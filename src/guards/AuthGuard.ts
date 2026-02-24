/**
 * @file AuthGuard.ts — JWT Authentication Guard (Standard Users)
 *
 * @intent
 *   Protects routes that require an authenticated user. Extracts the JWT from
 *   the Authorization header, validates it via AuthService, and attaches the
 *   decoded user payload to `req.user` so downstream controllers can identify
 *   the caller.
 *
 * @idea
 *   NestJS guards implement the CanActivate interface. Returning a truthy value
 *   from canActivate() allows the request through; throwing an exception rejects
 *   it. This guard performs Bearer-token validation against the app's own JWT
 *   secret (not Passport — uses a custom AuthService.validateToken flow).
 *
 * @usage
 *   Applied via @UseGuards(AuthGuard) on controllers or individual routes.
 *   Used across most feature modules: user, product, cart, order, chat,
 *   wishlist, team-member, payment, rfq-product, service, etc.
 *   Example: @UseGuards(AuthGuard) on UserController, ProductController, etc.
 *
 * @dataflow
 *   1. Extract `Authorization` header from incoming HTTP request.
 *   2. Split "Bearer <token>" → extract the token string.
 *   3. Call AuthService.validateToken(token) → returns { error, user, message }.
 *   4. If error → throw UnauthorizedException (401).
 *   5. If valid → attach user object to req.user and return truthy result.
 *
 * @depends
 *   - @nestjs/common   (CanActivate, ExecutionContext, UnauthorizedException, etc.)
 *   - AuthService      (src/auth/auth.service.ts — JWT validation logic)
 *   - PrismaService    (src/prisma/prisma.service.ts — database access)
 *
 * @notes
 *   - Test auth bypass validates that the user exists in the database before
 *     allowing bypass. Only active when NODE_ENV=development AND
 *     ENABLE_TEST_AUTH_BYPASS=true.
 *   - Uses UnauthorizedException (401) for all auth failures.
 */

import {
  CanActivate,
  ExecutionContext,
  Logger,
  UnauthorizedException,
  Injectable,
} from '@nestjs/common';
import { AuthService } from 'src/auth/auth.service';
import { PrismaService } from '../prisma/prisma.service';

/**
 * TokenValidationResult — Shape returned by AuthService.validateToken().
 * @property error   - true if the token is invalid or expired.
 * @property user    - Decoded JWT payload (id, email, userType, etc.) when valid.
 * @property message - Human-readable status or error description.
 */
interface TokenValidationResult {
  error: boolean;
  user?: any; // Make user optional since it's not present on error
  message: string;
}

@Injectable()
export class AuthGuard implements CanActivate {
  private readonly logger = new Logger(AuthGuard.name);

  constructor(
    private readonly authService: AuthService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * canActivate — Main guard logic. Validates the JWT and attaches user to request.
   *
   * @param context - NestJS execution context wrapping the HTTP request.
   * @returns The TokenValidationResult (truthy) if authentication succeeds.
   * @throws UnauthorizedException if the token is missing, invalid, or expired.
   */
  async canActivate(context: ExecutionContext): Promise<any> {
    let req = context.switchToHttp().getRequest();

    // --- Test Auth Bypass (development only) ---
    // SECURITY: Hard-disabled in production/staging. Only active when BOTH:
    //   1. NODE_ENV is explicitly 'development'
    //   2. ENABLE_TEST_AUTH_BYPASS is exactly 'true'
    if (
      process.env.NODE_ENV === 'development' &&
      process.env.ENABLE_TEST_AUTH_BYPASS === 'true'
    ) {
      const testUserId = req.headers['x-test-user-id'];
      if (testUserId) {
        const parsedId = parseInt(testUserId as string, 10);
        if (isNaN(parsedId) || parsedId <= 0) {
          throw new UnauthorizedException(
            'Invalid test user ID: must be a positive integer',
          );
        }

        const user = await this.prisma.user.findUnique({
          where: { id: parsedId },
        });
        if (!user) {
          throw new UnauthorizedException(
            `Test auth bypass rejected: user with ID ${parsedId} does not exist`,
          );
        }

        this.logger.warn(`[SECURITY] Auth bypass used for user ID: ${parsedId} — dev-only`);
        req.user = {
          id: parsedId,
          email: user.email,
          userType: user.userType,
          isTestBypass: true,
        };
        return { error: false, user: req.user, message: 'Test bypass active' };
      }
    }
    // --- End Test Auth Bypass ---

    try {
      /* Extract Bearer token from Authorization header */
      let jwt = req.headers['authorization'];
      if (!jwt) {
        throw new UnauthorizedException('No authorization token provided');
      }
      jwt = jwt.split(' ')[1];

      /* Validate the JWT using AuthService (verifies signature + expiry) */
      const data = await this.authService.validateToken(jwt);
      const res: TokenValidationResult = data;

      if (res.error == true) {
        throw new UnauthorizedException(res.message);
      }

      /* Attach decoded user payload to the request object for downstream use */
      // Get the user from token
      const tokenUser = res['user'];

      // Enhance user with active subaccount if needed
      const enhancedUser = await this.getActiveUserAccount(tokenUser);

      req.user = enhancedUser;

      return res;
    } catch (err) {
      if (err instanceof UnauthorizedException) {
        throw err;
      }
      throw new UnauthorizedException(
        err?.response?.message || 'Unauthorized',
      );
    }
  }

  /**
   * Get the active user account (subaccount if exists, otherwise the user itself)
   */
  private async getActiveUserAccount(tokenUser: any): Promise<any> {
    if (!tokenUser || !tokenUser.id) {
      return tokenUser;
    }

    try {
      // First, get the user from database
      const user = await this.prisma.user.findUnique({
        where: { id: tokenUser.id },
      });

      if (!user) {
        // User not found in database, return token user as-is
        return tokenUser;
      }

      // If user is a subaccount (has parentUserId), check if it's the current one
      if (user.parentUserId) {
        // This user is a subaccount, check if it's the current active one
        if (user.isCurrent) {
          // This subaccount is already the active one, return it
          return {
            ...tokenUser,
            id: user.id,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            tradeRole: user.tradeRole,
            isSubAccount: true,
            masterAccountId: user.masterAccountId,
            parentUserId: user.parentUserId,
          };
        } else {
          // This subaccount is not current, find the active one from the same parent
          const activeSubAccount = await this.prisma.user.findFirst({
            where: {
              parentUserId: user.parentUserId,
              isCurrent: true,
              deletedAt: null,
            },
          });

          if (activeSubAccount) {
            return {
              ...tokenUser,
              id: activeSubAccount.id,
              email: activeSubAccount.email,
              firstName: activeSubAccount.firstName,
              lastName: activeSubAccount.lastName,
              tradeRole: activeSubAccount.tradeRole,
              isSubAccount: true,
              masterAccountId: activeSubAccount.masterAccountId,
              parentUserId: activeSubAccount.parentUserId,
            };
          }
        }
      }

      // If user doesn't have parentUserId, it's a master account user
      // Find the active subaccount from its subaccounts
      const activeSubAccount = await this.prisma.user.findFirst({
        where: {
          parentUserId: user.id,
          isCurrent: true,
          deletedAt: null,
        },
      });

      // If active subaccount found, use it
      if (activeSubAccount) {
        return {
          ...tokenUser,
          id: activeSubAccount.id,
          email: activeSubAccount.email,
          firstName: activeSubAccount.firstName,
          lastName: activeSubAccount.lastName,
          tradeRole: activeSubAccount.tradeRole,
          isSubAccount: true,
          masterAccountId: activeSubAccount.masterAccountId,
          parentUserId: activeSubAccount.parentUserId,
        };
      }

      // Fallback: return the user as-is (master account user with no active subaccount)
      return {
        ...tokenUser,
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        tradeRole: user.tradeRole,
        isSubAccount: false,
        masterAccountId: user.masterAccountId,
        parentUserId: user.parentUserId,
      };
    } catch (error) {
      // If database lookup fails, return token user as-is (fallback)
      return tokenUser;
    }
  }

}

/**
 * @file SuperAdminAuthGuard.ts — JWT + Admin Role Authorization Guard
 *
 * @intent
 *   Extends authentication beyond simple JWT validation by also verifying
 *   that the authenticated user has `userType === 'ADMIN'`. Routes protected
 *   by this guard are restricted to platform administrators only.
 *
 * @idea
 *   Two-step authorization: first authenticate via JWT (same as AuthGuard),
 *   then perform a database lookup to confirm the user's role. This ensures
 *   that even if a regular user obtains a valid JWT, they cannot access admin
 *   endpoints.
 *
 * @usage
 *   Applied via @UseGuards(SuperAdminAuthGuard) on admin-only controllers:
 *   - AdminController (src/admin/admin.controller.ts)
 *   - AdminMemberController (src/admin-member/admin-member.controller.ts)
 *   - Possibly other admin-restricted routes.
 *
 * @dataflow
 *   1. Extract Bearer token from Authorization header.
 *   2. Validate JWT via AuthService.validateToken().
 *   3. If invalid → throw UnauthorizedException (401).
 *   4. Attach decoded user to req.user.
 *   5. Query the database (prisma.user.findUnique) to fetch the user's userType.
 *   6. If userType !== 'ADMIN' → throw ForbiddenException (403) "Not An Admin".
 *   7. If admin → allow request through.
 *
 * @depends
 *   - @nestjs/common       (CanActivate, ExecutionContext, UnauthorizedException, etc.)
 *   - AuthService          (src/auth/auth.service.ts — JWT validation)
 *   - PrismaService        (src/prisma/prisma.service.ts — database access via DI)
 *
 * @notes
 *   - Uses UnauthorizedException (401) for auth failures and ForbiddenException (403)
 *     for authorization failures (non-admin users).
 *   - Test auth bypass validates that the user exists in the database AND is an admin
 *     before allowing bypass. Only active when NODE_ENV=development AND
 *     ENABLE_TEST_AUTH_BYPASS=true.
 */

import {
  CanActivate,
  ExecutionContext,
  Logger,
  UnauthorizedException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { AuthService } from 'src/auth/auth.service';
import { PrismaService } from '../prisma/prisma.service';

/**
 * TokenValidationResult — Shape returned by AuthService.validateToken().
 * (Same interface as AuthGuard — could be extracted to a shared types file.)
 */
interface TokenValidationResult {
  error: boolean;
  user?: any; // Make user optional since it's not present on error
  message: string;
}

@Injectable()
export class SuperAdminAuthGuard implements CanActivate {
  private readonly logger = new Logger(SuperAdminAuthGuard.name);

  constructor(
    private readonly authService: AuthService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * canActivate — Validates JWT AND checks that the user is an ADMIN.
   *
   * @param context - NestJS execution context wrapping the HTTP request.
   * @returns The TokenValidationResult (truthy) if authentication + authorization succeed.
   * @throws UnauthorizedException if token is invalid; ForbiddenException if user is not an admin.
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
          select: { id: true, email: true, userType: true },
        });
        if (!user) {
          throw new UnauthorizedException(
            `Test auth bypass rejected: user with ID ${parsedId} does not exist`,
          );
        }
        if (user.userType !== 'ADMIN') {
          throw new ForbiddenException(
            `Test auth bypass rejected: user with ID ${parsedId} is not an admin`,
          );
        }

        this.logger.warn(`Auth bypass used for user ID: ${parsedId}`);
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
      /* Step 1: Extract and validate JWT (identical to AuthGuard) */
      let jwt = req.headers['authorization'];
      if (!jwt) {
        throw new UnauthorizedException('No authorization token provided');
      }
      jwt = jwt.split(' ')[1];
      const data = await this.authService.validateToken(jwt);
      const res: TokenValidationResult = data;

      if (res.error == true) {
        throw new UnauthorizedException(res.message);
      }

      req.user = res['user'];

      /* Step 2: Database lookup to verify the user's userType is ADMIN */
      const userDetail = await this.prisma.user.findUnique({
        where: { id: req.user.id },
        select: {
          id: true,
          userType: true,
        },
      });

      if (!userDetail) {
        throw new UnauthorizedException('User not found');
      }

      /* Reject non-admin users even if they have a valid JWT */
      if (userDetail.userType !== 'ADMIN') {
        throw new ForbiddenException('Not An Admin');
      }

      return res;
    } catch (err) {
      if (
        err instanceof UnauthorizedException ||
        err instanceof ForbiddenException
      ) {
        throw err;
      }
      throw new UnauthorizedException(
        err?.response?.message || 'Unauthorized',
      );
    }
  }

}

/**
 * @file SuperAdminAuthGuard.ts — Admin-only authorization guard (JWT + Better Auth)
 *
 * @intent
 *   Restricts admin endpoints (AdminController, AdminMemberController) to users
 *   with `userType === 'ADMIN'`. Accepts either a legacy JWT Bearer token or a
 *   Better Auth session cookie — mirrors the bridge in AuthGuard.ts so the
 *   admin app can migrate to Better Auth without backend churn.
 *
 * @dataflow
 *   1. Test auth bypass (dev only) — `x-test-user-id` header.
 *   2. Legacy JWT path — Bearer header or `ultrasooq_accessToken` cookie.
 *      If valid, look up user; if userType === 'ADMIN', allow.
 *   3. Better Auth path — `auth.api.getSession()` from request cookies.
 *      If session exists and user.userType === 'ADMIN', allow.
 *   4. Otherwise → UnauthorizedException (no auth) or ForbiddenException (auth
 *      but not admin).
 */

import {
  CanActivate,
  ExecutionContext,
  Logger,
  UnauthorizedException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { fromNodeHeaders } from 'better-auth/node';
import { AuthService } from 'src/auth/auth.service';
import { auth } from '../auth-better/auth';
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
    // Allows skipping JWT + admin validation by sending the `x-test-user-id` header.
    // Requires BOTH conditions:
    //   1. NODE_ENV === 'development'
    //   2. ENABLE_TEST_AUTH_BYPASS === 'true'
    if (
      process.env.NODE_ENV === 'development' &&
      process.env.ENABLE_TEST_AUTH_BYPASS === 'true'
    ) {
      const testUserId = req.headers['x-test-user-id'];
      if (testUserId) {
        const parsedId = String(testUserId);
        if (!parsedId) {
          throw new UnauthorizedException(
            'Invalid test user ID',
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

    // ─── Legacy JWT path ────────────────────────────────────────────────
    // Accepts either a Bearer header or the `ultrasooq_accessToken` cookie.
    // If the JWT is valid AND the user is an ADMIN, allow and return.
    // If the JWT is missing or invalid, fall through to Better Auth.
    const authHeader = req.headers?.authorization || req.headers?.Authorization;
    let bearerToken: string | undefined;
    if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
      bearerToken = authHeader.slice('Bearer '.length).trim();
    }
    if (!bearerToken) {
      const cookieHeader = req.headers?.cookie || '';
      const match = /(?:^|;\s*)ultrasooq_accessToken=([^;]+)/.exec(cookieHeader);
      if (match) bearerToken = decodeURIComponent(match[1]);
    }

    if (bearerToken) {
      const result: TokenValidationResult =
        await this.authService.validateToken(bearerToken);
      if (!result?.error && result?.user) {
        const claimedId =
          (result.user as any)?.id ||
          (result.user as any)?.user?.id ||
          (result.user as any)?.sub;
        if (claimedId) {
          const userDetail = await this.prisma.user.findUnique({
            where: { id: String(claimedId) },
            select: { id: true, userType: true },
          });
          if (userDetail) {
            if (userDetail.userType !== 'ADMIN') {
              throw new ForbiddenException('Not An Admin');
            }
            req.user = result.user;
            return result;
          }
        }
      }
      // Bad/expired bearer → fall through to Better Auth rather than 401.
    }

    // ─── Better Auth path ───────────────────────────────────────────────
    let session;
    try {
      session = await auth.api.getSession({
        headers: fromNodeHeaders(req.headers),
      });
    } catch (err: any) {
      throw new UnauthorizedException(
        err?.message || 'Failed to validate session',
      );
    }

    if (!session || !session.user) {
      throw new UnauthorizedException('No active session');
    }

    const sessionUser = session.user as any;
    const userDetail = await this.prisma.user.findUnique({
      where: { id: sessionUser.id },
      select: { id: true, userType: true },
    });

    if (!userDetail) {
      throw new UnauthorizedException('Session user not found');
    }
    if (userDetail.userType !== 'ADMIN') {
      throw new ForbiddenException('Not An Admin');
    }

    req.user = sessionUser;
    req.betterAuthUser = sessionUser;
    req.betterAuthSession = session.session;
    return { error: false, user: sessionUser, message: 'OK' };
  }
}

/**
 * @file AuthGuard.ts — Better Auth session guard for protected business routes
 *
 * @intent
 *   Protects ~60 business controllers (orders, cart, products, RFQ, wallet,
 *   vendor dashboard, etc.) by validating a Better Auth session cookie OR
 *   bearer token. The resolved user is exposed on `req.user` with the same
 *   shape every controller has always read (`{ id, email, tradeRole, ... }`),
 *   except `req.user.id` is now a Better Auth string id (User.id is String).
 *
 * @history
 *   The legacy LegacyUser/LegacyMasterAccount bridge that used to live here
 *   is gone — the schema now points every FK directly at the new `User`.
 *   See MIGRATION_TODO.mdx (final cleanup pass) for the full history.
 *
 * @usage
 *   Applied via `@UseGuards(AuthGuard)` on controllers or individual routes.
 */

import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { fromNodeHeaders } from 'better-auth/node';
import { AuthService } from 'src/auth/auth.service';
import { auth } from '../auth-better/auth';
import { PrismaService } from '../prisma/prisma.service';

// Defense-in-depth: refuse to boot if the test-auth bypass is enabled in
// production. The runtime check at line ~54 already gates by NODE_ENV ===
// 'development', but the assertion below catches misconfigurations earlier
// (during module load, before any request lands) so a leaked env var in
// prod hard-crashes the process instead of silently allowing impersonation.
if (
  process.env.NODE_ENV === 'production' &&
  process.env.ENABLE_TEST_AUTH_BYPASS === 'true'
) {
  throw new Error(
    'FATAL: ENABLE_TEST_AUTH_BYPASS=true is not permitted in production. ' +
      'Unset this variable or set NODE_ENV=development.',
  );
}

@Injectable()
export class AuthGuard implements CanActivate {
  private readonly logger = new Logger(AuthGuard.name);

  constructor(
    // Kept for DI-graph compatibility — every controller module imports
    // AuthModule expressly to provide AuthService to this guard. The new
    // implementation no longer calls into it, but removing the parameter
    // would force changes across ~36 module files. A separate cleanup PR
    // can drop both the parameter and the module-level wiring together.
    private readonly _authService: AuthService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<any> {
    const req = context.switchToHttp().getRequest();

    // ─── Test Auth Bypass (development only) ────────────────────────────
    // Allows skipping auth entirely by sending `x-test-user-id` header.
    // Requires BOTH:
    //   1. NODE_ENV === 'development'
    //   2. ENABLE_TEST_AUTH_BYPASS === 'true'
    if (
      process.env.NODE_ENV === 'development' &&
      process.env.ENABLE_TEST_AUTH_BYPASS === 'true'
    ) {
      const testUserId = req.headers['x-test-user-id'];
      if (testUserId) {
        const user = await this.prisma.user.findUnique({
          where: { id: String(testUserId) },
        });
        if (!user) {
          throw new UnauthorizedException(
            `Test auth bypass rejected: user with ID ${String(testUserId)} does not exist`,
          );
        }

        this.logger.warn(`Auth bypass used for user ID: ${user.id}`);
        req.user = {
          id: user.id,
          email: user.email,
          userType: user.userType,
          tradeRole: user.tradeRole,
          isTestBypass: true,
        };
        return true;
      }
    }
    // ─── End Test Auth Bypass ───────────────────────────────────────────

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

    // Better Auth's session.user has the core columns + every additionalFields
    // entry from src/auth-better/auth.ts. The remaining business columns we
    // store directly on User aren't in the session — fetch them once here so
    // controllers reading `req.user.userType` / `req.user.tradeRole` etc. keep
    // working with no churn.
    const u = session.user as any;
    const fullUser = await this.prisma.user.findUnique({
      where: { id: u.id },
    });
    if (!fullUser) {
      throw new UnauthorizedException('Session user not found');
    }

    req.user = fullUser;
    req.betterAuthUser = u;
    req.betterAuthSession = session.session;
    return true;
  }
}

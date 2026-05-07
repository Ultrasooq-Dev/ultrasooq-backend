/**
 * @file AuthGuard.ts — Better-Auth-aware authentication guard (formerly JWT)
 *
 * @intent
 *   Protects ~60 business controllers (orders, cart, products, RFQ, wallet,
 *   vendor dashboard, etc.) by validating a Better Auth session cookie OR
 *   bearer token, then resolving the linked LEGACY `User` row so downstream
 *   handlers see the same `req.user.id` integer they always have.
 *
 * @history
 *   This guard previously called `AuthService.validateToken()` against a
 *   custom JWT (`Authorization: Bearer <jwt>`). Since Phase 4 of the Better
 *   Auth migration dropped `/api/v1/user/login`, no new JWTs are minted —
 *   existing client tokens expire in 7 days and any controller still using
 *   this guard would 401 thereafter. Rather than retarget every controller,
 *   we keep the class name + import path and rewrite the internals to read
 *   a Better Auth session via `auth.api.getSession({ headers })`.
 *
 * @bridge
 *   Every BetterAuthUser row carries `legacyUserId` (an FK to `User.id`),
 *   populated either by:
 *     - the Phase 5 migration script (existing MasterAccount → BetterAuthUser)
 *     - `databaseHooks.user.create.after` in `src/auth-better/auth.ts` (new
 *       signups going forward)
 *     - `scripts/backfill-legacy-shadow.ts` (one-shot orphan healer)
 *   The guard resolves that link on every request and sets `req.user` to the
 *   full legacy `User` row. The downstream controllers don't change.
 *
 * @usage
 *   Applied via `@UseGuards(AuthGuard)` on controllers or individual routes.
 *   Used across most feature modules: user, product, cart, order, chat,
 *   wishlist, team-member, payment, rfq-product, service, etc.
 *
 * @dataflow
 *   1. `auth.api.getSession({ headers: fromNodeHeaders(req.headers) })`
 *      reads the `ultrasooq.session_token` cookie OR `Authorization: Bearer`
 *      via the `bearer()` plugin.
 *   2. If no session → 401 UnauthorizedException.
 *   3. Lookup `User` row via `BetterAuthUser.legacyUserId`.
 *   4. If no link → 401 (the bridge invariant — every BA user must have one;
 *      enforced by the database hook + backfill script).
 *   5. Optional sub-account / multi-account resolution preserved from the
 *      legacy guard for the currently-active sub-account semantics.
 *   6. `req.user` = legacy User shape (integer `id`, `tradeRole`, etc.).
 *      `req.betterAuthUser` = Better Auth user (UUID `id`).
 *      `req.betterAuthSession` = Better Auth session.
 *
 * @notes
 *   - `AuthService` is no longer required at runtime, but kept as a
 *     constructor parameter so the existing DI graph (every module that
 *     imports `AuthModule` to get `AuthService` for THIS guard) continues
 *     to compile + resolve without churn. The dependency is a no-op now —
 *     a follow-up cleanup PR can drop both the parameter and the
 *     module-level `AuthService` requirements together.
 *   - The dev-only test-bypass header (`x-test-user-id` with
 *     ENABLE_TEST_AUTH_BYPASS=true) is preserved unchanged, so test
 *     fixtures and CI helpers keep working.
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

@Injectable()
export class AuthGuard implements CanActivate {
  private readonly logger = new Logger(AuthGuard.name);

  constructor(
    // Kept for DI-graph compatibility — every controller module imports
    // AuthModule expressly to provide AuthService to this guard. The new
    // implementation no longer calls into it, but removing the parameter
    // would force changes across ~36 module files. A separate cleanup PR
    // can drop `AuthService` once the legacy auth surface is gone.
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
        const parsedId = parseInt(testUserId as string, 10);
        if (isNaN(parsedId) || parsedId <= 0) {
          throw new UnauthorizedException(
            'Invalid test user ID: must be a positive integer',
          );
        }

        const user = await this.prisma.legacyUser.findUnique({
          where: { id: parsedId },
        });
        if (!user) {
          throw new UnauthorizedException(
            `Test auth bypass rejected: user with ID ${parsedId} does not exist`,
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

    const baUser = session.user as any;

    // The bridge invariant: every BA user must have a paired legacy User row.
    // Created by `databaseHooks.user.create.after` (auth.ts) for new signups,
    // by `scripts/backfill-legacy-shadow.ts` for pre-hook orphans.
    if (!baUser.legacyUserId) {
      this.logger.warn(
        `BetterAuthUser ${baUser.id} (${baUser.email}) is missing legacyUserId — backfill needed`,
      );
      throw new UnauthorizedException('Legacy user link missing');
    }

    const legacyUser = await this.prisma.legacyUser.findUnique({
      where: { id: baUser.legacyUserId },
    });
    if (!legacyUser) {
      this.logger.warn(
        `BetterAuthUser ${baUser.id} legacyUserId=${baUser.legacyUserId} points to missing User row`,
      );
      throw new UnauthorizedException('Legacy user link missing');
    }

    // Preserve the legacy guard's "currently-active sub-account" resolution
    // semantics so multi-account flows keep working: if this user (or any
    // sibling) has `isCurrent=true` under the same parent, hand that one
    // back as `req.user`. Same shape every downstream controller expects.
    const enhancedUser = await this.getActiveUserAccount({
      id: legacyUser.id,
      email: legacyUser.email,
      tradeRole: legacyUser.tradeRole,
    });

    req.user = enhancedUser;
    req.betterAuthUser = baUser;
    req.betterAuthSession = session.session;
    return true;
  }

  /**
   * getActiveUserAccount — Resolves to the currently-active sub-account
   * under the same parent (if any). Mirrors the legacy guard's behavior so
   * controllers that depend on `req.user.isSubAccount`, `parentUserId`, or
   * `masterAccountId` keep seeing the same data.
   */
  private async getActiveUserAccount(tokenUser: any): Promise<any> {
    if (!tokenUser?.id) return tokenUser;

    try {
      const user = await this.prisma.legacyUser.findUnique({
        where: { id: tokenUser.id },
      });
      if (!user) return tokenUser;

      // Sub-account path: if THIS row is a sub-account, either return it
      // (when it's the active one) or hand back its currently-active sibling.
      if (user.parentUserId) {
        if (user.isCurrent) {
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
        }
        const activeSubAccount = await this.prisma.legacyUser.findFirst({
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

      // Master-account path: if THIS row has children, hand back the active
      // child if there is one, otherwise THIS row.
      const activeSubAccount = await this.prisma.legacyUser.findFirst({
        where: {
          parentUserId: user.id,
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
    } catch {
      // DB lookup failure → return token user as-is (fallback).
      return tokenUser;
    }
  }
}

/**
 * @file auth.service.ts — Legacy JWT helper service
 *
 * @intent
 *   Provides the JWT signing/verification helpers that the legacy
 *   `JwtAuthGuard` (in `src/guards/AuthGuard.ts`) and a couple of internal
 *   call-sites (`admin.service.login`, `user.service.switchAccount`) still
 *   depend on.
 *
 * @scope
 *   Reduced surface as of Phase 4 of the Better Auth migration:
 *   - `login(user)`        — signs an access token for a user (no refresh
 *                            token; Better Auth owns sessions now).
 *   - `getToken(user)`     — signs a JWT with account-context claims for the
 *                            multi-account switch flow.
 *   - `validateToken(jwt)` — verifies signature/expiry; used by guards.
 *   - `getSessionConfig()` — reads JWT expiry from the PageSetting table
 *                            (5-minute cache).
 *
 *   The `generateRefreshToken`, `refreshAccessToken`, and
 *   `revokeRefreshToken` methods (which depended on the now-dropped
 *   `RefreshToken` Prisma model) were removed — see Phase 4 in
 *   MIGRATION_TODO.mdx. Better Auth replaces refresh-token rotation with
 *   its own sliding-window session cookie.
 *
 *   Existing clients that already hold an access token continue to work
 *   until expiry; once expired, they hit 401 from the legacy guard and
 *   must re-authenticate via Better Auth.
 *
 * @depends
 *   - @nestjs/common    (Injectable)
 *   - @nestjs/jwt       (JwtService — sign/verify operations)
 *   - PrismaService     (PageSetting read for session config)
 *   - process.env.JWT_SECRET, process.env.JWT_EXPIRY
 */

import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuthService {
  // ─── Session config cache (reads from PageSetting slug: "session-settings") ───
  private sessionConfigCache: {
    data: { jwtAccessTokenExpiry: string };
    expiry: number;
  } | null = null;

  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * getSessionConfig — Reads the JWT access-token expiry from the
   * PageSetting table (slug: "session-settings") with a 5-minute cache.
   *
   * Falls back to env vars / defaults if no DB record exists.
   *
   * @returns { jwtAccessTokenExpiry: string }
   */
  async getSessionConfig(): Promise<{ jwtAccessTokenExpiry: string }> {
    // Return cached value if still valid
    if (this.sessionConfigCache && Date.now() < this.sessionConfigCache.expiry) {
      return this.sessionConfigCache.data;
    }

    const defaults = {
      jwtAccessTokenExpiry: (process.env.JWT_EXPIRY || '1h') as string,
    };

    try {
      const setting = await this.prisma.pageSetting.findUnique({
        where: { slug: 'session-settings' },
      });

      if (setting?.setting && typeof setting.setting === 'object') {
        const s = setting.setting as Record<string, any>;
        const config = {
          jwtAccessTokenExpiry:
            typeof s.jwtAccessTokenExpiry === 'string'
              ? s.jwtAccessTokenExpiry
              : defaults.jwtAccessTokenExpiry,
        };

        this.sessionConfigCache = {
          data: config,
          expiry: Date.now() + 5 * 60 * 1000, // 5-minute cache
        };
        return config;
      }
    } catch {
      // DB error — fall back to defaults silently
    }

    this.sessionConfigCache = {
      data: defaults,
      expiry: Date.now() + 5 * 60 * 1000,
    };
    return defaults;
  }

  /**
   * login — Creates a short-lived access token for the given user.
   *
   * @param user - The authenticated user object. Must have `id`; optionally
   *               `email`, `tradeRole`, `userType` for JWT claims.
   * @returns Object containing:
   *   - data: The user object (echoed back for convenience).
   *   - userId: The user's primary key.
   *   - accessToken: Signed JWT string (default 1h expiry).
   *
   * @usage Called by `AdminService.login` and (transitively) by
   *        `UserService.switchAccount`. The original
   *        legacy /api/v1/user/login endpoint that used to call this is
   *        gone — see MIGRATION_TODO.mdx Phase 4.
   *
   * @notes No longer issues a refresh token — the `RefreshToken` model was
   *        dropped in Phase 4. Better Auth owns sessions/refresh now.
   */
  async login(user) {
    // Read session config from DB (cached 5 min) with env fallback
    const sessionConfig = await this.getSessionConfig();

    // Minimal JWT payload — only essential claims, no full user object
    const payload = {
      sub: user.id,
      email: user.email,
      tradeRole: user.tradeRole,
      userType: user.userType,
    };

    const accessToken = this.jwtService.sign(payload, {
      secret: process.env.JWT_SECRET,
      expiresIn: sessionConfig.jwtAccessTokenExpiry as any,
    });

    return {
      data: user,
      userId: user.id,
      accessToken,
    };
  }

  /**
   * getToken — Creates a JWT with account-context awareness.
   *
   * @param user - A user-like object that may come from the User model or a
   *               custom object built during account switching. Expected fields:
   *               - id or userId: The main user's primary key.
   *               - tradeRole: The user's current trade role (BUYER, SELLER, etc.).
   *               - userAccountId (optional): If switching to a sub-account,
   *                 this identifies the specific UserAccount record.
   * @returns Same shape as login(): { data, userId, accessToken }.
   *
   * @usage Called by `UserService.switchAccount`. Embeds
   *        id, tradeRole, and optionally userAccountId.
   */
  async getToken(user) {
    // Read session config from DB (cached 5 min) with env fallback
    const sessionConfig = await this.getSessionConfig();

    // Handle both user object structures (from User model or custom object)
    const mainUserId = user.id || user.userId;
    const tradeRole = user.tradeRole;

    // Create payload with account context
    const payload = {
      user: {
        id: mainUserId,
        tradeRole: tradeRole,
        // Include userAccountId if switching to a sub-account
        ...(user.userAccountId && { userAccountId: user.userAccountId }),
      },
      sub: mainUserId,
    };

    return {
      data: user,
      userId: mainUserId,
      accessToken: this.jwtService.sign(payload, {
        secret: process.env.JWT_SECRET,
        expiresIn: sessionConfig.jwtAccessTokenExpiry as any,
      }),
    };
  }

  /**
   * validateToken — Verifies a JWT's signature and expiry, then extracts the user payload.
   *
   * @param jwt - The raw JWT string (without "Bearer " prefix — already stripped by guards).
   * @returns TokenValidationResult:
   *   - { error: false, user: <decoded payload>, message: 'Token valid' } on success.
   *   - { error: true, user: null, message: <reason> } on failure.
   *
   * @usage Called by AuthGuard.canActivate() and SuperAdminAuthGuard.canActivate()
   *        on every protected HTTP request, and by ChatGateway for WebSocket auth.
   *
   * @dataflow
   *   JWT string → jwtService.verify() → decoded payload
   *   → if decoded.user exists → return decoded.user (login() tokens)
   *   → else if decoded.sub exists → return full decoded object (getToken() tokens)
   *   → else → invalid structure error
   *   → catch: TokenExpiredError, JsonWebTokenError, or generic error
   */
  validateToken(jwt: string) {
    try {
      const decoded = this.jwtService.verify(jwt, {
        secret: process.env.JWT_SECRET,
      });

      // Handle three token payload formats for backward compatibility:
      //
      // Format 1 (legacy login): { user: {full user object}, sub: userId }
      //   → decoded.user contains the full user object with id, email, etc.
      //
      // Format 2 (getToken / account switch): { user: { id, tradeRole, ?userAccountId }, sub: userId }
      //   → decoded.user contains a minimal object with id and tradeRole.
      //
      // Format 3 (new minimal login): { sub: userId, email, tradeRole, userType }
      //   → No decoded.user; claims are at top level. We normalize to { id, ... }.

      if (decoded.user) {
        // Format 1 or 2: user object is embedded in the token
        return {
          error: false,
          user: decoded.user,
          message: 'Token valid',
        };
      } else if (decoded.sub) {
        // Format 3 (new minimal) or any token with sub but no user wrapper.
        // Normalize so downstream consumers always see an `id` field.
        const user = {
          id: decoded.sub,
          email: decoded.email,
          tradeRole: decoded.tradeRole,
          userType: decoded.userType,
          sub: decoded.sub,
        };
        return {
          error: false,
          user,
          message: 'Token valid',
        };
      } else {
        return {
          error: true,
          user: null,
          message: 'Invalid token structure',
        };
      }
    } catch (err: unknown) {
      const error = err as { name?: string };
      switch (error?.name) {
        case 'TokenExpiredError':
          return {
            error: true,
            user: null,
            message: 'Link Expired!',
          };
        case 'JsonWebTokenError':
          return {
            error: true,
            user: null,
            message: 'Invalid Token!',
          };
        default:
          return {
            error: true,
            user: null,
            message: 'Unable to Process Token',
          };
      }
    }
  }
}

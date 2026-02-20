/**
 * @file auth.service.ts — Authentication Service (JWT + Refresh Token Operations)
 *
 * @intent
 *   Central authority for JWT token creation, validation, and refresh token
 *   management. Provides five core operations:
 *   - login (initial access + refresh token after authentication)
 *   - getToken (access token for account switching)
 *   - validateToken (verification used by guards on every protected request)
 *   - refreshAccessToken (exchange refresh token for new access + refresh token pair)
 *   - revokeRefreshToken (invalidate a refresh token on logout)
 *
 * @idea
 *   Uses @nestjs/jwt's JwtService for short-lived access tokens (default 1h)
 *   and opaque refresh tokens stored in the database (7d expiry) with rotation.
 *   Access token payload is minimal: { sub, email, tradeRole, userType }.
 *   Refresh tokens are cryptographically random 64-byte hex strings.
 *
 * @usage
 *   - Provided by AuthModule.
 *   - Consumed by:
 *     - UserService — calls login() after authentication; calls getToken() on account switch.
 *     - AuthGuard / SuperAdminAuthGuard — calls validateToken() on every request.
 *     - ChatGateway — validates WebSocket connections.
 *     - UserController — exposes /auth/refresh and /auth/logout endpoints.
 *
 * @dataflow
 *   login(user)              → signs minimal JWT + generates refresh token → returns { data, userId, accessToken, refreshToken }
 *   getToken(user)           → signs JWT with account context → returns { data, userId, accessToken }
 *   validateToken(jwt)       → verifies signature + expiry → returns { error, user, message }
 *   refreshAccessToken(rt)   → validates refresh token, rotates, returns new pair
 *   revokeRefreshToken(rt)   → marks refresh token as revoked in DB
 *
 * @depends
 *   - @nestjs/common    (Injectable)
 *   - @nestjs/jwt       (JwtService — sign/verify operations)
 *   - PrismaService     (RefreshToken table operations)
 *   - crypto            (secure random token generation)
 *   - process.env.JWT_SECRET, process.env.JWT_EXPIRY
 *
 * @notes
 *   - Access token expiry defaults to 1h (JWT_EXPIRY env var).
 *   - Refresh tokens expire after 7 days and are rotated on each use.
 *   - validateToken() handles three payload formats for backward compatibility:
 *     (a) decoded.user with full object — legacy login() tokens
 *     (b) decoded.user with { id, tradeRole } — getToken() tokens
 *     (c) decoded.sub at top level — new minimal login() tokens
 */

import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * login — Creates a short-lived access token and a database-backed refresh token
   * after successful user authentication (email/password or OAuth).
   *
   * @param user - The authenticated user object. Must have `id`; optionally
   *               `email`, `tradeRole`, `userType` for JWT claims.
   * @returns Object containing:
   *   - data: The user object (echoed back for convenience).
   *   - userId: The user's primary key.
   *   - accessToken: Signed JWT string (default 1h expiry).
   *   - refreshToken: Opaque token string (7d expiry, stored in DB).
   *
   * @usage Called by UserService.login(), UserService.socialLogin(),
   *        UserService.registerValidateOtp(), UserService.verifyOtp().
   */
  async login(user) {
    // Minimal JWT payload — only essential claims, no full user object
    const payload = {
      sub: user.id,
      email: user.email,
      tradeRole: user.tradeRole,
      userType: user.userType,
    };

    const accessToken = this.jwtService.sign(payload, {
      secret: process.env.JWT_SECRET,
      expiresIn: process.env.JWT_EXPIRY || '1h',
    });

    // Generate a refresh token and store it in the database
    const refreshToken = await this.generateRefreshToken(user.id);

    return {
      data: user,
      userId: user.id,
      accessToken,
      refreshToken,
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
   * @usage Called by UserService during account switching (switchAccount flow),
   *        and when a refreshed token is needed with updated role context.
   *
   * @notes Unlike login(), this method only embeds id, tradeRole, and optionally
   *        userAccountId in the JWT payload — a more minimal and secure approach.
   */
  async getToken(user) {
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
        expiresIn: process.env.JWT_EXPIRY || '1h',
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
   *
   * @notes
   *   - This is a synchronous method (no async/await needed) despite being
   *     called with `await` in guards — this is harmless but unnecessary.
   *   - The dual payload handling (decoded.user vs decoded.sub) supports both
   *     old and new token formats for backwards compatibility.
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

  // ===========================================================================
  // REFRESH TOKEN METHODS
  // ===========================================================================

  /**
   * generateRefreshToken — Creates a cryptographically random refresh token,
   * stores it in the database with a 7-day expiry, and returns the raw token string.
   *
   * @param userId - The user's primary key.
   * @returns The raw refresh token string (hex-encoded).
   */
  async generateRefreshToken(userId: number): Promise<string> {
    const token = crypto.randomBytes(64).toString('hex');
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 days from now

    await this.prisma.refreshToken.create({
      data: {
        token,
        userId,
        expiresAt,
      },
    });

    return token;
  }

  /**
   * refreshAccessToken — Validates a refresh token, generates a new access token
   * and rotates the refresh token (revoke old, create new).
   *
   * @param refreshToken - The raw refresh token string from the client.
   * @returns Object containing new accessToken and refreshToken.
   * @throws Error if the refresh token is invalid, expired, or revoked.
   */
  async refreshAccessToken(
    refreshToken: string,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    // Find the refresh token in the database
    const storedToken = await this.prisma.refreshToken.findUnique({
      where: { token: refreshToken },
      include: { user: true },
    });

    if (!storedToken) {
      throw new Error('Invalid refresh token');
    }

    if (storedToken.revoked) {
      // Possible token reuse attack — revoke all tokens for this user
      await this.prisma.refreshToken.updateMany({
        where: { userId: storedToken.userId },
        data: { revoked: true },
      });
      throw new Error('Refresh token has been revoked — all sessions invalidated');
    }

    if (storedToken.expiresAt < new Date()) {
      throw new Error('Refresh token has expired');
    }

    const user = storedToken.user;

    // Generate new access token with minimal payload
    const payload = {
      sub: user.id,
      email: user.email,
      tradeRole: user.tradeRole,
      userType: user.userType,
    };

    const accessToken = this.jwtService.sign(payload, {
      secret: process.env.JWT_SECRET,
      expiresIn: process.env.JWT_EXPIRY || '1h',
    });

    // Rotate: generate new refresh token and revoke old one
    const newRefreshToken = await this.generateRefreshToken(user.id);

    await this.prisma.refreshToken.update({
      where: { id: storedToken.id },
      data: {
        revoked: true,
        replacedBy: newRefreshToken,
      },
    });

    return {
      accessToken,
      refreshToken: newRefreshToken,
    };
  }

  /**
   * revokeRefreshToken — Marks a refresh token as revoked in the database.
   *
   * @param token - The raw refresh token string to revoke.
   */
  async revokeRefreshToken(token: string): Promise<void> {
    const storedToken = await this.prisma.refreshToken.findUnique({
      where: { token },
    });

    if (storedToken) {
      await this.prisma.refreshToken.update({
        where: { id: storedToken.id },
        data: { revoked: true },
      });
    }
  }
}

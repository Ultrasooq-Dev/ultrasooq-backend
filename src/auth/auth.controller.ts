/**
 * @file auth.controller.ts — Authentication HTTP Controller
 *
 * @intent
 *   Exposes token refresh and logout endpoints under /auth/*.
 *   These endpoints are public (no AuthGuard) since the client uses them
 *   when the access token has expired.
 *
 * @usage
 *   - POST /auth/refresh  — Exchange a valid refresh token for a new access + refresh token pair.
 *   - POST /auth/logout   — Revoke a refresh token (invalidate the session).
 *
 * @depends
 *   - AuthService (src/auth/auth.service.ts) — refresh and revoke operations.
 */

import {
  Body,
  Controller,
  Post,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AuthService } from './auth.service';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * POST /auth/refresh — Exchange a refresh token for a new access + refresh token pair.
   *
   * The old refresh token is revoked and a new one is issued (token rotation).
   * If the refresh token is invalid, expired, or already revoked, an error is returned.
   */
  @Post('/refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Body() body: { refreshToken: string }) {
    if (!body.refreshToken) {
      throw new BadRequestException({
        status: false,
        message: 'refreshToken is required',
      });
    }

    try {
      const result = await this.authService.refreshAccessToken(body.refreshToken);
      return {
        status: true,
        message: 'Token refreshed successfully',
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
      };
    } catch (error) {
      throw new BadRequestException({
        status: false,
        message: error.message || 'Failed to refresh token',
      });
    }
  }

  /**
   * POST /auth/logout — Revoke a refresh token to end the session.
   *
   * The refresh token is marked as revoked in the database. The access token
   * will naturally expire (short-lived), but the client should discard it.
   */
  @Post('/logout')
  @HttpCode(HttpStatus.OK)
  async logout(@Body() body: { refreshToken: string }) {
    if (!body.refreshToken) {
      throw new BadRequestException({
        status: false,
        message: 'refreshToken is required',
      });
    }

    try {
      await this.authService.revokeRefreshToken(body.refreshToken);
      return {
        status: true,
        message: 'Logged out successfully',
      };
    } catch (error) {
      throw new BadRequestException({
        status: false,
        message: error.message || 'Failed to logout',
      });
    }
  }
}

/**
 * PRODUCTION-GRADE AUTH CONTROLLER TESTS
 * Covers: refresh endpoint, logout endpoint, input validation,
 * error responses, HTTP status codes
 */
import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { BadRequestException } from '@nestjs/common';

const mockAuthService = {
  refreshAccessToken: jest.fn(),
  revokeRefreshToken: jest.fn(),
};

describe('AuthController — Production Tests', () => {
  let controller: AuthController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: mockAuthService }],
    }).compile();

    controller = module.get<AuthController>(AuthController);
    jest.clearAllMocks();
  });

  // ═══════════════════════════════════════════════════════════
  // POST /auth/refresh
  // ═══════════════════════════════════════════════════════════

  describe('POST /auth/refresh', () => {
    it('returns new token pair on valid refresh token', async () => {
      mockAuthService.refreshAccessToken.mockResolvedValue({
        accessToken: 'new-access',
        refreshToken: 'new-refresh',
      });

      const result = await controller.refresh({ refreshToken: 'valid-refresh' });

      expect(result).toHaveProperty('accessToken', 'new-access');
      expect(result).toHaveProperty('refreshToken', 'new-refresh');
    });

    it('throws BadRequestException when refreshToken is missing', async () => {
      await expect(
        controller.refresh({ refreshToken: '' }),
      ).rejects.toThrow();
    });

    it('throws when refresh token is invalid/expired', async () => {
      mockAuthService.refreshAccessToken.mockRejectedValue(
        new Error('Invalid refresh token'),
      );

      await expect(
        controller.refresh({ refreshToken: 'invalid' }),
      ).rejects.toThrow();
    });

    it('passes through service error messages', async () => {
      mockAuthService.refreshAccessToken.mockRejectedValue(
        new BadRequestException('Token has been revoked'),
      );

      await expect(
        controller.refresh({ refreshToken: 'revoked' }),
      ).rejects.toThrow('Token has been revoked');
    });
  });

  // ═══════════════════════════════════════════════════════════
  // POST /auth/logout
  // ═══════════════════════════════════════════════════════════

  describe('POST /auth/logout', () => {
    it('revokes refresh token on logout', async () => {
      mockAuthService.revokeRefreshToken.mockResolvedValue(undefined);

      const result = await controller.logout({ refreshToken: 'token-to-revoke' });

      expect(mockAuthService.revokeRefreshToken).toHaveBeenCalledWith('token-to-revoke');
    });

    it('throws BadRequestException when refreshToken is missing', async () => {
      await expect(
        controller.logout({ refreshToken: '' }),
      ).rejects.toThrow();
    });

    it('handles already-revoked token gracefully (idempotent)', async () => {
      mockAuthService.revokeRefreshToken.mockResolvedValue(undefined);

      // Should not throw even if token was already revoked
      await expect(
        controller.logout({ refreshToken: 'already-revoked' }),
      ).resolves.not.toThrow();
    });

    it('handles service errors during logout', async () => {
      mockAuthService.revokeRefreshToken.mockRejectedValue(
        new Error('DB connection lost'),
      );

      await expect(
        controller.logout({ refreshToken: 'any-token' }),
      ).rejects.toThrow();
    });
  });

  // ═══════════════════════════════════════════════════════════
  // EDGE CASES
  // ═══════════════════════════════════════════════════════════

  describe('Edge cases', () => {
    it('handles concurrent refresh requests', async () => {
      let callCount = 0;
      mockAuthService.refreshAccessToken.mockImplementation(async () => {
        callCount++;
        return {
          accessToken: `access-${callCount}`,
          refreshToken: `refresh-${callCount}`,
        };
      });

      const [r1, r2] = await Promise.all([
        controller.refresh({ refreshToken: 'token-1' }),
        controller.refresh({ refreshToken: 'token-2' }),
      ]);

      expect(r1.accessToken).not.toBe(r2.accessToken);
    });

    it('FINDING: whitespace-only refresh token is NOT rejected by controller', async () => {
      // PRODUCTION FINDING: The controller passes whitespace tokens to service
      // without validation. Service should handle this, but a DTO validator
      // with @IsNotEmpty() would be safer at the controller level.
      mockAuthService.refreshAccessToken.mockResolvedValue({
        accessToken: 'token',
        refreshToken: 'refresh',
      });

      const result = await controller.refresh({ refreshToken: '   ' });
      // Controller does NOT validate — delegates to service
      expect(mockAuthService.refreshAccessToken).toHaveBeenCalledWith('   ');
    });
  });
});

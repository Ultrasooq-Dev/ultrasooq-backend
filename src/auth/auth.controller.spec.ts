import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

/**
 * Mock AuthService — stubs for methods called by AuthController.
 */
const mockAuthService = {
  refreshAccessToken: jest.fn(),
  revokeRefreshToken: jest.fn(),
};

describe('AuthController', () => {
  let controller: AuthController;
  let authService: typeof mockAuthService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: mockAuthService }],
    }).compile();

    controller = module.get<AuthController>(AuthController);
    authService = module.get(AuthService);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  // ===========================================================================
  // POST /auth/refresh
  // ===========================================================================
  describe('POST /auth/refresh', () => {
    it('should return new token pair on valid refresh token', async () => {
      authService.refreshAccessToken.mockResolvedValue({
        accessToken: 'new-access-jwt',
        refreshToken: 'new-refresh-hex',
      });

      const result = await controller.refresh({ refreshToken: 'valid-refresh-token' });

      expect(result).toEqual({
        status: true,
        message: 'Token refreshed successfully',
        accessToken: 'new-access-jwt',
        refreshToken: 'new-refresh-hex',
      });
      expect(authService.refreshAccessToken).toHaveBeenCalledWith('valid-refresh-token');
    });

    it('should throw BadRequestException when refreshToken is missing', async () => {
      // body.refreshToken is falsy (empty string)
      await expect(controller.refresh({ refreshToken: '' })).rejects.toThrow(BadRequestException);

      // body.refreshToken is undefined
      await expect(controller.refresh({} as any)).rejects.toThrow(BadRequestException);

      // Verify the error payload shape
      try {
        await controller.refresh({ refreshToken: '' });
      } catch (e) {
        expect(e).toBeInstanceOf(BadRequestException);
        const response = e.getResponse();
        expect(response).toEqual({
          status: false,
          message: 'refreshToken is required',
        });
      }
    });

    it('should throw BadRequestException when refresh token is invalid', async () => {
      authService.refreshAccessToken.mockRejectedValue(new Error('Invalid refresh token'));

      await expect(controller.refresh({ refreshToken: 'bad-token' })).rejects.toThrow(
        BadRequestException,
      );

      try {
        await controller.refresh({ refreshToken: 'bad-token' });
      } catch (e) {
        expect(e).toBeInstanceOf(BadRequestException);
        const response = e.getResponse();
        expect(response).toEqual({
          status: false,
          message: 'Invalid refresh token',
        });
      }
    });

    it('should propagate specific error messages from AuthService', async () => {
      authService.refreshAccessToken.mockRejectedValue(
        new Error('Refresh token has been revoked — all sessions invalidated'),
      );

      try {
        await controller.refresh({ refreshToken: 'reused-token' });
        fail('Expected BadRequestException to be thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(BadRequestException);
        const response = e.getResponse();
        expect(response.message).toBe(
          'Refresh token has been revoked — all sessions invalidated',
        );
      }
    });
  });

  // ===========================================================================
  // POST /auth/logout
  // ===========================================================================
  describe('POST /auth/logout', () => {
    it('should revoke refresh token successfully', async () => {
      authService.revokeRefreshToken.mockResolvedValue(undefined);

      const result = await controller.logout({ refreshToken: 'token-to-revoke' });

      expect(result).toEqual({
        status: true,
        message: 'Logged out successfully',
      });
      expect(authService.revokeRefreshToken).toHaveBeenCalledWith('token-to-revoke');
    });

    it('should throw BadRequestException when refreshToken is missing', async () => {
      await expect(controller.logout({ refreshToken: '' })).rejects.toThrow(BadRequestException);

      await expect(controller.logout({} as any)).rejects.toThrow(BadRequestException);

      try {
        await controller.logout({ refreshToken: '' });
      } catch (e) {
        expect(e).toBeInstanceOf(BadRequestException);
        const response = e.getResponse();
        expect(response).toEqual({
          status: false,
          message: 'refreshToken is required',
        });
      }
    });

    it('should throw BadRequestException when revokeRefreshToken fails', async () => {
      authService.revokeRefreshToken.mockRejectedValue(new Error('DB connection lost'));

      try {
        await controller.logout({ refreshToken: 'some-token' });
        fail('Expected BadRequestException');
      } catch (e) {
        expect(e).toBeInstanceOf(BadRequestException);
        const response = e.getResponse();
        expect(response.message).toBe('DB connection lost');
      }
    });
  });
});

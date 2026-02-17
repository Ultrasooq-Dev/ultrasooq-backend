import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Mock PrismaService — stubs for all RefreshToken model methods used by AuthService.
 */
const mockPrismaService = {
  refreshToken: {
    create: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  },
};

/**
 * Mock JwtService — stubs for sign() and verify().
 */
const mockJwtService = {
  sign: jest.fn(),
  verify: jest.fn(),
};

describe('AuthService', () => {
  let service: AuthService;
  let jwtService: typeof mockJwtService;
  let prisma: typeof mockPrismaService;

  beforeEach(async () => {
    // Reset environment variables used by AuthService
    process.env.JWT_SECRET = 'test-secret';
    process.env.JWT_EXPIRY = '1h';

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: JwtService, useValue: mockJwtService },
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    jwtService = module.get(JwtService);
    prisma = module.get(PrismaService);

    // Clear all mocks before each test
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ===========================================================================
  // login()
  // ===========================================================================
  describe('login()', () => {
    const mockUser = {
      id: 42,
      email: 'seller@example.com',
      tradeRole: 'SELLER',
      userType: 'VENDOR',
      firstName: 'Test',
      lastName: 'User',
    };

    it('should create JWT access token with minimal payload (sub, email, tradeRole, userType)', async () => {
      jwtService.sign.mockReturnValue('mock-access-token');
      prisma.refreshToken.create.mockResolvedValue({ id: 1, token: 'mock-refresh-hex' });

      await service.login(mockUser);

      // Verify the JWT payload only includes the four essential claims
      expect(jwtService.sign).toHaveBeenCalledWith(
        {
          sub: 42,
          email: 'seller@example.com',
          tradeRole: 'SELLER',
          userType: 'VENDOR',
        },
        {
          secret: 'test-secret',
          expiresIn: '1h',
        },
      );
      // Should NOT include firstName, lastName, or other user fields
      const signedPayload = jwtService.sign.mock.calls[0][0];
      expect(signedPayload).not.toHaveProperty('firstName');
      expect(signedPayload).not.toHaveProperty('lastName');
    });

    it('should generate a refresh token and store it in DB', async () => {
      jwtService.sign.mockReturnValue('mock-access-token');
      prisma.refreshToken.create.mockResolvedValue({ id: 1, token: 'stored-token' });

      await service.login(mockUser);

      // generateRefreshToken should call prisma.refreshToken.create
      expect(prisma.refreshToken.create).toHaveBeenCalledTimes(1);
      const createCall = prisma.refreshToken.create.mock.calls[0][0];
      expect(createCall.data).toHaveProperty('token');
      expect(createCall.data).toHaveProperty('userId', 42);
      expect(createCall.data).toHaveProperty('expiresAt');
      // Token should be a hex string (128 chars = 64 bytes * 2)
      expect(createCall.data.token).toMatch(/^[a-f0-9]{128}$/);
    });

    it('should return { data, userId, accessToken, refreshToken }', async () => {
      jwtService.sign.mockReturnValue('signed-jwt-token');
      prisma.refreshToken.create.mockResolvedValue({ id: 1 });

      const result = await service.login(mockUser);

      expect(result).toHaveProperty('data', mockUser);
      expect(result).toHaveProperty('userId', 42);
      expect(result).toHaveProperty('accessToken', 'signed-jwt-token');
      expect(result).toHaveProperty('refreshToken');
      expect(typeof result.refreshToken).toBe('string');
      expect(result.refreshToken.length).toBe(128); // 64 bytes as hex
    });
  });

  // ===========================================================================
  // getToken()
  // ===========================================================================
  describe('getToken()', () => {
    it('should create JWT with account context (id, tradeRole, userAccountId)', async () => {
      const user = { id: 10, tradeRole: 'BUYER', userAccountId: 5 };
      jwtService.sign.mockReturnValue('account-context-jwt');

      const result = await service.getToken(user);

      expect(jwtService.sign).toHaveBeenCalledWith(
        {
          user: {
            id: 10,
            tradeRole: 'BUYER',
            userAccountId: 5,
          },
          sub: 10,
        },
        {
          secret: 'test-secret',
          expiresIn: '1h',
        },
      );
      expect(result).toEqual({
        data: user,
        userId: 10,
        accessToken: 'account-context-jwt',
      });
    });

    it('should handle both user object structures (id or userId)', async () => {
      // When user has "userId" instead of "id"
      const userWithUserId = { userId: 99, tradeRole: 'SELLER' };
      jwtService.sign.mockReturnValue('jwt-with-userid');

      const result = await service.getToken(userWithUserId);

      // Should fall back to user.userId
      const signedPayload = jwtService.sign.mock.calls[0][0];
      expect(signedPayload.user.id).toBe(99);
      expect(signedPayload.sub).toBe(99);
      expect(result.userId).toBe(99);
    });

    it('should omit userAccountId from payload when not provided', async () => {
      const user = { id: 7, tradeRole: 'COMPANY' };
      jwtService.sign.mockReturnValue('jwt-no-account-id');

      await service.getToken(user);

      const signedPayload = jwtService.sign.mock.calls[0][0];
      expect(signedPayload.user).not.toHaveProperty('userAccountId');
      expect(signedPayload.user).toEqual({ id: 7, tradeRole: 'COMPANY' });
    });
  });

  // ===========================================================================
  // validateToken()
  // ===========================================================================
  describe('validateToken()', () => {
    it('should return valid result with user data for Format 1 (decoded.user object)', () => {
      // Format 1: legacy login — { user: {full user object}, sub: userId }
      const decodedPayload = {
        user: { id: 42, email: 'u@x.com', tradeRole: 'SELLER', userType: 'VENDOR' },
        sub: 42,
        iat: 1700000000,
        exp: 1700003600,
      };
      jwtService.verify.mockReturnValue(decodedPayload);

      const result = service.validateToken('valid-jwt-format1');

      expect(result).toEqual({
        error: false,
        user: { id: 42, email: 'u@x.com', tradeRole: 'SELLER', userType: 'VENDOR' },
        message: 'Token valid',
      });
      expect(jwtService.verify).toHaveBeenCalledWith('valid-jwt-format1', {
        secret: 'test-secret',
      });
    });

    it('should return valid result for Format 3 (decoded.sub at top level)', () => {
      // Format 3: new minimal login — { sub: userId, email, tradeRole, userType }
      const decodedPayload = {
        sub: 55,
        email: 'buyer@market.com',
        tradeRole: 'BUYER',
        userType: 'CONSUMER',
        iat: 1700000000,
        exp: 1700003600,
      };
      jwtService.verify.mockReturnValue(decodedPayload);

      const result = service.validateToken('valid-jwt-format3');

      expect(result.error).toBe(false);
      expect(result.message).toBe('Token valid');
      // Normalized user should always have an `id` field
      expect(result.user).toEqual({
        id: 55,
        email: 'buyer@market.com',
        tradeRole: 'BUYER',
        userType: 'CONSUMER',
        sub: 55,
      });
    });

    it('should return error for expired tokens', () => {
      jwtService.verify.mockImplementation(() => {
        const err = new Error('jwt expired');
        err.name = 'TokenExpiredError';
        throw err;
      });

      const result = service.validateToken('expired-jwt');

      expect(result).toEqual({
        error: true,
        user: null,
        message: 'Link Expired!',
      });
    });

    it('should return error for invalid tokens', () => {
      jwtService.verify.mockImplementation(() => {
        const err = new Error('invalid signature');
        err.name = 'JsonWebTokenError';
        throw err;
      });

      const result = service.validateToken('bad-signature-jwt');

      expect(result).toEqual({
        error: true,
        user: null,
        message: 'Invalid Token!',
      });
    });

    it('should return error for unknown verification failures', () => {
      jwtService.verify.mockImplementation(() => {
        throw new Error('something unexpected');
      });

      const result = service.validateToken('weird-jwt');

      expect(result).toEqual({
        error: true,
        user: null,
        message: 'Unable to Process Token',
      });
    });

    it('should return error for invalid token structure (no user, no sub)', () => {
      // Token decodes successfully but has neither `user` nor `sub`
      jwtService.verify.mockReturnValue({ iat: 1700000000, exp: 1700003600 });

      const result = service.validateToken('structurally-invalid-jwt');

      expect(result).toEqual({
        error: true,
        user: null,
        message: 'Invalid token structure',
      });
    });
  });

  // ===========================================================================
  // generateRefreshToken()
  // ===========================================================================
  describe('generateRefreshToken()', () => {
    it('should create 64-byte hex token', async () => {
      prisma.refreshToken.create.mockResolvedValue({ id: 1 });

      const token = await service.generateRefreshToken(100);

      // 64 bytes = 128 hex characters
      expect(typeof token).toBe('string');
      expect(token.length).toBe(128);
      expect(token).toMatch(/^[a-f0-9]+$/);
    });

    it('should store token with 7-day expiry in DB', async () => {
      prisma.refreshToken.create.mockResolvedValue({ id: 1 });

      const beforeCall = new Date();
      await service.generateRefreshToken(200);
      const afterCall = new Date();

      expect(prisma.refreshToken.create).toHaveBeenCalledTimes(1);
      const { data } = prisma.refreshToken.create.mock.calls[0][0];

      expect(data.userId).toBe(200);
      expect(data.token).toMatch(/^[a-f0-9]{128}$/);

      // expiresAt should be approximately 7 days from now
      const expiresAt = new Date(data.expiresAt);
      const sevenDaysFromBefore = new Date(beforeCall);
      sevenDaysFromBefore.setDate(sevenDaysFromBefore.getDate() + 7);
      const sevenDaysFromAfter = new Date(afterCall);
      sevenDaysFromAfter.setDate(sevenDaysFromAfter.getDate() + 7);

      expect(expiresAt.getTime()).toBeGreaterThanOrEqual(sevenDaysFromBefore.getTime() - 1000);
      expect(expiresAt.getTime()).toBeLessThanOrEqual(sevenDaysFromAfter.getTime() + 1000);
    });
  });

  // ===========================================================================
  // refreshAccessToken()
  // ===========================================================================
  describe('refreshAccessToken()', () => {
    const mockStoredToken = {
      id: 1,
      token: 'valid-refresh-token',
      userId: 42,
      revoked: false,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
      user: {
        id: 42,
        email: 'user@test.com',
        tradeRole: 'BUYER',
        userType: 'CONSUMER',
      },
    };

    it('should validate refresh token and issue new pair', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue(mockStoredToken);
      jwtService.sign.mockReturnValue('new-access-token');
      prisma.refreshToken.create.mockResolvedValue({ id: 2 });
      prisma.refreshToken.update.mockResolvedValue({});

      const result = await service.refreshAccessToken('valid-refresh-token');

      expect(result).toHaveProperty('accessToken', 'new-access-token');
      expect(result).toHaveProperty('refreshToken');
      expect(typeof result.refreshToken).toBe('string');
      expect(result.refreshToken.length).toBe(128);

      // Should sign JWT with minimal payload from the user
      expect(jwtService.sign).toHaveBeenCalledWith(
        {
          sub: 42,
          email: 'user@test.com',
          tradeRole: 'BUYER',
          userType: 'CONSUMER',
        },
        {
          secret: 'test-secret',
          expiresIn: '1h',
        },
      );
    });

    it('should revoke old token and create new one (rotation)', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue(mockStoredToken);
      jwtService.sign.mockReturnValue('rotated-access');
      prisma.refreshToken.create.mockResolvedValue({ id: 3 });
      prisma.refreshToken.update.mockResolvedValue({});

      const result = await service.refreshAccessToken('valid-refresh-token');

      // Old token should be revoked
      expect(prisma.refreshToken.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: {
          revoked: true,
          replacedBy: result.refreshToken,
        },
      });

      // New token should be created in DB
      expect(prisma.refreshToken.create).toHaveBeenCalledTimes(1);
      const createData = prisma.refreshToken.create.mock.calls[0][0].data;
      expect(createData.userId).toBe(42);
    });

    it('should revoke all tokens if reuse detected (revoked token used)', async () => {
      const revokedToken = { ...mockStoredToken, revoked: true };
      prisma.refreshToken.findUnique.mockResolvedValue(revokedToken);

      await expect(service.refreshAccessToken('reused-token')).rejects.toThrow(
        'Refresh token has been revoked — all sessions invalidated',
      );

      // Should revoke ALL tokens for that user (security measure)
      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { userId: 42 },
        data: { revoked: true },
      });
    });

    it('should throw error for expired refresh token', async () => {
      const expiredToken = {
        ...mockStoredToken,
        expiresAt: new Date(Date.now() - 1000), // expired 1 second ago
      };
      prisma.refreshToken.findUnique.mockResolvedValue(expiredToken);

      await expect(service.refreshAccessToken('expired-refresh')).rejects.toThrow(
        'Refresh token has expired',
      );
    });

    it('should throw error for invalid refresh token', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue(null);

      await expect(service.refreshAccessToken('nonexistent-token')).rejects.toThrow(
        'Invalid refresh token',
      );
    });
  });

  // ===========================================================================
  // revokeRefreshToken()
  // ===========================================================================
  describe('revokeRefreshToken()', () => {
    it('should mark token as revoked', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue({ id: 5, token: 'to-revoke' });
      prisma.refreshToken.update.mockResolvedValue({});

      await service.revokeRefreshToken('to-revoke');

      expect(prisma.refreshToken.findUnique).toHaveBeenCalledWith({
        where: { token: 'to-revoke' },
      });
      expect(prisma.refreshToken.update).toHaveBeenCalledWith({
        where: { id: 5 },
        data: { revoked: true },
      });
    });

    it('should handle non-existent token gracefully', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue(null);

      // Should not throw — just silently does nothing
      await expect(service.revokeRefreshToken('nonexistent')).resolves.toBeUndefined();

      expect(prisma.refreshToken.findUnique).toHaveBeenCalledWith({
        where: { token: 'nonexistent' },
      });
      // update should NOT be called if token does not exist
      expect(prisma.refreshToken.update).not.toHaveBeenCalled();
    });
  });
});

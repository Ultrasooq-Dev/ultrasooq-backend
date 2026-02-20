import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { ExecutionContext } from '@nestjs/common';
import { AuthGuard } from './AuthGuard';
import { AuthService } from '../auth/auth.service';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Mock AuthService — validateToken stub.
 */
const mockAuthService = {
  validateToken: jest.fn(),
};

/**
 * Mock PrismaService — user model stubs used by getActiveUserAccount.
 */
const mockPrismaService = {
  user: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
  },
};

/**
 * Helper to create a mock ExecutionContext with configurable request headers.
 */
function createMockExecutionContext(headers: Record<string, string> = {}): ExecutionContext {
  const request = {
    headers,
    user: null as any,
  };
  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as unknown as ExecutionContext;
}

describe('AuthGuard', () => {
  let guard: AuthGuard;
  let authService: typeof mockAuthService;
  let prisma: typeof mockPrismaService;

  // Preserve original env
  const originalEnv = { ...process.env };

  beforeEach(async () => {
    // Reset env to production defaults
    process.env.NODE_ENV = 'production';
    process.env.ENABLE_TEST_AUTH_BYPASS = 'false';

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthGuard,
        { provide: AuthService, useValue: mockAuthService },
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    guard = module.get<AuthGuard>(AuthGuard);
    authService = module.get(AuthService);
    prisma = module.get(PrismaService);

    jest.clearAllMocks();
  });

  afterAll(() => {
    // Restore original environment
    process.env = originalEnv;
  });

  it('should be defined', () => {
    expect(guard).toBeDefined();
  });

  // ===========================================================================
  // Token presence and validation
  // ===========================================================================
  describe('token validation', () => {
    it('should throw UnauthorizedException when no Authorization header', async () => {
      const ctx = createMockExecutionContext({});

      await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
      await expect(guard.canActivate(ctx)).rejects.toThrow('No authorization token provided');
    });

    it('should throw UnauthorizedException when token is invalid', async () => {
      const ctx = createMockExecutionContext({ authorization: 'Bearer invalid-token' });

      authService.validateToken.mockReturnValue({
        error: true,
        user: null,
        message: 'Invalid Token!',
      });

      // Also mock prisma user lookup for the guard flow
      await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
      await expect(guard.canActivate(ctx)).rejects.toThrow('Invalid Token!');
    });

    it('should attach user to request on valid token', async () => {
      const headers = { authorization: 'Bearer valid-jwt-token' };
      const ctx = createMockExecutionContext(headers);
      const request = ctx.switchToHttp().getRequest();

      const tokenUser = { id: 42, email: 'user@test.com', tradeRole: 'BUYER' };
      authService.validateToken.mockReturnValue({
        error: false,
        user: tokenUser,
        message: 'Token valid',
      });

      // Mock: user exists, is a master account, no active subaccount
      prisma.user.findUnique.mockResolvedValue({
        id: 42,
        email: 'user@test.com',
        firstName: 'John',
        lastName: 'Doe',
        tradeRole: 'BUYER',
        parentUserId: null,
        isCurrent: false,
        masterAccountId: null,
        deletedAt: null,
      });
      prisma.user.findFirst.mockResolvedValue(null); // No active subaccount

      const result = await guard.canActivate(ctx);

      expect(result).toBeTruthy();
      expect(result.error).toBe(false);
      expect(request.user).toBeDefined();
      expect(request.user.id).toBe(42);
      expect(request.user.email).toBe('user@test.com');
      expect(request.user.isSubAccount).toBe(false);
    });
  });

  // ===========================================================================
  // Subaccount resolution
  // ===========================================================================
  describe('subaccount resolution', () => {
    it('should handle subaccount resolution (user with parentUserId and isCurrent=true)', async () => {
      const ctx = createMockExecutionContext({ authorization: 'Bearer jwt-sub' });
      const request = ctx.switchToHttp().getRequest();

      const tokenUser = { id: 100, email: 'sub@test.com', tradeRole: 'SELLER' };
      authService.validateToken.mockReturnValue({
        error: false,
        user: tokenUser,
        message: 'Token valid',
      });

      // The user from DB IS a subaccount (has parentUserId) and IS the current one
      prisma.user.findUnique.mockResolvedValue({
        id: 100,
        email: 'sub@test.com',
        firstName: 'Sub',
        lastName: 'Account',
        tradeRole: 'SELLER',
        parentUserId: 50,
        isCurrent: true,
        masterAccountId: 50,
        deletedAt: null,
      });

      const result = await guard.canActivate(ctx);

      expect(result).toBeTruthy();
      expect(request.user.id).toBe(100);
      expect(request.user.isSubAccount).toBe(true);
      expect(request.user.parentUserId).toBe(50);
      expect(request.user.masterAccountId).toBe(50);
    });

    it('should find active subaccount from parent (parentUserId lookup)', async () => {
      const ctx = createMockExecutionContext({ authorization: 'Bearer jwt-parent' });
      const request = ctx.switchToHttp().getRequest();

      const tokenUser = { id: 50, email: 'master@test.com', tradeRole: 'SELLER' };
      authService.validateToken.mockReturnValue({
        error: false,
        user: tokenUser,
        message: 'Token valid',
      });

      // Master account user
      prisma.user.findUnique.mockResolvedValue({
        id: 50,
        email: 'master@test.com',
        firstName: 'Master',
        lastName: 'User',
        tradeRole: 'SELLER',
        parentUserId: null,
        isCurrent: false,
        masterAccountId: null,
        deletedAt: null,
      });

      // Active subaccount found under this master
      prisma.user.findFirst.mockResolvedValue({
        id: 101,
        email: 'activesub@test.com',
        firstName: 'Active',
        lastName: 'Sub',
        tradeRole: 'SELLER',
        parentUserId: 50,
        isCurrent: true,
        masterAccountId: 50,
        deletedAt: null,
      });

      const result = await guard.canActivate(ctx);

      expect(result).toBeTruthy();
      expect(request.user.id).toBe(101);
      expect(request.user.email).toBe('activesub@test.com');
      expect(request.user.isSubAccount).toBe(true);
      expect(request.user.masterAccountId).toBe(50);

      // Verify findFirst was called with correct where clause
      expect(prisma.user.findFirst).toHaveBeenCalledWith({
        where: {
          parentUserId: 50,
          isCurrent: true,
          deletedAt: null,
        },
      });
    });

    it('should fall back to master account when no active subaccount', async () => {
      const ctx = createMockExecutionContext({ authorization: 'Bearer jwt-master' });
      const request = ctx.switchToHttp().getRequest();

      const tokenUser = { id: 50, email: 'master@test.com', tradeRole: 'SELLER' };
      authService.validateToken.mockReturnValue({
        error: false,
        user: tokenUser,
        message: 'Token valid',
      });

      // Master account user, no parentUserId
      prisma.user.findUnique.mockResolvedValue({
        id: 50,
        email: 'master@test.com',
        firstName: 'Master',
        lastName: 'User',
        tradeRole: 'SELLER',
        parentUserId: null,
        isCurrent: false,
        masterAccountId: null,
        deletedAt: null,
      });

      // No active subaccount
      prisma.user.findFirst.mockResolvedValue(null);

      const result = await guard.canActivate(ctx);

      expect(result).toBeTruthy();
      expect(request.user.id).toBe(50);
      expect(request.user.isSubAccount).toBe(false);
      expect(request.user.email).toBe('master@test.com');
    });
  });

  // ===========================================================================
  // Test auth bypass (development mode)
  // ===========================================================================
  describe('test auth bypass in development mode', () => {
    beforeEach(() => {
      process.env.NODE_ENV = 'development';
      process.env.ENABLE_TEST_AUTH_BYPASS = 'true';
    });

    it('should handle test auth bypass in development mode (valid user)', async () => {
      const ctx = createMockExecutionContext({ 'x-test-user-id': '99' });
      const request = ctx.switchToHttp().getRequest();

      prisma.user.findUnique.mockResolvedValue({
        id: 99,
        email: 'testuser@dev.com',
        userType: 'VENDOR',
      });

      const result = await guard.canActivate(ctx);

      expect(result).toEqual({
        error: false,
        user: {
          id: 99,
          email: 'testuser@dev.com',
          userType: 'VENDOR',
          isTestBypass: true,
        },
        message: 'Test bypass active',
      });
      expect(request.user).toEqual({
        id: 99,
        email: 'testuser@dev.com',
        userType: 'VENDOR',
        isTestBypass: true,
      });
    });

    it('should reject test auth bypass with invalid user ID (non-positive)', async () => {
      const ctxZero = createMockExecutionContext({ 'x-test-user-id': '0' });
      await expect(guard.canActivate(ctxZero)).rejects.toThrow(UnauthorizedException);
      await expect(guard.canActivate(ctxZero)).rejects.toThrow(
        'Invalid test user ID: must be a positive integer',
      );

      const ctxNegative = createMockExecutionContext({ 'x-test-user-id': '-5' });
      await expect(guard.canActivate(ctxNegative)).rejects.toThrow(UnauthorizedException);

      const ctxNaN = createMockExecutionContext({ 'x-test-user-id': 'abc' });
      await expect(guard.canActivate(ctxNaN)).rejects.toThrow(UnauthorizedException);
    });

    it('should reject test auth bypass when user does not exist', async () => {
      const ctx = createMockExecutionContext({ 'x-test-user-id': '999' });

      prisma.user.findUnique.mockResolvedValue(null);

      await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
      await expect(guard.canActivate(ctx)).rejects.toThrow(
        'Test auth bypass rejected: user with ID 999 does not exist',
      );
    });

    it('should NOT bypass auth when NODE_ENV is not development', async () => {
      process.env.NODE_ENV = 'production';
      process.env.ENABLE_TEST_AUTH_BYPASS = 'true';

      // Even with x-test-user-id header, production mode should not bypass
      const ctx = createMockExecutionContext({ 'x-test-user-id': '99' });

      // No Authorization header → should throw
      await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
      await expect(guard.canActivate(ctx)).rejects.toThrow('No authorization token provided');
    });

    it('should NOT bypass auth when ENABLE_TEST_AUTH_BYPASS is not true', async () => {
      process.env.NODE_ENV = 'development';
      process.env.ENABLE_TEST_AUTH_BYPASS = 'false';

      const ctx = createMockExecutionContext({ 'x-test-user-id': '99' });

      // Should fall through to normal token validation, no auth header → throw
      await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
    });
  });
});

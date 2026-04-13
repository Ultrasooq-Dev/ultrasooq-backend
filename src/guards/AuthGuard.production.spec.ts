/**
 * PRODUCTION-GRADE AUTH GUARD TESTS
 * Covers: JWT extraction, test auth bypass, sub-account resolution,
 * missing headers, malformed tokens, security boundaries
 */
import { Test, TestingModule } from '@nestjs/testing';
import { AuthGuard } from './AuthGuard';
import { AuthService } from 'src/auth/auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { ExecutionContext, UnauthorizedException } from '@nestjs/common';

// ─── Helpers ────────────────────────────────────────────────

function createMockContext(headers: Record<string, string> = {}): ExecutionContext {
  const request = {
    headers: { ...headers },
    user: null as any,
  };

  return {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => ({}),
      getNext: () => jest.fn(),
    }),
    getClass: () => ({}),
    getHandler: () => ({}),
    getArgs: () => [request, {}, jest.fn()],
    getArgByIndex: (i: number) => [request, {}, jest.fn()][i],
    getType: () => 'http' as const,
    switchToRpc: jest.fn() as any,
    switchToWs: jest.fn() as any,
  } as unknown as ExecutionContext;
}

const mockAuthService = {
  validateToken: jest.fn(),
};

const mockPrisma = {
  user: {
    findFirst: jest.fn(),
  },
};

describe('AuthGuard — Production Tests', () => {
  let guard: AuthGuard;
  const originalEnv = { ...process.env };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthGuard,
        { provide: AuthService, useValue: mockAuthService },
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    guard = module.get<AuthGuard>(AuthGuard);
    jest.clearAllMocks();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  // ═══════════════════════════════════════════════════════════
  // HAPPY PATH
  // ═══════════════════════════════════════════════════════════

  describe('Valid authentication', () => {
    it('allows request with valid Bearer token', async () => {
      const ctx = createMockContext({
        authorization: 'Bearer valid-jwt-token',
      });

      mockAuthService.validateToken.mockReturnValue({
        error: false,
        user: { sub: 1, email: 'user@test.com', tradeRole: 'BUYER' },
        message: 'ok',
      });

      mockPrisma.user.findFirst.mockResolvedValue({
        id: 1,
        email: 'user@test.com',
        status: 'ACTIVE',
      });

      const result = await guard.canActivate(ctx);

      expect(result).toBe(true);
      expect(mockAuthService.validateToken).toHaveBeenCalledWith('valid-jwt-token');
    });

    it('attaches user to request object', async () => {
      const ctx = createMockContext({
        authorization: 'Bearer my-token',
      });

      mockAuthService.validateToken.mockReturnValue({
        error: false,
        user: { sub: 5, email: 'attached@test.com', tradeRole: 'COMPANY' },
        message: 'ok',
      });

      mockPrisma.user.findFirst.mockResolvedValue({
        id: 5,
        email: 'attached@test.com',
        status: 'ACTIVE',
      });

      await guard.canActivate(ctx);

      const request = ctx.switchToHttp().getRequest();
      expect(request.user).toBeDefined();
    });
  });

  // ═══════════════════════════════════════════════════════════
  // MISSING / MALFORMED HEADERS
  // ═══════════════════════════════════════════════════════════

  describe('Missing or malformed auth headers', () => {
    it('throws UnauthorizedException when no Authorization header', async () => {
      const ctx = createMockContext({});

      await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
    });

    it('throws on Authorization header without Bearer prefix', async () => {
      const ctx = createMockContext({ authorization: 'Basic abc123' });

      await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
    });

    it('throws on empty Bearer value', async () => {
      const ctx = createMockContext({ authorization: 'Bearer ' });

      mockAuthService.validateToken.mockReturnValue({
        error: true,
        message: 'jwt must be provided',
      });

      await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
    });

    it('throws on "Bearer null"', async () => {
      const ctx = createMockContext({ authorization: 'Bearer null' });

      mockAuthService.validateToken.mockReturnValue({
        error: true,
        message: 'jwt malformed',
      });

      await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
    });

    it('throws on "Bearer undefined"', async () => {
      const ctx = createMockContext({ authorization: 'Bearer undefined' });

      mockAuthService.validateToken.mockReturnValue({
        error: true,
        message: 'jwt malformed',
      });

      await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
    });
  });

  // ═══════════════════════════════════════════════════════════
  // EXPIRED / INVALID TOKENS
  // ═══════════════════════════════════════════════════════════

  describe('Token validation failures', () => {
    it('throws on expired token', async () => {
      const ctx = createMockContext({ authorization: 'Bearer expired-jwt' });

      mockAuthService.validateToken.mockReturnValue({
        error: true,
        message: 'jwt expired',
      });

      await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
    });

    it('throws on token with invalid signature', async () => {
      const ctx = createMockContext({ authorization: 'Bearer tampered-jwt' });

      mockAuthService.validateToken.mockReturnValue({
        error: true,
        message: 'invalid signature',
      });

      await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
    });
  });

  // ═══════════════════════════════════════════════════════════
  // TEST AUTH BYPASS (Development only)
  // ═══════════════════════════════════════════════════════════

  describe('Test auth bypass', () => {
    it('allows bypass with x-test-user-id in dev + ENABLE_TEST_AUTH_BYPASS', async () => {
      process.env.NODE_ENV = 'development';
      process.env.ENABLE_TEST_AUTH_BYPASS = 'true';

      const ctx = createMockContext({
        'x-test-user-id': '42',
      });

      mockPrisma.user.findFirst.mockResolvedValue({
        id: 42,
        email: 'dev@test.com',
        tradeRole: 'BUYER',
        status: 'ACTIVE',
      });

      const result = await guard.canActivate(ctx);

      expect(result).toBe(true);
      // Should NOT call validateToken — bypassed
      expect(mockAuthService.validateToken).not.toHaveBeenCalled();
    });

    it('DOES NOT allow bypass when ENABLE_TEST_AUTH_BYPASS is not set', async () => {
      process.env.NODE_ENV = 'development';
      delete process.env.ENABLE_TEST_AUTH_BYPASS;

      const ctx = createMockContext({
        'x-test-user-id': '42',
      });

      // Without the bypass flag, it should require real auth
      await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
    });

    it('DOES NOT allow bypass in production even with flag', async () => {
      process.env.NODE_ENV = 'production';
      process.env.ENABLE_TEST_AUTH_BYPASS = 'true';

      const ctx = createMockContext({
        'x-test-user-id': '42',
      });

      await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
    });

    it('rejects non-numeric x-test-user-id', async () => {
      process.env.NODE_ENV = 'development';
      process.env.ENABLE_TEST_AUTH_BYPASS = 'true';

      const ctx = createMockContext({
        'x-test-user-id': 'not-a-number',
      });

      mockPrisma.user.findFirst.mockResolvedValue(null);

      await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
    });
  });

  // ═══════════════════════════════════════════════════════════
  // SUB-ACCOUNT RESOLUTION
  // ═══════════════════════════════════════════════════════════

  describe('Sub-account context resolution', () => {
    it('resolves active sub-account for parent user', async () => {
      const ctx = createMockContext({
        authorization: 'Bearer valid-token',
      });

      mockAuthService.validateToken.mockReturnValue({
        error: false,
        user: { sub: 1, email: 'parent@test.com', tradeRole: 'BUYER' },
        message: 'ok',
      });

      // Returns the active sub-account
      mockPrisma.user.findFirst.mockResolvedValue({
        id: 10,
        email: 'parent@test.com',
        tradeRole: 'COMPANY',
        parentUserId: 1,
        isCurrent: true,
        status: 'ACTIVE',
      });

      const result = await guard.canActivate(ctx);
      expect(result).toBe(true);
    });

    it('handles user with no sub-accounts', async () => {
      const ctx = createMockContext({
        authorization: 'Bearer valid-token',
      });

      mockAuthService.validateToken.mockReturnValue({
        error: false,
        user: { sub: 1, email: 'solo@test.com', tradeRole: 'BUYER' },
        message: 'ok',
      });

      mockPrisma.user.findFirst.mockResolvedValue({
        id: 1,
        email: 'solo@test.com',
        tradeRole: 'BUYER',
        status: 'ACTIVE',
      });

      const result = await guard.canActivate(ctx);
      expect(result).toBe(true);
    });
  });

  // ═══════════════════════════════════════════════════════════
  // SECURITY: Attack vectors
  // ═══════════════════════════════════════════════════════════

  describe('Security — Attack vectors', () => {
    it('rejects SQL injection in x-test-user-id', async () => {
      process.env.NODE_ENV = 'development';
      process.env.ENABLE_TEST_AUTH_BYPASS = 'true';

      const ctx = createMockContext({
        'x-test-user-id': "1; DROP TABLE users;--",
      });

      mockPrisma.user.findFirst.mockResolvedValue(null);

      await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
    });

    it('rejects XSS payloads in Authorization header', async () => {
      const ctx = createMockContext({
        authorization: 'Bearer <script>alert(1)</script>',
      });

      mockAuthService.validateToken.mockReturnValue({
        error: true,
        message: 'jwt malformed',
      });

      await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
    });

    it('handles extremely long token strings (DoS prevention)', async () => {
      const longToken = 'a'.repeat(100000);
      const ctx = createMockContext({
        authorization: `Bearer ${longToken}`,
      });

      mockAuthService.validateToken.mockReturnValue({
        error: true,
        message: 'jwt malformed',
      });

      await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
    });

    it('rejects token with spaces injected', async () => {
      const ctx = createMockContext({
        authorization: 'Bearer valid token with spaces',
      });

      mockAuthService.validateToken.mockReturnValue({
        error: true,
        message: 'jwt malformed',
      });

      await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
    });
  });
});

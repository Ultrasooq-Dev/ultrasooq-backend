import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import helmet from 'helmet';
import * as compression from 'compression';
import { AppModule } from './../src/app.module';

/**
 * E2E tests for the Authentication endpoints.
 *
 * These tests exercise the POST /api/v1/auth/refresh and POST /api/v1/auth/logout
 * routes through the full NestJS HTTP stack, including middleware, pipes, guards,
 * and exception filters.
 *
 * NOTE: The auth controller lives under the 'auth' prefix, and the app applies a
 * global prefix of 'api/v1', so the actual routes are /api/v1/auth/refresh and
 * /api/v1/auth/logout.
 */
describe('AuthController (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();

    // Mirror the global configuration from main.ts
    app.use(
      helmet({
        contentSecurityPolicy: false,
        crossOriginEmbedderPolicy: false,
      }),
    );
    app.use(compression({ threshold: 1024, level: 6 }));
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    app.setGlobalPrefix('api/v1', {
      exclude: ['health', 'health/ready', 'health/live'],
    });
    app.enableCors({
      origin: ['http://localhost:4001', 'http://localhost:3001', 'http://localhost:3000'],
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'x-test-user-id'],
      credentials: true,
    });

    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  // ─── POST /api/v1/auth/refresh ────────────────────────────────────────────

  describe('POST /api/v1/auth/refresh', () => {
    it('should return 400 when refreshToken is missing from body', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({})
        .expect(400);

      expect(response.body).toBeDefined();
      expect(response.body.status).toBe(false);
      expect(response.body.message).toContain('refreshToken is required');
    });

    it('should return 400 when body is completely empty', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send()
        .expect(400);

      expect(response.body).toBeDefined();
      expect(response.body.status).toBe(false);
      expect(response.body.message).toContain('refreshToken is required');
    });

    it('should return 400 when refreshToken is an empty string', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: '' })
        .expect(400);

      expect(response.body).toBeDefined();
      expect(response.body.status).toBe(false);
      expect(response.body.message).toContain('refreshToken is required');
    });

    it('should return 400 for an invalid/expired refresh token', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: 'invalid-token-that-does-not-exist-in-db' })
        .expect(400);

      expect(response.body).toBeDefined();
      expect(response.body.status).toBe(false);
      expect(response.body.message).toBeDefined();
    });
  });

  // ─── POST /api/v1/auth/logout ─────────────────────────────────────────────

  describe('POST /api/v1/auth/logout', () => {
    it('should return 400 when refreshToken is missing from body', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/logout')
        .send({})
        .expect(400);

      expect(response.body).toBeDefined();
      expect(response.body.status).toBe(false);
      expect(response.body.message).toContain('refreshToken is required');
    });

    it('should return 400 when body is completely empty', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/logout')
        .send()
        .expect(400);

      expect(response.body).toBeDefined();
      expect(response.body.status).toBe(false);
      expect(response.body.message).toContain('refreshToken is required');
    });

    it('should return 400 when refreshToken is an empty string', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/logout')
        .send({ refreshToken: '' })
        .expect(400);

      expect(response.body).toBeDefined();
      expect(response.body.status).toBe(false);
      expect(response.body.message).toContain('refreshToken is required');
    });

    it('should return 400 for an invalid/non-existent refresh token', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/logout')
        .send({ refreshToken: 'non-existent-refresh-token-value' })
        .expect(400);

      expect(response.body).toBeDefined();
      expect(response.body.status).toBe(false);
      expect(response.body.message).toBeDefined();
    });
  });
});

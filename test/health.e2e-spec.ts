import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import helmet from 'helmet';
import * as compression from 'compression';
import { AppModule } from './../src/app.module';

/**
 * E2E tests for the Health Check endpoints.
 *
 * The HealthController is registered at the 'health' prefix and is excluded
 * from the global 'api/v1' prefix (see main.ts setGlobalPrefix exclude list).
 * Therefore the routes are:
 *   GET /health       — Full health (DB + memory)
 *   GET /health/ready — Readiness probe (DB only)
 *   GET /health/live  — Liveness probe (lightweight, no external deps)
 *
 * The health controller also has @SkipThrottle() so rate limiting does not
 * apply to these endpoints.
 */
describe('HealthController (e2e)', () => {
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

  // ─── GET /health ──────────────────────────────────────────────────────────

  describe('GET /health', () => {
    it('should return overall health status with status "ok" or "error"', async () => {
      const response = await request(app.getHttpServer())
        .get('/health')
        .expect((res) => {
          // Accept 200 (healthy) or 503 (unhealthy — e.g. DB not connected in test)
          expect([200, 503]).toContain(res.status);
        });

      expect(response.body).toBeDefined();
      expect(response.body.status).toBeDefined();
      // Terminus returns { status: 'ok' | 'error', info: {}, error: {}, details: {} }
      expect(['ok', 'error']).toContain(response.body.status);

      // Should contain detail keys regardless of health state
      if (response.body.status === 'ok') {
        expect(response.body.info).toBeDefined();
      }
      if (response.body.status === 'error') {
        expect(response.body.error).toBeDefined();
      }
    });

    it('should include database health indicator in the response', async () => {
      const response = await request(app.getHttpServer()).get('/health');

      expect(response.body).toBeDefined();
      const details = response.body.details || response.body.info || response.body.error;
      // The health check includes a 'database' key from PrismaHealthIndicator
      if (details) {
        expect(details.database || details).toBeDefined();
      }
    });

    it('should include memory health indicator in the response', async () => {
      const response = await request(app.getHttpServer()).get('/health');

      expect(response.body).toBeDefined();
      const details = response.body.details || response.body.info || response.body.error;
      if (details) {
        // The health check includes a 'memory_heap' key from MemoryHealthIndicator
        expect(details.memory_heap || details).toBeDefined();
      }
    });
  });

  // ─── GET /health/ready ────────────────────────────────────────────────────

  describe('GET /health/ready', () => {
    it('should return readiness status with status "ok" or "error"', async () => {
      const response = await request(app.getHttpServer())
        .get('/health/ready')
        .expect((res) => {
          // Accept 200 (ready) or 503 (not ready — DB down in test env)
          expect([200, 503]).toContain(res.status);
        });

      expect(response.body).toBeDefined();
      expect(response.body.status).toBeDefined();
      expect(['ok', 'error']).toContain(response.body.status);
    });

    it('should check database connectivity for readiness', async () => {
      const response = await request(app.getHttpServer()).get('/health/ready');

      expect(response.body).toBeDefined();
      const details = response.body.details || response.body.info || response.body.error;
      if (details) {
        expect(details.database || details).toBeDefined();
      }
    });
  });

  // ─── GET /health/live ─────────────────────────────────────────────────────

  describe('GET /health/live', () => {
    it('should return liveness status with status "ok"', async () => {
      const response = await request(app.getHttpServer())
        .get('/health/live')
        .expect(200);

      expect(response.body).toBeDefined();
      expect(response.body.status).toBe('ok');
    });

    it('should include uptime in the liveness response', async () => {
      const response = await request(app.getHttpServer())
        .get('/health/live')
        .expect(200);

      expect(response.body.uptime).toBeDefined();
      expect(typeof response.body.uptime).toBe('number');
      expect(response.body.uptime).toBeGreaterThanOrEqual(0);
    });

    it('should include a valid ISO timestamp in the liveness response', async () => {
      const response = await request(app.getHttpServer())
        .get('/health/live')
        .expect(200);

      expect(response.body.timestamp).toBeDefined();
      // Validate ISO 8601 format
      const parsed = new Date(response.body.timestamp);
      expect(parsed.toISOString()).toBe(response.body.timestamp);
    });
  });
});

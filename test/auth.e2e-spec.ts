import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import helmet from 'helmet';
import * as compression from 'compression';
import { AppModule } from './../src/app.module';

/**
 * E2E tests for removed legacy authentication endpoints.
 *
 * Better Auth now owns browser sessions at /api/auth/* from main.ts. The old
 * Nest /api/v1/auth refresh-token rotation endpoints should stay unavailable.
 */
describe('AuthController (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();

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

  it('returns 404 for legacy refresh-token rotation', () => {
    return request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({})
      .expect(404);
  });

  it('returns 404 for legacy logout/session invalidation', () => {
    return request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .send({})
      .expect(404);
  });
});

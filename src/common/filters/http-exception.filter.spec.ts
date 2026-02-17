import { ArgumentsHost, HttpException, HttpStatus } from '@nestjs/common';
import { GlobalExceptionFilter } from './http-exception.filter';

/**
 * Helper: creates a mock ArgumentsHost that captures the response JSON.
 */
function createMockArgumentsHost(url: string = '/test/path'): {
  host: ArgumentsHost;
  getResponseBody: () => any;
  getStatusCode: () => number;
} {
  let responseBody: any = null;
  let statusCode: number = 0;

  const response = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockImplementation((body) => {
      responseBody = body;
    }),
  };

  // Capture the status code when status() is called
  response.status.mockImplementation((code: number) => {
    statusCode = code;
    return response;
  });

  const request = {
    url,
  };

  const host = {
    switchToHttp: () => ({
      getResponse: () => response,
      getRequest: () => request,
    }),
  } as unknown as ArgumentsHost;

  return {
    host,
    getResponseBody: () => responseBody,
    getStatusCode: () => statusCode,
  };
}

describe('GlobalExceptionFilter', () => {
  let filter: GlobalExceptionFilter;

  beforeEach(() => {
    filter = new GlobalExceptionFilter();
  });

  it('should be defined', () => {
    expect(filter).toBeDefined();
  });

  // ===========================================================================
  // HttpException handling
  // ===========================================================================
  describe('HttpException handling', () => {
    it('should handle HttpException with string response', () => {
      const exception = new HttpException('Not Found Resource', HttpStatus.NOT_FOUND);
      const { host, getResponseBody, getStatusCode } = createMockArgumentsHost('/api/products/999');

      filter.catch(exception, host);

      expect(getStatusCode()).toBe(404);
      const body = getResponseBody();
      expect(body.statusCode).toBe(404);
      expect(body.message).toBe('Not Found Resource');
      expect(body.error).toBe('NOT_FOUND');
      expect(body.path).toBe('/api/products/999');
      expect(body.timestamp).toBeDefined();
      // Timestamp should be a valid ISO string
      expect(() => new Date(body.timestamp)).not.toThrow();
    });

    it('should handle HttpException with object response', () => {
      const exception = new HttpException(
        {
          message: 'Validation failed',
          error: 'Bad Request',
        },
        HttpStatus.BAD_REQUEST,
      );
      const { host, getResponseBody, getStatusCode } = createMockArgumentsHost('/api/users');

      filter.catch(exception, host);

      expect(getStatusCode()).toBe(400);
      const body = getResponseBody();
      expect(body.statusCode).toBe(400);
      expect(body.message).toBe('Validation failed');
      // error should be overwritten by HttpStatus[status]
      expect(body.error).toBe('BAD_REQUEST');
      expect(body.path).toBe('/api/users');
    });

    it('should handle HttpException with object response containing nested message array', () => {
      // NestJS validation pipe can return { message: ['field1 error', 'field2 error'] }
      const exception = new HttpException(
        {
          message: ['email must be valid', 'password too short'],
          error: 'Bad Request',
        },
        HttpStatus.BAD_REQUEST,
      );
      const { host, getResponseBody } = createMockArgumentsHost('/api/register');

      filter.catch(exception, host);

      const body = getResponseBody();
      expect(body.statusCode).toBe(400);
      // message should be the array as-is
      expect(body.message).toEqual(['email must be valid', 'password too short']);
    });

    it('should handle 401 Unauthorized', () => {
      const exception = new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
      const { host, getResponseBody, getStatusCode } = createMockArgumentsHost('/api/protected');

      filter.catch(exception, host);

      expect(getStatusCode()).toBe(401);
      const body = getResponseBody();
      expect(body.statusCode).toBe(401);
      expect(body.error).toBe('UNAUTHORIZED');
    });

    it('should handle 403 Forbidden', () => {
      const exception = new HttpException(
        { message: 'Admin only' },
        HttpStatus.FORBIDDEN,
      );
      const { host, getResponseBody, getStatusCode } = createMockArgumentsHost('/api/admin');

      filter.catch(exception, host);

      expect(getStatusCode()).toBe(403);
      const body = getResponseBody();
      expect(body.statusCode).toBe(403);
      expect(body.message).toBe('Admin only');
      expect(body.error).toBe('FORBIDDEN');
    });
  });

  // ===========================================================================
  // Non-HttpException (generic Error) handling
  // ===========================================================================
  describe('generic Error handling', () => {
    it('should handle generic Error (non-HttpException)', () => {
      const exception = new Error('Database connection failed');
      const { host, getResponseBody, getStatusCode } = createMockArgumentsHost('/api/data');

      filter.catch(exception, host);

      expect(getStatusCode()).toBe(500);
      const body = getResponseBody();
      expect(body.statusCode).toBe(500);
      expect(body.message).toBe('Database connection failed');
      expect(body.error).toBe('Internal Server Error');
      expect(body.path).toBe('/api/data');
    });

    it('should return 500 for unknown exceptions', () => {
      // Something that is neither HttpException nor Error
      const exception = 'a string thrown as exception';
      const { host, getResponseBody, getStatusCode } = createMockArgumentsHost('/api/unknown');

      filter.catch(exception as any, host);

      expect(getStatusCode()).toBe(500);
      const body = getResponseBody();
      expect(body.statusCode).toBe(500);
      expect(body.message).toBe('Internal server error');
      expect(body.error).toBe('Internal Server Error');
    });

    it('should return 500 for null/undefined exceptions', () => {
      const { host, getResponseBody, getStatusCode } = createMockArgumentsHost('/api/null');

      filter.catch(null as any, host);

      expect(getStatusCode()).toBe(500);
      const body = getResponseBody();
      expect(body.statusCode).toBe(500);
      expect(body.message).toBe('Internal server error');
    });
  });

  // ===========================================================================
  // Consistent response format
  // ===========================================================================
  describe('response format', () => {
    it('should return consistent response format with statusCode, message, error, timestamp, path', () => {
      const exception = new HttpException('Test', HttpStatus.I_AM_A_TEAPOT);
      const { host, getResponseBody } = createMockArgumentsHost('/brew/coffee');

      filter.catch(exception, host);

      const body = getResponseBody();
      // All five fields should always be present
      expect(body).toHaveProperty('statusCode');
      expect(body).toHaveProperty('message');
      expect(body).toHaveProperty('error');
      expect(body).toHaveProperty('timestamp');
      expect(body).toHaveProperty('path');
      expect(typeof body.statusCode).toBe('number');
      expect(typeof body.timestamp).toBe('string');
      expect(typeof body.path).toBe('string');
    });

    it('should include correct path from request URL', () => {
      const exception = new HttpException('x', 400);
      const { host, getResponseBody } = createMockArgumentsHost('/api/v2/orders?page=1&limit=10');

      filter.catch(exception, host);

      const body = getResponseBody();
      expect(body.path).toBe('/api/v2/orders?page=1&limit=10');
    });
  });
});

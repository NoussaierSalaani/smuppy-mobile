/**
 * CORS Utils Unit Tests
 */

jest.unmock('../../utils/cors');

import {
  createHeaders,
  getAllowedOrigin,
  getSecureHeaders,
  getCorsHeaders,
  createCorsResponse,
  cors,
  createCacheableHeaders,
} from '../../utils/cors';
import { APIGatewayProxyEvent } from 'aws-lambda';

// Mock environment
const originalEnv = process.env;

beforeEach(() => {
  jest.resetModules();
  process.env = { ...originalEnv };
});

afterAll(() => {
  process.env = originalEnv;
});

describe('CORS Utils', () => {
  describe('getAllowedOrigin', () => {
    it('should return allowed production origins', () => {
      process.env.ENVIRONMENT = 'production';

      expect(getAllowedOrigin('https://smuppy.com')).toBe('https://smuppy.com');
      expect(getAllowedOrigin('https://www.smuppy.com')).toBe('https://www.smuppy.com');
      expect(getAllowedOrigin('https://app.smuppy.com')).toBe('https://app.smuppy.com');
    });

    it('should reject unknown origins in production', () => {
      process.env.ENVIRONMENT = 'production';

      expect(getAllowedOrigin('https://evil.com')).toBe('https://smuppy.com');
      expect(getAllowedOrigin('https://smuppy.com.evil.com')).toBe('https://smuppy.com');
    });

    it('should allow localhost in non-production', () => {
      process.env.ENVIRONMENT = 'staging';

      expect(getAllowedOrigin('http://localhost:8081')).toBe('http://localhost:8081');
      expect(getAllowedOrigin('http://localhost:19006')).toBe('http://localhost:19006');
      expect(getAllowedOrigin('http://localhost:3000')).toBe('http://localhost:3000');
    });

    it('should never return wildcard *', () => {
      process.env.ENVIRONMENT = 'staging';

      const result = getAllowedOrigin('https://random-origin.com');
      expect(result).not.toBe('*');
    });

    it('should handle missing origin header', () => {
      process.env.ENVIRONMENT = 'production';

      expect(getAllowedOrigin(undefined)).toBe('https://smuppy.com');
      expect(getAllowedOrigin('')).toBe('https://smuppy.com');
    });
  });

  describe('getSecureHeaders', () => {
    it('should include all security headers', () => {
      const headers = getSecureHeaders('https://smuppy.com');

      expect(headers['Content-Type']).toBe('application/json');
      expect(headers['X-Content-Type-Options']).toBe('nosniff');
      expect(headers['X-Frame-Options']).toBe('DENY');
      expect(headers['X-XSS-Protection']).toBe('1; mode=block');
      expect(headers['Strict-Transport-Security']).toContain('max-age=');
      expect(headers['Cache-Control']).toContain('no-store');
    });

    it('should set correct CORS headers', () => {
      const headers = getSecureHeaders('https://smuppy.com');

      expect(headers['Access-Control-Allow-Origin']).toBe('https://smuppy.com');
      expect(headers['Access-Control-Allow-Methods']).toContain('GET');
      expect(headers['Access-Control-Allow-Methods']).toContain('POST');
      expect(headers['Access-Control-Allow-Credentials']).toBe('true');
    });

    it('should include CSP header', () => {
      const headers = getSecureHeaders('https://smuppy.com');

      expect(headers['Content-Security-Policy']).toContain("default-src 'none'");
    });
  });

  describe('createHeaders', () => {
    it('should extract origin from event and create headers', () => {
      const mockEvent = {
        headers: {
          origin: 'https://smuppy.com',
        },
      } as unknown as APIGatewayProxyEvent;

      const headers = createHeaders(mockEvent);

      expect(headers['Access-Control-Allow-Origin']).toBe('https://smuppy.com');
    });

    it('should handle case-insensitive Origin header', () => {
      const mockEvent = {
        headers: {
          Origin: 'https://smuppy.com',
        },
      } as unknown as APIGatewayProxyEvent;

      const headers = createHeaders(mockEvent);

      expect(headers['Access-Control-Allow-Origin']).toBeDefined();
    });

    it('should handle missing headers', () => {
      const mockEvent = {
        headers: null,
      } as unknown as APIGatewayProxyEvent;

      const headers = createHeaders(mockEvent);

      expect(headers['Access-Control-Allow-Origin']).toBeDefined();
    });

    it('should handle event with no argument', () => {
      const headers = createHeaders();

      expect(headers['Access-Control-Allow-Origin']).toBe('https://smuppy.com');
      expect(headers['Content-Type']).toBe('application/json');
    });

    it('should include X-Request-Id header when present in event', () => {
      const mockEvent = {
        headers: {
          origin: 'https://smuppy.com',
          'x-request-id': 'req-abc-123',
        },
      };

      const headers = createHeaders(mockEvent);

      expect(headers['X-Request-Id']).toBe('req-abc-123');
    });

    it('should handle uppercase X-Request-Id header', () => {
      const mockEvent = {
        headers: {
          'X-Request-Id': 'req-XYZ-789',
        },
      };

      const headers = createHeaders(mockEvent);

      expect(headers['X-Request-Id']).toBe('req-XYZ-789');
    });

    it('should not include X-Request-Id when not present', () => {
      const mockEvent = {
        headers: {
          origin: 'https://smuppy.com',
        },
      };

      const headers = createHeaders(mockEvent);

      expect(headers['X-Request-Id']).toBeUndefined();
    });
  });

  describe('getCorsHeaders', () => {
    it('should return all CORS-related headers', () => {
      const headers = getCorsHeaders('https://smuppy.com');

      expect(headers['Access-Control-Allow-Origin']).toBe('https://smuppy.com');
      expect(headers['Access-Control-Allow-Headers']).toContain('Content-Type');
      expect(headers['Access-Control-Allow-Headers']).toContain('Authorization');
      expect(headers['Access-Control-Allow-Methods']).toContain('GET');
      expect(headers['Access-Control-Allow-Methods']).toContain('POST');
      expect(headers['Access-Control-Allow-Methods']).toContain('PUT');
      expect(headers['Access-Control-Allow-Methods']).toContain('DELETE');
      expect(headers['Access-Control-Allow-Methods']).toContain('OPTIONS');
      expect(headers['Access-Control-Allow-Credentials']).toBe('true');
      expect(headers['Access-Control-Max-Age']).toBe('3600');
    });

    it('should default to smuppy.com for undefined origin', () => {
      const headers = getCorsHeaders(undefined);

      expect(headers['Access-Control-Allow-Origin']).toBe('https://smuppy.com');
    });
  });

  describe('createCorsResponse', () => {
    it('should create a complete response with JSON stringified body', () => {
      const response = createCorsResponse(200, { success: true, data: 'test' }, 'https://smuppy.com');

      expect(response.statusCode).toBe(200);
      expect(response.headers['Access-Control-Allow-Origin']).toBe('https://smuppy.com');
      expect(response.headers['Content-Type']).toBe('application/json');
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data).toBe('test');
    });

    it('should handle error status codes', () => {
      const response = createCorsResponse(400, { success: false, message: 'Bad request' });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
    });

    it('should include security headers in response', () => {
      const response = createCorsResponse(200, { success: true });

      expect(response.headers['X-Content-Type-Options']).toBe('nosniff');
      expect(response.headers['X-Frame-Options']).toBe('DENY');
    });
  });

  describe('cors wrapper', () => {
    it('should wrap a response with CORS headers', () => {
      const response = cors({
        statusCode: 200,
        body: JSON.stringify({ success: true }),
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['Access-Control-Allow-Origin']).toBeDefined();
      expect(response.headers['Content-Type']).toBe('application/json');
    });

    it('should preserve existing headers', () => {
      const response = cors({
        statusCode: 200,
        body: JSON.stringify({ success: true }),
        headers: { 'X-Custom-Header': 'custom-value' },
      });

      expect(response.headers['X-Custom-Header']).toBe('custom-value');
      expect(response.headers['Access-Control-Allow-Origin']).toBeDefined();
    });

    it('should allow existing headers to override defaults', () => {
      const response = cors({
        statusCode: 200,
        body: '{}',
        headers: { 'Cache-Control': 'public, max-age=3600' },
      });

      expect(response.headers['Cache-Control']).toBe('public, max-age=3600');
    });

    it('should handle response without headers property', () => {
      const response = cors({
        statusCode: 204,
        body: '',
      });

      expect(response.statusCode).toBe(204);
      expect(response.headers['Access-Control-Allow-Origin']).toBeDefined();
    });
  });

  describe('createCacheableHeaders', () => {
    it('should override Cache-Control with default private max-age', () => {
      const headers = createCacheableHeaders();

      expect(headers['Cache-Control']).toBe('private, max-age=60');
      expect(headers['Pragma']).toBeUndefined();
    });

    it('should use custom cacheControl value', () => {
      const headers = createCacheableHeaders(undefined, 'public, max-age=86400');

      expect(headers['Cache-Control']).toBe('public, max-age=86400');
    });

    it('should extract origin from event', () => {
      const mockEvent = {
        headers: {
          origin: 'https://app.smuppy.com',
        },
      };

      const headers = createCacheableHeaders(mockEvent);

      expect(headers['Access-Control-Allow-Origin']).toBe('https://app.smuppy.com');
      expect(headers['Cache-Control']).toBe('private, max-age=60');
    });

    it('should remove Pragma header for cacheability', () => {
      const headers = createCacheableHeaders();

      expect(headers).not.toHaveProperty('Pragma');
    });
  });

  describe('getAllowedOrigin edge cases', () => {
    it('should allow mobile app origin in non-production', () => {
      process.env.ENVIRONMENT = 'staging';

      expect(getAllowedOrigin('smuppy://')).toBe('smuppy://');
    });

    it('should reject mobile app origin in production', () => {
      process.env.ENVIRONMENT = 'production';

      expect(getAllowedOrigin('smuppy://')).toBe('https://smuppy.com');
    });

    it('should allow exp://localhost in non-production', () => {
      process.env.ENVIRONMENT = 'staging';

      expect(getAllowedOrigin('exp://localhost:8081')).toBe('exp://localhost:8081');
    });

    it('should reject localhost origins in production', () => {
      process.env.ENVIRONMENT = 'production';

      expect(getAllowedOrigin('http://localhost:8081')).toBe('https://smuppy.com');
      expect(getAllowedOrigin('http://localhost:3000')).toBe('https://smuppy.com');
    });
  });
});

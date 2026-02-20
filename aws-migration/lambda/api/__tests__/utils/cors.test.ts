/**
 * CORS Utils Unit Tests
 */

jest.unmock('../../utils/cors');

import { createHeaders, getAllowedOrigin, getSecureHeaders } from '../../utils/cors';
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
  });
});

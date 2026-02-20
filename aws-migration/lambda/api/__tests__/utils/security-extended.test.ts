/**
 * Security Utils Extended Tests
 *
 * Tests sanitizeText() and extractCognitoSub() from utils/security.ts
 * Separate file to avoid disrupting existing security.test.ts (needs SecretsManager mock at module level)
 */

import { APIGatewayProxyEvent } from 'aws-lambda';

// Mock SecretsManager and logger before importing security module
jest.mock('@aws-sdk/client-secrets-manager', () => ({
  SecretsManagerClient: jest.fn().mockImplementation(() => ({})),
  GetSecretValueCommand: jest.fn(),
}));

jest.mock('../../utils/logger', () => ({
  createLogger: () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    logSecurity: jest.fn(),
  }),
}));

import { sanitizeText, extractCognitoSub } from '../../utils/security';

function createMockEvent(overrides?: {
  claims?: Record<string, string> | null;
  headers?: Record<string, string>;
}): APIGatewayProxyEvent {
  return {
    httpMethod: 'GET',
    path: '/test',
    body: null,
    headers: overrides?.headers ?? {},
    multiValueHeaders: {},
    isBase64Encoded: false,
    pathParameters: null,
    queryStringParameters: null,
    multiValueQueryStringParameters: null,
    stageVariables: null,
    requestContext: {
      accountId: '123456789012',
      apiId: 'test',
      authorizer: overrides?.claims !== undefined
        ? (overrides.claims ? { claims: overrides.claims } : null)
        : null,
      protocol: 'HTTP/1.1',
      httpMethod: 'GET',
      identity: {} as never,
      path: '/test',
      stage: 'prod',
      requestId: 'test-request-id',
      requestTimeEpoch: Date.now(),
      resourceId: 'test',
      resourcePath: '/test',
    },
    resource: '/test',
  };
}

describe('Security Utils - Extended', () => {
  describe('sanitizeText', () => {
    it('should strip HTML tags', () => {
      expect(sanitizeText('<script>alert("xss")</script>Hello')).toBe('alert("xss")Hello');
    });

    it('should strip nested HTML tags', () => {
      expect(sanitizeText('<div><b>bold</b></div>')).toBe('bold');
    });

    it('should truncate to max length', () => {
      const result = sanitizeText('Hello World', 5);
      expect(result).toBe('Hello');
    });

    it('should return empty string for empty input', () => {
      expect(sanitizeText('')).toBe('');
    });

    it('should return empty string for non-string input', () => {
      expect(sanitizeText(null as unknown as string)).toBe('');
      expect(sanitizeText(undefined as unknown as string)).toBe('');
      expect(sanitizeText(123 as unknown as string)).toBe('');
    });

    it('should remove null bytes', () => {
      expect(sanitizeText('hello\0world')).toBe('helloworld');
    });

    it('should remove control characters but keep newlines/tabs', () => {
      expect(sanitizeText('hello\nworld\ttab')).toBe('hello\nworld\ttab');
      expect(sanitizeText('hello\x01world')).toBe('helloworld');
    });

    it('should trim whitespace', () => {
      expect(sanitizeText('  hello  ')).toBe('hello');
    });

    it('should handle text with only HTML tags', () => {
      expect(sanitizeText('<br/><hr/>')).toBe('');
    });

    it('should cap work and output length for very large inputs', () => {
      const huge = '<'.repeat(100000) + 'safe';
      const result = sanitizeText(huge, 500);
      expect(result.length).toBeLessThanOrEqual(500);
    });
  });

  describe('extractCognitoSub', () => {
    const SUB = '550e8400-e29b-41d4-a716-446655440000';

    it('should extract sub from authorizer claims', () => {
      const event = createMockEvent({ claims: { sub: SUB } });
      expect(extractCognitoSub(event)).toBe(SUB);
    });

    it('should return undefined when no authorizer and no Authorization header', () => {
      const event = createMockEvent({ claims: null });
      expect(extractCognitoSub(event)).toBeUndefined();
    });

    it('should return undefined when no Authorization header and no authorizer', () => {
      const event = createMockEvent({
        claims: null,
        headers: { Authorization: 'Bearer some-token' },
      });
      // SECURITY: extractCognitoSub never decodes JWT manually — only trusts authorizer claims
      expect(extractCognitoSub(event)).toBeUndefined();
    });
  });
});

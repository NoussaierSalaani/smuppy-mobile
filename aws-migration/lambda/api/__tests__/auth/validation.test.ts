/**
 * Auth Endpoint Validation Tests
 * Tests security measures in authentication handlers
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';

// Mock external dependencies before any imports
jest.mock('@aws-sdk/client-cognito-identity-provider', () => ({
  CognitoIdentityProviderClient: jest.fn().mockImplementation(() => ({
    send: jest.fn(),
  })),
  AdminCreateUserCommand: jest.fn(),
  AdminSetUserPasswordCommand: jest.fn(),
  AdminInitiateAuthCommand: jest.fn(),
  AdminGetUserCommand: jest.fn(),
  UserNotFoundException: class UserNotFoundException extends Error {},
}));

jest.mock('google-auth-library', () => ({
  OAuth2Client: jest.fn().mockImplementation(() => ({
    verifyIdToken: jest.fn().mockRejectedValue(new Error('Invalid token')),
  })),
}));

// Helper to create mock event
const createMockEvent = (body: Record<string, unknown>): APIGatewayProxyEvent => ({
  body: JSON.stringify(body),
  headers: { origin: 'https://smuppy.com' },
  requestContext: {
    identity: { sourceIp: '127.0.0.1' },
  } as unknown as APIGatewayProxyEvent['requestContext'],
} as unknown as APIGatewayProxyEvent);

describe('Auth Security Tests', () => {
  describe('Google Auth Handler', () => {
    let handler: (event: APIGatewayProxyEvent) => Promise<APIGatewayProxyResult>;

    beforeAll(async () => {
      // Set required env vars
      process.env.USER_POOL_ID = 'test-pool-id';
      process.env.CLIENT_ID = 'test-client-id';
      process.env.GOOGLE_IOS_CLIENT_ID = 'test-ios-client';

      // Import after mocks are set up
      const module = await import('../../auth/google');
      handler = module.handler;
    });

    it('should reject missing request body', async () => {
      const event = { ...createMockEvent({}), body: null };
      const response = await handler(event);

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toContain('Missing');
    });

    it('should reject missing ID token', async () => {
      const event = createMockEvent({});
      const response = await handler(event);

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toContain('Missing');
    });

    it('should not expose internal error details', async () => {
      const event = createMockEvent({ idToken: 'invalid-token' });
      const response = await handler(event);

      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.body);

      // Should NOT contain stack trace or internal error
      expect(body.error).not.toContain('stack');
      expect(body.error).not.toContain('Error:');
      expect(body.message).not.toContain('verifyIdToken');
    });

    it('should return generic error message for invalid tokens', async () => {
      const event = createMockEvent({ idToken: 'malformed.token.here' });
      const response = await handler(event);

      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.body);
      expect(body.message).toContain('Unable to authenticate');
    });

    it('should include required headers in response', async () => {
      const event = createMockEvent({ idToken: 'test-token' });
      const response = await handler(event);

      expect(response.headers).toBeDefined();
      expect(response.headers['Content-Type']).toBe('application/json');
      // Note: Security headers (X-Content-Type-Options, etc.) are added at CloudFront/API Gateway level
    });

    it('should include CORS headers', async () => {
      const event = createMockEvent({ idToken: 'test-token' });
      const response = await handler(event);

      expect(response.headers['Access-Control-Allow-Origin']).toBeDefined();
      expect(response.headers['Access-Control-Allow-Credentials']).toBe('true');
    });

    it('should return JSON content type', async () => {
      const event = createMockEvent({ idToken: 'test-token' });
      const response = await handler(event);

      expect(response.headers['Content-Type']).toBe('application/json');
    });

    it('should allow credentials in CORS', async () => {
      const event = createMockEvent({ idToken: 'test-token' });
      const response = await handler(event);

      expect(response.headers['Access-Control-Allow-Credentials']).toBe('true');
    });
  });

  describe('Input Sanitization', () => {
    let handler: (event: APIGatewayProxyEvent) => Promise<APIGatewayProxyResult>;

    beforeAll(async () => {
      process.env.USER_POOL_ID = 'test-pool-id';
      process.env.CLIENT_ID = 'test-client-id';
      process.env.GOOGLE_IOS_CLIENT_ID = 'test-ios-client';

      const module = await import('../../auth/google');
      handler = module.handler;
    });

    it('should handle SQL injection in token', async () => {
      const event = createMockEvent({
        idToken: "'; DROP TABLE users; --",
      });

      const response = await handler(event);

      // Should fail validation, not SQL injection
      expect(response.statusCode).toBe(401);
      expect(response.body).not.toContain('DROP');
    });

    it('should handle XSS in error responses', async () => {
      const event = createMockEvent({
        idToken: '<script>alert("XSS")</script>',
      });

      const response = await handler(event);

      // Response should not reflect the XSS payload
      expect(response.body).not.toContain('<script>');
    });

    it('should handle extremely long tokens gracefully', async () => {
      const longToken = 'a'.repeat(100000);
      const event = createMockEvent({ idToken: longToken });

      const response = await handler(event);

      // Should handle gracefully, not crash
      expect([400, 401]).toContain(response.statusCode);
    });

    it('should handle null bytes in input', async () => {
      const event = createMockEvent({
        idToken: 'test\0token\0with\0nulls',
      });

      const response = await handler(event);

      // Should not crash
      expect([400, 401]).toContain(response.statusCode);
    });

    it('should handle unicode in input', async () => {
      const event = createMockEvent({
        idToken: 'test-token-\u0000-\uFFFF-emoji-🔥',
      });

      const response = await handler(event);

      // Should not crash
      expect([400, 401]).toContain(response.statusCode);
    });
  });

  describe('Error Response Security', () => {
    let handler: (event: APIGatewayProxyEvent) => Promise<APIGatewayProxyResult>;

    beforeAll(async () => {
      process.env.USER_POOL_ID = 'test-pool-id';
      process.env.CLIENT_ID = 'test-client-id';
      process.env.GOOGLE_IOS_CLIENT_ID = 'test-ios-client';

      const module = await import('../../auth/google');
      handler = module.handler;
    });

    it('should not leak environment variables in errors', async () => {
      const event = createMockEvent({ idToken: 'test' });
      const response = await handler(event);

      expect(response.body).not.toContain('test-pool-id');
      expect(response.body).not.toContain('test-client-id');
    });

    it('should not leak stack traces', async () => {
      const event = createMockEvent({ idToken: 'test' });
      const response = await handler(event);

      expect(response.body).not.toContain('at ');
      expect(response.body).not.toContain('.ts:');
      expect(response.body).not.toContain('.js:');
    });

    it('should return consistent error format', async () => {
      const event = createMockEvent({ idToken: 'test' });
      const response = await handler(event);
      const body = JSON.parse(response.body);

      expect(body).toHaveProperty('error');
      expect(body).toHaveProperty('message');
    });
  });
});

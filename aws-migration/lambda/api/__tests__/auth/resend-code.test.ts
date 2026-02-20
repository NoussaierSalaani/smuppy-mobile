/**
 * Resend Code Handler Tests
 * Tests for resending verification code (standalone handler, uses requireRateLimit)
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';

// Set env vars before imports (cognito-helpers validates at module load)
process.env.USER_POOL_ID = 'us-east-1_TestPool';
process.env.CLIENT_ID = 'test-client-id';

// Mock exception classes using class expressions so constructor.name matches
// the keys used in createAuthHandler's errorHandlers map
const MockUserNotFoundException = class UserNotFoundException extends Error {
  constructor() { super('User not found'); this.name = 'UserNotFoundException'; }
};
const MockLimitExceededException = class LimitExceededException extends Error {
  constructor() { super('Limit exceeded'); this.name = 'LimitExceededException'; }
};
const MockInvalidParameterException = class InvalidParameterException extends Error {
  constructor() { super('Invalid parameter'); this.name = 'InvalidParameterException'; }
};

const mockCognitoSend = jest.fn();
jest.mock('@aws-sdk/client-cognito-identity-provider', () => ({
  CognitoIdentityProviderClient: jest.fn(() => ({
    send: (...args: unknown[]) => mockCognitoSend(...args),
  })),
  ResendConfirmationCodeCommand: jest.fn((params: unknown) => ({ ...params as object, _type: 'ResendConfirmationCodeCommand' })),
  ListUsersCommand: jest.fn((params: unknown) => ({ ...params as object, _type: 'ListUsersCommand' })),
  UserNotFoundException: MockUserNotFoundException as unknown,
  LimitExceededException: MockLimitExceededException as unknown,
  InvalidParameterException: MockInvalidParameterException as unknown,
}));

jest.mock('../../utils/rate-limit', () => ({
  checkRateLimit: jest.fn().mockResolvedValue({ allowed: true }),
  requireRateLimit: jest.fn().mockResolvedValue(null),
}));

jest.mock('../../utils/logger', () => ({
  createLogger: jest.fn(() => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    initFromEvent: jest.fn(),
    setRequestId: jest.fn(),
    setUserId: jest.fn(),
    logRequest: jest.fn(),
    logResponse: jest.fn(),
    logQuery: jest.fn(),
    logSecurity: jest.fn(),
    child: jest.fn().mockReturnThis(),
  })),
  getRequestId: jest.fn().mockReturnValue('test-request-id'),
}));

jest.mock('../../utils/cors', () => ({
  createHeaders: jest.fn(() => ({
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Credentials': 'true',
  })),
}));

jest.mock('../../../shared/db', () => ({
  getPool: jest.fn(),
  getReaderPool: jest.fn(),
}));

function makeEvent(overrides: Partial<Record<string, unknown>> = {}): APIGatewayProxyEvent {
  return {
    httpMethod: 'POST',
    headers: { 'X-Forwarded-For': '1.2.3.4' },
    body: overrides.body as string ?? null,
    queryStringParameters: null,
    pathParameters: null,
    multiValueHeaders: {},
    multiValueQueryStringParameters: null,
    isBase64Encoded: false,
    path: '/auth/resend-code',
    resource: '/',
    stageVariables: null,
    requestContext: {
      requestId: 'test-request-id',
      authorizer: overrides.sub ? { claims: { sub: overrides.sub } } : undefined,
      identity: { sourceIp: '127.0.0.1' },
    },
  } as unknown as APIGatewayProxyEvent;
}

describe('Resend Code Handler', () => {
  let handler: (event: APIGatewayProxyEvent) => Promise<APIGatewayProxyResult>;
  let checkRateLimit: jest.Mock;

  beforeAll(async () => {
    checkRateLimit = (await import('../../utils/rate-limit')).checkRateLimit as jest.Mock;
    const module = await import('../../auth/resend-code');
    handler = module.handler;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    checkRateLimit.mockResolvedValue({ allowed: true });
  });

  describe('Rate Limiting', () => {
    it('should return 429 when rate limited', async () => {
      checkRateLimit.mockResolvedValue({ allowed: false, retryAfter: 60 });

      const event = makeEvent({
        body: JSON.stringify({ email: 'test@example.com' }),
      });
      const response = await handler(event);

      expect(response.statusCode).toBe(429);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.code).toBe('RATE_LIMITED');
    });
  });

  describe('Input Validation', () => {
    it('should return 400 when body is missing', async () => {
      const event = makeEvent();
      const response = await handler(event);

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.message).toContain('Missing request body');
    });

    it('should return 400 when email is missing', async () => {
      const event = makeEvent({ body: JSON.stringify({}) });
      const response = await handler(event);

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.message).toContain('email is required');
    });
  });

  describe('Happy Path', () => {
    it('should resend code successfully', async () => {
      // ListUsersCommand (resolveUsername via getUsernameByEmail)
      mockCognitoSend.mockResolvedValueOnce({
        Users: [{ Username: 'resolveduser' }],
      });
      // ResendConfirmationCodeCommand — success
      mockCognitoSend.mockResolvedValueOnce({});

      const event = makeEvent({
        body: JSON.stringify({ email: 'test@example.com' }),
      });
      const response = await handler(event);

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.message).toContain('new verification code has been sent');
    });

    it('should resolve username when email lookup returns no results', async () => {
      // ListUsersCommand — no user found (falls back to generated username)
      mockCognitoSend.mockResolvedValueOnce({ Users: [] });
      // ResendConfirmationCodeCommand — success
      mockCognitoSend.mockResolvedValueOnce({});

      const event = makeEvent({
        body: JSON.stringify({ email: 'fallback@example.com' }),
      });
      const response = await handler(event);

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
    });
  });

  describe('Cognito Error Handling — Anti-Enumeration', () => {
    it('should return 200 success on UserNotFoundException to prevent enumeration', async () => {
      mockCognitoSend.mockResolvedValueOnce({ Users: [{ Username: 'testuser' }] });
      mockCognitoSend.mockRejectedValueOnce(new MockUserNotFoundException());

      const event = makeEvent({
        body: JSON.stringify({ email: 'nonexistent@example.com' }),
      });
      const response = await handler(event);

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.message).toContain('verification code has been sent');
    });

    it('should return 429 on LimitExceededException', async () => {
      mockCognitoSend.mockResolvedValueOnce({ Users: [{ Username: 'testuser' }] });
      mockCognitoSend.mockRejectedValueOnce(new MockLimitExceededException());

      const event = makeEvent({
        body: JSON.stringify({ email: 'limited@example.com' }),
      });
      const response = await handler(event);

      expect(response.statusCode).toBe(429);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.code).toBe('LIMIT_EXCEEDED');
    });

    it('should return 400 on InvalidParameterException (already confirmed)', async () => {
      mockCognitoSend.mockResolvedValueOnce({ Users: [{ Username: 'testuser' }] });
      mockCognitoSend.mockRejectedValueOnce(new MockInvalidParameterException());

      const event = makeEvent({
        body: JSON.stringify({ email: 'confirmed@example.com' }),
      });
      const response = await handler(event);

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.code).toBe('ALREADY_CONFIRMED');
      expect(body.message).toContain('already been verified');
    });
  });

  describe('Generic Error — Anti-Enumeration', () => {
    it('should return 500 with anti-enumeration fallback message on unexpected error', async () => {
      mockCognitoSend.mockResolvedValueOnce({ Users: [{ Username: 'testuser' }] });
      mockCognitoSend.mockRejectedValueOnce(new Error('Service unavailable'));

      const event = makeEvent({
        body: JSON.stringify({ email: 'error@example.com' }),
      });
      const response = await handler(event);

      // createAuthHandler returns 500 for unknown errors, but uses anti-enumeration message
      expect(response.statusCode).toBe(500);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.message).toContain('verification code has been sent');
      expect(body.message).not.toContain('Service unavailable');
    });
  });

  describe('Response Headers', () => {
    it('should include CORS headers', async () => {
      const event = makeEvent();
      const response = await handler(event);

      expect(response.headers).toBeDefined();
      expect(response.headers!['Content-Type']).toBe('application/json');
      expect(response.headers!['Access-Control-Allow-Origin']).toBe('*');
    });
  });
});

/**
 * Confirm Signup Handler Tests
 * Tests for email verification code confirmation (uses createAuthHandler factory)
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';

// Set env vars before imports (cognito-helpers validates at module load)
process.env.USER_POOL_ID = 'us-east-1_TestPool';
process.env.CLIENT_ID = 'test-client-id';

// Mock exception classes using class expressions so constructor.name matches the key
// used in createAuthHandler's errorHandlers map
// eslint-disable-next-line @typescript-eslint/no-extraneous-class
const mockCodeMismatchException = class CodeMismatchException extends Error {
  constructor() { super('Code mismatch'); this.name = 'CodeMismatchException'; }
};
const mockExpiredCodeException = class ExpiredCodeException extends Error {
  constructor() { super('Code expired'); this.name = 'ExpiredCodeException'; }
};
const mockUserNotFoundException = class UserNotFoundException extends Error {
  constructor() { super('User not found'); this.name = 'UserNotFoundException'; }
};
const mockNotAuthorizedException = class NotAuthorizedException extends Error {
  constructor() { super('Not authorized'); this.name = 'NotAuthorizedException'; }
};
const mockAliasExistsException = class AliasExistsException extends Error {
  constructor() { super('Alias exists'); this.name = 'AliasExistsException'; }
};

const mockCognitoSend = jest.fn();
jest.mock('@aws-sdk/client-cognito-identity-provider', () => ({
  CognitoIdentityProviderClient: jest.fn(() => ({
    send: (...args: unknown[]) => mockCognitoSend(...args),
  })),
  ConfirmSignUpCommand: jest.fn((params: unknown) => ({ ...params as object, _type: 'ConfirmSignUpCommand' })),
  ListUsersCommand: jest.fn((params: unknown) => ({ ...params as object, _type: 'ListUsersCommand' })),
  CodeMismatchException: mockCodeMismatchException,
  ExpiredCodeException: mockExpiredCodeException,
  UserNotFoundException: mockUserNotFoundException,
  NotAuthorizedException: mockNotAuthorizedException,
  AliasExistsException: mockAliasExistsException,
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
    path: '/auth/confirm-signup',
    resource: '/',
    stageVariables: null,
    requestContext: {
      requestId: 'test-request-id',
      authorizer: overrides.sub ? { claims: { sub: overrides.sub } } : undefined,
      identity: { sourceIp: '127.0.0.1' },
    },
  } as unknown as APIGatewayProxyEvent;
}

describe('Confirm Signup Handler', () => {
  let handler: (event: APIGatewayProxyEvent) => Promise<APIGatewayProxyResult>;
  let checkRateLimit: jest.Mock;

  beforeAll(async () => {
    checkRateLimit = (await import('../../utils/rate-limit')).checkRateLimit as jest.Mock;
    const module = await import('../../auth/confirm-signup');
    handler = module.handler;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    checkRateLimit.mockResolvedValue({ allowed: true });
  });

  describe('Rate Limiting', () => {
    it('should return 429 when rate limited', async () => {
      checkRateLimit.mockResolvedValue({ allowed: false, retryAfter: 300 });

      const event = makeEvent({
        body: JSON.stringify({ email: 'test@example.com', code: '123456' }),
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
      const event = makeEvent({ body: JSON.stringify({ code: '123456' }) });
      const response = await handler(event);

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.message).toContain('email');
    });

    it('should return 400 when code is missing', async () => {
      const event = makeEvent({ body: JSON.stringify({ email: 'test@example.com' }) });
      const response = await handler(event);

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.message).toContain('code');
    });

    it('should return 400 when both email and code are missing', async () => {
      const event = makeEvent({ body: JSON.stringify({}) });
      const response = await handler(event);

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.message).toContain('email');
      expect(body.message).toContain('code');
    });
  });

  describe('Happy Path', () => {
    it('should confirm signup successfully', async () => {
      // ListUsersCommand (resolveUsername via getUsernameByEmail) — user found
      mockCognitoSend.mockResolvedValueOnce({
        Users: [{ Username: 'testuser123' }],
      });
      // ConfirmSignUpCommand — success
      mockCognitoSend.mockResolvedValueOnce({});

      const event = makeEvent({
        body: JSON.stringify({ email: 'test@example.com', code: '123456' }),
      });
      const response = await handler(event);

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.message).toContain('Email verified successfully');
    });

    it('should resolve username when not found by email (falls back to generated)', async () => {
      // ListUsersCommand — no user found by email
      mockCognitoSend.mockResolvedValueOnce({ Users: [] });
      // ConfirmSignUpCommand — success (uses generated username)
      mockCognitoSend.mockResolvedValueOnce({});

      const event = makeEvent({
        body: JSON.stringify({ email: 'fallback@example.com', code: '654321' }),
      });
      const response = await handler(event);

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
    });
  });

  describe('Cognito Error Handling', () => {
    it('should return 400 with INVALID_CODE on CodeMismatchException', async () => {
      mockCognitoSend.mockResolvedValueOnce({ Users: [{ Username: 'testuser' }] });
      mockCognitoSend.mockRejectedValueOnce(new mockCodeMismatchException());

      const event = makeEvent({
        body: JSON.stringify({ email: 'test@example.com', code: 'wrong' }),
      });
      const response = await handler(event);

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.code).toBe('INVALID_CODE');
      expect(body.message).toContain('Invalid verification code');
    });

    it('should return 400 with EXPIRED_CODE on ExpiredCodeException', async () => {
      mockCognitoSend.mockResolvedValueOnce({ Users: [{ Username: 'testuser' }] });
      mockCognitoSend.mockRejectedValueOnce(new mockExpiredCodeException());

      const event = makeEvent({
        body: JSON.stringify({ email: 'test@example.com', code: '111111' }),
      });
      const response = await handler(event);

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.code).toBe('EXPIRED_CODE');
      expect(body.message).toContain('expired');
    });

    it('should return 400 with USER_NOT_FOUND on UserNotFoundException', async () => {
      mockCognitoSend.mockResolvedValueOnce({ Users: [{ Username: 'testuser' }] });
      mockCognitoSend.mockRejectedValueOnce(new mockUserNotFoundException());

      const event = makeEvent({
        body: JSON.stringify({ email: 'missing@example.com', code: '123456' }),
      });
      const response = await handler(event);

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.code).toBe('USER_NOT_FOUND');
    });

    it('should return 400 with ALREADY_CONFIRMED on NotAuthorizedException', async () => {
      mockCognitoSend.mockResolvedValueOnce({ Users: [{ Username: 'testuser' }] });
      mockCognitoSend.mockRejectedValueOnce(new mockNotAuthorizedException());

      const event = makeEvent({
        body: JSON.stringify({ email: 'confirmed@example.com', code: '123456' }),
      });
      const response = await handler(event);

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.code).toBe('ALREADY_CONFIRMED');
      expect(body.message).toContain('already verified');
    });

    it('should return 400 with VERIFICATION_FAILED on AliasExistsException', async () => {
      mockCognitoSend.mockResolvedValueOnce({ Users: [{ Username: 'testuser' }] });
      mockCognitoSend.mockRejectedValueOnce(new mockAliasExistsException());

      const event = makeEvent({
        body: JSON.stringify({ email: 'alias@example.com', code: '123456' }),
      });
      const response = await handler(event);

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.code).toBe('VERIFICATION_FAILED');
    });
  });

  describe('Generic Error', () => {
    it('should return 500 on unexpected error', async () => {
      mockCognitoSend.mockResolvedValueOnce({ Users: [{ Username: 'testuser' }] });
      mockCognitoSend.mockRejectedValueOnce(new Error('Unexpected Cognito failure'));

      const event = makeEvent({
        body: JSON.stringify({ email: 'error@example.com', code: '123456' }),
      });
      const response = await handler(event);

      expect(response.statusCode).toBe(500);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.message).toContain('Verification failed');
      expect(body.message).not.toContain('Unexpected Cognito failure');
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

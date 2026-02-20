/**
 * Signup Handler Tests
 * Tests for user registration with Cognito
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';

// Set env vars before imports (signup.ts validates at module load)
process.env.USER_POOL_ID = 'us-east-1_TestPool';
process.env.CLIENT_ID = 'test-client-id';

// Mock Cognito SDK
const mockCognitoSend = jest.fn();

// Create mock exception classes accessible outside jest.mock
class MockUserNotFoundException extends Error {
  constructor() { super('User not found'); this.name = 'UserNotFoundException'; }
}
class MockUsernameExistsException extends Error {
  constructor() { super('Username exists'); this.name = 'UsernameExistsException'; }
}

jest.mock('@aws-sdk/client-cognito-identity-provider', () => ({
  CognitoIdentityProviderClient: jest.fn(() => ({
    send: (...args: unknown[]) => mockCognitoSend(...args),
  })),
  SignUpCommand: jest.fn((params: unknown) => ({ ...params as object, _type: 'SignUpCommand' })),
  AdminGetUserCommand: jest.fn((params: unknown) => ({ ...params as object, _type: 'AdminGetUserCommand' })),
  AdminDeleteUserCommand: jest.fn((params: unknown) => ({ ...params as object, _type: 'AdminDeleteUserCommand' })),
  ListUsersCommand: jest.fn((params: unknown) => ({ ...params as object, _type: 'ListUsersCommand' })),
  UserNotFoundException: MockUserNotFoundException,
  UsernameExistsException: MockUsernameExistsException,
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

jest.mock('../../utils/error-handler', () => ({
  isNamedError: jest.fn((error: unknown): error is { name: string; message: string } => {
    return typeof error === 'object' && error !== null && 'name' in error;
  }),
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
    path: '/auth/signup',
    resource: '/',
    stageVariables: null,
    requestContext: {
      requestId: 'test-request-id',
      authorizer: overrides.sub ? { claims: { sub: overrides.sub } } : undefined,
      identity: { sourceIp: '127.0.0.1' },
    },
  } as unknown as APIGatewayProxyEvent;
}

describe('Signup Handler', () => {
  let handler: (event: APIGatewayProxyEvent) => Promise<APIGatewayProxyResult>;
  let checkRateLimit: jest.Mock;

  beforeAll(async () => {
    checkRateLimit = (await import('../../utils/rate-limit')).checkRateLimit as jest.Mock;
    const module = await import('../../auth/signup');
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
        body: JSON.stringify({ email: 'test@example.com', password: 'Password1!' }),
      });
      const response = await handler(event);

      expect(response.statusCode).toBe(429);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.code).toBe('RATE_LIMITED');
      expect(body.retryAfter).toBe(300);
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

    it('should return 400 when body is invalid JSON', async () => {
      const event = makeEvent({ body: 'not-json' });
      const response = await handler(event);

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.message).toContain('Invalid request format');
    });

    it('should return 400 when email is missing', async () => {
      const event = makeEvent({ body: JSON.stringify({ password: 'Password1!' }) });
      const response = await handler(event);

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.message).toContain('Email and password are required');
    });

    it('should return 400 when password is missing', async () => {
      const event = makeEvent({ body: JSON.stringify({ email: 'test@example.com' }) });
      const response = await handler(event);

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.message).toContain('Email and password are required');
    });
  });

  describe('Happy Path — New User', () => {
    it('should create a new user when no existing user is found', async () => {
      // ListUsersCommand (checkUserByEmail) — no users found
      mockCognitoSend.mockResolvedValueOnce({ Users: [] });
      // AdminGetUserCommand (checkUserStatus) — user not found
      mockCognitoSend.mockRejectedValueOnce(new MockUserNotFoundException());
      // SignUpCommand (createUser)
      mockCognitoSend.mockResolvedValueOnce({ UserSub: 'new-user-sub-123' });

      const event = makeEvent({
        body: JSON.stringify({ email: 'New@Example.COM', password: 'Password1!' }),
      });
      const response = await handler(event);

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.userSub).toBe('new-user-sub-123');
      expect(body.confirmationRequired).toBe(true);
    });

    it('should create user with fullName when provided', async () => {
      mockCognitoSend.mockResolvedValueOnce({ Users: [] });
      mockCognitoSend.mockRejectedValueOnce(new MockUserNotFoundException());
      mockCognitoSend.mockResolvedValueOnce({ UserSub: 'sub-with-name' });

      const event = makeEvent({
        body: JSON.stringify({
          email: 'test@example.com',
          password: 'Password1!',
          fullName: 'Test User',
        }),
      });
      const response = await handler(event);

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.userSub).toBe('sub-with-name');
    });
  });

  describe('Existing User — Confirmed', () => {
    it('should return 409 when a confirmed user exists with the same email', async () => {
      // ListUsersCommand — user found and CONFIRMED
      mockCognitoSend.mockResolvedValueOnce({
        Users: [{ Username: 'existinguser', UserStatus: 'CONFIRMED' }],
      });

      const event = makeEvent({
        body: JSON.stringify({ email: 'existing@example.com', password: 'Password1!' }),
      });
      const response = await handler(event);

      expect(response.statusCode).toBe(409);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.message).toContain('Unable to create account');
    });
  });

  describe('Existing User — Unconfirmed (by email)', () => {
    it('should delete unconfirmed user and recreate', async () => {
      // ListUsersCommand (checkUserByEmail) — user found, UNCONFIRMED
      mockCognitoSend.mockResolvedValueOnce({
        Users: [{ Username: 'olduser', UserStatus: 'UNCONFIRMED' }],
      });
      // AdminDeleteUserCommand (deleteUnconfirmedUser)
      mockCognitoSend.mockResolvedValueOnce({});
      // ListUsersCommand (re-check after delete, first retry — no users)
      mockCognitoSend.mockResolvedValueOnce({ Users: [] });
      // SignUpCommand (createUser)
      mockCognitoSend.mockResolvedValueOnce({ UserSub: 'recreated-sub' });

      const event = makeEvent({
        body: JSON.stringify({ email: 'unconfirmed@example.com', password: 'NewPassword1!' }),
      });
      const response = await handler(event);

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.userSub).toBe('recreated-sub');
    });
  });

  describe('Existing User — Unconfirmed (by username fallback)', () => {
    it('should delete unconfirmed user found by username and recreate', async () => {
      // ListUsersCommand (checkUserByEmail) — no user by email
      mockCognitoSend.mockResolvedValueOnce({ Users: [] });
      // AdminGetUserCommand (checkUserStatus) — user found, UNCONFIRMED
      mockCognitoSend.mockResolvedValueOnce({ UserStatus: 'UNCONFIRMED' });
      // AdminDeleteUserCommand (deleteUnconfirmedUser)
      mockCognitoSend.mockResolvedValueOnce({});
      // AdminGetUserCommand (re-check first retry) — not found
      mockCognitoSend.mockRejectedValueOnce(new MockUserNotFoundException());
      // SignUpCommand (createUser)
      mockCognitoSend.mockResolvedValueOnce({ UserSub: 'recreated-username-sub' });

      const event = makeEvent({
        body: JSON.stringify({ email: 'userfallback@example.com', password: 'Password1!' }),
      });
      const response = await handler(event);

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.userSub).toBe('recreated-username-sub');
    });
  });

  describe('Cognito Error Handling', () => {
    it('should return 409 on UsernameExistsException', async () => {
      // ListUsersCommand — no users found
      mockCognitoSend.mockResolvedValueOnce({ Users: [] });
      // AdminGetUserCommand — user not found
      mockCognitoSend.mockRejectedValueOnce(new MockUserNotFoundException());
      // SignUpCommand — throws UsernameExistsException
      mockCognitoSend.mockRejectedValueOnce(new MockUsernameExistsException());

      const event = makeEvent({
        body: JSON.stringify({ email: 'conflict@example.com', password: 'Password1!' }),
      });
      const response = await handler(event);

      expect(response.statusCode).toBe(409);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.message).toContain('Unable to create account');
    });

    it('should return 400 on InvalidPasswordException', async () => {
      mockCognitoSend.mockResolvedValueOnce({ Users: [] });
      mockCognitoSend.mockRejectedValueOnce(new MockUserNotFoundException());

      const invalidPasswordError = new Error('Password does not conform to policy');
      invalidPasswordError.name = 'InvalidPasswordException';
      mockCognitoSend.mockRejectedValueOnce(invalidPasswordError);

      const event = makeEvent({
        body: JSON.stringify({ email: 'weakpw@example.com', password: '123' }),
      });
      const response = await handler(event);

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.message).toContain('Password must be at least 8 characters');
    });

    it('should return 400 on InvalidParameterException', async () => {
      mockCognitoSend.mockResolvedValueOnce({ Users: [] });
      mockCognitoSend.mockRejectedValueOnce(new MockUserNotFoundException());

      const invalidParamError = new Error('Invalid parameter');
      invalidParamError.name = 'InvalidParameterException';
      mockCognitoSend.mockRejectedValueOnce(invalidParamError);

      const event = makeEvent({
        body: JSON.stringify({ email: 'badparam@example.com', password: 'Password1!' }),
      });
      const response = await handler(event);

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.message).toContain('Invalid input');
    });
  });

  describe('Generic Error', () => {
    it('should return 500 on unexpected error', async () => {
      mockCognitoSend.mockResolvedValueOnce({ Users: [] });
      mockCognitoSend.mockRejectedValueOnce(new MockUserNotFoundException());
      mockCognitoSend.mockRejectedValueOnce(new Error('Unexpected internal failure'));

      const event = makeEvent({
        body: JSON.stringify({ email: 'error@example.com', password: 'Password1!' }),
      });
      const response = await handler(event);

      expect(response.statusCode).toBe(500);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.message).toContain('Unable to create account');
      // Should not leak internal error details
      expect(body.message).not.toContain('Unexpected internal failure');
    });
  });

  describe('Base64 Encoded Body', () => {
    it('should decode base64 body when isBase64Encoded is true', async () => {
      mockCognitoSend.mockResolvedValueOnce({ Users: [] });
      mockCognitoSend.mockRejectedValueOnce(new MockUserNotFoundException());
      mockCognitoSend.mockResolvedValueOnce({ UserSub: 'base64-sub' });

      const rawBody = JSON.stringify({ email: 'b64@example.com', password: 'Password1!' });
      const base64Body = Buffer.from(rawBody).toString('base64');

      const event = makeEvent({ body: base64Body });
      event.isBase64Encoded = true;

      const response = await handler(event);

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.userSub).toBe('base64-sub');
    });
  });

  describe('Response Headers', () => {
    it('should include CORS headers in every response', async () => {
      const event = makeEvent();
      const response = await handler(event);

      expect(response.headers).toBeDefined();
      expect(response.headers!['Content-Type']).toBe('application/json');
      expect(response.headers!['Access-Control-Allow-Origin']).toBe('*');
    });
  });
});

/**
 * Check User Handler Tests
 * Tests for checking if a user already exists in Cognito (uses createAuthHandler factory)
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';

// Set env vars before imports (cognito-helpers validates at module load)
process.env.USER_POOL_ID = 'us-east-1_TestPool';
process.env.CLIENT_ID = 'test-client-id';

// Mock exception class accessible outside jest.mock
class MockUserNotFoundException extends Error {
  constructor() { super('User not found'); this.name = 'UserNotFoundException'; }
}

const mockCognitoSend = jest.fn();
jest.mock('@aws-sdk/client-cognito-identity-provider', () => ({
  CognitoIdentityProviderClient: jest.fn(() => ({
    send: (...args: unknown[]) => mockCognitoSend(...args),
  })),
  AdminGetUserCommand: jest.fn((params: unknown) => ({ ...params as object, _type: 'AdminGetUserCommand' })),
  ListUsersCommand: jest.fn((params: unknown) => ({ ...params as object, _type: 'ListUsersCommand' })),
  UserNotFoundException: MockUserNotFoundException,
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
    path: '/auth/check-user',
    resource: '/',
    stageVariables: null,
    requestContext: {
      requestId: 'test-request-id',
      authorizer: overrides.sub ? { claims: { sub: overrides.sub } } : undefined,
      identity: { sourceIp: '127.0.0.1' },
    },
  } as unknown as APIGatewayProxyEvent;
}

describe('Check User Handler', () => {
  let handler: (event: APIGatewayProxyEvent) => Promise<APIGatewayProxyResult>;
  let checkRateLimit: jest.Mock;

  beforeAll(async () => {
    checkRateLimit = (await import('../../utils/rate-limit')).checkRateLimit as jest.Mock;
    const module = await import('../../auth/check-user');
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
      expect(body.message).toContain('email');
    });
  });

  describe('Happy Path — User Exists and Confirmed (by email)', () => {
    it('should return canSignup=false when user is CONFIRMED by email lookup', async () => {
      // ListUsersCommand (checkUserByEmail) — user found, CONFIRMED
      mockCognitoSend.mockResolvedValueOnce({
        Users: [{ Username: 'confirmeduser', UserStatus: 'CONFIRMED' }],
      });

      const event = makeEvent({
        body: JSON.stringify({ email: 'existing@example.com' }),
      });
      const response = await handler(event);

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.canSignup).toBe(false);
    });
  });

  describe('Happy Path — User Does Not Exist', () => {
    it('should return canSignup=true when no user found by email or username', async () => {
      // ListUsersCommand (checkUserByEmail) — no user
      mockCognitoSend.mockResolvedValueOnce({ Users: [] });
      // AdminGetUserCommand (fallback by username) — user not found
      mockCognitoSend.mockRejectedValueOnce(new MockUserNotFoundException());

      const event = makeEvent({
        body: JSON.stringify({ email: 'newuser@example.com' }),
      });
      const response = await handler(event);

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.canSignup).toBe(true);
    });
  });

  describe('Happy Path — User Exists but UNCONFIRMED', () => {
    it('should return canSignup=true when user is UNCONFIRMED', async () => {
      // ListUsersCommand — user found, UNCONFIRMED
      mockCognitoSend.mockResolvedValueOnce({
        Users: [{ Username: 'unconfirmeduser', UserStatus: 'UNCONFIRMED' }],
      });

      const event = makeEvent({
        body: JSON.stringify({ email: 'unconfirmed@example.com' }),
      });
      const response = await handler(event);

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.canSignup).toBe(true);
    });
  });

  describe('Fallback — User Found by Username', () => {
    it('should return canSignup=false when user found by username and CONFIRMED', async () => {
      // ListUsersCommand (checkUserByEmail) — no user by email
      mockCognitoSend.mockResolvedValueOnce({ Users: [] });
      // AdminGetUserCommand — user found, CONFIRMED
      mockCognitoSend.mockResolvedValueOnce({ UserStatus: 'CONFIRMED' });

      const event = makeEvent({
        body: JSON.stringify({ email: 'legacy@example.com' }),
      });
      const response = await handler(event);

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.canSignup).toBe(false);
    });
  });

  describe('Error Handling — Anti-Enumeration', () => {
    it('should return canSignup=true on generic error to allow user to proceed', async () => {
      // ListUsersCommand throws unexpected error
      mockCognitoSend.mockRejectedValueOnce(new Error('Service unavailable'));

      const event = makeEvent({
        body: JSON.stringify({ email: 'error@example.com' }),
      });
      const response = await handler(event);

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.canSignup).toBe(true);
      expect(body.message).toContain('Unable to verify');
    });
  });

  describe('Generic Error (factory)', () => {
    it('should return 500 on error thrown from createAuthHandler factory level', async () => {
      // Force an error at the JSON.parse level (invalid JSON body)
      const event = makeEvent({ body: '{invalid-json' });
      const response = await handler(event);

      expect(response.statusCode).toBe(500);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
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

/**
 * Apple Auth Handler Tests
 * Tests for Apple Sign-In authentication with Cognito
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';

// Set env vars before imports (apple.ts validates at module load)
process.env.USER_POOL_ID = 'us-east-1_TestPool';
process.env.CLIENT_ID = 'test-client-id';
process.env.APPLE_CLIENT_ID = 'com.test.Smuppy';

// Mock exception class accessible outside jest.mock
class MockUserNotFoundException extends Error {
  constructor() { super('User not found'); this.name = 'UserNotFoundException'; }
}

// Mock Cognito SDK
const mockCognitoSend = jest.fn();
jest.mock('@aws-sdk/client-cognito-identity-provider', () => ({
  CognitoIdentityProviderClient: jest.fn(() => ({
    send: (...args: unknown[]) => mockCognitoSend(...args),
  })),
  AdminCreateUserCommand: jest.fn((params: unknown) => ({ ...params as object, _type: 'AdminCreateUserCommand' })),
  AdminSetUserPasswordCommand: jest.fn((params: unknown) => ({ ...params as object, _type: 'AdminSetUserPasswordCommand' })),
  AdminInitiateAuthCommand: jest.fn((params: unknown) => ({ ...params as object, _type: 'AdminInitiateAuthCommand' })),
  AdminGetUserCommand: jest.fn((params: unknown) => ({ ...params as object, _type: 'AdminGetUserCommand' })),
  UserNotFoundException: MockUserNotFoundException,
}));

// Mock jsonwebtoken
const mockJwtDecode = jest.fn();
const mockJwtVerify = jest.fn();
jest.mock('jsonwebtoken', () => ({
  decode: (...args: unknown[]) => mockJwtDecode(...args),
  verify: (...args: unknown[]) => mockJwtVerify(...args),
}));

// Mock jwks-rsa
const mockGetSigningKey = jest.fn();
jest.mock('jwks-rsa', () => ({
  __esModule: true,
  default: jest.fn(() => ({
    getSigningKey: (...args: unknown[]) => mockGetSigningKey(...args),
  })),
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
    path: '/auth/apple',
    resource: '/',
    stageVariables: null,
    requestContext: {
      requestId: 'test-request-id',
      authorizer: overrides.sub ? { claims: { sub: overrides.sub } } : undefined,
      identity: { sourceIp: '127.0.0.1' },
    },
  } as unknown as APIGatewayProxyEvent;
}

// Helper to set up successful Apple token verification
function setupAppleTokenVerification(applePayload: Record<string, unknown>) {
  // jwt.decode returns decoded header
  mockJwtDecode.mockReturnValue({
    header: { kid: 'apple-key-id', alg: 'RS256' },
    payload: applePayload,
  });

  // jwks getSigningKey callback with public key
  mockGetSigningKey.mockImplementation((_kid: string, cb: (err: Error | null, key?: { getPublicKey: () => string }) => void) => {
    cb(null, { getPublicKey: () => 'mock-public-key' });
  });

  // jwt.verify returns the payload
  mockJwtVerify.mockReturnValue(applePayload);
}

describe('Apple Auth Handler', () => {
  let handler: (event: APIGatewayProxyEvent) => Promise<APIGatewayProxyResult>;
  let requireRateLimit: jest.Mock;

  beforeAll(async () => {
    requireRateLimit = (await import('../../utils/rate-limit')).requireRateLimit as jest.Mock;
    const module = await import('../../auth/apple');
    handler = module.handler;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    requireRateLimit.mockResolvedValue(null);
  });

  describe('Rate Limiting', () => {
    it('should return rate limit response when requireRateLimit returns a response', async () => {
      const rateLimitResponse = {
        statusCode: 429,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ success: false, message: 'Rate limited' }),
      };
      requireRateLimit.mockResolvedValue(rateLimitResponse);

      const event = makeEvent({
        body: JSON.stringify({ identityToken: 'token', nonce: 'nonce' }),
      });
      const response = await handler(event);

      expect(response.statusCode).toBe(429);
    });
  });

  describe('Input Validation', () => {
    it('should return 400 when body is missing', async () => {
      const event = makeEvent();
      const response = await handler(event);

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.message).toContain('Missing request body');
    });

    it('should return 400 when identityToken is missing', async () => {
      const event = makeEvent({ body: JSON.stringify({ nonce: 'test-nonce' }) });
      const response = await handler(event);

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.message).toContain('Missing identity token');
    });

    it('should return 400 when nonce is missing', async () => {
      // Need to set up Apple token verification first since nonce check happens after verification
      const { createHash } = require('crypto');
      const hashedNonce = createHash('sha256').update('raw-nonce').digest('hex');

      setupAppleTokenVerification({
        iss: 'https://appleid.apple.com',
        aud: 'com.test.Smuppy',
        sub: 'apple-user-123',
        email: 'test@icloud.com',
        nonce: hashedNonce,
      });

      const event = makeEvent({
        body: JSON.stringify({ identityToken: 'valid-apple-token' }),
      });
      const response = await handler(event);

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.message).toContain('Missing nonce');
    });
  });

  describe('Nonce Verification', () => {
    it('should return 401 when nonce does not match', async () => {
      setupAppleTokenVerification({
        iss: 'https://appleid.apple.com',
        aud: 'com.test.Smuppy',
        sub: 'apple-user-123',
        email: 'test@icloud.com',
        nonce: 'expected-hashed-nonce',
      });

      const event = makeEvent({
        body: JSON.stringify({
          identityToken: 'valid-apple-token',
          nonce: 'wrong-raw-nonce',
        }),
      });
      const response = await handler(event);

      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.body);
      expect(body.message).toContain('Invalid nonce');
    });
  });

  describe('Happy Path — New User', () => {
    it('should create a new Apple user and return tokens', async () => {
      const { createHash } = require('crypto');
      const rawNonce = 'raw-nonce-123';
      const hashedNonce = createHash('sha256').update(rawNonce).digest('hex');

      setupAppleTokenVerification({
        iss: 'https://appleid.apple.com',
        aud: 'com.test.Smuppy',
        sub: 'apple-user-new',
        email: 'newuser@icloud.com',
        email_verified: 'true',
        nonce: hashedNonce,
      });

      // AdminGetUserCommand — user not found (new user)
      mockCognitoSend.mockRejectedValueOnce(new MockUserNotFoundException());
      // AdminCreateUserCommand — success
      mockCognitoSend.mockResolvedValueOnce({});
      // AdminSetUserPasswordCommand — success
      mockCognitoSend.mockResolvedValueOnce({});
      // AdminInitiateAuthCommand — success
      mockCognitoSend.mockResolvedValueOnce({
        AuthenticationResult: {
          AccessToken: 'access-token',
          IdToken: 'id-token',
          RefreshToken: 'refresh-token',
        },
      });

      const event = makeEvent({
        body: JSON.stringify({
          identityToken: 'valid-apple-token',
          nonce: rawNonce,
        }),
      });
      const response = await handler(event);

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.user).toBeDefined();
      expect(body.user.id).toBe('apple-user-new');
      expect(body.user.email).toBe('newuser@icloud.com');
      expect(body.tokens).toBeDefined();
      expect(body.tokens.accessToken).toBe('access-token');
      expect(body.tokens.idToken).toBe('id-token');
      expect(body.tokens.refreshToken).toBe('refresh-token');
      expect(body.isNewUser).toBe(true);
    });
  });

  describe('Happy Path — Existing User', () => {
    it('should authenticate existing Apple user and return tokens', async () => {
      const { createHash } = require('crypto');
      const rawNonce = 'raw-nonce-existing';
      const hashedNonce = createHash('sha256').update(rawNonce).digest('hex');

      setupAppleTokenVerification({
        iss: 'https://appleid.apple.com',
        aud: 'com.test.Smuppy',
        sub: 'apple-user-existing',
        email: 'existing@icloud.com',
        email_verified: 'true',
        nonce: hashedNonce,
      });

      // AdminGetUserCommand — user exists
      mockCognitoSend.mockResolvedValueOnce({ Username: 'apple_apple-user-existing' });
      // AdminSetUserPasswordCommand — set transient password
      mockCognitoSend.mockResolvedValueOnce({});
      // AdminInitiateAuthCommand — success
      mockCognitoSend.mockResolvedValueOnce({
        AuthenticationResult: {
          AccessToken: 'existing-access',
          IdToken: 'existing-id',
          RefreshToken: 'existing-refresh',
        },
      });

      const event = makeEvent({
        body: JSON.stringify({
          identityToken: 'valid-apple-token',
          nonce: rawNonce,
        }),
      });
      const response = await handler(event);

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.isNewUser).toBe(false);
      expect(body.tokens.accessToken).toBe('existing-access');
    });
  });

  describe('Token Verification Errors', () => {
    it('should return 401 when Apple token has invalid format (no header)', async () => {
      mockJwtDecode.mockReturnValue(null);

      const event = makeEvent({
        body: JSON.stringify({
          identityToken: 'invalid-format-token',
          nonce: 'test-nonce',
        }),
      });
      const response = await handler(event);

      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.body);
      expect(body.message).toContain('Unable to authenticate with Apple');
    });

    it('should return 401 when JWKS key retrieval fails', async () => {
      mockJwtDecode.mockReturnValue({
        header: { kid: 'bad-key-id', alg: 'RS256' },
      });
      mockGetSigningKey.mockImplementation((_kid: string, cb: (err: Error | null) => void) => {
        cb(new Error('Key not found'));
      });

      const event = makeEvent({
        body: JSON.stringify({
          identityToken: 'token-with-bad-key',
          nonce: 'test-nonce',
        }),
      });
      const response = await handler(event);

      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.body);
      expect(body.message).toContain('Unable to authenticate with Apple');
      // Should not leak internal error details
      expect(body.message).not.toContain('Key not found');
    });

    it('should return 401 when jwt.verify fails (expired token)', async () => {
      mockJwtDecode.mockReturnValue({
        header: { kid: 'valid-key', alg: 'RS256' },
      });
      mockGetSigningKey.mockImplementation((_kid: string, cb: (err: Error | null, key?: { getPublicKey: () => string }) => void) => {
        cb(null, { getPublicKey: () => 'mock-key' });
      });
      mockJwtVerify.mockImplementation(() => {
        throw new Error('jwt expired');
      });

      const event = makeEvent({
        body: JSON.stringify({
          identityToken: 'expired-token',
          nonce: 'test-nonce',
        }),
      });
      const response = await handler(event);

      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.body);
      expect(body.message).not.toContain('jwt expired');
    });
  });

  describe('Cognito Auth Failure', () => {
    it('should return 401 when Cognito auth returns incomplete tokens', async () => {
      const { createHash } = require('crypto');
      const rawNonce = 'raw-nonce-fail';
      const hashedNonce = createHash('sha256').update(rawNonce).digest('hex');

      setupAppleTokenVerification({
        iss: 'https://appleid.apple.com',
        aud: 'com.test.Smuppy',
        sub: 'apple-user-fail',
        email: 'fail@icloud.com',
        nonce: hashedNonce,
      });

      // AdminGetUserCommand — user exists
      mockCognitoSend.mockResolvedValueOnce({ Username: 'apple_apple-user-fail' });
      // AdminSetUserPasswordCommand — success
      mockCognitoSend.mockResolvedValueOnce({});
      // AdminInitiateAuthCommand — incomplete tokens
      mockCognitoSend.mockResolvedValueOnce({
        AuthenticationResult: {
          AccessToken: 'token',
          IdToken: null,
          RefreshToken: null,
        },
      });

      const event = makeEvent({
        body: JSON.stringify({
          identityToken: 'valid-apple-token',
          nonce: rawNonce,
        }),
      });
      const response = await handler(event);

      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.body);
      expect(body.message).toContain('Unable to authenticate with Apple');
    });
  });

  describe('Security', () => {
    it('should not expose internal error details', async () => {
      mockJwtDecode.mockImplementation(() => {
        throw new Error('Internal JWT parsing error: buffer overflow at 0x1234');
      });

      const event = makeEvent({
        body: JSON.stringify({
          identityToken: 'bad-token',
          nonce: 'test-nonce',
        }),
      });
      const response = await handler(event);

      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.body);
      expect(body.message).not.toContain('buffer overflow');
      expect(body.message).not.toContain('0x1234');
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

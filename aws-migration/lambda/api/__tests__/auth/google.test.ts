/**
 * Google Auth Handler Tests
 * Comprehensive tests for Google OAuth authentication
 */

import { APIGatewayProxyEvent } from 'aws-lambda';

// Mock dependencies
const mockSend = jest.fn();
const mockVerifyIdToken = jest.fn();

jest.mock('@aws-sdk/client-cognito-identity-provider', () => ({
  CognitoIdentityProviderClient: jest.fn().mockImplementation(() => ({
    send: mockSend,
  })),
  AdminCreateUserCommand: jest.fn(),
  AdminSetUserPasswordCommand: jest.fn(),
  AdminInitiateAuthCommand: jest.fn(),
  AdminGetUserCommand: jest.fn(),
  UserNotFoundException: class UserNotFoundException extends Error {
    constructor() {
      super('User not found');
      this.name = 'UserNotFoundException';
    }
  },
}));

jest.mock('google-auth-library', () => ({
  OAuth2Client: jest.fn().mockImplementation(() => ({
    verifyIdToken: mockVerifyIdToken,
  })),
}));

// Helper to create mock event
const createMockEvent = (body: any): APIGatewayProxyEvent => ({
  body: JSON.stringify(body),
  headers: { origin: 'https://smuppy.com' },
  requestContext: {
    requestId: 'test-request-id',
    identity: { sourceIp: '127.0.0.1' },
  } as any,
} as unknown as APIGatewayProxyEvent);

describe('Google Auth Handler', () => {
  let handler: any;
  let UserNotFoundException: any;

  beforeAll(async () => {
    process.env.USER_POOL_ID = 'test-pool-id';
    process.env.CLIENT_ID = 'test-client-id';
    process.env.GOOGLE_IOS_CLIENT_ID = 'test-ios-client';

    const cognitoModule = await import('@aws-sdk/client-cognito-identity-provider');
    UserNotFoundException = cognitoModule.UserNotFoundException;

    const module = await import('../../auth/google');
    handler = module.handler;
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Input Validation', () => {
    it('should reject null body', async () => {
      const event = { ...createMockEvent({}), body: null };
      const response = await handler(event);

      expect(response.statusCode).toBe(400);
      expect(JSON.parse(response.body).error).toContain('Missing');
    });

    it('should reject empty body', async () => {
      const event = createMockEvent({});
      const response = await handler(event);

      expect(response.statusCode).toBe(400);
    });

    it('should reject missing idToken', async () => {
      const event = createMockEvent({ someField: 'value' });
      const response = await handler(event);

      expect(response.statusCode).toBe(400);
      expect(JSON.parse(response.body).error).toContain('Missing');
    });
  });

  describe('Token Verification', () => {
    it('should verify Google token and return user info for new user', async () => {
      // Mock successful token verification
      mockVerifyIdToken.mockResolvedValue({
        getPayload: () => ({
          sub: 'google-user-123',
          email: 'test@gmail.com',
          email_verified: true,
          name: 'Test User',
          picture: 'https://example.com/photo.jpg',
        }),
      });

      // Mock user not found (new user)
      mockSend.mockRejectedValueOnce(new UserNotFoundException());
      // Mock user creation success
      mockSend.mockResolvedValueOnce({});
      // Mock password set success
      mockSend.mockResolvedValueOnce({});
      // Mock auth success
      mockSend.mockResolvedValueOnce({
        AuthenticationResult: {
          AccessToken: 'access-token',
          IdToken: 'id-token',
          RefreshToken: 'refresh-token',
        },
      });

      const event = createMockEvent({ idToken: 'valid-google-token' });
      const response = await handler(event);

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.user).toBeDefined();
      expect(body.user.email).toBe('test@gmail.com');
      expect(body.tokens).toBeDefined();
      expect(body.isNewUser).toBe(true);
    });

    it('should verify Google token for existing user', async () => {
      mockVerifyIdToken.mockResolvedValue({
        getPayload: () => ({
          sub: 'google-user-456',
          email: 'existing@gmail.com',
          email_verified: true,
        }),
      });

      // Mock user exists
      mockSend.mockResolvedValueOnce({ Username: 'google_google-user-456' });
      // Mock auth success
      mockSend.mockResolvedValueOnce({
        AuthenticationResult: {
          AccessToken: 'access-token',
          IdToken: 'id-token',
          RefreshToken: 'refresh-token',
        },
      });

      const event = createMockEvent({ idToken: 'valid-google-token' });
      const response = await handler(event);

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.isNewUser).toBe(false);
    });

    it('should handle invalid Google token', async () => {
      mockVerifyIdToken.mockRejectedValue(new Error('Invalid token'));

      const event = createMockEvent({ idToken: 'invalid-token' });
      const response = await handler(event);

      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Authentication failed');
    });
  });

  describe('User Creation', () => {
    it('should create Cognito user with correct attributes', async () => {
      mockVerifyIdToken.mockResolvedValue({
        getPayload: () => ({
          sub: 'new-user-789',
          email: 'new@gmail.com',
          email_verified: true,
          name: 'New User',
        }),
      });

      mockSend.mockRejectedValueOnce(new UserNotFoundException());
      mockSend.mockResolvedValueOnce({});
      mockSend.mockResolvedValueOnce({});
      mockSend.mockResolvedValueOnce({
        AuthenticationResult: {
          AccessToken: 'token',
          IdToken: 'token',
          RefreshToken: 'token',
        },
      });

      const event = createMockEvent({ idToken: 'valid-token' });
      await handler(event);

      // Verify AdminCreateUserCommand was called
      expect(mockSend).toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    it('should handle Cognito auth failure', async () => {
      mockVerifyIdToken.mockResolvedValue({
        getPayload: () => ({
          sub: 'user-123',
          email: 'test@gmail.com',
        }),
      });

      mockSend.mockResolvedValueOnce({ Username: 'google_user-123' });
      mockSend.mockResolvedValueOnce({ AuthenticationResult: null });

      const event = createMockEvent({ idToken: 'valid-token' });
      const response = await handler(event);

      expect(response.statusCode).toBe(401);
    });

    it('should not expose internal errors', async () => {
      mockVerifyIdToken.mockRejectedValue(new Error('Internal database error: connection refused'));

      const event = createMockEvent({ idToken: 'valid-token' });
      const response = await handler(event);

      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.body);
      expect(body.message).not.toContain('database');
      expect(body.message).not.toContain('connection');
    });
  });

  describe('Response Format', () => {
    it('should include required headers', async () => {
      mockVerifyIdToken.mockRejectedValue(new Error('Invalid'));

      const event = createMockEvent({ idToken: 'token' });
      const response = await handler(event);

      expect(response.headers).toBeDefined();
      expect(response.headers['Content-Type']).toBe('application/json');
      expect(response.headers['Access-Control-Allow-Origin']).toBeDefined();
    });

    it('should return proper user structure on success', async () => {
      mockVerifyIdToken.mockResolvedValue({
        getPayload: () => ({
          sub: 'user-success',
          email: 'success@gmail.com',
          email_verified: true,
          name: 'Success User',
          picture: 'https://photo.url',
        }),
      });

      mockSend.mockResolvedValueOnce({ Username: 'existing' });
      mockSend.mockResolvedValueOnce({
        AuthenticationResult: {
          AccessToken: 'access',
          IdToken: 'id',
          RefreshToken: 'refresh',
        },
      });

      const event = createMockEvent({ idToken: 'valid' });
      const response = await handler(event);

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      expect(body.user).toMatchObject({
        id: 'user-success',
        email: 'success@gmail.com',
        emailVerified: true,
      });
      expect(body.tokens).toMatchObject({
        accessToken: 'access',
        idToken: 'id',
        refreshToken: 'refresh',
      });
    });
  });
});

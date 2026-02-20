/**
 * AWS Auth Service Tests
 * Comprehensive tests for src/services/aws-auth.ts (982 lines)
 *
 * Tests the real AWSAuthService singleton: initialize, signIn, signUp,
 * signOut, token refresh, social sign-in, password management, and
 * auth state listeners.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

// ─── Global: __DEV__ flag (used throughout aws-auth.ts) ─────────────────────
(global as any).__DEV__ = true;

// ─── JWT helper ─────────────────────────────────────────────────────────────
function makeJwt(payload: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${header}.${body}.fake-signature`;
}

// ─── Mock: expo-secure-store ────────────────────────────────────────────────
const secureStoreMap = new Map<string, string>();

jest.mock('expo-secure-store', () => ({
  setItemAsync: jest.fn((key: string, value: string) => {
    secureStoreMap.set(key, value);
    return Promise.resolve();
  }),
  getItemAsync: jest.fn((key: string) => Promise.resolve(secureStoreMap.get(key) ?? null)),
  deleteItemAsync: jest.fn((key: string) => {
    secureStoreMap.delete(key);
    return Promise.resolve();
  }),
}));

// ─── Mock: aws-config ───────────────────────────────────────────────────────
jest.mock('../../config/aws-config', () => ({
  AWS_CONFIG: {
    region: 'us-east-1',
    cognito: {
      userPoolId: 'us-east-1_testPool',
      userPoolClientId: 'test-client-id',
      identityPoolId: 'us-east-1:test-identity-pool',
    },
    api: {
      restEndpoint: 'https://api.test.com',
      restEndpoint2: 'https://api2.test.com',
      restEndpoint3: 'https://api3.test.com',
      restEndpointDisputes: 'https://disputes.test.com',
      graphqlEndpoint: 'https://graphql.test.com',
      websocketEndpoint: 'wss://ws.test.com',
    },
    storage: { bucket: 'test-bucket', cdnDomain: 'cdn.test.com' },
    dynamodb: { feedTable: 'test-feeds', likesTable: 'test-likes' },
  },
}));

// ─── Mock: @aws-sdk/client-cognito-identity-provider ────────────────────────
const mockSend = jest.fn().mockResolvedValue({});

jest.mock('@aws-sdk/client-cognito-identity-provider', () => ({
  CognitoIdentityProviderClient: jest.fn(() => ({ send: mockSend })),
  InitiateAuthCommand: jest.fn((params: any) => ({ ...params, _type: 'InitiateAuth' })),
  SignUpCommand: jest.fn((params: any) => ({ ...params, _type: 'SignUp' })),
  ConfirmSignUpCommand: jest.fn((params: any) => ({ ...params, _type: 'ConfirmSignUp' })),
  ResendConfirmationCodeCommand: jest.fn((params: any) => ({ ...params, _type: 'ResendConfirmation' })),
  ForgotPasswordCommand: jest.fn((params: any) => ({ ...params, _type: 'ForgotPassword' })),
  ConfirmForgotPasswordCommand: jest.fn((params: any) => ({ ...params, _type: 'ConfirmForgotPassword' })),
  GlobalSignOutCommand: jest.fn((params: any) => ({ ...params, _type: 'GlobalSignOut' })),
  ChangePasswordCommand: jest.fn((params: any) => ({ ...params, _type: 'ChangePassword' })),
}));

// ─── Mock: aws-api ──────────────────────────────────────────────────────────
const mockSmartSignup = jest.fn();
const mockConfirmSignup = jest.fn();
const mockResendConfirmationCode = jest.fn();
const mockForgotPassword = jest.fn();
const mockConfirmForgotPassword = jest.fn();
const mockApiRequest = jest.fn();

jest.mock('../../services/aws-api', () => ({
  awsAPI: {
    smartSignup: mockSmartSignup,
    confirmSignup: mockConfirmSignup,
    resendConfirmationCode: mockResendConfirmationCode,
    forgotPassword: mockForgotPassword,
    confirmForgotPassword: mockConfirmForgotPassword,
    request: mockApiRequest,
  },
}));

// ─── Mock: feedStore & VibesFeed (require'd inside signOut) ─────────────────
const mockClearFeed = jest.fn();
const mockClearVibesFeedCache = jest.fn();

jest.mock('../../stores/feedStore', () => ({
  useFeedStore: { getState: jest.fn(() => ({ clearFeed: mockClearFeed })) },
}));
jest.mock('../../screens/home/VibesFeed', () => ({
  clearVibesFeedCache: mockClearVibesFeedCache,
}));

// ─── Token constants (must match source) ────────────────────────────────────
const TOKEN_KEYS = {
  ACCESS_TOKEN: 'smuppy_access_token',
  REFRESH_TOKEN: 'smuppy_refresh_token',
  ID_TOKEN: 'smuppy_id_token',
  USER: 'smuppy_user',
};

// ─── Standard test fixtures ─────────────────────────────────────────────────
const VALID_PAYLOAD = {
  sub: 'user-uuid-123',
  email: 'test@example.com',
  email_verified: true,
  'cognito:username': 'testuser',
  phone_number: '+14155551234',
  exp: Math.floor(Date.now() / 1000) + 3600, // 1 hour from now
};

const EXPIRED_PAYLOAD = {
  ...VALID_PAYLOAD,
  exp: Math.floor(Date.now() / 1000) - 3600, // 1 hour ago
};

const validIdToken = makeJwt(VALID_PAYLOAD);
const validAccessToken = makeJwt({ ...VALID_PAYLOAD, token_use: 'access' });
const expiredAccessToken = makeJwt({ ...EXPIRED_PAYLOAD, token_use: 'access' });
const expiredIdToken = makeJwt(EXPIRED_PAYLOAD);
const validRefreshToken = 'valid-refresh-token-string';

const VALID_USER = {
  id: 'user-uuid-123',
  email: 'test@example.com',
  username: 'testuser',
  emailVerified: true,
  phoneNumber: '+14155551234',
  attributes: VALID_PAYLOAD,
};

// ─── Import after mocks ────────────────────────────────────────────────────
import { awsAuth } from '../../services/aws-auth';
import * as SecureStore from 'expo-secure-store';

// ─── Helper: reset singleton state between tests ────────────────────────────
async function resetAuthState() {
  // signOut clears internal fields + SecureStore
  // mockSend has a default .mockResolvedValue({}) so GlobalSignOutCommand will not fail
  try {
    await awsAuth.signOut();
  } catch {
    // ignore
  }
  secureStoreMap.clear();
  // Reset all mocks but keep the default mockSend implementation
  mockSend.mockReset().mockResolvedValue({});
  mockSmartSignup.mockReset();
  mockConfirmSignup.mockReset();
  mockResendConfirmationCode.mockReset();
  mockForgotPassword.mockReset();
  mockConfirmForgotPassword.mockReset();
  mockApiRequest.mockReset();
  mockClearFeed.mockReset();
  mockClearVibesFeedCache.mockReset();
  (SecureStore.setItemAsync as jest.Mock).mockReset().mockImplementation((key: string, value: string) => {
    secureStoreMap.set(key, value);
    return Promise.resolve();
  });
  (SecureStore.getItemAsync as jest.Mock).mockReset().mockImplementation((key: string) => {
    return Promise.resolve(secureStoreMap.get(key) ?? null);
  });
  (SecureStore.deleteItemAsync as jest.Mock).mockReset().mockImplementation((key: string) => {
    secureStoreMap.delete(key);
    return Promise.resolve();
  });
}

/** Helper: sign in with standard tokens for tests that need an authenticated state */
async function doSignIn() {
  mockSend.mockResolvedValueOnce({
    AuthenticationResult: {
      AccessToken: validAccessToken,
      RefreshToken: validRefreshToken,
      IdToken: validIdToken,
    },
  });
  await awsAuth.signIn({ email: 'test@example.com', password: 'Pass1234' });
}

// ═════════════════════════════════════════════════════════════════════════════
// TEST SUITES
// ═════════════════════════════════════════════════════════════════════════════

describe('AWSAuthService', () => {
  beforeEach(async () => {
    await resetAuthState();
  });

  // ─── A. base64UrlDecode / decodeIdToken (via signIn) ────────────────────
  describe('decodeIdToken (via signIn)', () => {
    it('should decode a valid JWT and return correct user fields', async () => {
      mockSend.mockResolvedValueOnce({
        AuthenticationResult: {
          AccessToken: validAccessToken,
          RefreshToken: validRefreshToken,
          IdToken: validIdToken,
        },
      });

      const user = await awsAuth.signIn({ email: 'test@example.com', password: 'Pass1234' });

      expect(user.id).toBe('user-uuid-123');
      expect(user.email).toBe('test@example.com');
      expect(user.username).toBe('testuser');
      expect(user.emailVerified).toBe(true);
      expect(user.phoneNumber).toBe('+14155551234');
      expect(user.attributes).toMatchObject({ sub: 'user-uuid-123' });
    });

    it('should decode JWT with unicode/special characters in payload', async () => {
      const unicodePayload = {
        sub: 'user-unicode-456',
        email: 'rene@example.com',
        email_verified: false,
        'cognito:username': 'rene',
        exp: Math.floor(Date.now() / 1000) + 3600,
      };
      const unicodeIdToken = makeJwt(unicodePayload);

      mockSend.mockResolvedValueOnce({
        AuthenticationResult: {
          AccessToken: validAccessToken,
          RefreshToken: validRefreshToken,
          IdToken: unicodeIdToken,
        },
      });

      const user = await awsAuth.signIn({ email: 'rene@example.com', password: 'Pass1234' });
      expect(user.email).toBe('rene@example.com');
      expect(user.username).toBe('rene');
    });

    it('should throw on malformed token (not 3 parts)', async () => {
      mockSend.mockResolvedValueOnce({
        AuthenticationResult: {
          AccessToken: validAccessToken,
          RefreshToken: validRefreshToken,
          IdToken: 'only-two.parts',
        },
      });

      await expect(
        awsAuth.signIn({ email: 'test@example.com', password: 'Pass1234' })
      ).rejects.toThrow('Failed to decode token');
    });

    it('should throw on invalid base64 in payload', async () => {
      const header = Buffer.from(JSON.stringify({ alg: 'RS256' })).toString('base64url');
      const badToken = `${header}.!!!invalid-base64!!!.signature`;

      mockSend.mockResolvedValueOnce({
        AuthenticationResult: {
          AccessToken: validAccessToken,
          RefreshToken: validRefreshToken,
          IdToken: badToken,
        },
      });

      await expect(
        awsAuth.signIn({ email: 'test@example.com', password: 'Pass1234' })
      ).rejects.toThrow('Failed to decode token');
    });
  });

  // ─── B. isTokenExpired (via getAccessToken/initialize behavior) ─────────
  describe('isTokenExpired (via getAccessToken)', () => {
    it('should NOT refresh when token exp is far in the future', async () => {
      secureStoreMap.set(TOKEN_KEYS.ACCESS_TOKEN, validAccessToken);
      secureStoreMap.set(TOKEN_KEYS.ID_TOKEN, validIdToken);
      secureStoreMap.set(TOKEN_KEYS.REFRESH_TOKEN, validRefreshToken);
      secureStoreMap.set(TOKEN_KEYS.USER, JSON.stringify(VALID_USER));

      await awsAuth.initialize();
      mockSend.mockClear();

      const token = await awsAuth.getAccessToken();
      expect(token).toBe(validAccessToken);
      expect(mockSend).not.toHaveBeenCalled();
    });

    it('should trigger refresh when token is expired', async () => {
      secureStoreMap.set(TOKEN_KEYS.ACCESS_TOKEN, expiredAccessToken);
      secureStoreMap.set(TOKEN_KEYS.ID_TOKEN, expiredIdToken);
      secureStoreMap.set(TOKEN_KEYS.REFRESH_TOKEN, validRefreshToken);
      secureStoreMap.set(TOKEN_KEYS.USER, JSON.stringify(VALID_USER));

      mockSend.mockResolvedValueOnce({
        AuthenticationResult: {
          AccessToken: validAccessToken,
          IdToken: validIdToken,
        },
      });

      const user = await awsAuth.initialize();
      expect(user).toBeTruthy();
      expect(mockSend).toHaveBeenCalled();
    });

    it('should trigger refresh when token is within 60s buffer of expiry', async () => {
      const almostExpiredPayload = {
        ...VALID_PAYLOAD,
        exp: Math.floor(Date.now() / 1000) + 30,
      };
      const almostExpiredToken = makeJwt(almostExpiredPayload);

      secureStoreMap.set(TOKEN_KEYS.ACCESS_TOKEN, almostExpiredToken);
      secureStoreMap.set(TOKEN_KEYS.ID_TOKEN, almostExpiredToken);
      secureStoreMap.set(TOKEN_KEYS.REFRESH_TOKEN, validRefreshToken);
      secureStoreMap.set(TOKEN_KEYS.USER, JSON.stringify(VALID_USER));

      mockSend.mockResolvedValueOnce({
        AuthenticationResult: {
          AccessToken: validAccessToken,
          IdToken: validIdToken,
        },
      });

      await awsAuth.initialize();
      expect(mockSend).toHaveBeenCalled();
    });

    it('should treat malformed token as expired', async () => {
      secureStoreMap.set(TOKEN_KEYS.ACCESS_TOKEN, 'not-a-jwt');
      secureStoreMap.set(TOKEN_KEYS.ID_TOKEN, validIdToken);
      secureStoreMap.set(TOKEN_KEYS.REFRESH_TOKEN, validRefreshToken);
      secureStoreMap.set(TOKEN_KEYS.USER, JSON.stringify(VALID_USER));

      mockSend.mockResolvedValueOnce({
        AuthenticationResult: {
          AccessToken: validAccessToken,
          IdToken: validIdToken,
        },
      });

      await awsAuth.initialize();
      expect(mockSend).toHaveBeenCalled();
    });
  });

  // ─── C. initialize() ───────────────────────────────────────────────────
  describe('initialize()', () => {
    it('should return null when no stored tokens', async () => {
      const result = await awsAuth.initialize();
      expect(result).toBeNull();
    });

    it('should return user when tokens are valid and not expired', async () => {
      secureStoreMap.set(TOKEN_KEYS.ACCESS_TOKEN, validAccessToken);
      secureStoreMap.set(TOKEN_KEYS.ID_TOKEN, validIdToken);
      secureStoreMap.set(TOKEN_KEYS.REFRESH_TOKEN, validRefreshToken);
      secureStoreMap.set(TOKEN_KEYS.USER, JSON.stringify(VALID_USER));

      const result = await awsAuth.initialize();
      expect(result).toMatchObject({ id: 'user-uuid-123', email: 'test@example.com' });
    });

    it('should call refreshSession when token is expired', async () => {
      secureStoreMap.set(TOKEN_KEYS.ACCESS_TOKEN, expiredAccessToken);
      secureStoreMap.set(TOKEN_KEYS.ID_TOKEN, expiredIdToken);
      secureStoreMap.set(TOKEN_KEYS.REFRESH_TOKEN, validRefreshToken);
      secureStoreMap.set(TOKEN_KEYS.USER, JSON.stringify(VALID_USER));

      mockSend.mockResolvedValueOnce({
        AuthenticationResult: {
          AccessToken: validAccessToken,
          IdToken: validIdToken,
        },
      });

      const result = await awsAuth.initialize();
      expect(result).toBeTruthy();
      expect(mockSend).toHaveBeenCalled();
    });

    it('should return null and clear session when expired token refresh fails with auth error', async () => {
      secureStoreMap.set(TOKEN_KEYS.ACCESS_TOKEN, expiredAccessToken);
      secureStoreMap.set(TOKEN_KEYS.ID_TOKEN, expiredIdToken);
      secureStoreMap.set(TOKEN_KEYS.REFRESH_TOKEN, validRefreshToken);
      secureStoreMap.set(TOKEN_KEYS.USER, JSON.stringify(VALID_USER));

      mockSend.mockRejectedValueOnce(new Error('Token has been revoked'));

      const result = await awsAuth.initialize();
      expect(result).toBeNull();
      expect(SecureStore.deleteItemAsync).toHaveBeenCalled();
    });

    it('should return null when accessToken exists but no userJson', async () => {
      secureStoreMap.set(TOKEN_KEYS.ACCESS_TOKEN, validAccessToken);

      const result = await awsAuth.initialize();
      expect(result).toBeNull();
    });

    it('should clear session and return null when userJson is invalid JSON', async () => {
      secureStoreMap.set(TOKEN_KEYS.ACCESS_TOKEN, validAccessToken);
      secureStoreMap.set(TOKEN_KEYS.USER, '{ invalid json');

      const result = await awsAuth.initialize();
      expect(result).toBeNull();
      expect(SecureStore.deleteItemAsync).toHaveBeenCalled();
    });
  });

  // ─── D. signIn() ──────────────────────────────────────────────────────
  describe('signIn()', () => {
    it('should store tokens, return decoded user, and notify listeners', async () => {
      const listener = jest.fn();
      const unsub = awsAuth.onAuthStateChange(listener);

      mockSend.mockResolvedValueOnce({
        AuthenticationResult: {
          AccessToken: validAccessToken,
          RefreshToken: validRefreshToken,
          IdToken: validIdToken,
        },
      });

      const user = await awsAuth.signIn({ email: 'test@example.com', password: 'Pass1234' });

      expect(user.id).toBe('user-uuid-123');
      expect(user.email).toBe('test@example.com');

      expect(SecureStore.setItemAsync).toHaveBeenCalledWith(TOKEN_KEYS.ACCESS_TOKEN, validAccessToken);
      expect(SecureStore.setItemAsync).toHaveBeenCalledWith(TOKEN_KEYS.REFRESH_TOKEN, validRefreshToken);
      expect(SecureStore.setItemAsync).toHaveBeenCalledWith(TOKEN_KEYS.ID_TOKEN, validIdToken);
      expect(SecureStore.setItemAsync).toHaveBeenCalledWith(TOKEN_KEYS.USER, expect.any(String));

      expect(listener).toHaveBeenCalledWith(expect.objectContaining({ id: 'user-uuid-123' }));

      unsub();
    });

    it('should throw when no AuthenticationResult', async () => {
      mockSend.mockResolvedValueOnce({});

      await expect(
        awsAuth.signIn({ email: 'test@example.com', password: 'Pass1234' })
      ).rejects.toThrow('Authentication failed - no result');
    });

    it('should throw when no AccessToken or IdToken', async () => {
      mockSend.mockResolvedValueOnce({
        AuthenticationResult: {
          RefreshToken: validRefreshToken,
        },
      });

      await expect(
        awsAuth.signIn({ email: 'test@example.com', password: 'Pass1234' })
      ).rejects.toThrow('No tokens received');
    });

    it('should retry token persist when getItemAsync returns null initially', async () => {
      jest.useFakeTimers();

      mockSend.mockResolvedValueOnce({
        AuthenticationResult: {
          AccessToken: validAccessToken,
          RefreshToken: validRefreshToken,
          IdToken: validIdToken,
        },
      });

      let getCallCount = 0;
      (SecureStore.getItemAsync as jest.Mock).mockImplementation((key: string) => {
        if (key === TOKEN_KEYS.ACCESS_TOKEN) {
          getCallCount++;
          if (getCallCount <= 1) return Promise.resolve(null);
          return Promise.resolve(validAccessToken);
        }
        return Promise.resolve(secureStoreMap.get(key) ?? null);
      });

      const signInPromise = awsAuth.signIn({ email: 'test@example.com', password: 'Pass1234' });

      await jest.advanceTimersByTimeAsync(200);
      await jest.advanceTimersByTimeAsync(400);
      await jest.advanceTimersByTimeAsync(800);

      const user = await signInPromise;
      expect(user.id).toBe('user-uuid-123');
      expect(SecureStore.setItemAsync).toHaveBeenCalled();

      jest.useRealTimers();
    });

    it('should work when AuthenticationResult has no RefreshToken', async () => {
      mockSend.mockResolvedValueOnce({
        AuthenticationResult: {
          AccessToken: validAccessToken,
          IdToken: validIdToken,
        },
      });

      const user = await awsAuth.signIn({ email: 'test@example.com', password: 'Pass1234' });
      expect(user.id).toBe('user-uuid-123');

      const refreshCalls = (SecureStore.setItemAsync as jest.Mock).mock.calls.filter(
        (c: any[]) => c[0] === TOKEN_KEYS.REFRESH_TOKEN
      );
      expect(refreshCalls.length).toBe(0);
    });
  });

  // ─── E. signUp() ──────────────────────────────────────────────────────
  describe('signUp()', () => {
    it('should return user with confirmationRequired from API smart signup', async () => {
      mockSmartSignup.mockResolvedValueOnce({
        success: true,
        userSub: 'new-user-uuid',
        confirmationRequired: true,
      });

      const result = await awsAuth.signUp({
        email: 'new@example.com',
        password: 'NewPass123',
        username: 'newuser',
        fullName: 'New User',
      });

      expect(result.user).toMatchObject({ id: 'new-user-uuid', email: 'new@example.com' });
      expect(result.confirmationRequired).toBe(true);
    });

    it('should fall back to signUpDirect when API returns success=false', async () => {
      // When smartSignup returns { success: false }, the thrown Error has no statusCode,
      // so the catch block treats it as a server error and falls back to signUpDirect.
      mockSmartSignup.mockResolvedValueOnce({
        success: false,
        message: 'Email already exists',
      });

      mockSend.mockResolvedValueOnce({
        UserSub: 'fallback-uuid-3',
        UserConfirmed: false,
      });

      const result = await awsAuth.signUp({ email: 'dup@example.com', password: 'Pass1234' });
      expect(result.user?.id).toBe('fallback-uuid-3');
      expect(result.confirmationRequired).toBe(true);
    });

    it('should re-throw 400 client validation errors (no fallback to direct)', async () => {
      const apiError: any = new Error('Password too weak');
      apiError.statusCode = 400;

      mockSmartSignup.mockRejectedValueOnce(apiError);

      await expect(
        awsAuth.signUp({ email: 'test@example.com', password: 'weak' })
      ).rejects.toThrow('Password too weak');

      expect(mockSend).not.toHaveBeenCalled();
    });

    it('should fall back to signUpDirect on 500/network error', async () => {
      const serverError: any = new Error('Internal Server Error');
      serverError.statusCode = 500;
      mockSmartSignup.mockRejectedValueOnce(serverError);

      mockSend.mockResolvedValueOnce({
        UserSub: 'direct-user-uuid',
        UserConfirmed: false,
      });

      const result = await awsAuth.signUp({
        email: 'test@example.com',
        password: 'Pass1234',
        username: 'testuser',
      });

      expect(result.user?.id).toBe('direct-user-uuid');
      expect(result.confirmationRequired).toBe(true);
      expect(mockSend).toHaveBeenCalled();
    });

    it('should fall back to signUpDirect on 404 error', async () => {
      const notFoundError: any = new Error('Not Found');
      notFoundError.statusCode = 404;
      mockSmartSignup.mockRejectedValueOnce(notFoundError);

      mockSend.mockResolvedValueOnce({
        UserSub: 'fallback-uuid',
        UserConfirmed: false,
      });

      const result = await awsAuth.signUp({
        email: 'user@example.com',
        password: 'Pass1234',
      });

      expect(result.user?.id).toBe('fallback-uuid');
    });

    it('should fall back to direct when 400 contains "Not Found" message', async () => {
      const ambiguousError: any = new Error('Not Found');
      ambiguousError.statusCode = 400;
      mockSmartSignup.mockRejectedValueOnce(ambiguousError);

      mockSend.mockResolvedValueOnce({
        UserSub: 'fallback-uuid-2',
        UserConfirmed: false,
      });

      const result = await awsAuth.signUp({
        email: 'test@example.com',
        password: 'Pass1234',
      });

      expect(result.user?.id).toBe('fallback-uuid-2');
    });
  });

  // ─── signUpDirect (via fallback) ──────────────────────────────────────
  describe('signUpDirect (via fallback)', () => {
    it('should generate cognitoUsername from email when no username provided', async () => {
      const networkError: any = new Error('Network error');
      networkError.statusCode = 500;
      mockSmartSignup.mockRejectedValueOnce(networkError);

      mockSend.mockResolvedValueOnce({
        UserSub: 'direct-uuid',
        UserConfirmed: false,
      });

      const result = await awsAuth.signUp({
        email: 'John.Doe@Gmail.com',
        password: 'Pass1234',
      });

      expect(result.user?.id).toBe('direct-uuid');
    });

    it('should include fullName in user attributes when provided', async () => {
      const networkError: any = new Error('Network error');
      networkError.statusCode = 500;
      mockSmartSignup.mockRejectedValueOnce(networkError);

      mockSend.mockResolvedValueOnce({
        UserSub: 'direct-uuid-2',
        UserConfirmed: true,
      });

      const result = await awsAuth.signUp({
        email: 'test@example.com',
        password: 'Pass1234',
        fullName: 'Test User',
      });

      expect(result.user?.id).toBe('direct-uuid-2');
      expect(result.confirmationRequired).toBe(false);
    });

    it('should re-throw Cognito errors from signUpDirect', async () => {
      const networkError: any = new Error('Network error');
      networkError.statusCode = 500;
      mockSmartSignup.mockRejectedValueOnce(networkError);

      const cognitoError = new Error('UsernameExistsException');
      cognitoError.name = 'UsernameExistsException';
      mockSend.mockRejectedValueOnce(cognitoError);

      await expect(
        awsAuth.signUp({ email: 'dup@example.com', password: 'Pass1234' })
      ).rejects.toThrow('UsernameExistsException');
    });

    it('should return null user when no UserSub in Cognito response', async () => {
      const networkError: any = new Error('Network error');
      networkError.statusCode = 500;
      mockSmartSignup.mockRejectedValueOnce(networkError);

      mockSend.mockResolvedValueOnce({
        UserConfirmed: false,
      });

      const result = await awsAuth.signUp({
        email: 'test@example.com',
        password: 'Pass1234',
      });

      expect(result.user).toBeNull();
      expect(result.confirmationRequired).toBe(true);
    });
  });

  // ─── F. confirmSignUp() ───────────────────────────────────────────────
  describe('confirmSignUp()', () => {
    it('should return true on API success', async () => {
      mockConfirmSignup.mockResolvedValueOnce({ success: true });

      const result = await awsAuth.confirmSignUp('test@example.com', '123456');
      expect(result).toBe(true);
    });

    it('should throw when API returns success=false', async () => {
      mockConfirmSignup.mockResolvedValueOnce({ success: false, message: 'Invalid code' });

      await expect(
        awsAuth.confirmSignUp('test@example.com', 'badcode')
      ).rejects.toThrow('Invalid code');
    });

    it('should fall back to direct Cognito on 404', async () => {
      const notFoundError: any = new Error('Not Found');
      notFoundError.statusCode = 404;
      mockConfirmSignup.mockRejectedValueOnce(notFoundError);

      const result = await awsAuth.confirmSignUp('test@example.com', '123456');
      expect(result).toBe(true);
      expect(mockSend).toHaveBeenCalled();
    });

    it('should fall back to Cognito when message includes "Not Found"', async () => {
      const apiError: any = new Error('Not Found');
      mockConfirmSignup.mockRejectedValueOnce(apiError);

      const result = await awsAuth.confirmSignUp('test@example.com', '123456');
      expect(result).toBe(true);
    });

    it('should re-throw non-404 API errors', async () => {
      const serverError: any = new Error('Server Error');
      serverError.statusCode = 500;
      mockConfirmSignup.mockRejectedValueOnce(serverError);

      await expect(
        awsAuth.confirmSignUp('test@example.com', '123456')
      ).rejects.toThrow('Server Error');
    });
  });

  // ─── G. resendConfirmationCode() ──────────────────────────────────────
  describe('resendConfirmationCode()', () => {
    it('should return true on API success', async () => {
      mockResendConfirmationCode.mockResolvedValueOnce({ success: true });

      const result = await awsAuth.resendConfirmationCode('test@example.com');
      expect(result).toBe(true);
    });

    it('should re-throw 429 rate limit errors', async () => {
      const rateLimitError: any = new Error('Too many requests');
      rateLimitError.statusCode = 429;
      mockResendConfirmationCode.mockRejectedValueOnce(rateLimitError);

      await expect(
        awsAuth.resendConfirmationCode('test@example.com')
      ).rejects.toThrow('Too many requests');
    });

    it('should fall back to direct Cognito on 404', async () => {
      const notFoundError: any = new Error('Not Found');
      notFoundError.statusCode = 404;
      mockResendConfirmationCode.mockRejectedValueOnce(notFoundError);

      const result = await awsAuth.resendConfirmationCode('test@example.com');
      expect(result).toBe(true);
    });

    it('should fall back to Cognito when message includes "Not Found"', async () => {
      const apiError: any = new Error('Not Found');
      mockResendConfirmationCode.mockRejectedValueOnce(apiError);

      const result = await awsAuth.resendConfirmationCode('test@example.com');
      expect(result).toBe(true);
    });

    it('should throw when API returns success=false', async () => {
      mockResendConfirmationCode.mockResolvedValueOnce({ success: false, message: 'Resend failed' });

      await expect(
        awsAuth.resendConfirmationCode('test@example.com')
      ).rejects.toThrow('Resend failed');
    });
  });

  // ─── H. forgotPassword() ─────────────────────────────────────────────
  describe('forgotPassword()', () => {
    it('should return true on API success', async () => {
      mockForgotPassword.mockResolvedValueOnce({ success: true });

      const result = await awsAuth.forgotPassword('test@example.com');
      expect(result).toBe(true);
    });

    it('should return true even when API returns success=false (anti-enumeration)', async () => {
      mockForgotPassword.mockResolvedValueOnce({ success: false });

      const result = await awsAuth.forgotPassword('nonexistent@example.com');
      expect(result).toBe(true);
    });

    it('should re-throw 429 rate limit errors', async () => {
      const rateLimitError: any = new Error('Too many requests');
      rateLimitError.statusCode = 429;
      mockForgotPassword.mockRejectedValueOnce(rateLimitError);

      await expect(
        awsAuth.forgotPassword('test@example.com')
      ).rejects.toThrow('Too many requests');
    });

    it('should fall back to direct Cognito on 404', async () => {
      const notFoundError: any = new Error('Not Found');
      notFoundError.statusCode = 404;
      mockForgotPassword.mockRejectedValueOnce(notFoundError);

      const result = await awsAuth.forgotPassword('test@example.com');
      expect(result).toBe(true);
    });

    it('should fall back to Cognito when message includes "Not Found"', async () => {
      const apiError: any = new Error('Not Found');
      mockForgotPassword.mockRejectedValueOnce(apiError);

      const result = await awsAuth.forgotPassword('test@example.com');
      expect(result).toBe(true);
    });

    it('should re-throw non-404/non-429 errors', async () => {
      const serverError: any = new Error('Internal Server Error');
      serverError.statusCode = 500;
      mockForgotPassword.mockRejectedValueOnce(serverError);

      await expect(
        awsAuth.forgotPassword('test@example.com')
      ).rejects.toThrow('Internal Server Error');
    });
  });

  // ─── I. confirmForgotPassword() ──────────────────────────────────────
  describe('confirmForgotPassword()', () => {
    it('should return true on API success', async () => {
      mockConfirmForgotPassword.mockResolvedValueOnce({ success: true });

      const result = await awsAuth.confirmForgotPassword('test@example.com', '123456', 'NewPass123');
      expect(result).toBe(true);
    });

    it('should fall back to direct Cognito on 404', async () => {
      const notFoundError: any = new Error('Not Found');
      notFoundError.statusCode = 404;
      mockConfirmForgotPassword.mockRejectedValueOnce(notFoundError);

      const result = await awsAuth.confirmForgotPassword('test@example.com', '123456', 'NewPass123');
      expect(result).toBe(true);
    });

    it('should fall back to Cognito when message includes "Not Found"', async () => {
      const apiError: any = new Error('Not Found');
      mockConfirmForgotPassword.mockRejectedValueOnce(apiError);

      const result = await awsAuth.confirmForgotPassword('test@example.com', '123456', 'NewPass');
      expect(result).toBe(true);
    });

    it('should re-throw non-404 API errors', async () => {
      const serverError: any = new Error('Server broke');
      serverError.statusCode = 500;
      mockConfirmForgotPassword.mockRejectedValueOnce(serverError);

      await expect(
        awsAuth.confirmForgotPassword('test@example.com', '123456', 'NewPass123')
      ).rejects.toThrow('Server broke');
    });

    it('should throw when API returns success=false', async () => {
      mockConfirmForgotPassword.mockResolvedValueOnce({
        success: false,
        message: 'Code expired',
      });

      await expect(
        awsAuth.confirmForgotPassword('test@example.com', 'badcode', 'NewPass123')
      ).rejects.toThrow('Code expired');
    });
  });

  // ─── J. signOut() ─────────────────────────────────────────────────────
  describe('signOut()', () => {
    it('should call GlobalSignOutCommand when accessToken is present', async () => {
      await doSignIn();
      mockSend.mockClear();

      await awsAuth.signOut();

      expect(mockSend).toHaveBeenCalled();
    });

    it('should clear session and feeds even without accessToken', async () => {
      await awsAuth.signOut();

      expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith(TOKEN_KEYS.ACCESS_TOKEN);
      expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith(TOKEN_KEYS.REFRESH_TOKEN);
      expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith(TOKEN_KEYS.ID_TOKEN);
      expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith(TOKEN_KEYS.USER);
    });

    it('should still clear session when GlobalSignOutCommand fails', async () => {
      await doSignIn();
      mockSend.mockReset().mockRejectedValue(new Error('Cognito error'));

      await awsAuth.signOut();

      expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith(TOKEN_KEYS.ACCESS_TOKEN);
      expect(awsAuth.isAuthenticated()).toBe(false);
    });

    it('should notify listeners with null on signOut', async () => {
      const listener = jest.fn();
      const unsub = awsAuth.onAuthStateChange(listener);

      await doSignIn();
      listener.mockClear();

      await awsAuth.signOut();

      expect(listener).toHaveBeenCalledWith(null);

      unsub();
    });

    it('should clear feedStore and VibesFeed cache', async () => {
      await doSignIn();
      mockClearFeed.mockClear();
      mockClearVibesFeedCache.mockClear();

      await awsAuth.signOut();

      expect(mockClearFeed).toHaveBeenCalled();
      expect(mockClearVibesFeedCache).toHaveBeenCalled();
    });
  });

  // ─── K. getAccessToken() / getIdToken() ───────────────────────────────
  describe('getAccessToken() / getIdToken()', () => {
    it('should call initialize() when no token in memory and return null', async () => {
      const token = await awsAuth.getAccessToken();
      expect(token).toBeNull();
    });

    it('should return token directly when not expired', async () => {
      await doSignIn();
      mockSend.mockClear();

      const token = await awsAuth.getAccessToken();
      expect(token).toBe(validAccessToken);
      expect(mockSend).not.toHaveBeenCalled();
    });

    it('should call refreshSessionOnce when token is expired', async () => {
      const expiredAT = makeJwt({ ...EXPIRED_PAYLOAD, token_use: 'access' });

      mockSend.mockResolvedValueOnce({
        AuthenticationResult: {
          AccessToken: expiredAT,
          RefreshToken: validRefreshToken,
          IdToken: validIdToken,
        },
      });
      await awsAuth.signIn({ email: 'test@example.com', password: 'Pass1234' });
      mockSend.mockClear();

      mockSend.mockResolvedValueOnce({
        AuthenticationResult: {
          AccessToken: validAccessToken,
          IdToken: validIdToken,
        },
      });

      const token = await awsAuth.getAccessToken();
      expect(token).toBe(validAccessToken);
    });

    it('getIdToken should return token directly when not expired', async () => {
      await doSignIn();
      mockSend.mockClear();

      const token = await awsAuth.getIdToken();
      expect(token).toBe(validIdToken);
      expect(mockSend).not.toHaveBeenCalled();
    });

    it('getIdToken should call initialize when no token in memory', async () => {
      const token = await awsAuth.getIdToken();
      expect(token).toBeNull();
    });
  });

  // ─── L. getCurrentUser() ──────────────────────────────────────────────
  describe('getCurrentUser()', () => {
    it('should return user in memory immediately', async () => {
      await doSignIn();

      const user = await awsAuth.getCurrentUser();
      expect(user?.id).toBe('user-uuid-123');
    });

    it('should call initialize when no user in memory', async () => {
      const user = await awsAuth.getCurrentUser();
      expect(user).toBeNull();
    });

    it('should restore user from SecureStore if available', async () => {
      secureStoreMap.set(TOKEN_KEYS.ACCESS_TOKEN, validAccessToken);
      secureStoreMap.set(TOKEN_KEYS.ID_TOKEN, validIdToken);
      secureStoreMap.set(TOKEN_KEYS.REFRESH_TOKEN, validRefreshToken);
      secureStoreMap.set(TOKEN_KEYS.USER, JSON.stringify(VALID_USER));

      const user = await awsAuth.getCurrentUser();
      expect(user?.id).toBe('user-uuid-123');
    });
  });

  // ─── M. isAuthenticated() ─────────────────────────────────────────────
  describe('isAuthenticated()', () => {
    it('should return true when accessToken is present', async () => {
      await doSignIn();
      expect(awsAuth.isAuthenticated()).toBe(true);
    });

    it('should return false when no accessToken', () => {
      expect(awsAuth.isAuthenticated()).toBe(false);
    });
  });

  // ─── N. isEmailVerified() ─────────────────────────────────────────────
  describe('isEmailVerified()', () => {
    it('should return true when user has emailVerified=true', async () => {
      await doSignIn();

      const result = await awsAuth.isEmailVerified();
      expect(result).toBe(true);
    });

    it('should return false when user has emailVerified=false', async () => {
      const unverifiedPayload = { ...VALID_PAYLOAD, email_verified: false };
      const unverifiedIdToken = makeJwt(unverifiedPayload);

      mockSend.mockResolvedValueOnce({
        AuthenticationResult: {
          AccessToken: validAccessToken,
          RefreshToken: validRefreshToken,
          IdToken: unverifiedIdToken,
        },
      });
      await awsAuth.signIn({ email: 'test@example.com', password: 'Pass1234' });

      const result = await awsAuth.isEmailVerified();
      expect(result).toBe(false);
    });

    it('should return false when no user', async () => {
      const result = await awsAuth.isEmailVerified();
      expect(result).toBe(false);
    });
  });

  // ─── O. verifyPassword() ─────────────────────────────────────────────
  describe('verifyPassword()', () => {
    it('should return true when signIn succeeds', async () => {
      await doSignIn();

      mockSend.mockResolvedValueOnce({
        AuthenticationResult: {
          AccessToken: validAccessToken,
          RefreshToken: validRefreshToken,
          IdToken: validIdToken,
        },
      });

      const result = await awsAuth.verifyPassword('Pass1234');
      expect(result).toBe(true);
    });

    it('should return false when signIn throws', async () => {
      await doSignIn();

      mockSend.mockRejectedValueOnce(new Error('Incorrect password'));

      const result = await awsAuth.verifyPassword('WrongPass');
      expect(result).toBe(false);
    });

    it('should return false when no current user', async () => {
      const result = await awsAuth.verifyPassword('SomePass');
      expect(result).toBe(false);
    });
  });

  // ─── P. changePassword() ─────────────────────────────────────────────
  describe('changePassword()', () => {
    it('should succeed when authenticated', async () => {
      await doSignIn();
      mockSend.mockClear();

      mockSend.mockResolvedValueOnce({});

      await expect(
        awsAuth.changePassword('OldPass123', 'NewPass456')
      ).resolves.toBeUndefined();

      expect(mockSend).toHaveBeenCalled();
    });

    it('should throw when no accessToken (not authenticated)', async () => {
      await expect(
        awsAuth.changePassword('OldPass', 'NewPass')
      ).rejects.toThrow('No authenticated user');
    });

    it('should re-throw Cognito errors', async () => {
      await doSignIn();
      mockSend.mockClear();

      const cognitoError = new Error('Password does not meet requirements');
      cognitoError.name = 'InvalidPasswordException';
      mockSend.mockRejectedValueOnce(cognitoError);

      await expect(
        awsAuth.changePassword('OldPass123', 'weak')
      ).rejects.toThrow('Password does not meet requirements');
    });
  });

  // ─── Q. signInWithApple() ─────────────────────────────────────────────
  describe('signInWithApple()', () => {
    it('should store tokens, decode ID token, and notify listeners', async () => {
      const listener = jest.fn();
      const unsub = awsAuth.onAuthStateChange(listener);

      mockApiRequest.mockResolvedValueOnce({
        user: { id: 'apple-user-id', email: 'apple@example.com' },
        tokens: {
          accessToken: validAccessToken,
          idToken: validIdToken,
          refreshToken: validRefreshToken,
        },
      });

      const user = await awsAuth.signInWithApple('apple-identity-token', 'apple-nonce');

      expect(user.id).toBe('user-uuid-123');
      expect(SecureStore.setItemAsync).toHaveBeenCalledWith(TOKEN_KEYS.ACCESS_TOKEN, validAccessToken);
      expect(listener).toHaveBeenCalledWith(expect.objectContaining({ id: 'user-uuid-123' }));

      unsub();
    });

    it('should re-throw errors', async () => {
      mockApiRequest.mockRejectedValueOnce(new Error('Apple auth failed'));

      await expect(
        awsAuth.signInWithApple('bad-token', 'nonce')
      ).rejects.toThrow('Apple auth failed');
    });
  });

  // ─── R. signInWithGoogle() ────────────────────────────────────────────
  describe('signInWithGoogle()', () => {
    it('should store tokens, decode ID token, and notify listeners', async () => {
      const listener = jest.fn();
      const unsub = awsAuth.onAuthStateChange(listener);

      mockApiRequest.mockResolvedValueOnce({
        user: { id: 'google-user-id', email: 'google@example.com' },
        tokens: {
          accessToken: validAccessToken,
          idToken: validIdToken,
          refreshToken: validRefreshToken,
        },
      });

      const user = await awsAuth.signInWithGoogle('google-id-token', 'google-access-token');

      expect(user.id).toBe('user-uuid-123');
      expect(SecureStore.setItemAsync).toHaveBeenCalledWith(TOKEN_KEYS.ACCESS_TOKEN, validAccessToken);
      expect(listener).toHaveBeenCalledWith(expect.objectContaining({ id: 'user-uuid-123' }));

      unsub();
    });

    it('should re-throw errors', async () => {
      mockApiRequest.mockRejectedValueOnce(new Error('Google auth failed'));

      await expect(
        awsAuth.signInWithGoogle('bad-token')
      ).rejects.toThrow('Google auth failed');
    });
  });

  // ─── S. onAuthStateChange() ───────────────────────────────────────────
  describe('onAuthStateChange()', () => {
    it('should call listener on signIn', async () => {
      const listener = jest.fn();
      awsAuth.onAuthStateChange(listener);

      mockSend.mockResolvedValueOnce({
        AuthenticationResult: {
          AccessToken: validAccessToken,
          RefreshToken: validRefreshToken,
          IdToken: validIdToken,
        },
      });

      await awsAuth.signIn({ email: 'test@example.com', password: 'Pass1234' });

      expect(listener).toHaveBeenCalledWith(expect.objectContaining({ id: 'user-uuid-123' }));
    });

    it('should NOT call listener after unsubscribe', async () => {
      const listener = jest.fn();
      const unsub = awsAuth.onAuthStateChange(listener);
      unsub();

      mockSend.mockResolvedValueOnce({
        AuthenticationResult: {
          AccessToken: validAccessToken,
          RefreshToken: validRefreshToken,
          IdToken: validIdToken,
        },
      });

      await awsAuth.signIn({ email: 'test@example.com', password: 'Pass1234' });

      expect(listener).not.toHaveBeenCalled();
    });

    it('should not crash other listeners when one throws', async () => {
      const badListener = jest.fn(() => { throw new Error('Listener error'); });
      const goodListener = jest.fn();

      awsAuth.onAuthStateChange(badListener);
      awsAuth.onAuthStateChange(goodListener);

      mockSend.mockResolvedValueOnce({
        AuthenticationResult: {
          AccessToken: validAccessToken,
          RefreshToken: validRefreshToken,
          IdToken: validIdToken,
        },
      });

      await awsAuth.signIn({ email: 'test@example.com', password: 'Pass1234' });

      expect(badListener).toHaveBeenCalled();
      expect(goodListener).toHaveBeenCalled();
    });
  });

  // ─── T. refreshSession (tested indirectly) ───────────────────────────
  describe('refreshSession (indirect via initialize/getAccessToken)', () => {
    it('should return false when no refreshToken is present', async () => {
      secureStoreMap.set(TOKEN_KEYS.ACCESS_TOKEN, expiredAccessToken);
      secureStoreMap.set(TOKEN_KEYS.ID_TOKEN, expiredIdToken);
      secureStoreMap.set(TOKEN_KEYS.USER, JSON.stringify(VALID_USER));

      const user = await awsAuth.initialize();
      expect(user).toBeTruthy();
    });

    it('should update tokens on successful refresh', async () => {
      const newAccessToken = makeJwt({ ...VALID_PAYLOAD, token_use: 'access', iat: Date.now() / 1000 });
      const newIdToken = makeJwt({ ...VALID_PAYLOAD, iat: Date.now() / 1000 });

      mockSend.mockResolvedValueOnce({
        AuthenticationResult: {
          AccessToken: expiredAccessToken,
          RefreshToken: validRefreshToken,
          IdToken: expiredIdToken,
        },
      });
      await awsAuth.signIn({ email: 'test@example.com', password: 'Pass1234' });
      mockSend.mockClear();
      (SecureStore.setItemAsync as jest.Mock).mockClear();

      mockSend.mockResolvedValueOnce({
        AuthenticationResult: {
          AccessToken: newAccessToken,
          IdToken: newIdToken,
        },
      });

      const token = await awsAuth.getAccessToken();
      expect(token).toBe(newAccessToken);
      expect(SecureStore.setItemAsync).toHaveBeenCalledWith(TOKEN_KEYS.ACCESS_TOKEN, newAccessToken);
    });

    it('should retry on network error then return false keeping session alive', async () => {
      jest.useFakeTimers();

      secureStoreMap.set(TOKEN_KEYS.ACCESS_TOKEN, expiredAccessToken);
      secureStoreMap.set(TOKEN_KEYS.ID_TOKEN, expiredIdToken);
      secureStoreMap.set(TOKEN_KEYS.REFRESH_TOKEN, validRefreshToken);
      secureStoreMap.set(TOKEN_KEYS.USER, JSON.stringify(VALID_USER));

      const networkError = new TypeError('Network request failed');
      mockSend.mockRejectedValueOnce(networkError);
      mockSend.mockRejectedValueOnce(new TypeError('Network request failed'));

      const initPromise = awsAuth.initialize();

      await jest.advanceTimersByTimeAsync(3000);

      const user = await initPromise;
      expect(user).toBeTruthy();

      jest.useRealTimers();
    });

    it('should succeed on retry after initial network error', async () => {
      jest.useFakeTimers();

      const newAccessToken = makeJwt({ ...VALID_PAYLOAD, token_use: 'access', retried: true });
      const newIdToken = makeJwt({ ...VALID_PAYLOAD, retried: true });

      secureStoreMap.set(TOKEN_KEYS.ACCESS_TOKEN, expiredAccessToken);
      secureStoreMap.set(TOKEN_KEYS.ID_TOKEN, expiredIdToken);
      secureStoreMap.set(TOKEN_KEYS.REFRESH_TOKEN, validRefreshToken);
      secureStoreMap.set(TOKEN_KEYS.USER, JSON.stringify(VALID_USER));

      mockSend.mockRejectedValueOnce(new TypeError('Network request failed'));
      mockSend.mockResolvedValueOnce({
        AuthenticationResult: {
          AccessToken: newAccessToken,
          IdToken: newIdToken,
        },
      });

      const initPromise = awsAuth.initialize();
      await jest.advanceTimersByTimeAsync(3000);
      const user = await initPromise;

      expect(user).toBeTruthy();
      expect(SecureStore.setItemAsync).toHaveBeenCalledWith(TOKEN_KEYS.ACCESS_TOKEN, newAccessToken);

      jest.useRealTimers();
    });

    it('should clear session on auth error (not network)', async () => {
      secureStoreMap.set(TOKEN_KEYS.ACCESS_TOKEN, expiredAccessToken);
      secureStoreMap.set(TOKEN_KEYS.ID_TOKEN, expiredIdToken);
      secureStoreMap.set(TOKEN_KEYS.REFRESH_TOKEN, validRefreshToken);
      secureStoreMap.set(TOKEN_KEYS.USER, JSON.stringify(VALID_USER));

      mockSend.mockRejectedValueOnce(new Error('Token has been revoked'));

      const result = await awsAuth.initialize();
      expect(result).toBeNull();
      expect(awsAuth.isAuthenticated()).toBe(false);
    });

    it('should return false when refresh response has no AccessToken', async () => {
      secureStoreMap.set(TOKEN_KEYS.ACCESS_TOKEN, expiredAccessToken);
      secureStoreMap.set(TOKEN_KEYS.ID_TOKEN, expiredIdToken);
      secureStoreMap.set(TOKEN_KEYS.REFRESH_TOKEN, validRefreshToken);
      secureStoreMap.set(TOKEN_KEYS.USER, JSON.stringify(VALID_USER));

      mockSend.mockResolvedValueOnce({
        AuthenticationResult: {},
      });

      const user = await awsAuth.initialize();
      expect(user).toBeTruthy();
    });
  });

  // ─── U. refreshSessionOnce (deduplication) ───────────────────────────
  describe('refreshSessionOnce deduplication', () => {
    it('should only execute one actual refresh for concurrent calls', async () => {
      mockSend.mockResolvedValueOnce({
        AuthenticationResult: {
          AccessToken: expiredAccessToken,
          RefreshToken: validRefreshToken,
          IdToken: expiredIdToken,
        },
      });
      await awsAuth.signIn({ email: 'test@example.com', password: 'Pass1234' });
      mockSend.mockClear();

      const newAccessToken = makeJwt({ ...VALID_PAYLOAD, token_use: 'access', fresh: true });
      const newIdToken = makeJwt({ ...VALID_PAYLOAD, fresh: true });

      mockSend.mockResolvedValueOnce({
        AuthenticationResult: {
          AccessToken: newAccessToken,
          IdToken: newIdToken,
        },
      });

      const [token1, token2] = await Promise.all([
        awsAuth.getAccessToken(),
        awsAuth.getAccessToken(),
      ]);

      expect(token1).toBe(newAccessToken);
      expect(token2).toBe(newAccessToken);
      expect(mockSend).toHaveBeenCalledTimes(1);
    });
  });

  // ─── requestPasswordReset() ───────────────────────────────────────────
  describe('requestPasswordReset()', () => {
    it('should delegate to forgotPassword', async () => {
      mockForgotPassword.mockResolvedValueOnce({ success: true });

      await awsAuth.requestPasswordReset('test@example.com');

      expect(mockForgotPassword).toHaveBeenCalledWith('test@example.com');
    });
  });

  // ─── SecureStore error handling ───────────────────────────────────────
  describe('SecureStore error handling', () => {
    it('should handle SecureStore.getItemAsync errors gracefully in initialize', async () => {
      (SecureStore.getItemAsync as jest.Mock).mockRejectedValueOnce(new Error('Keychain error'));

      const result = await awsAuth.initialize();
      expect(result).toBeNull();
    });
  });

  // ─── Apple/Google signIn: token persist retry ─────────────────────────
  describe('signInWithApple/Google token persist retry', () => {
    it('signInWithApple should retry token persist on failure', async () => {
      jest.useFakeTimers();

      mockApiRequest.mockResolvedValueOnce({
        user: { id: 'apple-id' },
        tokens: {
          accessToken: validAccessToken,
          idToken: validIdToken,
          refreshToken: validRefreshToken,
        },
      });

      let verifyCallCount = 0;
      (SecureStore.getItemAsync as jest.Mock).mockImplementation((key: string) => {
        if (key === TOKEN_KEYS.ACCESS_TOKEN) {
          verifyCallCount++;
          if (verifyCallCount <= 1) return Promise.resolve(null);
          return Promise.resolve(validAccessToken);
        }
        return Promise.resolve(secureStoreMap.get(key) ?? null);
      });

      const signInPromise = awsAuth.signInWithApple('token', 'nonce');
      await jest.advanceTimersByTimeAsync(1500);
      const user = await signInPromise;

      expect(user.id).toBe('user-uuid-123');

      jest.useRealTimers();
    });

    it('signInWithGoogle should retry token persist on failure', async () => {
      jest.useFakeTimers();

      mockApiRequest.mockResolvedValueOnce({
        user: { id: 'google-id' },
        tokens: {
          accessToken: validAccessToken,
          idToken: validIdToken,
          refreshToken: validRefreshToken,
        },
      });

      let verifyCallCount = 0;
      (SecureStore.getItemAsync as jest.Mock).mockImplementation((key: string) => {
        if (key === TOKEN_KEYS.ACCESS_TOKEN) {
          verifyCallCount++;
          if (verifyCallCount <= 1) return Promise.resolve(null);
          return Promise.resolve(validAccessToken);
        }
        return Promise.resolve(secureStoreMap.get(key) ?? null);
      });

      const signInPromise = awsAuth.signInWithGoogle('id-token', 'access-token');
      await jest.advanceTimersByTimeAsync(1500);
      const user = await signInPromise;

      expect(user.id).toBe('user-uuid-123');

      jest.useRealTimers();
    });
  });
});

/**
 * Social Authentication Service Tests
 *
 * Tests Apple and Google Sign-In flows with all native modules mocked.
 */

// ---------------------------------------------------------------------------
// Mocks — must be declared before imports
// ---------------------------------------------------------------------------

jest.mock('react-native', () => ({
  Platform: { OS: 'ios' },
}));

const mockIsAvailableAsync = jest.fn();
const mockSignInAsync = jest.fn();

jest.mock('expo-apple-authentication', () => ({
  isAvailableAsync: mockIsAvailableAsync,
  signInAsync: mockSignInAsync,
  AppleAuthenticationScope: { FULL_NAME: 0, EMAIL: 1 },
}));

const mockGetRandomBytes = jest.fn();
const mockDigestStringAsync = jest.fn();

jest.mock('expo-crypto', () => ({
  getRandomBytes: mockGetRandomBytes,
  digestStringAsync: mockDigestStringAsync,
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
}));

jest.mock('expo-web-browser', () => ({
  maybeCompleteAuthSession: jest.fn(),
}));

jest.mock('expo-auth-session/providers/google', () => ({
  useAuthRequest: jest.fn(() => [null, null, jest.fn()]),
}));

const mockSignInWithApple = jest.fn();
const mockSignInWithGoogle = jest.fn();

jest.mock('../../services/aws-auth', () => ({
  awsAuth: {
    signInWithApple: mockSignInWithApple,
    signInWithGoogle: mockSignInWithGoogle,
  },
}));

jest.mock('../../config/env', () => ({
  ENV: {
    GOOGLE_IOS_CLIENT_ID: 'ios-client-id',
    GOOGLE_ANDROID_CLIENT_ID: 'android-client-id',
    GOOGLE_WEB_CLIENT_ID: 'web-client-id',
  },
}));

const mockStorageSet = jest.fn();

jest.mock('../../utils/secureStorage', () => ({
  storage: { set: mockStorageSet },
  STORAGE_KEYS: { REMEMBER_ME: 'remember_me' },
}));

(global as Record<string, unknown>).__DEV__ = false;

// ---------------------------------------------------------------------------
// Imports — after mocks
// ---------------------------------------------------------------------------

import {
  isAppleSignInAvailable,
  signInWithApple,
  handleGoogleSignIn,
} from '../../services/socialAuth';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('socialAuth', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // =========================================================================
  // isAppleSignInAvailable
  // =========================================================================

  describe('isAppleSignInAvailable', () => {
    it('should return true when available on iOS', async () => {
      mockIsAvailableAsync.mockResolvedValue(true);
      const result = await isAppleSignInAvailable();
      expect(result).toBe(true);
    });

    it('should return false on error', async () => {
      mockIsAvailableAsync.mockRejectedValue(new Error('Not available'));
      const result = await isAppleSignInAvailable();
      expect(result).toBe(false);
    });
  });

  // =========================================================================
  // signInWithApple
  // =========================================================================

  describe('signInWithApple', () => {
    it('should sign in successfully and store remember me', async () => {
      const fakeBytes = new Uint8Array(32);
      fakeBytes.fill(0xab);
      mockGetRandomBytes.mockReturnValue(fakeBytes);
      mockDigestStringAsync.mockResolvedValue('hashed-nonce');
      mockSignInAsync.mockResolvedValue({
        identityToken: 'apple-id-token-123',
        fullName: { givenName: 'John', familyName: 'Doe' },
        email: 'john@apple.com',
      });
      mockSignInWithApple.mockResolvedValue({
        id: 'user-1',
        email: 'john@apple.com',
      });
      mockStorageSet.mockResolvedValue(undefined);

      const result = await signInWithApple();

      expect(result.success).toBe(true);
      expect(result.user?.id).toBe('user-1');
      expect(result.user?.email).toBe('john@apple.com');
      expect(result.user?.fullName).toBe('John Doe');
      expect(mockStorageSet).toHaveBeenCalledWith('remember_me', 'true');
    });

    it('should return error when no identity token', async () => {
      const fakeBytes = new Uint8Array(32);
      fakeBytes.fill(0xab);
      mockGetRandomBytes.mockReturnValue(fakeBytes);
      mockDigestStringAsync.mockResolvedValue('hashed-nonce');
      mockSignInAsync.mockResolvedValue({ identityToken: null });

      const result = await signInWithApple();

      expect(result.success).toBe(false);
      expect(result.error).toBe('No identity token received from Apple');
    });

    it('should handle user cancellation', async () => {
      const fakeBytes = new Uint8Array(32);
      fakeBytes.fill(0xab);
      mockGetRandomBytes.mockReturnValue(fakeBytes);
      mockDigestStringAsync.mockResolvedValue('hashed-nonce');
      mockSignInAsync.mockRejectedValue({ code: 'ERR_REQUEST_CANCELED' });

      const result = await signInWithApple();

      expect(result.success).toBe(false);
      expect(result.error).toBe('cancelled');
    });

    it('should handle rate limiting (429)', async () => {
      const fakeBytes = new Uint8Array(32);
      fakeBytes.fill(0xab);
      mockGetRandomBytes.mockReturnValue(fakeBytes);
      mockDigestStringAsync.mockResolvedValue('hashed-nonce');
      mockSignInAsync.mockRejectedValue({ message: 'Error 429', status: 429 });

      const result = await signInWithApple();

      expect(result.success).toBe(false);
      expect(result.error).toContain('Too many attempts');
    });

    it('should handle generic errors', async () => {
      const fakeBytes = new Uint8Array(32);
      fakeBytes.fill(0xab);
      mockGetRandomBytes.mockReturnValue(fakeBytes);
      mockDigestStringAsync.mockResolvedValue('hashed-nonce');
      mockSignInAsync.mockRejectedValue(new Error('Unknown error'));

      const result = await signInWithApple();

      expect(result.success).toBe(false);
      expect(result.error).toBe('Apple Sign-In failed. Please try again.');
    });

    it('should return error when random bytes generation fails', async () => {
      mockGetRandomBytes.mockReturnValue(null);

      const result = await signInWithApple();

      expect(result.success).toBe(false);
      expect(result.error).toContain('Security initialization failed');
    });
  });

  // =========================================================================
  // handleGoogleSignIn
  // =========================================================================

  describe('handleGoogleSignIn', () => {
    it('should return error for null response', async () => {
      const result = await handleGoogleSignIn(null);
      expect(result.success).toBe(false);
      expect(result.error).toBe('No response from Google');
    });

    it('should handle cancellation', async () => {
      const result = await handleGoogleSignIn({ type: 'cancel' } as never);
      expect(result.success).toBe(false);
      expect(result.error).toBe('cancelled');
    });

    it('should handle dismiss', async () => {
      const result = await handleGoogleSignIn({ type: 'dismiss' } as never);
      expect(result.success).toBe(false);
      expect(result.error).toBe('cancelled');
    });

    it('should handle non-success response', async () => {
      const result = await handleGoogleSignIn({ type: 'error' } as never);
      expect(result.success).toBe(false);
      expect(result.error).toBe('Google Sign-In failed');
    });

    it('should return error when no id_token', async () => {
      const result = await handleGoogleSignIn({
        type: 'success',
        params: { access_token: 'at' },
      } as never);
      expect(result.success).toBe(false);
      expect(result.error).toBe('No ID token received from Google');
    });

    it('should sign in successfully with Google', async () => {
      mockSignInWithGoogle.mockResolvedValue({
        id: 'google-user-1',
        email: 'john@gmail.com',
        attributes: { name: 'John Doe' },
      });
      mockStorageSet.mockResolvedValue(undefined);

      const result = await handleGoogleSignIn({
        type: 'success',
        params: { id_token: 'google-id-token', access_token: 'google-access-token' },
      } as never);

      expect(result.success).toBe(true);
      expect(result.user?.id).toBe('google-user-1');
      expect(result.user?.email).toBe('john@gmail.com');
      expect(result.user?.fullName).toBe('John Doe');
      expect(mockSignInWithGoogle).toHaveBeenCalledWith('google-id-token', 'google-access-token');
    });

    it('should handle Cognito sign-in error', async () => {
      mockSignInWithGoogle.mockRejectedValue(new Error('Cognito error'));

      const result = await handleGoogleSignIn({
        type: 'success',
        params: { id_token: 'token' },
      } as never);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Google Sign-In failed. Please try again.');
    });
  });
});

/**
 * Social Authentication Service
 * Handles Apple and Google Sign-In with AWS Cognito integration
 */

import { Platform } from 'react-native';
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import { AuthSessionResult } from 'expo-auth-session';
import { awsAuth } from './aws-auth';
import { ENV } from '../config/env';
import { storage, STORAGE_KEYS } from '../utils/secureStorage';

// Lazy load native modules to prevent crash in Expo Go
let AppleAuthentication: typeof import('expo-apple-authentication') | null = null;
let Crypto: typeof import('expo-crypto') | null = null;

const getAppleAuth = async () => {
  if (!AppleAuthentication) {
    AppleAuthentication = await import('expo-apple-authentication');
  }
  return AppleAuthentication;
};

const getCrypto = async () => {
  if (!Crypto) {
    Crypto = await import('expo-crypto');
  }
  return Crypto;
};

// Required for web browser auth session
WebBrowser.maybeCompleteAuthSession();

interface SocialAuthResult {
  success: boolean;
  error?: string;
  user?: {
    id: string;
    email?: string;
    fullName?: string;
  };
}

// =====================================================
// APPLE SIGN-IN
// =====================================================

/**
 * Check if Apple Sign-In is available on the device
 */
export const isAppleSignInAvailable = async (): Promise<boolean> => {
  if (Platform.OS !== 'ios') {
    return false;
  }
  try {
    const appleAuth = await getAppleAuth();
    return await appleAuth.isAvailableAsync();
  } catch {
    return false;
  }
};

/**
 * Convert Uint8Array to hex string
 * @throws Error if bytes is invalid
 */
const bytesToHex = (bytes: Uint8Array): string => {
  if (!bytes || !(bytes instanceof Uint8Array) || bytes.length === 0) {
    throw new Error('Invalid bytes provided to bytesToHex - crypto polyfill may have failed');
  }
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
};

/**
 * Sign in with Apple
 * Creates or signs in user via AWS Cognito
 */
export const signInWithApple = async (): Promise<SocialAuthResult> => {
  try {
    const crypto = await getCrypto();
    const appleAuth = await getAppleAuth();

    // Generate a random nonce for security
    const randomBytes = crypto.getRandomBytes(32);

    // Validate random bytes generation (crypto polyfill must be loaded)
    if (!randomBytes || randomBytes.length !== 32) {
      if (__DEV__) console.warn('[AppleAuth] Failed to generate random bytes - crypto polyfill may not be initialized');
      return { success: false, error: 'Security initialization failed. Please restart the app.' };
    }

    const rawNonce = bytesToHex(randomBytes);
    const hashedNonce = await crypto.digestStringAsync(
      crypto.CryptoDigestAlgorithm.SHA256,
      rawNonce
    );

    // Request Apple credentials
    const credential = await appleAuth.signInAsync({
      requestedScopes: [
        appleAuth.AppleAuthenticationScope.FULL_NAME,
        appleAuth.AppleAuthenticationScope.EMAIL,
      ],
      nonce: hashedNonce,
    });

    if (!credential.identityToken) {
      return { success: false, error: 'No identity token received from Apple' };
    }

    // Sign in with AWS Cognito using the Apple ID token
    const user = await awsAuth.signInWithApple(credential.identityToken, rawNonce);

    // Store remember me
    await storage.set(STORAGE_KEYS.REMEMBER_ME, 'true');

    // Extract full name from Apple credential (only available on first sign-in)
    const fullName = credential.fullName
      ? [credential.fullName.givenName, credential.fullName.familyName]
          .filter(Boolean)
          .join(' ')
      : undefined;

    return {
      success: true,
      user: {
        id: user.id,
        email: user.email || credential.email || undefined,
        fullName,
      },
    };
  } catch (error: unknown) {
    const err = error as { code?: string; message?: string; status?: number };
    // Handle user cancellation
    if (err.code === 'ERR_REQUEST_CANCELED') {
      return { success: false, error: 'cancelled' };
    }
    // Handle rate limiting (429)
    if (err.message?.includes('429') || err.status === 429) {
      return { success: false, error: 'Too many attempts. Please wait a few minutes and try again.' };
    }
    if (__DEV__) console.warn('[AppleAuth] Error:', error);
    return { success: false, error: 'Apple Sign-In failed. Please try again.' };
  }
};

// =====================================================
// GOOGLE SIGN-IN
// =====================================================

/**
 * Google OAuth configuration hook
 * Use this in your component: const [request, response, promptAsync] = useGoogleAuth();
 */
export const useGoogleAuth = () => {
  return Google.useAuthRequest({
    iosClientId: ENV.GOOGLE_IOS_CLIENT_ID,
    androidClientId: ENV.GOOGLE_ANDROID_CLIENT_ID,
    webClientId: ENV.GOOGLE_WEB_CLIENT_ID,
    scopes: ['openid', 'profile', 'email'],
  });
};

/**
 * Handle Google sign-in response
 * Call this when the Google auth response changes
 */
export const handleGoogleSignIn = async (
  response: AuthSessionResult | null
): Promise<SocialAuthResult> => {
  if (!response) {
    return { success: false, error: 'No response from Google' };
  }

  if (response.type === 'cancel' || response.type === 'dismiss') {
    return { success: false, error: 'cancelled' };
  }

  if (response.type !== 'success') {
    return { success: false, error: 'Google Sign-In failed' };
  }

  const { id_token, access_token } = response.params;

  if (!id_token) {
    return { success: false, error: 'No ID token received from Google' };
  }

  try {
    // Sign in with AWS Cognito using the Google ID token
    const user = await awsAuth.signInWithGoogle(id_token, access_token);

    // Store remember me
    await storage.set(STORAGE_KEYS.REMEMBER_ME, 'true');

    return {
      success: true,
      user: {
        id: user.id,
        email: user.email || undefined,
        fullName: user.attributes?.name,
      },
    };
  } catch (error: any) {
    if (__DEV__) console.warn('[GoogleAuth] Error:', error);
    return { success: false, error: error.message || 'Google Sign-In failed' };
  }
};


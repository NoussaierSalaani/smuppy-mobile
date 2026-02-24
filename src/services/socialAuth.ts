/**
 * Social Authentication Service
 * Handles Apple and Google Sign-In with AWS Cognito integration
 */

import { Platform } from 'react-native';
import * as Google from 'expo-auth-session/providers/google';
import { AuthSessionResult } from 'expo-auth-session';
import { awsAuth } from './aws-auth';
import { ENV } from '../config/env';
import { storage, STORAGE_KEYS } from '../utils/secureStorage';
import { addBreadcrumb, captureException } from '../lib/sentry';

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

// NOTE: WebBrowser.maybeCompleteAuthSession() is called in AppNavigator.tsx
// (a non-lazy-loaded file) so it runs before any OAuth redirect is processed.
// Do NOT add it here — socialAuth.ts is inside AuthNavigator which is lazy-loaded.

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
  addBreadcrumb('Apple sign-in started', 'auth');
  try {
    const crypto = await getCrypto();
    const appleAuth = await getAppleAuth();

    // Generate a random nonce for security
    const randomBytes = crypto.getRandomBytes(32);

    // Validate random bytes generation (crypto polyfill must be loaded)
    if (!randomBytes || randomBytes.length !== 32) {
      captureException(new Error('Apple Sign-In: crypto random bytes failed'), { provider: 'apple', stage: 'nonce' });
      return { success: false, error: 'Security initialization failed. Please restart the app.' };
    }

    const rawNonce = bytesToHex(randomBytes);
    const hashedNonce = await crypto.digestStringAsync(
      crypto.CryptoDigestAlgorithm.SHA256,
      rawNonce
    );

    addBreadcrumb('Apple signInAsync called', 'auth');

    // Request Apple credentials
    const credential = await appleAuth.signInAsync({
      requestedScopes: [
        appleAuth.AppleAuthenticationScope.FULL_NAME,
        appleAuth.AppleAuthenticationScope.EMAIL,
      ],
      nonce: hashedNonce,
    });

    addBreadcrumb('Apple credential received', 'auth', {
      hasToken: String(!!credential.identityToken),
      hasEmail: String(!!credential.email),
    });

    if (!credential.identityToken) {
      captureException(new Error('Apple Sign-In: no identity token'), { provider: 'apple' });
      return { success: false, error: 'No identity token received from Apple' };
    }

    // Sign in with AWS Cognito using the Apple ID token
    const user = await awsAuth.signInWithApple(credential.identityToken, rawNonce);

    addBreadcrumb('Apple auth: Cognito sign-in success', 'auth', { userId: user.id.slice(0, 8) });

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
    const err = error as { code?: string; message?: string; status?: number; domain?: string };
    // Handle user cancellation
    if (err.code === 'ERR_REQUEST_CANCELED' || err.code === 'ERR_CANCELED') {
      return { success: false, error: 'cancelled' };
    }
    // Handle rate limiting (429)
    if (err.message?.includes('429') || err.status === 429) {
      return { success: false, error: 'Too many attempts. Please wait a few minutes and try again.' };
    }

    // Capture all non-cancellation errors to Sentry
    captureException(error instanceof Error ? error : new Error(err.message || 'Apple Sign-In failed'), {
      provider: 'apple',
      code: err.code,
      domain: err.domain,
      buildNumber: ENV.BUILD_NUMBER,
    });

    if (__DEV__) console.warn('[AppleAuth] Error:', JSON.stringify({ code: err.code, message: err.message, domain: err.domain }));
    return { success: false, error: 'Apple Sign-In failed. Please try again.' };
  }
};

// =====================================================
// GOOGLE SIGN-IN
// =====================================================

/**
 * Google OAuth configuration hook
 * Use this in your component: const [request, response, promptAsync] = useGoogleAuth();
 *
 * IMPORTANT: On iOS standalone builds, expo-auth-session defaults to using
 * Application.applicationId (bundle ID) as the redirect URI scheme. But Google's
 * iOS OAuth client expects the REVERSED client ID as the redirect scheme.
 * We override redirectUri on iOS to match Google's expectation.
 */
export const useGoogleAuth = () => {
  // On iOS standalone builds, Google expects the reversed client ID as redirect scheme.
  // expo-auth-session defaults to Application.applicationId (bundle ID) which doesn't match.
  const hasIosClientId = Platform.OS === 'ios' && !!ENV.GOOGLE_IOS_CLIENT_ID;
  const redirectUri = hasIosClientId
    ? `com.googleusercontent.apps.${ENV.GOOGLE_IOS_CLIENT_ID.split('.apps.')[0]}:/oauthredirect`
    : undefined;

  // Diagnostic: log config state so device logs show whether env vars are populated
  if (__DEV__) {
    console.log('[GoogleAuth] Config:', {
      hasIosClientId,
      iosClientIdLen: ENV.GOOGLE_IOS_CLIENT_ID?.length ?? 0,
      webClientIdLen: ENV.GOOGLE_WEB_CLIENT_ID?.length ?? 0,
      redirectUri: redirectUri ?? 'default',
    });
  }

  addBreadcrumb('Google auth config', 'auth', {
    hasIosClientId: String(hasIosClientId),
    redirectUri: redirectUri ? 'custom' : 'default',
  });

  return Google.useAuthRequest({
    iosClientId: ENV.GOOGLE_IOS_CLIENT_ID,
    androidClientId: ENV.GOOGLE_ANDROID_CLIENT_ID,
    webClientId: ENV.GOOGLE_WEB_CLIENT_ID,
    scopes: ['openid', 'profile', 'email'],
    responseType: 'id_token',
    usePKCE: false,
    redirectUri,
  });
};

/**
 * Handle Google sign-in response
 * Call this when the Google auth response changes
 */
export const handleGoogleSignIn = async (
  response: AuthSessionResult | null
): Promise<SocialAuthResult> => {
  // Diagnostic: log the response type and params for debugging
  addBreadcrumb('Google response received', 'auth', {
    type: response?.type ?? 'null',
    hasParams: response?.type === 'success' ? 'true' : 'false',
  });

  if (!response) {
    return { success: false, error: 'No response from Google' };
  }

  if (response.type === 'cancel' || response.type === 'dismiss') {
    return { success: false, error: 'cancelled' };
  }

  if (response.type !== 'success') {
    // Capture non-success responses for diagnostics
    const errorInfo = 'error' in response ? String((response as { error?: unknown }).error) : 'unknown';
    addBreadcrumb('Google auth non-success', 'auth', { type: response.type, error: errorInfo.slice(0, 200) });
    captureException(new Error(`Google Sign-In response type: ${response.type}`), {
      provider: 'google',
      responseType: response.type,
      buildNumber: ENV.BUILD_NUMBER,
    });
    return { success: false, error: `Google Sign-In failed (${response.type})` };
  }

  const { id_token, access_token } = response.params;

  if (!id_token) {
    addBreadcrumb('Google auth: no id_token in params', 'auth', {
      paramKeys: Object.keys(response.params).join(','),
    });
    captureException(new Error('Google Sign-In: no id_token in response.params'), {
      provider: 'google',
      paramKeys: Object.keys(response.params).join(','),
    });
    return { success: false, error: 'No ID token received from Google' };
  }

  try {
    // Sign in with AWS Cognito using the Google ID token
    const user = await awsAuth.signInWithGoogle(id_token, access_token);

    addBreadcrumb('Google auth: Cognito sign-in success', 'auth', { userId: user.id.slice(0, 8) });

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
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error);
    addBreadcrumb('Google auth: Cognito exchange failed', 'auth', { error: errMsg.slice(0, 200) });
    captureException(error instanceof Error ? error : new Error(errMsg), {
      provider: 'google',
      stage: 'cognito_exchange',
      buildNumber: ENV.BUILD_NUMBER,
    });
    if (__DEV__) console.warn('[GoogleAuth] Cognito exchange error:', errMsg.slice(0, 100));
    return { success: false, error: 'Google Sign-In failed. Please try again.' };
  }
};

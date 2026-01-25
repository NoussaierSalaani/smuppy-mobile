/**
 * Social Authentication Service
 * Handles Apple and Google Sign-In with AWS Cognito integration
 */

import { Platform } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import * as Crypto from 'expo-crypto';
import { AuthSessionResult } from 'expo-auth-session';
import { awsAuth } from './aws-auth';
import { awsAPI } from './aws-api';
import { ENV } from '../config/env';
import { storage, STORAGE_KEYS } from '../utils/secureStorage';

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
  isNewUser?: boolean;
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
    return await AppleAuthentication.isAvailableAsync();
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
    // Generate a random nonce for security
    const randomBytes = Crypto.getRandomBytes(32);

    // Validate random bytes generation (crypto polyfill must be loaded)
    if (!randomBytes || randomBytes.length !== 32) {
      console.error('[AppleAuth] Failed to generate random bytes - crypto polyfill may not be initialized');
      return { success: false, error: 'Security initialization failed. Please restart the app.' };
    }

    const rawNonce = bytesToHex(randomBytes);
    const hashedNonce = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      rawNonce
    );

    // Request Apple credentials
    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
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

    // Check if this is a new user (no profile yet)
    let isNewUser = false;
    try {
      await awsAPI.getProfile(user.id);
    } catch {
      isNewUser = true;
    }

    return {
      success: true,
      user: {
        id: user.id,
        email: user.email || credential.email || undefined,
        fullName,
      },
      isNewUser,
    };
  } catch (error: any) {
    // Handle user cancellation
    if (error.code === 'ERR_REQUEST_CANCELED') {
      return { success: false, error: 'cancelled' };
    }
    console.error('[AppleAuth] Error:', error);
    return { success: false, error: error.message || 'Apple Sign-In failed' };
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

    // Check if this is a new user
    let isNewUser = false;
    try {
      await awsAPI.getProfile(user.id);
    } catch {
      isNewUser = true;
    }

    return {
      success: true,
      user: {
        id: user.id,
        email: user.email || undefined,
        fullName: user.attributes?.name,
      },
      isNewUser,
    };
  } catch (error: any) {
    console.error('[GoogleAuth] Error:', error);
    return { success: false, error: error.message || 'Google Sign-In failed' };
  }
};

/**
 * Alternative: Sign in with Google using OAuth flow
 * This opens a browser for authentication
 */
export const signInWithGoogleOAuth = async (): Promise<SocialAuthResult> => {
  // Not implemented for AWS - use the handleGoogleSignIn flow instead
  return { success: false, error: 'Use Google Auth Session instead' };
};

// =====================================================
// PROFILE MANAGEMENT FOR SOCIAL AUTH USERS
// =====================================================

/**
 * Create or update profile for social auth user
 * Called after successful social sign-in for new users
 */
export const createSocialAuthProfile = async (
  userId: string,
  email?: string,
  fullName?: string,
  accountType: 'personal' | 'pro_creator' | 'pro_local' = 'personal'
): Promise<{ success: boolean; error?: string }> => {
  try {
    // Generate username from email or name
    const baseUsername = email
      ? email.split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '')
      : fullName?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'user';

    const uniqueUsername = `${baseUsername}_${Math.floor(Math.random() * 10000)}`;

    await awsAPI.updateProfile({
      username: uniqueUsername,
      fullName: fullName || baseUsername,
    });

    return { success: true };
  } catch (error: any) {
    console.error('[SocialAuth] Profile creation error:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Shared social authentication hook for Login and Signup screens.
 * Encapsulates Apple Sign-In and Google Sign-In flows with proper
 * error handling, mount tracking, and rate limiting.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  isAppleSignInAvailable,
  signInWithApple,
  useGoogleAuth,
  handleGoogleSignIn,
} from '../services/socialAuth';

const SOCIAL_AUTH_COOLDOWN_MS = 3000;

interface UseSocialAuthOptions {
  /** Prefix for error modal titles ('Sign-In' or 'Sign-Up') */
  errorPrefix: 'Sign-In' | 'Sign-Up';
  /** Callback invoked when a social auth error occurs */
  onError: (title: string, message: string) => void;
}

interface UseSocialAuthReturn {
  appleAvailable: boolean;
  socialLoading: 'apple' | 'google' | null;
  handleAppleSignIn: () => Promise<void>;
  handleGoogleSignInPress: () => Promise<void>;
}

export function useSocialAuth({ errorPrefix, onError }: UseSocialAuthOptions): UseSocialAuthReturn {
  const [appleAvailable, setAppleAvailable] = useState(false);
  const [socialLoading, setSocialLoading] = useState<'apple' | 'google' | null>(null);
  const isMountedRef = useRef(true);
  const lastAttemptRef = useRef(0);

  const [googleRequest, googleResponse, googlePromptAsync] = useGoogleAuth();

  // Mount tracking — single dedicated effect
  useEffect(() => {
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
  }, []);

  // Check Apple Sign-In availability (iOS only)
  useEffect(() => {
    let cancelled = false;
    isAppleSignInAvailable().then((available) => {
      if (!cancelled) setAppleAvailable(available);
    }).catch(() => {
      if (__DEV__) console.warn(`[SocialAuth] Apple Sign-In check failed`);
    });
    return () => { cancelled = true; };
  }, []);

  // Handle Google OAuth response when it changes
  useEffect(() => {
    if (!googleResponse) return;

    let cancelled = false;

    (async () => {
      if (!isMountedRef.current || cancelled) return;
      setSocialLoading('google');

      try {
        const result = await handleGoogleSignIn(googleResponse);
        if (!isMountedRef.current || cancelled) return;

        if (!result.success && result.error && result.error !== 'cancelled') {
          onError(`Google ${errorPrefix} Failed`, result.error);
        }
      } finally {
        if (isMountedRef.current && !cancelled) {
          setSocialLoading(null);
        }
      }
    })().catch(() => {
      if (isMountedRef.current && !cancelled) {
        setSocialLoading(null);
      }
    });

    return () => { cancelled = true; };
  }, [googleResponse, errorPrefix, onError]);

  const handleAppleSignIn = useCallback(async () => {
    // Rate limiting: prevent rapid successive taps
    const now = Date.now();
    if (now - lastAttemptRef.current < SOCIAL_AUTH_COOLDOWN_MS) return;
    lastAttemptRef.current = now;

    setSocialLoading('apple');
    try {
      const result = await signInWithApple();
      if (!isMountedRef.current) return;

      if (!result.success && result.error && result.error !== 'cancelled') {
        onError(`Apple ${errorPrefix} Failed`, result.error);
      }
    } finally {
      if (isMountedRef.current) {
        setSocialLoading(null);
      }
    }
  }, [errorPrefix, onError]);

  const handleGoogleSignInPress = useCallback(async () => {
    if (!googleRequest) {
      onError(
        `Google ${errorPrefix} Unavailable`,
        'Google Sign-In is not configured. Please try again later.',
      );
      return;
    }

    // Rate limiting: prevent rapid successive taps
    const now = Date.now();
    if (now - lastAttemptRef.current < SOCIAL_AUTH_COOLDOWN_MS) return;
    lastAttemptRef.current = now;

    try {
      setSocialLoading('google');
      await googlePromptAsync();
      // Response handled by the googleResponse useEffect above
    } catch {
      if (__DEV__) console.warn(`[SocialAuth] Google prompt error`);
      if (isMountedRef.current) {
        setSocialLoading(null);
      }
    }
  }, [googleRequest, googlePromptAsync, errorPrefix, onError]);

  return {
    appleAvailable,
    socialLoading,
    handleAppleSignIn,
    handleGoogleSignInPress,
  };
}

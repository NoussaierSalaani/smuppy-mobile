import * as LocalAuthentication from 'expo-local-authentication';
import { storage, STORAGE_KEYS } from './secureStorage';

const MAX_ATTEMPTS = 3;
const BLOCK_DURATION = 5 * 60 * 1000; // 5 minutes

/**
 * Biometric authentication types
 */
export type BiometricType = 'face' | 'fingerprint' | null;

export interface BlockStatus {
  blocked: boolean;
  remainingSeconds: number;
}

export interface AttemptResult {
  blocked: boolean;
  remainingSeconds?: number;
  attemptsLeft?: number;
}

export interface AuthResult {
  success: boolean;
  error?: string;
  remainingSeconds?: number;
  attemptsLeft?: number;
}

export interface Biometrics {
  isAvailable: () => Promise<boolean>;
  getType: () => Promise<BiometricType>;
  isBlocked: () => Promise<BlockStatus>;
  recordFailedAttempt: () => Promise<AttemptResult>;
  resetAttempts: () => Promise<void>;
  authenticate: (promptMessage?: string) => Promise<AuthResult>;
  enable: () => Promise<AuthResult>;
  disable: () => Promise<{ success: boolean }>;
  isEnabled: () => Promise<boolean>;
  loginWithBiometrics: () => Promise<AuthResult>;
}

export const biometrics: Biometrics = {
  isAvailable: async (): Promise<boolean> => {
    const compatible = await LocalAuthentication.hasHardwareAsync();
    const enrolled = await LocalAuthentication.isEnrolledAsync();
    return compatible && enrolled;
  },

  getType: async (): Promise<BiometricType> => {
    const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
    if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) return 'face';
    if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) return 'fingerprint';
    return null;
  },

  isBlocked: async (): Promise<BlockStatus> => {
    const blockedUntil = await storage.get('biometric_blocked_until');
    if (blockedUntil) {
      const blockTime = parseInt(blockedUntil);
      if (Date.now() < blockTime) {
        const remainingMs = blockTime - Date.now();
        return { blocked: true, remainingSeconds: Math.ceil(remainingMs / 1000) };
      }
      await storage.delete('biometric_blocked_until');
      await storage.delete('biometric_attempts');
    }
    return { blocked: false, remainingSeconds: 0 };
  },

  recordFailedAttempt: async (): Promise<AttemptResult> => {
    const attemptsStr = await storage.get('biometric_attempts');
    const attempts = attemptsStr ? parseInt(attemptsStr) + 1 : 1;
    await storage.set('biometric_attempts', attempts.toString());

    if (attempts >= MAX_ATTEMPTS) {
      const blockUntil = Date.now() + BLOCK_DURATION;
      await storage.set('biometric_blocked_until', blockUntil.toString());
      return { blocked: true, remainingSeconds: Math.ceil(BLOCK_DURATION / 1000) };
    }
    return { blocked: false, attemptsLeft: MAX_ATTEMPTS - attempts };
  },

  resetAttempts: async (): Promise<void> => {
    await storage.delete('biometric_attempts');
    await storage.delete('biometric_blocked_until');
  },

  authenticate: async (promptMessage = 'Authenticate to continue'): Promise<AuthResult> => {
    try {
      const blockStatus = await biometrics.isBlocked();
      if (blockStatus.blocked) {
        return { success: false, error: 'blocked', remainingSeconds: blockStatus.remainingSeconds };
      }

      const result = await LocalAuthentication.authenticateAsync({
        promptMessage,
        cancelLabel: 'Cancel',
        disableDeviceFallback: false,
        fallbackLabel: 'Use password',
      });

      if (result.success) {
        await biometrics.resetAttempts();
        return { success: true };
      }

      // Handle failed authentication - result is now narrowed to { success: false; error: string }
      const attemptResult = await biometrics.recordFailedAttempt();
      const errorMessage = 'error' in result ? result.error : 'unknown';
      if (attemptResult.blocked) {
        return { success: false, error: 'blocked', remainingSeconds: attemptResult.remainingSeconds };
      }
      return { success: false, error: errorMessage, attemptsLeft: attemptResult.attemptsLeft };
    } catch (e) {
      const error = e as Error;
      return { success: false, error: error.message };
    }
  },

  enable: async (): Promise<AuthResult> => {
    const available = await biometrics.isAvailable();
    if (!available) return { success: false, error: 'Biometrics not available' };

    const auth = await biometrics.authenticate('Enable biometric login');
    if (auth.success) {
      await storage.set(STORAGE_KEYS.BIOMETRIC_ENABLED, 'true');
      return { success: true };
    }
    return auth;
  },

  disable: async (): Promise<{ success: boolean }> => {
    await storage.delete(STORAGE_KEYS.BIOMETRIC_ENABLED);
    await biometrics.resetAttempts();
    return { success: true };
  },

  isEnabled: async (): Promise<boolean> => {
    const enabled = await storage.get(STORAGE_KEYS.BIOMETRIC_ENABLED);
    return enabled === 'true';
  },

  loginWithBiometrics: async (): Promise<AuthResult> => {
    const enabled = await biometrics.isEnabled();
    if (!enabled) return { success: false, error: 'Biometrics not enabled' };

    const auth = await biometrics.authenticate('Login to Smuppy');
    return auth;
  },
};

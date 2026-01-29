import * as LocalAuthentication from 'expo-local-authentication';
import { storage, STORAGE_KEYS } from './secureStorage';

const MAX_ATTEMPTS = 3;
const BLOCK_DURATION = 5 * 60 * 1000; // 5 minutes
const SESSION_TIMEOUT_DAYS = 30; // Session expires after 30 days of inactivity

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
  /**
   * Enable biometrics - REQUIRES password verification for security
   * This prevents someone from enabling biometrics on a borrowed device
   * @param verifyPassword - Function to verify password with backend
   */
  enable: (verifyPassword: () => Promise<boolean>) => Promise<AuthResult>;
  disable: () => Promise<{ success: boolean }>;
  isEnabled: () => Promise<boolean>;
  loginWithBiometrics: () => Promise<AuthResult>;
  /**
   * Check if session is still valid (not timed out)
   * Sessions expire after SESSION_TIMEOUT_DAYS of inactivity
   */
  isSessionValid: () => Promise<boolean>;
  /**
   * Update last activity timestamp
   */
  updateLastActivity: () => Promise<void>;
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
        disableDeviceFallback: true,
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

  /**
   * Enable biometrics with password verification
   * SECURITY: Requires password to prevent unauthorized biometric enrollment
   */
  enable: async (verifyPassword: () => Promise<boolean>): Promise<AuthResult> => {
    const available = await biometrics.isAvailable();
    if (!available) return { success: false, error: 'Biometrics not available' };

    // SECURITY STEP 1: Verify password FIRST (before biometric prompt)
    // This ensures the account owner is enabling biometrics, not device owner
    const passwordValid = await verifyPassword();
    if (!passwordValid) {
      return { success: false, error: 'Password verification failed' };
    }

    // SECURITY STEP 2: Now authenticate with biometrics
    const auth = await biometrics.authenticate('Enable biometric login');
    if (auth.success) {
      await storage.set(STORAGE_KEYS.BIOMETRIC_ENABLED, 'true');
      // Record when biometrics was enabled for session tracking
      await storage.set('biometric_enabled_at', Date.now().toString());
      await biometrics.updateLastActivity();
      return { success: true };
    }
    return auth;
  },

  disable: async (): Promise<{ success: boolean }> => {
    await storage.delete(STORAGE_KEYS.BIOMETRIC_ENABLED);
    await storage.delete('biometric_enabled_at');
    await storage.delete('biometric_last_activity');
    await biometrics.resetAttempts();
    return { success: true };
  },

  isEnabled: async (): Promise<boolean> => {
    const enabled = await storage.get(STORAGE_KEYS.BIOMETRIC_ENABLED);
    return enabled === 'true';
  },

  /**
   * Check if biometric session is still valid
   * Sessions expire after SESSION_TIMEOUT_DAYS of inactivity
   */
  isSessionValid: async (): Promise<boolean> => {
    const lastActivity = await storage.get('biometric_last_activity');
    if (!lastActivity) return false;

    const lastActivityTime = parseInt(lastActivity, 10);
    const now = Date.now();
    const daysSinceActivity = (now - lastActivityTime) / (1000 * 60 * 60 * 24);

    return daysSinceActivity < SESSION_TIMEOUT_DAYS;
  },

  /**
   * Update last activity timestamp
   * Call this on successful biometric login
   */
  updateLastActivity: async (): Promise<void> => {
    await storage.set('biometric_last_activity', Date.now().toString());
  },

  loginWithBiometrics: async (): Promise<AuthResult> => {
    const enabled = await biometrics.isEnabled();
    if (!enabled) return { success: false, error: 'Biometrics not enabled' };

    // SECURITY: Check session timeout
    const sessionValid = await biometrics.isSessionValid();
    if (!sessionValid) {
      // Session expired - disable biometrics and require password login
      await biometrics.disable();
      return { success: false, error: 'session_expired' };
    }

    const auth = await biometrics.authenticate('Login to Smuppy');
    if (auth.success) {
      // Update last activity on successful login
      await biometrics.updateLastActivity();
    }
    return auth;
  },
};

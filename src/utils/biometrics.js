import * as LocalAuthentication from 'expo-local-authentication';
import { storage, STORAGE_KEYS } from './secureStorage';

const MAX_ATTEMPTS = 3;
const BLOCK_DURATION = 5 * 60 * 1000; // 5 minutes

export const biometrics = {
  isAvailable: async () => {
    const compatible = await LocalAuthentication.hasHardwareAsync();
    const enrolled = await LocalAuthentication.isEnrolledAsync();
    return compatible && enrolled;
  },

  getType: async () => {
    const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
    if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) return 'face';
    if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) return 'fingerprint';
    return null;
  },

  isBlocked: async () => {
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

  recordFailedAttempt: async () => {
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

  resetAttempts: async () => {
    await storage.delete('biometric_attempts');
    await storage.delete('biometric_blocked_until');
  },

  authenticate: async (promptMessage = 'Authenticate to continue') => {
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
      } else {
        const attemptResult = await biometrics.recordFailedAttempt();
        if (attemptResult.blocked) {
          return { success: false, error: 'blocked', remainingSeconds: attemptResult.remainingSeconds };
        }
        return { success: false, error: result.error, attemptsLeft: attemptResult.attemptsLeft };
      }
    } catch (e) {
      return { success: false, error: e.message };
    }
  },

  enable: async () => {
    const available = await biometrics.isAvailable();
    if (!available) return { success: false, error: 'Biometrics not available' };
    
    const auth = await biometrics.authenticate('Enable biometric login');
    if (auth.success) {
      await storage.set(STORAGE_KEYS.BIOMETRIC_ENABLED, 'true');
      return { success: true };
    }
    return auth;
  },

  disable: async () => {
    await storage.delete(STORAGE_KEYS.BIOMETRIC_ENABLED);
    await biometrics.resetAttempts();
    return { success: true };
  },

  isEnabled: async () => {
    const enabled = await storage.get(STORAGE_KEYS.BIOMETRIC_ENABLED);
    return enabled === 'true';
  },

  loginWithBiometrics: async () => {
    const enabled = await biometrics.isEnabled();
    if (!enabled) return { success: false, error: 'Biometrics not enabled' };
    
    const auth = await biometrics.authenticate('Login to Smuppy');
    return auth;
  },
};
import { AppState, NativeEventSubscription } from 'react-native';
import { storage } from './secureStorage';
import { biometrics } from './biometrics';

const LOCK_TIMEOUT = 5 * 60 * 1000; // 5 minutes
const LOGOUT_TIMEOUT = 30 * 60 * 1000; // 30 minutes

/**
 * Session state types
 */
export type SessionState = 'ok' | 'lock' | 'logout';

export type LockCallback = () => void;
export type LogoutCallback = () => void;

export interface SessionManager {
  start: (onLock?: LockCallback, onLogout?: LogoutCallback) => void;
  stop: () => void;
  checkOnLaunch: () => Promise<SessionState>;
  resetTimer: () => void;
}

let backgroundTime: number | null = null;
let appStateSubscription: NativeEventSubscription | null = null;

export const sessionManager: SessionManager = {
  // Start monitoring app state
  start: (onLock?: LockCallback, onLogout?: LogoutCallback): void => {
    appStateSubscription = AppState.addEventListener('change', async (state) => {
      if (state === 'background') {
        backgroundTime = Date.now();
        await storage.set('background_time', backgroundTime.toString());
      } else if (state === 'active' && backgroundTime) {
        const elapsed = Date.now() - backgroundTime;
        backgroundTime = null;
        await storage.delete('background_time');

        if (elapsed >= LOGOUT_TIMEOUT) {
          onLogout?.();
        } else if (elapsed >= LOCK_TIMEOUT) {
          const biometricEnabled = await biometrics.isEnabled();
          if (biometricEnabled) onLock?.();
        }
      }
    });
  },

  // Stop monitoring
  stop: (): void => {
    appStateSubscription?.remove();
    appStateSubscription = null;
    backgroundTime = null;
  },

  // Check session state on app launch
  checkOnLaunch: async (): Promise<SessionState> => {
    const savedTime = await storage.get('background_time');
    if (savedTime) {
      const elapsed = Date.now() - parseInt(savedTime);
      await storage.delete('background_time');

      if (elapsed >= LOGOUT_TIMEOUT) return 'logout';
      if (elapsed >= LOCK_TIMEOUT) return 'lock';
    }
    return 'ok';
  },

  // Reset timer after user activity
  resetTimer: (): void => {
    backgroundTime = null;
  },
};

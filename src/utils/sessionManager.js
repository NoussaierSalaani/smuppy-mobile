import { AppState } from 'react-native';
import { storage, STORAGE_KEYS } from './secureStorage';
import { biometrics } from './biometrics';

const LOCK_TIMEOUT = 5 * 60 * 1000; // 5 minutes
const LOGOUT_TIMEOUT = 30 * 60 * 1000; // 30 minutes

let backgroundTime = null;
let appStateSubscription = null;

export const sessionManager = {
  // Démarrer le monitoring
  start: (onLock, onLogout) => {
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

  // Arrêter le monitoring
  stop: () => {
    appStateSubscription?.remove();
    appStateSubscription = null;
    backgroundTime = null;
  },

  // Vérifier au lancement de l'app
  checkOnLaunch: async () => {
    const savedTime = await storage.get('background_time');
    if (savedTime) {
      const elapsed = Date.now() - parseInt(savedTime);
      await storage.delete('background_time');
      
      if (elapsed >= LOGOUT_TIMEOUT) return 'logout';
      if (elapsed >= LOCK_TIMEOUT) return 'lock';
    }
    return 'ok';
  },

  // Reset le timer (après activité utilisateur)
  resetTimer: () => {
    backgroundTime = null;
  },
};
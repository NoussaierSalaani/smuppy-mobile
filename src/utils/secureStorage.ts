import * as SecureStore from 'expo-secure-store';

/**
 * Secure storage wrapper using expo-secure-store
 * Provides encrypted key-value storage for sensitive data
 */

export interface Storage {
  set: (key: string, value: string | Record<string, unknown>) => Promise<boolean>;
  get: <T = string>(key: string, parse?: boolean) => Promise<T | null>;
  delete: (key: string) => Promise<boolean>;
  clear: (keys: string[]) => Promise<boolean>;
}

// Log SecureStore errors in dev so failures are visible
function logStorageError(op: string, key: string, e: unknown): void {
  if (__DEV__) {
    console.warn(`[SecureStorage] ${op} failed for key "${key}":`, (e as Error).message);
  }
}

export const storage: Storage = {
  set: async (key: string, value: string | Record<string, unknown>): Promise<boolean> => {
    try {
      const data = typeof value === 'string' ? value : JSON.stringify(value);
      await SecureStore.setItemAsync(key, data);
      return true;
    } catch (e) {
      logStorageError('set', key, e);
      return false;
    }
  },

  get: async <T = string>(key: string, parse = false): Promise<T | null> => {
    try {
      const value = await SecureStore.getItemAsync(key);
      if (!value) return null;
      return parse ? JSON.parse(value) : (value as unknown as T);
    } catch (e) {
      logStorageError('get', key, e);
      return null;
    }
  },

  delete: async (key: string): Promise<boolean> => {
    try {
      await SecureStore.deleteItemAsync(key);
      return true;
    } catch (e) {
      logStorageError('delete', key, e);
      return false;
    }
  },

  clear: async (keys: string[]): Promise<boolean> => {
    try {
      await Promise.all(keys.map(k => SecureStore.deleteItemAsync(k)));
      return true;
    } catch (e) {
      logStorageError('clear', keys.join(','), e);
      return false;
    }
  },
};

export const STORAGE_KEYS = {
  ACCESS_TOKEN: 'access_token',
  REFRESH_TOKEN: 'refresh_token',
  USER_ID: 'user_id',
  BIOMETRIC_ENABLED: 'biometric_enabled',
  REMEMBER_ME: 'remember_me',
  FIND_FRIENDS_SHOWN: 'find_friends_shown',
} as const;

export type StorageKey = typeof STORAGE_KEYS[keyof typeof STORAGE_KEYS];

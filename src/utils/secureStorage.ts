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

export const storage: Storage = {
  set: async (key: string, value: string | Record<string, unknown>): Promise<boolean> => {
    try {
      const data = typeof value === 'string' ? value : JSON.stringify(value);
      await SecureStore.setItemAsync(key, data);
      return true;
    } catch (e) {
      // Silent on simulator (no keychain access)
      return false;
    }
  },

  get: async <T = string>(key: string, parse = false): Promise<T | null> => {
    try {
      const value = await SecureStore.getItemAsync(key);
      if (!value) return null;
      return parse ? JSON.parse(value) : (value as unknown as T);
    } catch (e) {
      // Silent on simulator (no keychain access)
      return null;
    }
  },

  delete: async (key: string): Promise<boolean> => {
    try {
      await SecureStore.deleteItemAsync(key);
      return true;
    } catch (e) {
      // Silent on simulator (no keychain access)
      return false;
    }
  },

  clear: async (keys: string[]): Promise<boolean> => {
    try {
      await Promise.all(keys.map(k => SecureStore.deleteItemAsync(k)));
      return true;
    } catch (e) {
      // Silent on simulator (no keychain access)
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
  JUST_SIGNED_UP: 'just_signed_up',
} as const;

export type StorageKey = typeof STORAGE_KEYS[keyof typeof STORAGE_KEYS];

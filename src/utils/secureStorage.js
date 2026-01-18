import * as SecureStore from 'expo-secure-store';

export const storage = {
  set: async (key, value) => {
    try {
      const data = typeof value === 'string' ? value : JSON.stringify(value);
      await SecureStore.setItemAsync(key, data);
      return true;
    } catch (e) {
      console.error('SecureStore set error:', e);
      return false;
    }
  },
  get: async (key, parse = false) => {
    try {
      const value = await SecureStore.getItemAsync(key);
      if (!value) return null;
      return parse ? JSON.parse(value) : value;
    } catch (e) {
      console.error('SecureStore get error:', e);
      return null;
    }
  },
  delete: async (key) => {
    try {
      await SecureStore.deleteItemAsync(key);
      return true;
    } catch (e) {
      console.error('SecureStore delete error:', e);
      return false;
    }
  },
  clear: async (keys) => {
    try {
      await Promise.all(keys.map(k => SecureStore.deleteItemAsync(k)));
      return true;
    } catch (e) {
      console.error('SecureStore clear error:', e);
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
};
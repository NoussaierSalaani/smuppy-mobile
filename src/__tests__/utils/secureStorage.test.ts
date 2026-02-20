/**
 * Secure Storage Utility Tests
 * Tests for the encrypted key-value storage wrapper.
 */

// Define __DEV__ before imports
(global as Record<string, unknown>).__DEV__ = true;

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

import * as SecureStore from 'expo-secure-store';
import { storage, STORAGE_KEYS } from '../../utils/secureStorage';

describe('Secure Storage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('storage.set', () => {
    it('should store a string value', async () => {
      (SecureStore.setItemAsync as jest.Mock).mockResolvedValue(undefined);
      const result = await storage.set('test_key', 'test_value');
      expect(result).toBe(true);
      expect(SecureStore.setItemAsync).toHaveBeenCalledWith('test_key', 'test_value');
    });

    it('should stringify objects before storing', async () => {
      (SecureStore.setItemAsync as jest.Mock).mockResolvedValue(undefined);
      const obj = { token: 'abc123', userId: '456' };
      const result = await storage.set('test_key', obj);
      expect(result).toBe(true);
      expect(SecureStore.setItemAsync).toHaveBeenCalledWith('test_key', JSON.stringify(obj));
    });

    it('should return false when setItemAsync fails', async () => {
      (SecureStore.setItemAsync as jest.Mock).mockRejectedValue(new Error('Storage full'));
      const result = await storage.set('test_key', 'value');
      expect(result).toBe(false);
    });
  });

  describe('storage.get', () => {
    it('should return a stored string value', async () => {
      (SecureStore.getItemAsync as jest.Mock).mockResolvedValue('test_value');
      const result = await storage.get('test_key');
      expect(result).toBe('test_value');
    });

    it('should return null when key does not exist', async () => {
      (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(null);
      const result = await storage.get('missing_key');
      expect(result).toBeNull();
    });

    it('should parse JSON when parse=true', async () => {
      const obj = { token: 'abc123', userId: '456' };
      (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(JSON.stringify(obj));
      const result = await storage.get('test_key', true);
      expect(result).toEqual(obj);
    });

    it('should return raw string when parse=false (default)', async () => {
      (SecureStore.getItemAsync as jest.Mock).mockResolvedValue('{"key": "value"}');
      const result = await storage.get('test_key');
      expect(result).toBe('{"key": "value"}');
    });

    it('should return null when getItemAsync fails', async () => {
      (SecureStore.getItemAsync as jest.Mock).mockRejectedValue(new Error('Read error'));
      const result = await storage.get('test_key');
      expect(result).toBeNull();
    });

    it('should return null for empty string value', async () => {
      (SecureStore.getItemAsync as jest.Mock).mockResolvedValue('');
      const result = await storage.get('test_key');
      expect(result).toBeNull();
    });
  });

  describe('storage.delete', () => {
    it('should delete a key and return true', async () => {
      (SecureStore.deleteItemAsync as jest.Mock).mockResolvedValue(undefined);
      const result = await storage.delete('test_key');
      expect(result).toBe(true);
      expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('test_key');
    });

    it('should return false when deleteItemAsync fails', async () => {
      (SecureStore.deleteItemAsync as jest.Mock).mockRejectedValue(new Error('Delete error'));
      const result = await storage.delete('test_key');
      expect(result).toBe(false);
    });
  });

  describe('storage.clear', () => {
    it('should delete all given keys and return true', async () => {
      (SecureStore.deleteItemAsync as jest.Mock).mockResolvedValue(undefined);
      const result = await storage.clear(['key1', 'key2', 'key3']);
      expect(result).toBe(true);
      expect(SecureStore.deleteItemAsync).toHaveBeenCalledTimes(3);
      expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('key1');
      expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('key2');
      expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('key3');
    });

    it('should return false when any delete fails', async () => {
      (SecureStore.deleteItemAsync as jest.Mock)
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error('Delete error'));
      const result = await storage.clear(['key1', 'key2']);
      expect(result).toBe(false);
    });

    it('should handle empty array', async () => {
      const result = await storage.clear([]);
      expect(result).toBe(true);
      expect(SecureStore.deleteItemAsync).not.toHaveBeenCalled();
    });
  });

  describe('STORAGE_KEYS', () => {
    it('should have all expected keys', () => {
      expect(STORAGE_KEYS.ACCESS_TOKEN).toBe('access_token');
      expect(STORAGE_KEYS.REFRESH_TOKEN).toBe('refresh_token');
      expect(STORAGE_KEYS.USER_ID).toBe('user_id');
      expect(STORAGE_KEYS.REMEMBER_ME).toBe('remember_me');
      expect(STORAGE_KEYS.FIND_FRIENDS_SHOWN).toBe('find_friends_shown');
    });

    it('should have exactly 5 keys', () => {
      expect(Object.keys(STORAGE_KEYS)).toHaveLength(5);
    });
  });
});

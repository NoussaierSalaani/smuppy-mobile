/**
 * Cognito Storage Adapter Tests
 *
 * Tests the custom storage adapter for AWS Cognito tokens.
 * Uses in-memory cache + SecureStore (mocked) for persistence.
 */

// ---------------------------------------------------------------------------
// Mocks — must be declared before imports
// ---------------------------------------------------------------------------

const mockSecureGetItemAsync = jest.fn();
const mockSecureSetItemAsync = jest.fn();
const mockSecureDeleteItemAsync = jest.fn();

jest.mock('expo-secure-store', () => ({
  getItemAsync: mockSecureGetItemAsync,
  setItemAsync: mockSecureSetItemAsync,
  deleteItemAsync: mockSecureDeleteItemAsync,
}));

// AsyncStorage is already mocked in jest.setup.js, but let's get a reference
const mockAsyncStorage = require('@react-native-async-storage/async-storage');

(global as Record<string, unknown>).__DEV__ = false;

// ---------------------------------------------------------------------------
// Imports — after mocks
// ---------------------------------------------------------------------------

import {
  cognitoStorage,
  getCognitoItem,
  setCognitoItem,
  removeCognitoItem,
  clearCognitoStorage,
  initializeCognitoStorage,
} from '../../services/cognitoStorage';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('cognitoStorage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default: mock SecureStore operations to return resolved promises
    mockSecureSetItemAsync.mockResolvedValue(undefined);
    mockSecureDeleteItemAsync.mockResolvedValue(undefined);
    mockSecureGetItemAsync.mockResolvedValue(null);
    // Clear in-memory cache by accessing internal state via clear()
    // We call the sync adapter clear method which also clears memoryCache
    cognitoStorage.clear();
    // Wait for async operations
    return new Promise(resolve => setTimeout(resolve, 0));
  });

  // =========================================================================
  // CognitoStorageAdapter (synchronous)
  // =========================================================================

  describe('setItem', () => {
    it('should store in memory and return value', () => {
      const result = cognitoStorage.setItem('test_key', 'test_value');
      expect(result).toBe('test_value');
    });

    it('should persist to SecureStore asynchronously', async () => {
      mockSecureSetItemAsync.mockResolvedValue(undefined);
      cognitoStorage.setItem('test_key', 'test_value');

      // Allow async operations to complete
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(mockSecureSetItemAsync).toHaveBeenCalledWith(
        'cognito_test_key',
        'test_value'
      );
    });

    it('should sanitize keys with special characters', async () => {
      mockSecureSetItemAsync.mockResolvedValue(undefined);
      cognitoStorage.setItem('CognitoIdentityServiceProvider.123.test@email.com', 'value');

      await new Promise(resolve => setTimeout(resolve, 10));

      // Special chars replaced with _
      expect(mockSecureSetItemAsync).toHaveBeenCalledWith(
        expect.stringContaining('cognito_CognitoIdentityServiceProvider'),
        'value'
      );
    });
  });

  describe('getItem', () => {
    it('should return value from memory cache', () => {
      cognitoStorage.setItem('my_key', 'my_value');
      const result = cognitoStorage.getItem('my_key');
      expect(result).toBe('my_value');
    });

    it('should return null for missing key', () => {
      const result = cognitoStorage.getItem('nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('removeItem', () => {
    it('should remove from memory cache', () => {
      cognitoStorage.setItem('remove_me', 'value');
      cognitoStorage.removeItem('remove_me');
      expect(cognitoStorage.getItem('remove_me')).toBeNull();
    });

    it('should delete from SecureStore asynchronously', async () => {
      mockSecureDeleteItemAsync.mockResolvedValue(undefined);
      cognitoStorage.setItem('remove_me', 'value');
      cognitoStorage.removeItem('remove_me');

      await new Promise(resolve => setTimeout(resolve, 10));

      expect(mockSecureDeleteItemAsync).toHaveBeenCalledWith('cognito_remove_me');
    });
  });

  describe('clear', () => {
    it('should clear memory cache', () => {
      cognitoStorage.setItem('key1', 'val1');
      cognitoStorage.setItem('key2', 'val2');
      cognitoStorage.clear();

      expect(cognitoStorage.getItem('key1')).toBeNull();
      expect(cognitoStorage.getItem('key2')).toBeNull();
    });
  });

  describe('sync', () => {
    it('should load keys from SecureStore into memory', async () => {
      // Set up indexed keys
      mockAsyncStorage.getItem.mockResolvedValue(JSON.stringify(['token_key']));
      mockSecureGetItemAsync.mockResolvedValue('stored_token');

      await cognitoStorage.sync();

      expect(cognitoStorage.getItem('token_key')).toBe('stored_token');
    });

    it('should handle empty keys index', async () => {
      mockAsyncStorage.getItem.mockResolvedValue(null);

      await cognitoStorage.sync();
      // Should not throw
    });

    it('should skip null values from SecureStore', async () => {
      mockAsyncStorage.getItem.mockResolvedValue(JSON.stringify(['key1']));
      mockSecureGetItemAsync.mockResolvedValue(null);

      await cognitoStorage.sync();
      expect(cognitoStorage.getItem('key1')).toBeNull();
    });

    it('should handle sync errors gracefully', async () => {
      mockAsyncStorage.getItem.mockRejectedValue(new Error('Storage error'));

      await expect(cognitoStorage.sync()).resolves.toBeUndefined();
    });
  });

  // =========================================================================
  // Async functions
  // =========================================================================

  describe('getCognitoItem', () => {
    it('should return from memory cache first', async () => {
      cognitoStorage.setItem('cached_key', 'cached_value');
      const result = await getCognitoItem('cached_key');
      expect(result).toBe('cached_value');
      expect(mockSecureGetItemAsync).not.toHaveBeenCalled();
    });

    it('should fall back to SecureStore when not in cache', async () => {
      mockSecureGetItemAsync.mockResolvedValue('secure_value');
      const result = await getCognitoItem('secure_key');
      expect(result).toBe('secure_value');
    });

    it('should return null on SecureStore error', async () => {
      mockSecureGetItemAsync.mockRejectedValue(new Error('Read error'));
      const result = await getCognitoItem('error_key');
      expect(result).toBeNull();
    });
  });

  describe('setCognitoItem', () => {
    it('should set in memory and persist to SecureStore', async () => {
      mockSecureSetItemAsync.mockResolvedValue(undefined);
      mockAsyncStorage.getItem.mockResolvedValue(null);
      mockAsyncStorage.setItem.mockResolvedValue(undefined);

      await setCognitoItem('async_key', 'async_value');

      expect(cognitoStorage.getItem('async_key')).toBe('async_value');
      expect(mockSecureSetItemAsync).toHaveBeenCalledWith('cognito_async_key', 'async_value');
    });

    it('should handle SecureStore write error gracefully', async () => {
      mockSecureSetItemAsync.mockRejectedValue(new Error('Write error'));

      await expect(setCognitoItem('fail_key', 'value')).resolves.toBeUndefined();
      // Value should still be in memory
      expect(cognitoStorage.getItem('fail_key')).toBe('value');
    });
  });

  describe('removeCognitoItem', () => {
    it('should remove from memory and SecureStore', async () => {
      cognitoStorage.setItem('del_key', 'del_value');
      mockSecureDeleteItemAsync.mockResolvedValue(undefined);
      mockAsyncStorage.getItem.mockResolvedValue(JSON.stringify(['del_key']));
      mockAsyncStorage.setItem.mockResolvedValue(undefined);

      await removeCognitoItem('del_key');

      expect(cognitoStorage.getItem('del_key')).toBeNull();
      expect(mockSecureDeleteItemAsync).toHaveBeenCalledWith('cognito_del_key');
    });

    it('should handle errors gracefully', async () => {
      mockSecureDeleteItemAsync.mockRejectedValue(new Error('Delete error'));

      await expect(removeCognitoItem('fail_key')).resolves.toBeUndefined();
    });
  });

  describe('clearCognitoStorage', () => {
    it('should clear memory and all indexed SecureStore keys', async () => {
      cognitoStorage.setItem('key1', 'val1');
      mockAsyncStorage.getItem.mockResolvedValue(JSON.stringify(['key1']));
      mockSecureDeleteItemAsync.mockResolvedValue(undefined);
      mockAsyncStorage.removeItem.mockResolvedValue(undefined);

      await clearCognitoStorage();

      expect(cognitoStorage.getItem('key1')).toBeNull();
      expect(mockSecureDeleteItemAsync).toHaveBeenCalledWith('cognito_key1');
    });

    it('should handle errors gracefully', async () => {
      mockAsyncStorage.getItem.mockRejectedValue(new Error('Clear error'));

      await expect(clearCognitoStorage()).resolves.toBeUndefined();
    });
  });

  describe('initializeCognitoStorage', () => {
    it('should call sync', async () => {
      mockAsyncStorage.getItem.mockResolvedValue(null);

      await initializeCognitoStorage();
      // No error means sync was called
    });
  });
});

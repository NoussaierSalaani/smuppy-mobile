/**
 * Custom Storage Adapter for AWS Cognito tokens
 * Required for React Native - Cognito needs explicit storage implementation
 *
 * SECURITY: Uses in-memory cache + SecureStore (encrypted keychain) for persistence
 * SecureStore encrypts data at rest on both iOS (Keychain) and Android (Keystore)
 *
 * NOTE: Cognito SDK requires synchronous getItem/setItem. We use an in-memory cache
 * for synchronous reads, and persist asynchronously to SecureStore. On app startup,
 * sync() loads all persisted keys back into memory.
 */

import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';

// SecureStore keys cannot contain special characters — sanitize
const COGNITO_SECURE_PREFIX = 'cognito_';
// Track all stored keys in AsyncStorage (SecureStore has no getAllKeys)
const COGNITO_KEYS_INDEX = '@cognito_keys_index';

// In-memory cache for synchronous access (required by Cognito)
const memoryCache: Map<string, string> = new Map();

/**
 * Sanitize key for SecureStore compatibility (alphanumeric + _ + -)
 */
function sanitizeKey(key: string): string {
  return COGNITO_SECURE_PREFIX + key.replace(/[^a-zA-Z0-9_-]/g, '_');
}

/**
 * Track a key in the index (for sync/clear operations)
 */
async function addKeyToIndex(key: string): Promise<void> {
  try {
    const indexJson = await AsyncStorage.getItem(COGNITO_KEYS_INDEX);
    const keys: string[] = indexJson ? JSON.parse(indexJson) : [];
    if (!keys.includes(key)) {
      keys.push(key);
      await AsyncStorage.setItem(COGNITO_KEYS_INDEX, JSON.stringify(keys));
    }
  } catch {
    // Non-critical: key tracking failed
  }
}

async function removeKeyFromIndex(key: string): Promise<void> {
  try {
    const indexJson = await AsyncStorage.getItem(COGNITO_KEYS_INDEX);
    const keys: string[] = indexJson ? JSON.parse(indexJson) : [];
    const filtered = keys.filter((k) => k !== key);
    await AsyncStorage.setItem(COGNITO_KEYS_INDEX, JSON.stringify(filtered));
  } catch {
    // Non-critical
  }
}

async function getAllIndexedKeys(): Promise<string[]> {
  try {
    const indexJson = await AsyncStorage.getItem(COGNITO_KEYS_INDEX);
    return indexJson ? JSON.parse(indexJson) : [];
  } catch {
    return [];
  }
}

class CognitoStorageAdapter {
  /**
   * Synchronous setItem - stores in memory, persists to SecureStore async
   */
  setItem(key: string, value: string): string {
    memoryCache.set(key, value);

    // Persist to SecureStore asynchronously
    const secureKey = sanitizeKey(key);
    SecureStore.setItemAsync(secureKey, value).catch((error) => {
      console.error('[CognitoStorage] SecureStore setItem error:', error);
    });
    addKeyToIndex(key).catch(() => {});

    return value;
  }

  /**
   * Synchronous getItem - returns from memory cache
   */
  getItem(key: string): string | null {
    const value = memoryCache.get(key);
    return value !== undefined ? value : null;
  }

  /**
   * Synchronous removeItem - removes from memory + SecureStore
   */
  removeItem(key: string): void {
    memoryCache.delete(key);

    const secureKey = sanitizeKey(key);
    SecureStore.deleteItemAsync(secureKey).catch((error) => {
      console.error('[CognitoStorage] SecureStore removeItem error:', error);
    });
    removeKeyFromIndex(key).catch(() => {});
  }

  /**
   * Clear all Cognito storage
   */
  clear(): void {
    memoryCache.clear();

    getAllIndexedKeys()
      .then(async (keys) => {
        for (const key of keys) {
          const secureKey = sanitizeKey(key);
          await SecureStore.deleteItemAsync(secureKey).catch(() => {});
        }
        await AsyncStorage.removeItem(COGNITO_KEYS_INDEX);
      })
      .catch((error) => {
        console.error('[CognitoStorage] clear error:', error);
      });
  }

  /**
   * Sync memory cache from SecureStore - call on app startup
   */
  async sync(): Promise<void> {
    try {
      const keys = await getAllIndexedKeys();
      if (keys.length === 0) return;

      for (const key of keys) {
        const secureKey = sanitizeKey(key);
        const value = await SecureStore.getItemAsync(secureKey);
        if (value !== null) {
          memoryCache.set(key, value);
        }
      }

      console.log('[CognitoStorage] Synced', memoryCache.size, 'items from SecureStore');
    } catch (error) {
      console.error('[CognitoStorage] sync error:', error);
    }
  }
}

// Singleton instance
export const cognitoStorage = new CognitoStorageAdapter();

// Async versions for manual token management
export async function getCognitoItem(key: string): Promise<string | null> {
  const cached = memoryCache.get(key);
  if (cached !== undefined) return cached;

  try {
    const secureKey = sanitizeKey(key);
    const value = await SecureStore.getItemAsync(secureKey);
    if (value !== null) {
      memoryCache.set(key, value);
    }
    return value;
  } catch (error) {
    console.error('[CognitoStorage] getItem async error:', error);
    return null;
  }
}

export async function setCognitoItem(key: string, value: string): Promise<void> {
  memoryCache.set(key, value);
  try {
    const secureKey = sanitizeKey(key);
    await SecureStore.setItemAsync(secureKey, value);
    await addKeyToIndex(key);
  } catch (error) {
    console.error('[CognitoStorage] setItem async error:', error);
  }
}

export async function removeCognitoItem(key: string): Promise<void> {
  memoryCache.delete(key);
  try {
    const secureKey = sanitizeKey(key);
    await SecureStore.deleteItemAsync(secureKey);
    await removeKeyFromIndex(key);
  } catch (error) {
    console.error('[CognitoStorage] removeItem async error:', error);
  }
}

export async function clearCognitoStorage(): Promise<void> {
  memoryCache.clear();
  try {
    const keys = await getAllIndexedKeys();
    for (const key of keys) {
      const secureKey = sanitizeKey(key);
      await SecureStore.deleteItemAsync(secureKey).catch(() => {});
    }
    await AsyncStorage.removeItem(COGNITO_KEYS_INDEX);
  } catch (error) {
    console.error('[CognitoStorage] clear async error:', error);
  }
}

/**
 * Initialize storage - call on app startup before using Cognito
 */
export async function initializeCognitoStorage(): Promise<void> {
  await cognitoStorage.sync();
}

export default cognitoStorage;

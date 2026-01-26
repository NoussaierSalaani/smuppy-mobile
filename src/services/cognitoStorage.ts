/**
 * Custom Storage Adapter for AWS Cognito tokens
 * Required for React Native - Cognito needs explicit storage implementation
 *
 * IMPORTANT: Uses in-memory cache + AsyncStorage for proper session persistence
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const COGNITO_PREFIX = '@cognito/';

// In-memory cache for synchronous access (required by Cognito)
const memoryCache: Map<string, string> = new Map();

class CognitoStorageAdapter {
  /**
   * Synchronous setItem - stores in both memory and AsyncStorage
   */
  setItem(key: string, value: string): string {
    // Store in memory cache for synchronous access
    memoryCache.set(key, value);

    // Also persist to AsyncStorage
    AsyncStorage.setItem(COGNITO_PREFIX + key, value).catch((error) => {
      console.error('[CognitoStorage] setItem error:', key, error);
    });

    return value;
  }

  /**
   * Synchronous getItem - returns from memory cache
   */
  getItem(key: string): string | null {
    // Return from memory cache
    const value = memoryCache.get(key);
    return value !== undefined ? value : null;
  }

  /**
   * Synchronous removeItem - removes from both memory and AsyncStorage
   */
  removeItem(key: string): void {
    memoryCache.delete(key);

    AsyncStorage.removeItem(COGNITO_PREFIX + key).catch((error) => {
      console.error('[CognitoStorage] removeItem error:', key, error);
    });
  }

  /**
   * Clear all Cognito storage
   */
  clear(): void {
    memoryCache.clear();

    AsyncStorage.getAllKeys()
      .then((keys) => {
        const cognitoKeys = keys.filter((k) => k.startsWith(COGNITO_PREFIX));
        return AsyncStorage.multiRemove(cognitoKeys);
      })
      .catch((error) => {
        console.error('[CognitoStorage] clear error:', error);
      });
  }

  /**
   * Sync memory cache from AsyncStorage - call on app startup
   */
  async sync(): Promise<void> {
    try {
      const keys = await AsyncStorage.getAllKeys();
      const cognitoKeys = keys.filter((k) => k.startsWith(COGNITO_PREFIX));

      if (cognitoKeys.length === 0) return;

      const pairs = await AsyncStorage.multiGet(cognitoKeys);

      for (const [key, value] of pairs) {
        if (value !== null) {
          // Remove prefix when storing in memory cache
          const cacheKey = key.replace(COGNITO_PREFIX, '');
          memoryCache.set(cacheKey, value);
        }
      }

      console.log('[CognitoStorage] Synced', memoryCache.size, 'items from AsyncStorage');
    } catch (error) {
      console.error('[CognitoStorage] sync error:', error);
    }
  }
}

// Singleton instance
export const cognitoStorage = new CognitoStorageAdapter();

// Async versions for manual token management
export async function getCognitoItem(key: string): Promise<string | null> {
  // First check memory cache
  const cached = memoryCache.get(key);
  if (cached !== undefined) return cached;

  // Fallback to AsyncStorage
  try {
    const value = await AsyncStorage.getItem(COGNITO_PREFIX + key);
    if (value !== null) {
      memoryCache.set(key, value);
    }
    return value;
  } catch (error) {
    console.error('[CognitoStorage] getItem async error:', key, error);
    return null;
  }
}

export async function setCognitoItem(key: string, value: string): Promise<void> {
  memoryCache.set(key, value);
  try {
    await AsyncStorage.setItem(COGNITO_PREFIX + key, value);
  } catch (error) {
    console.error('[CognitoStorage] setItem async error:', key, error);
  }
}

export async function removeCognitoItem(key: string): Promise<void> {
  memoryCache.delete(key);
  try {
    await AsyncStorage.removeItem(COGNITO_PREFIX + key);
  } catch (error) {
    console.error('[CognitoStorage] removeItem async error:', key, error);
  }
}

export async function clearCognitoStorage(): Promise<void> {
  memoryCache.clear();
  try {
    const keys = await AsyncStorage.getAllKeys();
    const cognitoKeys = keys.filter((k) => k.startsWith(COGNITO_PREFIX));
    await AsyncStorage.multiRemove(cognitoKeys);
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

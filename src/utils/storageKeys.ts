/**
 * Centralized AsyncStorage Keys
 * All storage keys should be defined here to avoid typos and ensure consistency
 */

export const STORAGE_KEYS = {
  // Zustand Stores
  USER_STORE: '@smuppy_user_store',
  ENGAGEMENT_STORE: 'smuppy-engagement-store',

  // Legacy Context (to be removed after migration)
  USER_PROFILE_LEGACY: '@smuppy_user_profile',

  // Authentication
  REMEMBER_ME: '@smuppy_remember_me',
  SAVED_EMAIL: '@smuppy_saved_email',

  // React Query Cache
  QUERY_CACHE: '@smuppy_query_cache',

  // Device & Session
  DEVICE_ID: '@smuppy_device_id',

  // Rate Limiting
  RATE_LIMITS: '@smuppy_rate_limits',
  REPORT_TIMESTAMPS: '@smuppy_report_timestamps',
} as const;

// Type for storage keys
export type StorageKey = (typeof STORAGE_KEYS)[keyof typeof STORAGE_KEYS];

/**
 * Keys to clear on logout
 * Does NOT include DEVICE_ID (should persist across sessions)
 */
export const LOGOUT_CLEAR_KEYS: StorageKey[] = [
  STORAGE_KEYS.USER_STORE,
  STORAGE_KEYS.USER_PROFILE_LEGACY,
  STORAGE_KEYS.REMEMBER_ME,
  STORAGE_KEYS.SAVED_EMAIL,
  STORAGE_KEYS.QUERY_CACHE,
  STORAGE_KEYS.ENGAGEMENT_STORE,
];

/**
 * Keys to clear on account deletion
 * Clears everything including device ID
 */
export const ACCOUNT_DELETE_KEYS: StorageKey[] = [
  ...LOGOUT_CLEAR_KEYS,
  STORAGE_KEYS.DEVICE_ID,
  STORAGE_KEYS.RATE_LIMITS,
  STORAGE_KEYS.REPORT_TIMESTAMPS,
];

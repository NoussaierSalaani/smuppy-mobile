/**
 * Persistent Rate Limiter
 * Stores rate limit data in AsyncStorage to persist across app restarts
 * Prevents abuse even if user closes and reopens the app
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = '@smuppy_rate_limits';

interface RateLimitCache {
  attempts: Record<string, number[]>;
  blocks: Record<string, number>;
  loaded: boolean;
}

// In-memory cache for fast access
let memoryCache: RateLimitCache = {
  attempts: {},
  blocks: {},
  loaded: false,
};

/**
 * Load rate limit data from storage
 */
const loadFromStorage = async (): Promise<void> => {
  if (memoryCache.loaded) return;

  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as { attempts?: Record<string, number[]>; blocks?: Record<string, number> };
      memoryCache.attempts = parsed.attempts || {};
      memoryCache.blocks = parsed.blocks || {};
    }
    memoryCache.loaded = true;
  } catch (e) {
    console.warn('Failed to load rate limits:', e);
    memoryCache.loaded = true;
  }
};

/**
 * Save rate limit data to storage
 */
const saveToStorage = async (): Promise<void> => {
  try {
    // Clean up expired data before saving
    const now = Date.now();

    // Clean expired blocks
    Object.keys(memoryCache.blocks).forEach((key) => {
      if (memoryCache.blocks[key] < now) {
        delete memoryCache.blocks[key];
      }
    });

    // Clean old attempts (keep only last hour)
    const oneHourAgo = now - 60 * 60 * 1000;
    Object.keys(memoryCache.attempts).forEach((key) => {
      memoryCache.attempts[key] = memoryCache.attempts[key].filter(
        (t) => t > oneHourAgo
      );
      if (memoryCache.attempts[key].length === 0) {
        delete memoryCache.attempts[key];
      }
    });

    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({
      attempts: memoryCache.attempts,
      blocks: memoryCache.blocks,
    }));
  } catch (e) {
    console.warn('Failed to save rate limits:', e);
  }
};

export interface RateLimitCheckResult {
  allowed: boolean;
  blocked: boolean;
  remaining: number;
  retryIn: number;
  retryInMinutes?: number;
}

/**
 * Rate limiter object
 */
export const rateLimiter = {
  /**
   * Initialize - load from storage
   */
  init: async (): Promise<void> => {
    await loadFromStorage();
  },

  /**
   * Check if action is allowed
   * @param {string} key - Rate limit key (e.g., 'login', 'signup')
   * @param {number} maxAttempts - Maximum attempts allowed
   * @param {number} windowMs - Time window in milliseconds
   * @returns {Object} { allowed, blocked, remaining, retryIn }
   */
  check: async (key: string, maxAttempts: number = 5, windowMs: number = 60000): Promise<RateLimitCheckResult> => {
    await loadFromStorage();
    const now = Date.now();

    // Check if blocked
    if (memoryCache.blocks[key] && now < memoryCache.blocks[key]) {
      const retryIn = Math.ceil((memoryCache.blocks[key] - now) / 1000);
      return {
        allowed: false,
        blocked: true,
        remaining: 0,
        retryIn,
        retryInMinutes: Math.ceil(retryIn / 60),
      };
    }

    // Get attempts in window
    if (!memoryCache.attempts[key]) {
      memoryCache.attempts[key] = [];
    }

    // Filter attempts within window
    memoryCache.attempts[key] = memoryCache.attempts[key].filter(
      (t) => now - t < windowMs
    );

    const attemptsInWindow = memoryCache.attempts[key].length;
    const remaining = Math.max(0, maxAttempts - attemptsInWindow);

    return {
      allowed: attemptsInWindow < maxAttempts,
      blocked: false,
      remaining,
      retryIn: 0,
    };
  },

  /**
   * Record an attempt
   * @param {string} key - Rate limit key
   */
  record: async (key: string): Promise<void> => {
    await loadFromStorage();

    if (!memoryCache.attempts[key]) {
      memoryCache.attempts[key] = [];
    }

    memoryCache.attempts[key].push(Date.now());
    await saveToStorage();
  },

  /**
   * Block a key for a duration
   * @param {string} key - Rate limit key
   * @param {number} durationMs - Block duration in milliseconds
   */
  block: async (key: string, durationMs: number = 900000): Promise<void> => {
    await loadFromStorage();
    memoryCache.blocks[key] = Date.now() + durationMs;
    await saveToStorage();
  },

  /**
   * Reset a specific key
   * @param {string} key - Rate limit key
   */
  reset: async (key: string): Promise<void> => {
    await loadFromStorage();
    delete memoryCache.attempts[key];
    delete memoryCache.blocks[key];
    await saveToStorage();
  },

  /**
   * Clear all rate limits (use with caution)
   */
  clear: async (): Promise<void> => {
    memoryCache.attempts = {};
    memoryCache.blocks = {};
    await AsyncStorage.removeItem(STORAGE_KEY);
  },

  /**
   * Get remaining time until unblocked
   * @param {string} key - Rate limit key
   * @returns {number} Seconds until unblocked, or 0 if not blocked
   */
  getBlockRemaining: async (key: string): Promise<number> => {
    await loadFromStorage();
    const now = Date.now();

    if (memoryCache.blocks[key] && now < memoryCache.blocks[key]) {
      return Math.ceil((memoryCache.blocks[key] - now) / 1000);
    }

    return 0;
  },
};

export interface RateLimitConfig {
  key: string;
  max: number;
  window: number;
  blockDuration: number;
}

/**
 * Pre-defined rate limit configurations
 */
export const RATE_LIMITS: Record<string, RateLimitConfig> = {
  LOGIN: {
    key: 'login',
    max: 5,
    window: 60000, // 1 minute
    blockDuration: 900000, // 15 minutes
  },
  SIGNUP: {
    key: 'signup',
    max: 3,
    window: 60000,
    blockDuration: 300000, // 5 minutes
  },
  FORGOT_PASSWORD: {
    key: 'forgot_password',
    max: 3,
    window: 300000, // 5 minutes
    blockDuration: 600000, // 10 minutes
  },
  RESEND_CODE: {
    key: 'resend_code',
    max: 3,
    window: 60000,
    blockDuration: 300000,
  },
  VERIFY_CODE: {
    key: 'verify_code',
    max: 5,
    window: 60000,
    blockDuration: 600000,
  },
  CREATE_POST: {
    key: 'create_post',
    max: 10,
    window: 60000,
    blockDuration: 300000,
  },
  SEND_MESSAGE: {
    key: 'send_message',
    max: 30,
    window: 60000,
    blockDuration: 120000, // 2 minutes
  },
  FOLLOW: {
    key: 'follow',
    max: 50,
    window: 60000,
    blockDuration: 300000,
  },
  LIKE: {
    key: 'like',
    max: 100,
    window: 60000,
    blockDuration: 120000,
  },
  COMMENT: {
    key: 'comment',
    max: 20,
    window: 60000,
    blockDuration: 300000,
  },
  REPORT: {
    key: 'report',
    max: 5,
    window: 300000,
    blockDuration: 3600000, // 1 hour
  },
};

/**
 * Helper function to check and record in one call
 * @param {Object} config - Rate limit config from RATE_LIMITS
 * @returns {Object} Rate limit status
 */
export const checkRateLimit = async (config: RateLimitConfig): Promise<RateLimitCheckResult> => {
  const status = await rateLimiter.check(config.key, config.max, config.window);

  if (!status.allowed && !status.blocked) {
    // Max attempts reached, block the key
    await rateLimiter.block(config.key, config.blockDuration);
    return {
      ...status,
      blocked: true,
      retryIn: Math.ceil(config.blockDuration / 1000),
      retryInMinutes: Math.ceil(config.blockDuration / 60000),
    };
  }

  return status;
};

/**
 * Record an attempt for a rate limit config
 * @param {Object} config - Rate limit config from RATE_LIMITS
 */
export const recordAttempt = async (config: RateLimitConfig): Promise<void> => {
  await rateLimiter.record(config.key);
};

export default rateLimiter;

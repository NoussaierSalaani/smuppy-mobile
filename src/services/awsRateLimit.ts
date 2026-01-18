/**
 * AWS Rate Limiter Service
 *
 * Uses local rateLimiter.ts as fallback (always active).
 * Future: Add AWS Lambda backend for distributed rate limiting.
 *
 * Rate limits are per-email + action combination to prevent:
 * - Brute force login attacks
 * - Email enumeration via signup
 * - OTP abuse via resend spam
 */

import {
  rateLimiter,
  checkRateLimit,
  recordAttempt,
  RATE_LIMITS,
  type RateLimitConfig
} from '../utils/rateLimiter';

export interface AWSRateLimitResult {
  allowed: boolean;
  remaining?: number;
  retryAfter?: number;
  error?: string;
}

/**
 * Map action types to rate limit configurations
 */
const ACTION_TO_CONFIG: Record<string, RateLimitConfig> = {
  'auth-login': RATE_LIMITS.LOGIN,
  'auth-signup': RATE_LIMITS.SIGNUP,
  'auth-forgot-password': RATE_LIMITS.FORGOT_PASSWORD,
  'auth-resend': RATE_LIMITS.RESEND_CODE,
  'auth-verify': RATE_LIMITS.VERIFY_CODE,
};

/**
 * Check rate limit for an action
 *
 * Creates a composite key from email + action to rate limit per-user per-action.
 * This prevents a single user from being blocked across all actions if they
 * only abuse one (e.g., spamming resend shouldn't block login).
 *
 * @param email - User email (normalized)
 * @param action - Action type (auth-login, auth-signup, auth-resend, etc.)
 * @returns Rate limit check result
 */
export const checkAWSRateLimit = async (
  email: string,
  action: string = 'auth-resend'
): Promise<AWSRateLimitResult> => {
  // Initialize rate limiter (loads from AsyncStorage if needed)
  await rateLimiter.init();

  // Get config for this action
  const config = ACTION_TO_CONFIG[action];
  if (!config) {
    // Unknown action - allow but log for debugging
    console.warn(`[RateLimit] Unknown action: ${action}`);
    return { allowed: true, remaining: 10 };
  }

  // Create composite key: email:action (e.g., "user@email.com:auth-login")
  const compositeKey = `${email.toLowerCase()}:${config.key}`;
  const keyedConfig: RateLimitConfig = {
    ...config,
    key: compositeKey,
  };

  // Check current status
  const status = await checkRateLimit(keyedConfig);

  if (!status.allowed) {
    return {
      allowed: false,
      remaining: 0,
      retryAfter: status.retryIn,
      error: status.blocked
        ? `Too many attempts. Please wait ${status.retryInMinutes || Math.ceil(status.retryIn / 60)} minute(s).`
        : 'Rate limit exceeded',
    };
  }

  // Record this attempt
  await recordAttempt(keyedConfig);

  return {
    allowed: true,
    remaining: status.remaining - 1, // -1 because we just recorded an attempt
  };
};

/**
 * Reset rate limit for a specific email + action
 * Useful after successful authentication to clear login attempts
 */
export const resetRateLimit = async (
  email: string,
  action: string
): Promise<void> => {
  const config = ACTION_TO_CONFIG[action];
  if (!config) return;

  const compositeKey = `${email.toLowerCase()}:${config.key}`;
  await rateLimiter.reset(compositeKey);
};

export default checkAWSRateLimit;

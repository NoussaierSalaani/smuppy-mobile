/**
 * AWS Rate Limiter Service Tests
 *
 * Tests the checkAWSRateLimit and resetRateLimit functions
 * from src/services/awsRateLimit.ts
 *
 * Mocks the underlying rateLimiter utilities to isolate the service logic.
 */

// ---------------------------------------------------------------------------
// Mocks — must be declared before imports
// ---------------------------------------------------------------------------

const mockInit = jest.fn().mockResolvedValue(undefined);
const mockReset = jest.fn().mockResolvedValue(undefined);
const mockCheckRateLimit = jest.fn();
const mockRecordAttempt = jest.fn().mockResolvedValue(undefined);

jest.mock('../../utils/rateLimiter', () => ({
  rateLimiter: {
    init: mockInit,
    reset: mockReset,
  },
  checkRateLimit: mockCheckRateLimit,
  recordAttempt: mockRecordAttempt,
  RATE_LIMITS: {
    LOGIN: {
      key: 'login',
      max: 5,
      window: 60000,
      blockDuration: 900000,
      progressiveDelay: true,
      delayAfterAttempts: 3,
      delayMs: 2000,
    },
    SIGNUP: {
      key: 'signup',
      max: 3,
      window: 60000,
      blockDuration: 300000,
    },
    FORGOT_PASSWORD: {
      key: 'forgot_password',
      max: 3,
      window: 300000,
      blockDuration: 600000,
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
  },
}));

// Provide __DEV__ global (React Native sets this at runtime)
(global as Record<string, unknown>).__DEV__ = false;

// ---------------------------------------------------------------------------
// Imports — after mocks
// ---------------------------------------------------------------------------

import { checkAWSRateLimit, resetRateLimit } from '../../services/awsRateLimit';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('awsRateLimit', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // =========================================================================
  // checkAWSRateLimit
  // =========================================================================

  describe('checkAWSRateLimit', () => {
    it('should initialize the rate limiter before checking', async () => {
      mockCheckRateLimit.mockResolvedValue({
        allowed: true,
        blocked: false,
        remaining: 4,
        retryIn: 0,
      });

      await checkAWSRateLimit('user@example.com', 'auth-login');

      expect(mockInit).toHaveBeenCalledTimes(1);
    });

    it('should allow a request when under the rate limit', async () => {
      mockCheckRateLimit.mockResolvedValue({
        allowed: true,
        blocked: false,
        remaining: 4,
        retryIn: 0,
      });

      const result = await checkAWSRateLimit('user@example.com', 'auth-login');

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(3); // remaining - 1 because attempt was recorded
    });

    it('should record an attempt when allowed', async () => {
      mockCheckRateLimit.mockResolvedValue({
        allowed: true,
        blocked: false,
        remaining: 3,
        retryIn: 0,
      });

      await checkAWSRateLimit('test@test.com', 'auth-login');

      expect(mockRecordAttempt).toHaveBeenCalledTimes(1);
      // Verify composite key is passed
      const calledConfig = mockRecordAttempt.mock.calls[0][0];
      expect(calledConfig.key).toBe('test@test.com:login');
    });

    it('should deny a request when rate limit exceeded (not blocked)', async () => {
      mockCheckRateLimit.mockResolvedValue({
        allowed: false,
        blocked: false,
        remaining: 0,
        retryIn: 60,
      });

      const result = await checkAWSRateLimit('spammer@evil.com', 'auth-login');

      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
      expect(result.retryAfter).toBe(60);
      expect(result.error).toBe('Rate limit exceeded');
    });

    it('should deny with user-friendly message when blocked', async () => {
      mockCheckRateLimit.mockResolvedValue({
        allowed: false,
        blocked: true,
        remaining: 0,
        retryIn: 300,
        retryInMinutes: 5,
      });

      const result = await checkAWSRateLimit('blocked@user.com', 'auth-login');

      expect(result.allowed).toBe(false);
      expect(result.error).toContain('Too many attempts');
      expect(result.error).toContain('5 minute(s)');
      expect(result.retryAfter).toBe(300);
    });

    it('should use Math.ceil for retryInMinutes fallback when retryInMinutes is missing', async () => {
      mockCheckRateLimit.mockResolvedValue({
        allowed: false,
        blocked: true,
        remaining: 0,
        retryIn: 120,
        // retryInMinutes is NOT provided
      });

      const result = await checkAWSRateLimit('blocked@user.com', 'auth-login');

      expect(result.allowed).toBe(false);
      expect(result.error).toContain('2 minute(s)');
    });

    it('should not record attempt when rate limit is exceeded', async () => {
      mockCheckRateLimit.mockResolvedValue({
        allowed: false,
        blocked: false,
        remaining: 0,
        retryIn: 60,
      });

      await checkAWSRateLimit('user@example.com', 'auth-login');

      expect(mockRecordAttempt).not.toHaveBeenCalled();
    });

    it('should normalize email to lowercase in the composite key', async () => {
      mockCheckRateLimit.mockResolvedValue({
        allowed: true,
        blocked: false,
        remaining: 4,
        retryIn: 0,
      });

      await checkAWSRateLimit('USER@EXAMPLE.COM', 'auth-login');

      const calledConfig = mockCheckRateLimit.mock.calls[0][0];
      expect(calledConfig.key).toBe('user@example.com:login');
    });

    it('should use default action "auth-resend" when no action specified', async () => {
      mockCheckRateLimit.mockResolvedValue({
        allowed: true,
        blocked: false,
        remaining: 2,
        retryIn: 0,
      });

      await checkAWSRateLimit('user@example.com');

      const calledConfig = mockCheckRateLimit.mock.calls[0][0];
      expect(calledConfig.key).toBe('user@example.com:resend_code');
    });

    it('should allow unknown actions and return allowed with remaining 10', async () => {
      const result = await checkAWSRateLimit('user@example.com', 'unknown-action');

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(10);
      // Should not call checkRateLimit for unknown actions
      expect(mockCheckRateLimit).not.toHaveBeenCalled();
    });

    it('should pass through progressive delay info when present', async () => {
      mockCheckRateLimit.mockResolvedValue({
        allowed: true,
        blocked: false,
        remaining: 2,
        retryIn: 0,
        shouldDelay: true,
        delayMs: 2000,
      });

      const result = await checkAWSRateLimit('user@example.com', 'auth-login');

      expect(result.allowed).toBe(true);
      expect(result.shouldDelay).toBe(true);
      expect(result.delayMs).toBe(2000);
    });

    it('should correctly map all known action types', async () => {
      mockCheckRateLimit.mockResolvedValue({
        allowed: true,
        blocked: false,
        remaining: 5,
        retryIn: 0,
      });

      const actionToKey: Record<string, string> = {
        'auth-login': 'login',
        'auth-signup': 'signup',
        'auth-forgot-password': 'forgot_password',
        'auth-resend': 'resend_code',
        'auth-verify': 'verify_code',
      };

      for (const [action, expectedKey] of Object.entries(actionToKey)) {
        jest.clearAllMocks();
        mockCheckRateLimit.mockResolvedValue({
          allowed: true,
          blocked: false,
          remaining: 5,
          retryIn: 0,
        });

        await checkAWSRateLimit('user@test.com', action);

        const calledConfig = mockCheckRateLimit.mock.calls[0][0];
        expect(calledConfig.key).toBe(`user@test.com:${expectedKey}`);
      }
    });
  });

  // =========================================================================
  // resetRateLimit
  // =========================================================================

  describe('resetRateLimit', () => {
    it('should reset rate limit for a known action', async () => {
      await resetRateLimit('user@example.com', 'auth-login');

      expect(mockReset).toHaveBeenCalledWith('user@example.com:login');
    });

    it('should normalize email to lowercase', async () => {
      await resetRateLimit('USER@EXAMPLE.COM', 'auth-login');

      expect(mockReset).toHaveBeenCalledWith('user@example.com:login');
    });

    it('should do nothing for unknown action types', async () => {
      await resetRateLimit('user@example.com', 'unknown-action');

      expect(mockReset).not.toHaveBeenCalled();
    });

    it('should reset the correct composite key for each action', async () => {
      await resetRateLimit('test@test.com', 'auth-signup');
      expect(mockReset).toHaveBeenCalledWith('test@test.com:signup');

      jest.clearAllMocks();

      await resetRateLimit('test@test.com', 'auth-forgot-password');
      expect(mockReset).toHaveBeenCalledWith('test@test.com:forgot_password');
    });
  });
});

/**
 * Rate Limiter Tests
 */

import { rateLimiter, RATE_LIMITS, checkRateLimit, recordAttempt } from '../../utils/rateLimiter';

// Mock AsyncStorage
const mockStorage: Record<string, string> = {};
jest.mock('@react-native-async-storage/async-storage', () => ({
  setItem: jest.fn((key: string, value: string) => {
    mockStorage[key] = value;
    return Promise.resolve();
  }),
  getItem: jest.fn((key: string) => {
    return Promise.resolve(mockStorage[key] || null);
  }),
  removeItem: jest.fn((key: string) => {
    delete mockStorage[key];
    return Promise.resolve();
  }),
}));

describe('Rate Limiter', () => {
  beforeEach(async () => {
    // Clear all rate limits before each test
    await rateLimiter.clear();
    Object.keys(mockStorage).forEach((key) => delete mockStorage[key]);
  });

  describe('check', () => {
    it('should allow first attempt', async () => {
      const result = await rateLimiter.check('test-key', 5, 60000);

      expect(result.allowed).toBe(true);
      expect(result.blocked).toBe(false);
      expect(result.remaining).toBe(5);
      expect(result.retryIn).toBe(0);
    });

    it('should allow attempts within limit', async () => {
      // Record 3 attempts
      await rateLimiter.record('test-key');
      await rateLimiter.record('test-key');
      await rateLimiter.record('test-key');

      const result = await rateLimiter.check('test-key', 5, 60000);

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(2);
    });

    it('should deny when limit exceeded', async () => {
      // Record 5 attempts
      for (let i = 0; i < 5; i++) {
        await rateLimiter.record('test-key');
      }

      const result = await rateLimiter.check('test-key', 5, 60000);

      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
    });

    it('should return blocked status when key is blocked', async () => {
      await rateLimiter.block('test-key', 60000); // Block for 1 minute

      const result = await rateLimiter.check('test-key', 5, 60000);

      expect(result.allowed).toBe(false);
      expect(result.blocked).toBe(true);
      expect(result.retryIn).toBeGreaterThan(0);
      expect(result.retryInMinutes).toBeGreaterThanOrEqual(1);
    });
  });

  describe('record', () => {
    it('should record an attempt', async () => {
      await rateLimiter.record('test-key');

      const result = await rateLimiter.check('test-key', 5, 60000);
      expect(result.remaining).toBe(4);
    });

    it('should accumulate attempts', async () => {
      await rateLimiter.record('test-key');
      await rateLimiter.record('test-key');
      await rateLimiter.record('test-key');

      const result = await rateLimiter.check('test-key', 5, 60000);
      expect(result.remaining).toBe(2);
    });
  });

  describe('block', () => {
    it('should block a key for specified duration', async () => {
      await rateLimiter.block('test-key', 60000);

      const result = await rateLimiter.check('test-key', 5, 60000);

      expect(result.blocked).toBe(true);
      expect(result.allowed).toBe(false);
    });

    it('should expire after duration', async () => {
      jest.useFakeTimers();

      await rateLimiter.block('test-key', 1000); // Block for 1 second

      // Fast forward past block duration
      jest.advanceTimersByTime(1500);

      // Need to reload from storage to see expired state
      await rateLimiter.clear();
      const result = await rateLimiter.check('test-key', 5, 60000);

      expect(result.blocked).toBe(false);
      expect(result.allowed).toBe(true);

      jest.useRealTimers();
    });
  });

  describe('reset', () => {
    it('should clear attempts for a key', async () => {
      await rateLimiter.record('test-key');
      await rateLimiter.record('test-key');

      await rateLimiter.reset('test-key');

      const result = await rateLimiter.check('test-key', 5, 60000);
      expect(result.remaining).toBe(5);
    });

    it('should clear block for a key', async () => {
      await rateLimiter.block('test-key', 60000);

      await rateLimiter.reset('test-key');

      const result = await rateLimiter.check('test-key', 5, 60000);
      expect(result.blocked).toBe(false);
    });
  });

  describe('clear', () => {
    it('should clear all rate limits', async () => {
      await rateLimiter.record('key1');
      await rateLimiter.record('key2');
      await rateLimiter.block('key3', 60000);

      await rateLimiter.clear();

      const result1 = await rateLimiter.check('key1', 5, 60000);
      const result2 = await rateLimiter.check('key2', 5, 60000);
      const result3 = await rateLimiter.check('key3', 5, 60000);

      expect(result1.remaining).toBe(5);
      expect(result2.remaining).toBe(5);
      expect(result3.blocked).toBe(false);
    });
  });

  describe('getBlockRemaining', () => {
    it('should return remaining block time in seconds', async () => {
      await rateLimiter.block('test-key', 60000); // Block for 1 minute

      const remaining = await rateLimiter.getBlockRemaining('test-key');

      expect(remaining).toBeGreaterThan(55); // Should be close to 60 seconds
      expect(remaining).toBeLessThanOrEqual(60);
    });

    it('should return 0 if not blocked', async () => {
      const remaining = await rateLimiter.getBlockRemaining('test-key');
      expect(remaining).toBe(0);
    });
  });
});

describe('RATE_LIMITS Configuration', () => {
  it('should have LOGIN config', () => {
    expect(RATE_LIMITS.LOGIN).toBeDefined();
    expect(RATE_LIMITS.LOGIN.key).toBe('login');
    expect(RATE_LIMITS.LOGIN.max).toBe(5);
    expect(RATE_LIMITS.LOGIN.window).toBe(60000);
    expect(RATE_LIMITS.LOGIN.blockDuration).toBe(900000);
  });

  it('should have SIGNUP config', () => {
    expect(RATE_LIMITS.SIGNUP).toBeDefined();
    expect(RATE_LIMITS.SIGNUP.key).toBe('signup');
    expect(RATE_LIMITS.SIGNUP.max).toBe(3);
  });

  it('should have VERIFY_CODE config', () => {
    expect(RATE_LIMITS.VERIFY_CODE).toBeDefined();
    expect(RATE_LIMITS.VERIFY_CODE.max).toBe(5);
  });

  it('should have all expected rate limits', () => {
    const expectedKeys = [
      'LOGIN',
      'SIGNUP',
      'FORGOT_PASSWORD',
      'RESEND_CODE',
      'VERIFY_CODE',
      'CREATE_POST',
      'SEND_MESSAGE',
      'FOLLOW',
      'LIKE',
      'COMMENT',
      'REPORT',
    ];

    expectedKeys.forEach((key) => {
      expect(RATE_LIMITS[key]).toBeDefined();
      expect(RATE_LIMITS[key].key).toBeDefined();
      expect(RATE_LIMITS[key].max).toBeGreaterThan(0);
      expect(RATE_LIMITS[key].window).toBeGreaterThan(0);
      expect(RATE_LIMITS[key].blockDuration).toBeGreaterThan(0);
    });
  });
});

describe('Helper Functions', () => {
  beforeEach(async () => {
    await rateLimiter.clear();
  });

  describe('checkRateLimit', () => {
    it('should check rate limit using config', async () => {
      const result = await checkRateLimit(RATE_LIMITS.LOGIN);

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(5);
    });

    it('should block when max attempts reached', async () => {
      // Fill up the limit
      for (let i = 0; i < 5; i++) {
        await rateLimiter.record(RATE_LIMITS.LOGIN.key);
      }

      const result = await checkRateLimit(RATE_LIMITS.LOGIN);

      expect(result.allowed).toBe(false);
      expect(result.blocked).toBe(true);
      expect(result.retryIn).toBe(Math.ceil(RATE_LIMITS.LOGIN.blockDuration / 1000));
    });
  });

  describe('recordAttempt', () => {
    it('should record attempt using config', async () => {
      await recordAttempt(RATE_LIMITS.LOGIN);

      const result = await rateLimiter.check(RATE_LIMITS.LOGIN.key, 5, 60000);
      expect(result.remaining).toBe(4);
    });
  });
});

describe('Window Expiration', () => {
  beforeEach(async () => {
    await rateLimiter.clear();
  });

  it('should expire attempts outside window', async () => {
    jest.useFakeTimers();

    // Record attempts
    await rateLimiter.record('test-key');
    await rateLimiter.record('test-key');

    // Fast forward past the window
    jest.advanceTimersByTime(70000); // 70 seconds (past 60 second window)

    const result = await rateLimiter.check('test-key', 5, 60000);

    // Old attempts should be expired, so all 5 should be remaining
    expect(result.remaining).toBe(5);

    jest.useRealTimers();
  });
});

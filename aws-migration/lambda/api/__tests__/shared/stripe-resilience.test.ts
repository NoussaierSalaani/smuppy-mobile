/**
 * Tests for shared/stripe-resilience module
 * Tests classifyStripeError, stripeUserMessage, and safeStripeCall
 */

import Stripe from 'stripe';

// ── Mocks (must be before module import — Jest hoists jest.mock calls) ──

jest.mock('../../../shared/redis', () => ({
  getRedis: jest.fn().mockResolvedValue(null), // fail-open circuit breaker
}));

// ── Import AFTER all mocks are declared ──

import {
  classifyStripeError,
  stripeUserMessage,
  safeStripeCall,
  StripeApiError,
} from '../../../shared/stripe-resilience';

// ── Helpers ──

const mockLog = { warn: jest.fn(), error: jest.fn() };

/** Create a mock object whose prototype chain passes instanceof checks */
function mockStripeError(
  ErrorClass: typeof Stripe.errors.StripeError,
  overrides: { statusCode?: number; type?: string; code?: string; message?: string } = {},
): Stripe.errors.StripeError {
  const obj = Object.create(ErrorClass.prototype);
  obj.message = overrides.message ?? 'stripe error';
  obj.statusCode = overrides.statusCode;
  obj.type = overrides.type ?? 'StripeError';
  obj.code = overrides.code;
  obj.name = ErrorClass.name;
  return obj as Stripe.errors.StripeError;
}

function makeAbortError(message = 'Timed out'): Error {
  const err = new Error(message);
  err.name = 'AbortError';
  return err;
}

// ── Test suite ──

describe('stripe-resilience', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ────────────────────────────────────────────────────────────────
  // classifyStripeError
  // ────────────────────────────────────────────────────────────────
  describe('classifyStripeError', () => {
    it('should classify AbortError as timeout', () => {
      const err = makeAbortError();

      expect(classifyStripeError(err)).toBe('timeout');
    });

    it('should classify StripeError with status 500 as retryable', () => {
      const err = mockStripeError(Stripe.errors.StripeError, { statusCode: 500 });

      expect(classifyStripeError(err)).toBe('retryable');
    });

    it('should classify StripeError with status 429 as retryable', () => {
      const err = mockStripeError(Stripe.errors.StripeError, { statusCode: 429 });

      expect(classifyStripeError(err)).toBe('retryable');
    });

    it('should classify StripeError with status 400 as permanent', () => {
      const err = mockStripeError(Stripe.errors.StripeError, { statusCode: 400 });

      expect(classifyStripeError(err)).toBe('permanent');
    });

    it('should classify TypeError with "fetch" as retryable', () => {
      const err = new TypeError('Failed to fetch resource');

      expect(classifyStripeError(err)).toBe('retryable');
    });

    it('should classify generic Error as permanent', () => {
      const err = new Error('Something unexpected');

      expect(classifyStripeError(err)).toBe('permanent');
    });
  });

  // ────────────────────────────────────────────────────────────────
  // stripeUserMessage
  // ────────────────────────────────────────────────────────────────
  describe('stripeUserMessage', () => {
    it('should return card declined message for StripeCardError', () => {
      const err = mockStripeError(Stripe.errors.StripeCardError, {
        statusCode: 402,
        type: 'StripeCardError',
      });

      expect(stripeUserMessage(err)).toBe(
        'Your card was declined. Please check your card details and try again.',
      );
    });

    it('should return timeout message for AbortError', () => {
      const err = makeAbortError();

      expect(stripeUserMessage(err)).toBe('Payment request timed out. Please try again.');
    });

    it('should return generic payment message for unknown errors', () => {
      const err = new Error('Something broke');

      expect(stripeUserMessage(err)).toBe('Payment processing failed. Please try again.');
    });
  });

  // ────────────────────────────────────────────────────────────────
  // safeStripeCall
  // ────────────────────────────────────────────────────────────────
  describe('safeStripeCall', () => {
    it('should return the result on success', async () => {
      const fn = jest.fn().mockResolvedValue({ id: 'cus_123' });

      const result = await safeStripeCall(fn, 'customers.create', mockLog, {
        timeoutMs: 50,
        retries: 0,
      });

      expect(result).toEqual({ id: 'cus_123' });
      expect(fn).toHaveBeenCalledTimes(1);
      expect(mockLog.error).not.toHaveBeenCalled();
    });

    it('should throw StripeApiError on permanent failure', async () => {
      const err = mockStripeError(Stripe.errors.StripeCardError, {
        statusCode: 402,
        type: 'StripeCardError',
        message: 'Your card was declined',
        code: 'card_declined',
      });
      const fn = jest.fn().mockRejectedValue(err);

      await expect(
        safeStripeCall(fn, 'charges.create', mockLog, {
          timeoutMs: 50,
          retries: 0,
        }),
      ).rejects.toThrow(StripeApiError);

      try {
        await safeStripeCall(fn, 'charges.create', mockLog, {
          timeoutMs: 50,
          retries: 0,
        });
      } catch (thrown) {
        expect(thrown).toBeInstanceOf(StripeApiError);
        const apiErr = thrown as StripeApiError;
        expect(apiErr.kind).toBe('permanent');
        expect(apiErr.statusCode).toBe(402);
      }
    });

    it('should skip circuit breaker when skipCircuitBreaker is true', async () => {
      const fn = jest.fn().mockResolvedValue({ id: 'sub_456' });

      const result = await safeStripeCall(fn, 'subscriptions.create', mockLog, {
        timeoutMs: 50,
        retries: 0,
        skipCircuitBreaker: true,
      });

      expect(result).toEqual({ id: 'sub_456' });
      expect(fn).toHaveBeenCalledTimes(1);
    });
  });
});

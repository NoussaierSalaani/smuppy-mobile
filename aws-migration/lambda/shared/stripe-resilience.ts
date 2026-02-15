/**
 * Stripe Resilience Utilities
 * Provides timeout wrappers, error classification, and retry logic for Stripe API calls
 *
 * Usage:
 *   import { safeStripeCall } from '../../shared/stripe-resilience';
 *   const customer = await safeStripeCall(() => stripe.customers.create({...}), 'customers.create', log);
 */

import Stripe from 'stripe';

/** Logger interface matching createLogger output */
interface Logger {
  warn: (msg: string, ...args: unknown[]) => void;
  error: (msg: string, ...args: unknown[]) => void;
}

/** Stripe error classification */
export type StripeErrorKind = 'retryable' | 'permanent' | 'timeout';

/** Classified Stripe error with actionable info */
export class StripeApiError extends Error {
  kind: StripeErrorKind;
  statusCode: number;
  stripeCode?: string;

  constructor(message: string, kind: StripeErrorKind, statusCode: number, stripeCode?: string) {
    super(message);
    this.name = 'StripeApiError';
    this.kind = kind;
    this.statusCode = statusCode;
    this.stripeCode = stripeCode;
  }
}

const STRIPE_CALL_TIMEOUT_MS = 10_000; // 10 seconds — fail fast

/**
 * Classify a Stripe error as retryable, permanent, or timeout
 */
export function classifyStripeError(error: unknown): StripeErrorKind {
  if (error instanceof Error && error.name === 'AbortError') return 'timeout';

  if (error instanceof Stripe.errors.StripeError) {
    const status = error.statusCode ?? 500;
    // 5xx, 429, and connection errors are retryable
    if (status >= 500 || status === 429) return 'retryable';
    if (error.type === 'StripeConnectionError' || error.type === 'StripeAPIError') return 'retryable';
    // 4xx are permanent (bad request, unauthorized, etc.)
    return 'permanent';
  }

  // Network errors are retryable
  if (error instanceof TypeError && (error.message.includes('fetch') || error.message.includes('network'))) {
    return 'retryable';
  }

  return 'permanent';
}

/**
 * Return a user-safe error message based on Stripe error type
 */
export function stripeUserMessage(error: unknown): string {
  if (error instanceof Stripe.errors.StripeCardError) {
    return 'Your card was declined. Please check your card details and try again.';
  }
  if (error instanceof Stripe.errors.StripeRateLimitError) {
    return 'Too many payment requests. Please wait a moment and try again.';
  }
  if (error instanceof Stripe.errors.StripeConnectionError) {
    return 'Payment service is temporarily unavailable. Please try again in a few minutes.';
  }
  if (error instanceof Error && error.name === 'AbortError') {
    return 'Payment request timed out. Please try again.';
  }
  return 'Payment processing failed. Please try again.';
}

/**
 * Execute a Stripe API call with timeout and optional retry
 *
 * @param fn - Async function that makes the Stripe API call
 * @param operation - Human-readable operation name for logging (e.g., 'customers.create')
 * @param log - Logger instance
 * @param options - Optional retry/timeout overrides
 * @returns The result of the Stripe API call
 * @throws StripeApiError with classified error kind
 */
export async function safeStripeCall<T>(
  fn: () => Promise<T>,
  operation: string,
  log: Logger,
  options?: { timeoutMs?: number; retries?: number }
): Promise<T> {
  const timeoutMs = options?.timeoutMs ?? STRIPE_CALL_TIMEOUT_MS;
  const maxRetries = options?.retries ?? 1;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await Promise.race([
        fn(),
        new Promise<never>((_, reject) => {
          setTimeout(() => {
            const err = new Error(`Stripe ${operation} timed out after ${timeoutMs}ms`);
            err.name = 'AbortError';
            reject(err);
          }, timeoutMs);
        }),
      ]);
      return result;
    } catch (error: unknown) {
      const kind = classifyStripeError(error);

      if (kind === 'retryable' && attempt < maxRetries) {
        const delayMs = Math.min(1000 * Math.pow(2, attempt), 5000);
        log.warn(`Stripe ${operation} failed (attempt ${attempt + 1}/${maxRetries + 1}), retrying in ${delayMs}ms`, {
          error: error instanceof Error ? error.message : 'unknown',
        });
        await new Promise(resolve => setTimeout(resolve, delayMs));
        continue;
      }

      const statusCode = error instanceof Stripe.errors.StripeError ? (error.statusCode ?? 500) : 500;
      const stripeCode = error instanceof Stripe.errors.StripeError ? error.code : undefined;
      const message = error instanceof Error ? error.message : 'Stripe API call failed';

      log.error(`Stripe ${operation} failed permanently`, {
        kind,
        statusCode,
        stripeCode,
        error: message,
      });

      throw new StripeApiError(message, kind, statusCode, stripeCode);
    }
  }

  // Unreachable, but TypeScript needs it
  throw new StripeApiError(`Stripe ${operation} exhausted all retries`, 'retryable', 500);
}

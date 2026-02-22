/**
 * Stripe Resilience Utilities
 * Provides timeout wrappers, error classification, and retry logic for Stripe API calls
 *
 * Usage:
 *   import { safeStripeCall } from '../../shared/stripe-resilience';
 *   const customer = await safeStripeCall(() => stripe.customers.create({...}), 'customers.create', log);
 */

import Stripe from 'stripe';
import { CircuitBreaker, CircuitOpenError } from './circuit-breaker';

/** Logger interface matching createLogger output */
interface Logger {
  warn: (message: string, data?: Record<string, unknown>) => void;
  error: (message: string, data?: Record<string, unknown>) => void;
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

// Singleton circuit breaker for Stripe API calls
const stripeCircuit = new CircuitBreaker({
  service: 'stripe',
  failureThreshold: 5,
  windowMs: 60_000,
  cooldownMs: 30_000,
  successThreshold: 3,
});

export { CircuitOpenError };

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
 * Check the circuit breaker and throw if the circuit is open.
 * Skipped when skipCircuitBreaker is true (e.g., webhook handlers).
 */
async function checkCircuitBreaker(operation: string, log: Logger, skip?: boolean): Promise<void> {
  if (skip) return;

  const canExecute = await stripeCircuit.canExecute();
  if (canExecute) return;

  log.warn(`Stripe circuit breaker OPEN, rejecting ${operation}`);
  throw new StripeApiError('Stripe service unavailable (circuit open)', 'retryable', 503);
}

/**
 * Execute an async function with a timeout. Rejects with an AbortError if the
 * timeout elapses before the function resolves.
 */
function executeWithTimeout<T>(fn: () => Promise<T>, operation: string, timeoutMs: number): Promise<T> {
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => {
      const err = new Error(`Stripe ${operation} timed out after ${timeoutMs}ms`);
      err.name = 'AbortError';
      reject(err);
    }, timeoutMs);
  });

  return Promise.race([fn(), timeoutPromise]);
}

/** Extract statusCode, stripeCode, and message from an unknown error */
function extractErrorDetails(error: unknown): { statusCode: number; stripeCode: string | undefined; message: string } {
  const statusCode = error instanceof Stripe.errors.StripeError ? (error.statusCode ?? 500) : 500;
  const stripeCode = error instanceof Stripe.errors.StripeError ? error.code : undefined;
  const message = error instanceof Error ? error.message : 'Stripe API call failed';
  return { statusCode, stripeCode, message };
}

/** Compute exponential backoff delay capped at 5 seconds */
function retryDelayMs(attempt: number): number {
  return Math.min(1000 * Math.pow(2, attempt), 5000);
}

/**
 * Handle a failed Stripe call attempt: log, record circuit breaker failure, and throw.
 */
async function handlePermanentFailure(
  error: unknown,
  kind: StripeErrorKind,
  operation: string,
  log: Logger,
  skipCircuitBreaker?: boolean,
): Promise<never> {
  const { statusCode, stripeCode, message } = extractErrorDetails(error);

  log.error(`Stripe ${operation} failed permanently`, {
    kind,
    statusCode,
    stripeCode,
    error: message,
  });

  if (!skipCircuitBreaker && kind !== 'permanent') {
    await stripeCircuit.recordFailure();
  }

  throw new StripeApiError(message, kind, statusCode, stripeCode);
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
  options?: { timeoutMs?: number; retries?: number; skipCircuitBreaker?: boolean }
): Promise<T> {
  const timeoutMs = options?.timeoutMs ?? STRIPE_CALL_TIMEOUT_MS;
  const maxRetries = options?.retries ?? 1;
  const skipCB = options?.skipCircuitBreaker;

  await checkCircuitBreaker(operation, log, skipCB);

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await executeWithTimeout(fn, operation, timeoutMs);

      if (!skipCB) {
        await stripeCircuit.recordSuccess();
      }

      return result;
    } catch (error: unknown) {
      const kind = classifyStripeError(error);
      const canRetry = kind === 'retryable' && attempt < maxRetries;

      if (canRetry) {
        const delayMs = retryDelayMs(attempt);
        log.warn(`Stripe ${operation} failed (attempt ${attempt + 1}/${maxRetries + 1}), retrying in ${delayMs}ms`, {
          error: error instanceof Error ? error.message : 'unknown',
        });
        await new Promise(resolve => setTimeout(resolve, delayMs));
        continue;
      }

      await handlePermanentFailure(error, kind, operation, log, skipCB);
    }
  }

  // Unreachable, but TypeScript needs it
  throw new StripeApiError(`Stripe ${operation} exhausted all retries`, 'retryable', 500);
}

/**
 * Redis-backed Distributed Circuit Breaker
 *
 * State machine: CLOSED → OPEN → HALF_OPEN → CLOSED
 *
 * - CLOSED: requests pass through normally. Failures increment counter.
 *   After `failureThreshold` failures in `windowMs`, transitions to OPEN.
 * - OPEN: requests are rejected immediately (fail-fast).
 *   After `cooldownMs`, transitions to HALF_OPEN.
 * - HALF_OPEN: a limited number of requests pass through.
 *   After `successThreshold` successes, transitions to CLOSED.
 *   Any failure transitions back to OPEN.
 *
 * Fail-open: if Redis is unavailable, all requests pass through.
 * This prevents Redis failures from cascading to upstream services.
 *
 * Redis keys use hash tags {smuppy:cb:<service>} for cluster slot affinity.
 */

import { getRedis } from './redis';

export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface CircuitBreakerConfig {
  service: string;
  failureThreshold?: number;
  windowMs?: number;
  cooldownMs?: number;
  successThreshold?: number;
}

export class CircuitOpenError extends Error {
  service: string;

  constructor(service: string) {
    super(`Circuit breaker OPEN for service: ${service}`);
    this.name = 'CircuitOpenError';
    this.service = service;
  }
}

const DEFAULT_FAILURE_THRESHOLD = 5;
const DEFAULT_WINDOW_MS = 60_000;
const DEFAULT_COOLDOWN_MS = 30_000;
const DEFAULT_SUCCESS_THRESHOLD = 3;

export class CircuitBreaker {
  private readonly service: string;
  private readonly failureThreshold: number;
  private readonly windowMs: number;
  private readonly cooldownMs: number;
  private readonly successThreshold: number;
  private readonly keyPrefix: string;

  constructor(config: CircuitBreakerConfig) {
    this.service = config.service;
    this.failureThreshold = config.failureThreshold ?? DEFAULT_FAILURE_THRESHOLD;
    this.windowMs = config.windowMs ?? DEFAULT_WINDOW_MS;
    this.cooldownMs = config.cooldownMs ?? DEFAULT_COOLDOWN_MS;
    this.successThreshold = config.successThreshold ?? DEFAULT_SUCCESS_THRESHOLD;
    // Hash tag for Redis Cluster slot affinity — all keys for this service land on the same shard
    this.keyPrefix = `{smuppy:cb:${this.service}}`;
  }

  private get stateKey(): string { return `${this.keyPrefix}:state`; }
  private get failureCountKey(): string { return `${this.keyPrefix}:failure_count`; }
  private get lastFailureKey(): string { return `${this.keyPrefix}:last_failure`; }
  private get successCountKey(): string { return `${this.keyPrefix}:success_count`; }

  /**
   * Check if a request can proceed.
   * Returns true if CLOSED or HALF_OPEN (with cooldown expired).
   * Returns false if OPEN (caller should fail-fast with 503).
   *
   * Fail-open: returns true if Redis is unavailable.
   */
  async canExecute(): Promise<boolean> {
    try {
      const redis = await getRedis();
      if (!redis) return true; // Fail-open

      const [state, lastFailure] = await Promise.all([
        redis.get(this.stateKey),
        redis.get(this.lastFailureKey),
      ]);

      if (!state || state === 'CLOSED') return true;

      if (state === 'OPEN') {
        // Check if cooldown has expired → transition to HALF_OPEN
        const lastFailureTs = lastFailure ? Number.parseInt(lastFailure, 10) : 0;
        if (Date.now() - lastFailureTs >= this.cooldownMs) {
          await redis.set(this.stateKey, 'HALF_OPEN');
          await redis.del(this.successCountKey);
          return true;
        }
        return false;
      }

      // HALF_OPEN — allow request through
      return true;
    } catch {
      // Fail-open: Redis error should not block requests
      return true;
    }
  }

  /**
   * Record a successful call.
   * In HALF_OPEN: increment success counter, transition to CLOSED after threshold.
   * In CLOSED: reset failure counter.
   */
  async recordSuccess(): Promise<void> {
    try {
      const redis = await getRedis();
      if (!redis) return;

      const state = await redis.get(this.stateKey);

      if (state === 'HALF_OPEN') {
        const count = await redis.incr(this.successCountKey);
        if (count >= this.successThreshold) {
          // Atomic transition: HALF_OPEN → CLOSED
          const pipeline = redis.multi();
          pipeline.set(this.stateKey, 'CLOSED');
          pipeline.del(this.failureCountKey);
          pipeline.del(this.successCountKey);
          pipeline.del(this.lastFailureKey);
          await pipeline.exec();
        }
      } else if (!state || state === 'CLOSED') {
        // Reset failure count on success in CLOSED state
        await redis.del(this.failureCountKey);
      }
    } catch {
      // Fail-open: ignore Redis errors
    }
  }

  /**
   * Record a failed call.
   * In CLOSED: increment failure counter, transition to OPEN after threshold.
   * In HALF_OPEN: immediately transition back to OPEN.
   */
  async recordFailure(): Promise<void> {
    try {
      const redis = await getRedis();
      if (!redis) return;

      const state = await redis.get(this.stateKey);

      if (state === 'HALF_OPEN') {
        // Any failure in HALF_OPEN → back to OPEN
        const pipeline = redis.multi();
        pipeline.set(this.stateKey, 'OPEN');
        pipeline.set(this.lastFailureKey, String(Date.now()));
        pipeline.del(this.successCountKey);
        await pipeline.exec();
        return;
      }

      // CLOSED state: increment failure counter with rolling window TTL
      const windowSec = Math.ceil(this.windowMs / 1000);
      const count = await redis.incr(this.failureCountKey);
      if (count === 1) {
        // First failure in window — set TTL for automatic rolling window
        await redis.expire(this.failureCountKey, windowSec);
      }

      await redis.set(this.lastFailureKey, String(Date.now()));

      if (count >= this.failureThreshold) {
        // Threshold reached → transition to OPEN
        const pipeline = redis.multi();
        pipeline.set(this.stateKey, 'OPEN');
        pipeline.del(this.failureCountKey);
        pipeline.del(this.successCountKey);
        await pipeline.exec();
      }
    } catch {
      // Fail-open: ignore Redis errors
    }
  }

  /**
   * Get current circuit state (for diagnostics/monitoring).
   * Returns 'CLOSED' if Redis is unavailable.
   */
  async getState(): Promise<CircuitState> {
    try {
      const redis = await getRedis();
      if (!redis) return 'CLOSED';

      const state = await redis.get(this.stateKey);
      if (state === 'OPEN' || state === 'HALF_OPEN') return state;
      return 'CLOSED';
    } catch {
      return 'CLOSED';
    }
  }
}

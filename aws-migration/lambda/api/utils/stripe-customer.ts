/**
 * Shared Stripe Customer Utility
 *
 * Consolidates the "get or create Stripe customer" pattern
 * from 5 payment handlers into a single, resilient function.
 */

import type Stripe from 'stripe';
import type { Pool, PoolClient } from 'pg';
import { safeStripeCall } from '../../shared/stripe-resilience';
import { getStripeClient } from '../../shared/stripe-client';
import { PLATFORM_NAME } from './constants';
import { createLogger } from './logger';

type Logger = ReturnType<typeof createLogger>;

interface GetOrCreateParams {
  /** Database pool or client (for transactional use) */
  db: Pool | PoolClient;
  /** Optional pre-initialized Stripe instance; fetched via getStripeClient() if omitted */
  stripe?: Stripe;
  /** Profile ID (UUID) — used in metadata and DB update */
  profileId: string;
  /** User email (nullable — Stripe accepts undefined) */
  email: string | null | undefined;
  /** User full name (falls back to username if provided) */
  fullName: string | null | undefined;
  /** Optional username fallback for name */
  username?: string;
  /** Logger instance for safeStripeCall tracing */
  log: Logger;
  /** Pre-fetched stripe_customer_id to skip DB lookup (if caller already has it) */
  existingCustomerId?: string | null;
}

/**
 * Get an existing Stripe customer ID or create a new one.
 *
 * - Always wraps creation in `safeStripeCall` for timeout/circuit-breaker protection
 * - Standardized metadata: `{ userId, platform: 'smuppy' }`
 * - Saves new customer ID back to profiles table
 *
 * @returns The Stripe customer ID string
 */
export async function getOrCreateStripeCustomer(params: GetOrCreateParams): Promise<string> {
  const { db, profileId, email, fullName, username, log, existingCustomerId } = params;

  // 1. Return existing if already known
  if (existingCustomerId) {
    return existingCustomerId;
  }

  // 2. Check DB for existing customer ID
  const result = await db.query(
    'SELECT stripe_customer_id FROM profiles WHERE id = $1',
    [profileId]
  );

  if (result.rows[0]?.stripe_customer_id) {
    return result.rows[0].stripe_customer_id as string;
  }

  // 3. Create new Stripe customer
  const stripe = params.stripe ?? await getStripeClient();
  const customer = await safeStripeCall(
    () => stripe.customers.create({
      email: email ?? undefined,
      name: fullName || username || undefined,
      metadata: { userId: profileId, platform: PLATFORM_NAME },
    }),
    'customers.create',
    log
  );

  // 4. Save to DB
  await db.query(
    'UPDATE profiles SET stripe_customer_id = $1, updated_at = NOW() WHERE id = $2',
    [customer.id, profileId]
  );

  return customer.id;
}

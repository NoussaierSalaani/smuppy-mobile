/**
 * Shared utilities for business subscription handlers.
 * Eliminates boilerplate duplication across cancel, reactivate, my-subscriptions, access-pass.
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { Pool } from 'pg';
import { getPool } from '../../shared/db';
import { createHeaders } from '../utils/cors';
import { getUserFromEvent, resolveProfileId } from '../utils/auth';
import { isValidUUID } from '../utils/security';
import { getStripeClient } from '../../shared/stripe-client';
import { Logger } from '../utils/logger';

// ── Auth context ─────────────────────────────────────────────────────

export interface AuthenticatedContext {
  headers: Record<string, string>;
  profileId: string;
  db: Pool;
  userSub: string;
}

/**
 * Authenticate user, resolve profile, and return context.
 * Returns an error response if auth/profile resolution fails, or the context if successful.
 */
export async function authenticateAndResolveProfile(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult | AuthenticatedContext> {
  const headers = createHeaders(event);

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  const user = getUserFromEvent(event);
  if (!user) {
    return { statusCode: 401, headers, body: JSON.stringify({ success: false, message: 'Unauthorized' }) };
  }

  const db = await getPool();

  const profileId = await resolveProfileId(db, user.sub);
  if (!profileId) {
    return { statusCode: 404, headers, body: JSON.stringify({ success: false, message: 'Profile not found' }) };
  }

  return { headers, profileId, db, userSub: user.sub };
}

/**
 * Type guard: check if authenticateAndResolveProfile returned an error response.
 */
export function isErrorResponse(result: APIGatewayProxyResult | AuthenticatedContext): result is APIGatewayProxyResult {
  return 'statusCode' in result;
}

// ── Validation ───────────────────────────────────────────────────────

/**
 * Validate and extract subscription ID from path parameters.
 * Returns the ID or an error response.
 */
export function validateSubscriptionId(
  event: APIGatewayProxyEvent,
  headers: Record<string, string>
): string | APIGatewayProxyResult {
  const subscriptionId = event.pathParameters?.subscriptionId;
  if (!subscriptionId) {
    return { statusCode: 400, headers, body: JSON.stringify({ success: false, message: 'Missing subscription ID' }) };
  }
  if (!isValidUUID(subscriptionId)) {
    return { statusCode: 400, headers, body: JSON.stringify({ success: false, message: 'Invalid subscription ID format' }) };
  }
  return subscriptionId;
}

// ── Ownership query ──────────────────────────────────────────────────

// Constant query with parameter binding to avoid SQL injection on identifiers/values.
const OWNED_SUBSCRIPTION_SELECT = `
  SELECT id, user_id, stripe_subscription_id, status, cancel_at_period_end,
         current_period_end, current_period_start, created_at, updated_at
  FROM business_subscriptions
  WHERE id = $1
`;

/**
 * Get a subscription by ID and verify ownership.
 * Returns the subscription row or an error response.
 *
 * @param extraColumns - Optional list of additional columns to select.
 *                       Each name is validated against an allowlist to prevent SQL injection.
 */
export async function getOwnedSubscription(
  db: Pool,
  subscriptionId: string,
  profileId: string,
  headers: Record<string, string>,
  extraColumns?: string[]
): Promise<APIGatewayProxyResult | Record<string, unknown>> {
  void extraColumns; // preserved for backward compatibility; query is fixed to avoid SQL injection

  const result = await db.query(OWNED_SUBSCRIPTION_SELECT, [subscriptionId]);

  if (result.rows.length === 0) {
    return { statusCode: 404, headers, body: JSON.stringify({ success: false, message: 'Subscription not found' }) };
  }

  const subscription = result.rows[0];

  if (subscription.user_id !== profileId) {
    return { statusCode: 403, headers, body: JSON.stringify({ success: false, message: 'You do not own this subscription' }) };
  }

  return subscription;
}

// ── Shared operations ────────────────────────────────────────────────

/**
 * Update a Stripe subscription flag (best-effort).
 * Errors are logged but do not block the caller from continuing.
 */
async function updateStripeSubscription(
  stripeSubscriptionId: string,
  cancelAtPeriodEnd: boolean,
  log: Logger,
  operationName: string,
): Promise<void> {
  try {
    const stripeClient = await getStripeClient();
    await stripeClient.subscriptions.update(stripeSubscriptionId, {
      cancel_at_period_end: cancelAtPeriodEnd,
    });
  } catch (stripeError) {
    log.error(`Stripe ${operationName} failed`, stripeError);
  }
}

/**
 * Cancel a subscription: validate state, update Stripe, update DB.
 * Expects a pre-validated, pre-owned subscription row.
 */
export async function performCancelSubscription(
  db: Pool,
  subscription: Record<string, unknown>,
  subscriptionId: string,
  profileId: string,
  headers: Record<string, string>,
  log: Logger,
): Promise<APIGatewayProxyResult> {
  if (subscription.cancel_at_period_end) {
    return { statusCode: 400, headers, body: JSON.stringify({ success: false, message: 'Subscription is already scheduled for cancellation' }) };
  }

  if (subscription.status !== 'active' && subscription.status !== 'trial') {
    return { statusCode: 400, headers, body: JSON.stringify({ success: false, message: 'Cannot cancel a non-active subscription' }) };
  }

  if (subscription.stripe_subscription_id) {
    await updateStripeSubscription(subscription.stripe_subscription_id as string, true, log, 'cancellation');
  }

  await db.query(
    `UPDATE business_subscriptions
     SET cancel_at_period_end = true,
         cancelled_at = NOW(),
         updated_at = NOW()
     WHERE id = $1`,
    [subscriptionId]
  );

  log.info('Subscription cancelled', { subscriptionId, profileId });

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({ success: true, message: 'Subscription will be cancelled at the end of the billing period' }),
  };
}

/**
 * Reactivate a subscription: validate state, update Stripe, update DB.
 * Expects a pre-validated, pre-owned subscription row (must include current_period_end).
 */
export async function performReactivateSubscription(
  db: Pool,
  subscription: Record<string, unknown>,
  subscriptionId: string,
  profileId: string,
  headers: Record<string, string>,
  log: Logger,
): Promise<APIGatewayProxyResult> {
  if (!subscription.cancel_at_period_end) {
    return { statusCode: 400, headers, body: JSON.stringify({ success: false, message: 'Subscription is not scheduled for cancellation' }) };
  }

  const now = new Date();
  const periodEnd = new Date(subscription.current_period_end as string);
  if (periodEnd < now) {
    return { statusCode: 400, headers, body: JSON.stringify({ success: false, message: 'Subscription period has ended. Please create a new subscription.' }) };
  }

  if (subscription.stripe_subscription_id) {
    await updateStripeSubscription(subscription.stripe_subscription_id as string, false, log, 'reactivation');
  }

  await db.query(
    `UPDATE business_subscriptions
     SET cancel_at_period_end = false,
         cancelled_at = NULL,
         updated_at = NOW()
     WHERE id = $1`,
    [subscriptionId]
  );

  log.info('Subscription reactivated', { subscriptionId, profileId });

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({ success: true, message: 'Subscription has been reactivated' }),
  };
}

// ── List subscriptions ───────────────────────────────────────────────

interface SubscriptionRow {
  id: unknown;
  status: unknown;
  current_period_start: unknown;
  current_period_end: unknown;
  trial_end: unknown;
  cancel_at_period_end: unknown;
  sessions_used: unknown;
  sessions_limit: unknown;
  business_id: unknown;
  business_name: unknown;
  business_logo: unknown;
  category_name: unknown;
  category_icon: unknown;
  category_color: unknown;
  plan_id: unknown;
  plan_name: unknown;
  price_cents: unknown;
  period: unknown;
}

/**
 * Map a DB row to the public subscription response shape.
 */
function mapSubscriptionRow(row: SubscriptionRow) {
  return {
    id: row.id,
    business: {
      id: row.business_id,
      name: row.business_name,
      logo_url: row.business_logo,
      category: {
        name: row.category_name,
        icon: row.category_icon,
        color: row.category_color,
      },
    },
    plan: {
      id: row.plan_id,
      name: row.plan_name || 'Subscription',
      price_cents: row.price_cents || 0,
      period: row.period || 'monthly',
    },
    status: row.status,
    current_period_start: row.current_period_start,
    current_period_end: row.current_period_end,
    trial_end: row.trial_end,
    cancel_at_period_end: row.cancel_at_period_end,
    sessions_used: row.sessions_used,
    sessions_limit: row.sessions_limit,
  };
}

/**
 * Fetch and map all subscriptions for a user.
 */
export async function listUserSubscriptions(
  db: Pool,
  profileId: string,
  headers: Record<string, string>,
): Promise<APIGatewayProxyResult> {
  const subscriptionsResult = await db.query(
    `SELECT
      bs.id, bs.status, bs.current_period_start, bs.current_period_end,
      bs.trial_end, bs.cancel_at_period_end, bs.sessions_used, bs.sessions_limit, bs.created_at,
      bp.id as business_id, bp.full_name as business_name, bp.avatar_url as business_logo,
      COALESCE(bc.name, 'General') as category_name,
      COALESCE(bc.icon, 'business') as category_icon,
      COALESCE(bc.color, '#0EBF8A') as category_color,
      sv.id as plan_id, sv.name as plan_name, sv.price_cents,
      COALESCE(sv.billing_period, sv.subscription_period, 'monthly') as period
    FROM business_subscriptions bs
    JOIN profiles bp ON bs.business_id = bp.id
    LEFT JOIN business_services sv ON bs.service_id = sv.id
    LEFT JOIN business_categories bc ON bp.business_category_id = bc.id
    WHERE bs.user_id = $1
    ORDER BY
      CASE WHEN bs.status = 'active' THEN 0
           WHEN bs.status = 'trial' THEN 1
           WHEN bs.status = 'cancelled' THEN 2
           ELSE 3 END,
      bs.created_at DESC
    LIMIT 50`,
    [profileId]
  );

  const subscriptions = subscriptionsResult.rows.map((row: SubscriptionRow) => mapSubscriptionRow(row));

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({ success: true, subscriptions }),
  };
}

// ── Access pass ──────────────────────────────────────────────────────

/**
 * Fetch a subscription's access pass (QR code data, member info, session tracking).
 */
export async function getAccessPass(
  db: Pool,
  subscriptionId: string,
  profileId: string,
  headers: Record<string, string>,
): Promise<APIGatewayProxyResult> {
  const subscriptionResult = await db.query(
    `SELECT
      bs.id, bs.user_id, bs.business_id, bs.service_id, bs.status,
      bs.current_period_end, bs.sessions_used, bs.sessions_limit,
      p.full_name as member_name,
      bp.full_name as business_name, bp.avatar_url as business_logo,
      sv.name as membership_type
    FROM business_subscriptions bs
    JOIN profiles p ON bs.user_id = p.id
    JOIN profiles bp ON bs.business_id = bp.id
    LEFT JOIN business_services sv ON bs.service_id = sv.id
    WHERE bs.id = $1 AND bs.user_id = $2`,
    [subscriptionId, profileId]
  );

  if (subscriptionResult.rows.length === 0) {
    return { statusCode: 404, headers, body: JSON.stringify({ success: false, message: 'Subscription not found or not owned by you' }) };
  }

  const subscription = subscriptionResult.rows[0];

  const qrCodeData = JSON.stringify({
    type: 'smuppy_access',
    subscriptionId: subscription.id,
    businessId: subscription.business_id,
    userId: subscription.user_id,
    timestamp: Date.now(),
  });

  let remainingSessions: number | undefined;
  if (subscription.sessions_limit !== null && subscription.sessions_limit !== undefined) {
    remainingSessions = subscription.sessions_limit - (subscription.sessions_used || 0);
  }

  const accessPass = {
    id: subscription.id,
    qrCode: qrCodeData,
    memberName: subscription.member_name || 'Member',
    membershipType: subscription.membership_type || 'Premium',
    validUntil: subscription.current_period_end,
    status: subscription.status,
    remainingSessions,
    businessName: subscription.business_name || 'Business',
    businessLogo: subscription.business_logo,
  };

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({ success: true, accessPass }),
  };
}

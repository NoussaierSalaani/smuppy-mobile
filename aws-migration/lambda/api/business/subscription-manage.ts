/**
 * Business Subscription Management
 * Combined handler for:
 * - POST /businesses/subscriptions/{subscriptionId}/cancel - Cancel subscription
 * - POST /businesses/subscriptions/{subscriptionId}/reactivate - Reactivate subscription
 * - GET /businesses/subscriptions/my - List user's subscriptions
 * - GET /businesses/subscriptions/{subscriptionId}/access-pass - Get access pass
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getPool } from '../../shared/db';
import { createHeaders } from '../utils/cors';
import { createLogger } from '../utils/logger';
import { getUserFromEvent } from '../utils/auth';
import { isValidUUID } from '../utils/security';
import { checkRateLimit } from '../utils/rate-limit';
import { getStripeKey } from '../../shared/secrets';
import Stripe from 'stripe';

const log = createLogger('business/subscription-manage');

let stripe: Stripe | null = null;

async function getStripe(): Promise<Stripe> {
  if (!stripe) {
    const key = await getStripeKey();
    stripe = new Stripe(key, { apiVersion: '2025-12-15.clover' });
  }
  return stripe;
}

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const headers = createHeaders(event);

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  const path = event.path;
  const method = event.httpMethod;

  // Route based on path and method
  if (path.endsWith('/subscriptions/my') && method === 'GET') {
    return handleListSubscriptions(event, headers);
  } else if (path.includes('/access-pass') && method === 'GET') {
    return handleGetAccessPass(event, headers);
  } else if (path.includes('/reactivate') && method === 'POST') {
    return handleReactivate(event, headers);
  } else if (path.includes('/cancel') && method === 'POST') {
    return handleCancel(event, headers);
  }

  return { statusCode: 404, headers, body: JSON.stringify({ success: false, message: 'Not found' }) };
}

async function handleListSubscriptions(event: APIGatewayProxyEvent, headers: Record<string, string>): Promise<APIGatewayProxyResult> {
  try {
    const user = getUserFromEvent(event);
    if (!user) {
      return { statusCode: 401, headers, body: JSON.stringify({ success: false, message: 'Unauthorized' }) };
    }

    const db = await getPool();

    const profileResult = await db.query(
      `SELECT id FROM profiles WHERE cognito_sub = $1`,
      [user.sub]
    );

    if (profileResult.rows.length === 0) {
      return { statusCode: 404, headers, body: JSON.stringify({ success: false, message: 'Profile not found' }) };
    }

    const profileId = profileResult.rows[0].id;

    const subscriptionsResult = await db.query(
      `SELECT
        bs.id,
        bs.status,
        bs.current_period_start,
        bs.current_period_end,
        bs.trial_end,
        bs.cancel_at_period_end,
        bs.sessions_used,
        bs.sessions_limit,
        bs.created_at,
        bp.id as business_id,
        bp.full_name as business_name,
        bp.avatar_url as business_logo,
        COALESCE(bc.name, 'General') as category_name,
        COALESCE(bc.icon, 'business') as category_icon,
        COALESCE(bc.color, '#0EBF8A') as category_color,
        sv.id as plan_id,
        sv.name as plan_name,
        sv.price_cents,
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

    const subscriptions = subscriptionsResult.rows.map((row: Record<string, unknown>) => ({
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
    }));

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ success: true, subscriptions }),
    };
  } catch (error) {
    log.error('Failed to get subscriptions', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ success: false, message: 'Internal server error' }),
    };
  }
}

async function handleGetAccessPass(event: APIGatewayProxyEvent, headers: Record<string, string>): Promise<APIGatewayProxyResult> {
  try {
    const user = getUserFromEvent(event);
    if (!user) {
      return { statusCode: 401, headers, body: JSON.stringify({ success: false, message: 'Unauthorized' }) };
    }

    const subscriptionId = event.pathParameters?.subscriptionId;
    if (!subscriptionId) {
      return { statusCode: 400, headers, body: JSON.stringify({ success: false, message: 'Missing subscription ID' }) };
    }

    if (!isValidUUID(subscriptionId)) {
      return { statusCode: 400, headers, body: JSON.stringify({ success: false, message: 'Invalid subscription ID format' }) };
    }

    const db = await getPool();

    const profileResult = await db.query(
      `SELECT id FROM profiles WHERE cognito_sub = $1`,
      [user.sub]
    );

    if (profileResult.rows.length === 0) {
      return { statusCode: 404, headers, body: JSON.stringify({ success: false, message: 'Profile not found' }) };
    }

    const profileId = profileResult.rows[0].id;

    const subscriptionResult = await db.query(
      `SELECT
        bs.id,
        bs.user_id,
        bs.business_id,
        bs.service_id,
        bs.status,
        bs.current_period_end,
        bs.sessions_used,
        bs.sessions_limit,
        p.full_name as member_name,
        bp.full_name as business_name,
        bp.avatar_url as business_logo,
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
  } catch (error) {
    log.error('Failed to get access pass', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ success: false, message: 'Internal server error' }),
    };
  }
}

async function handleCancel(event: APIGatewayProxyEvent, headers: Record<string, string>): Promise<APIGatewayProxyResult> {
  try {
    const user = getUserFromEvent(event);
    if (!user) {
      return { statusCode: 401, headers, body: JSON.stringify({ success: false, message: 'Unauthorized' }) };
    }

    // Rate limit: 5 cancel operations per minute
    const rateCheck = await checkRateLimit({ prefix: 'biz-sub-cancel', identifier: user.sub, maxRequests: 5, windowSeconds: 60 });
    if (!rateCheck.allowed) {
      return { statusCode: 429, headers, body: JSON.stringify({ success: false, message: 'Too many requests. Please try again later.' }) };
    }

    const subscriptionId = event.pathParameters?.subscriptionId;
    if (!subscriptionId) {
      return { statusCode: 400, headers, body: JSON.stringify({ success: false, message: 'Missing subscription ID' }) };
    }

    if (!isValidUUID(subscriptionId)) {
      return { statusCode: 400, headers, body: JSON.stringify({ success: false, message: 'Invalid subscription ID format' }) };
    }

    const db = await getPool();

    const profileResult = await db.query(
      `SELECT id FROM profiles WHERE cognito_sub = $1`,
      [user.sub]
    );

    if (profileResult.rows.length === 0) {
      return { statusCode: 404, headers, body: JSON.stringify({ success: false, message: 'Profile not found' }) };
    }

    const profileId = profileResult.rows[0].id;

    const subscriptionResult = await db.query(
      `SELECT id, user_id, stripe_subscription_id, status, cancel_at_period_end
       FROM business_subscriptions
       WHERE id = $1`,
      [subscriptionId]
    );

    if (subscriptionResult.rows.length === 0) {
      return { statusCode: 404, headers, body: JSON.stringify({ success: false, message: 'Subscription not found' }) };
    }

    const subscription = subscriptionResult.rows[0];

    if (subscription.user_id !== profileId) {
      return { statusCode: 403, headers, body: JSON.stringify({ success: false, message: 'You do not own this subscription' }) };
    }

    if (subscription.cancel_at_period_end) {
      return { statusCode: 400, headers, body: JSON.stringify({ success: false, message: 'Subscription is already scheduled for cancellation' }) };
    }

    if (subscription.status !== 'active' && subscription.status !== 'trial') {
      return { statusCode: 400, headers, body: JSON.stringify({ success: false, message: 'Cannot cancel a non-active subscription' }) };
    }

    if (subscription.stripe_subscription_id) {
      try {
        const stripeClient = await getStripe();
        await stripeClient.subscriptions.update(subscription.stripe_subscription_id, {
          cancel_at_period_end: true,
        });
      } catch (stripeError) {
        log.error('Stripe cancellation failed', stripeError);
      }
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
  } catch (error) {
    log.error('Failed to cancel subscription', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ success: false, message: 'Internal server error' }),
    };
  }
}

async function handleReactivate(event: APIGatewayProxyEvent, headers: Record<string, string>): Promise<APIGatewayProxyResult> {
  try {
    const user = getUserFromEvent(event);
    if (!user) {
      return { statusCode: 401, headers, body: JSON.stringify({ success: false, message: 'Unauthorized' }) };
    }

    // Rate limit: 5 reactivate operations per minute
    const rateCheck = await checkRateLimit({ prefix: 'biz-sub-reactivate', identifier: user.sub, maxRequests: 5, windowSeconds: 60 });
    if (!rateCheck.allowed) {
      return { statusCode: 429, headers, body: JSON.stringify({ success: false, message: 'Too many requests. Please try again later.' }) };
    }

    const subscriptionId = event.pathParameters?.subscriptionId;
    if (!subscriptionId) {
      return { statusCode: 400, headers, body: JSON.stringify({ success: false, message: 'Missing subscription ID' }) };
    }

    if (!isValidUUID(subscriptionId)) {
      return { statusCode: 400, headers, body: JSON.stringify({ success: false, message: 'Invalid subscription ID format' }) };
    }

    const db = await getPool();

    const profileResult = await db.query(
      `SELECT id FROM profiles WHERE cognito_sub = $1`,
      [user.sub]
    );

    if (profileResult.rows.length === 0) {
      return { statusCode: 404, headers, body: JSON.stringify({ success: false, message: 'Profile not found' }) };
    }

    const profileId = profileResult.rows[0].id;

    const subscriptionResult = await db.query(
      `SELECT id, user_id, stripe_subscription_id, status, cancel_at_period_end, current_period_end
       FROM business_subscriptions
       WHERE id = $1`,
      [subscriptionId]
    );

    if (subscriptionResult.rows.length === 0) {
      return { statusCode: 404, headers, body: JSON.stringify({ success: false, message: 'Subscription not found' }) };
    }

    const subscription = subscriptionResult.rows[0];

    if (subscription.user_id !== profileId) {
      return { statusCode: 403, headers, body: JSON.stringify({ success: false, message: 'You do not own this subscription' }) };
    }

    if (!subscription.cancel_at_period_end) {
      return { statusCode: 400, headers, body: JSON.stringify({ success: false, message: 'Subscription is not scheduled for cancellation' }) };
    }

    const now = new Date();
    const periodEnd = new Date(subscription.current_period_end);
    if (periodEnd < now) {
      return { statusCode: 400, headers, body: JSON.stringify({ success: false, message: 'Subscription period has ended. Please create a new subscription.' }) };
    }

    if (subscription.stripe_subscription_id) {
      try {
        const stripeClient = await getStripe();
        await stripeClient.subscriptions.update(subscription.stripe_subscription_id, {
          cancel_at_period_end: false,
        });
      } catch (stripeError) {
        log.error('Stripe reactivation failed', stripeError);
      }
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
  } catch (error) {
    log.error('Failed to reactivate subscription', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ success: false, message: 'Internal server error' }),
    };
  }
}

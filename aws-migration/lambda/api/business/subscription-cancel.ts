/**
 * Cancel Business Subscription
 * DELETE /businesses/subscriptions/{subscriptionId}
 * Cancels a subscription at period end
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getPool } from '../../shared/db';
import { createHeaders } from '../utils/cors';
import { createLogger } from '../utils/logger';
import { getUserFromEvent } from '../utils/auth';
import { isValidUUID } from '../utils/security';
import { checkRateLimit } from '../utils/rate-limit';
import { getStripeClient } from '../../shared/stripe-client';

const log = createLogger('business/subscription-cancel');

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const headers = createHeaders(event);

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  try {
    const user = getUserFromEvent(event);
    if (!user) {
      return { statusCode: 401, headers, body: JSON.stringify({ success: false, message: 'Unauthorized' }) };
    }

    const { allowed } = await checkRateLimit({ prefix: 'biz-sub-cancel', identifier: user.sub, windowSeconds: 60, maxRequests: 5, failOpen: false });
    if (!allowed) {
      return { statusCode: 429, headers, body: JSON.stringify({ success: false, message: 'Too many requests. Please try again later.' }) };
    }

    const subscriptionId = event.pathParameters?.subscriptionId;
    if (!subscriptionId) {
      return { statusCode: 400, headers, body: JSON.stringify({ success: false, message: 'Missing subscription ID' }) };
    }

    // Validate UUID format
    if (!isValidUUID(subscriptionId)) {
      return { statusCode: 400, headers, body: JSON.stringify({ success: false, message: 'Invalid subscription ID format' }) };
    }

    const db = await getPool();

    // First resolve cognito_sub to profile.id
    const profileResult = await db.query(
      `SELECT id FROM profiles WHERE cognito_sub = $1`,
      [user.sub]
    );

    if (profileResult.rows.length === 0) {
      return { statusCode: 404, headers, body: JSON.stringify({ success: false, message: 'Profile not found' }) };
    }

    const profileId = profileResult.rows[0].id;

    // Get subscription and verify ownership
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

    // Verify ownership
    if (subscription.user_id !== profileId) {
      return { statusCode: 403, headers, body: JSON.stringify({ success: false, message: 'You do not own this subscription' }) };
    }

    // Check if already cancelled
    if (subscription.cancel_at_period_end) {
      return { statusCode: 400, headers, body: JSON.stringify({ success: false, message: 'Subscription is already scheduled for cancellation' }) };
    }

    if (subscription.status !== 'active' && subscription.status !== 'trial') {
      return { statusCode: 400, headers, body: JSON.stringify({ success: false, message: 'Cannot cancel a non-active subscription' }) };
    }

    // If there's a Stripe subscription, cancel at period end
    if (subscription.stripe_subscription_id) {
      try {
        const stripeClient = await getStripeClient();
        await stripeClient.subscriptions.update(subscription.stripe_subscription_id, {
          cancel_at_period_end: true,
        });
      } catch (stripeError) {
        log.error('Stripe cancellation failed', stripeError);
        // Continue anyway to update our DB
      }
    }

    // Update our database
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

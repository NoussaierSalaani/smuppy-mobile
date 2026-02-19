/**
 * Reactivate Business Subscription
 * POST /businesses/subscriptions/{subscriptionId}/reactivate
 * Reactivates a cancelled subscription (before period end)
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { createLogger } from '../utils/logger';
import { requireRateLimit } from '../utils/rate-limit';
import { getStripeClient } from '../../shared/stripe-client';
import { authenticateAndResolveProfile, isErrorResponse, validateSubscriptionId, getOwnedSubscription } from './subscription-utils';

const log = createLogger('business/subscription-reactivate');

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  log.initFromEvent(event);

  const authResult = await authenticateAndResolveProfile(event);
  if (isErrorResponse(authResult)) return authResult;
  const { headers, profileId, db, userSub } = authResult;

  try {
    const rateLimitResponse = await requireRateLimit({ prefix: 'biz-sub-reactivate', identifier: userSub, windowSeconds: 60, maxRequests: 5, failOpen: false }, headers);
    if (rateLimitResponse) return rateLimitResponse;

    const subIdResult = validateSubscriptionId(event, headers);
    if (typeof subIdResult !== 'string') return subIdResult;
    const subscriptionId = subIdResult;

    const subResult = await getOwnedSubscription(db, subscriptionId, profileId, headers, 'current_period_end');
    if ('statusCode' in subResult) return subResult as APIGatewayProxyResult;
    const subscription = subResult;

    // Check if can be reactivated
    if (!subscription.cancel_at_period_end) {
      return { statusCode: 400, headers, body: JSON.stringify({ success: false, message: 'Subscription is not scheduled for cancellation' }) };
    }

    // Check if period has already ended
    const now = new Date();
    const periodEnd = new Date(subscription.current_period_end as string);
    if (periodEnd < now) {
      return { statusCode: 400, headers, body: JSON.stringify({ success: false, message: 'Subscription period has ended. Please create a new subscription.' }) };
    }

    // If there's a Stripe subscription, reactivate it
    if (subscription.stripe_subscription_id) {
      try {
        const stripeClient = await getStripeClient();
        await stripeClient.subscriptions.update(subscription.stripe_subscription_id as string, {
          cancel_at_period_end: false,
        });
      } catch (stripeError) {
        log.error('Stripe reactivation failed', stripeError);
        // Continue anyway to update our DB
      }
    }

    // Update our database
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
    return { statusCode: 500, headers, body: JSON.stringify({ success: false, message: 'Internal server error' }) };
  }
}

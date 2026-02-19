/**
 * Cancel Business Subscription
 * DELETE /businesses/subscriptions/{subscriptionId}
 * Cancels a subscription at period end
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { createLogger } from '../utils/logger';
import { requireRateLimit } from '../utils/rate-limit';
import { getStripeClient } from '../../shared/stripe-client';
import { authenticateAndResolveProfile, isErrorResponse, validateSubscriptionId, getOwnedSubscription } from './subscription-utils';

const log = createLogger('business/subscription-cancel');

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  log.initFromEvent(event);

  const authResult = await authenticateAndResolveProfile(event);
  if (isErrorResponse(authResult)) return authResult;
  const { headers, profileId, db, userSub } = authResult;

  try {
    const rateLimitResponse = await requireRateLimit({ prefix: 'biz-sub-cancel', identifier: userSub, windowSeconds: 60, maxRequests: 5, failOpen: false }, headers);
    if (rateLimitResponse) return rateLimitResponse;

    const subIdResult = validateSubscriptionId(event, headers);
    if (typeof subIdResult !== 'string') return subIdResult;
    const subscriptionId = subIdResult;

    const subResult = await getOwnedSubscription(db, subscriptionId, profileId, headers);
    if ('statusCode' in subResult) return subResult as APIGatewayProxyResult;
    const subscription = subResult;

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
        await stripeClient.subscriptions.update(subscription.stripe_subscription_id as string, {
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
    return { statusCode: 500, headers, body: JSON.stringify({ success: false, message: 'Internal server error' }) };
  }
}

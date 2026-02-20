/**
 * Cancel Business Subscription
 * DELETE /businesses/subscriptions/{subscriptionId}
 * Cancels a subscription at period end
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { createLogger } from '../utils/logger';
import { requireRateLimit } from '../utils/rate-limit';
import {
  authenticateAndResolveProfile,
  isErrorResponse,
  validateSubscriptionId,
  getOwnedSubscription,
  performCancelSubscription,
} from './subscription-utils';

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

    return await performCancelSubscription(db, subResult, subscriptionId, profileId, headers, log);
  } catch (error) {
    log.error('Failed to cancel subscription', error);
    return { statusCode: 500, headers, body: JSON.stringify({ success: false, message: 'Internal server error' }) };
  }
}

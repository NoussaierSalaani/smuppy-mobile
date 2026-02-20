/**
 * Reactivate Business Subscription
 * POST /businesses/subscriptions/{subscriptionId}/reactivate
 * Reactivates a cancelled subscription (before period end)
 */

import { APIGatewayProxyResult } from 'aws-lambda';
import { withErrorHandler } from '../utils/error-handler';
import { requireRateLimit } from '../utils/rate-limit';
import {
  authenticateAndResolveProfile,
  isErrorResponse,
  validateSubscriptionId,
  getOwnedSubscription,
  performReactivateSubscription,
} from './subscription-utils';

export const handler = withErrorHandler('business-subscription-reactivate', async (event, { headers, log }) => {
  const authResult = await authenticateAndResolveProfile(event);
  if (isErrorResponse(authResult)) return authResult;
  const { profileId, db, userSub } = authResult;

  const rateLimitResponse = await requireRateLimit({ prefix: 'biz-sub-reactivate', identifier: userSub, windowSeconds: 60, maxRequests: 5, failOpen: false }, headers);
  if (rateLimitResponse) return rateLimitResponse;

  const subIdResult = validateSubscriptionId(event, headers);
  if (typeof subIdResult !== 'string') return subIdResult;
  const subscriptionId = subIdResult;

  const subResult = await getOwnedSubscription(db, subscriptionId, profileId, headers, ['current_period_end']);
  if ('statusCode' in subResult) return subResult as APIGatewayProxyResult;

  return await performReactivateSubscription(db, subResult, subscriptionId, profileId, headers, log);
});

/**
 * Cancel Business Subscription
 * DELETE /businesses/subscriptions/{subscriptionId}
 * Cancels a subscription at period end
 */

import { APIGatewayProxyResult } from 'aws-lambda';
import { withErrorHandler } from '../utils/error-handler';
import { requireRateLimit } from '../utils/rate-limit';
import {
  authenticateAndResolveProfile,
  isErrorResponse,
  validateSubscriptionId,
  getOwnedSubscription,
  performCancelSubscription,
} from './subscription-utils';

export const handler = withErrorHandler('business-subscription-cancel', async (event, { headers, log }) => {
  const authResult = await authenticateAndResolveProfile(event);
  if (isErrorResponse(authResult)) return authResult;
  const { profileId, db, userSub } = authResult;

  const rateLimitResponse = await requireRateLimit({ prefix: 'biz-sub-cancel', identifier: userSub, windowSeconds: 60, maxRequests: 5, failOpen: false }, headers);
  if (rateLimitResponse) return rateLimitResponse;

  const subIdResult = validateSubscriptionId(event, headers);
  if (typeof subIdResult !== 'string') return subIdResult;
  const subscriptionId = subIdResult;

  const subResult = await getOwnedSubscription(db, subscriptionId, profileId, headers);
  if ('statusCode' in subResult) return subResult as APIGatewayProxyResult;

  return await performCancelSubscription(db, subResult, subscriptionId, profileId, headers, log);
});

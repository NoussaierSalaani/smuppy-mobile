/**
 * Business Access Pass
 * GET /businesses/subscriptions/{subscriptionId}/access-pass
 * Returns member QR code access pass for a subscription
 */

import { withErrorHandler } from '../utils/error-handler';
import {
  authenticateAndResolveProfile,
  isErrorResponse,
  validateSubscriptionId,
  getAccessPass,
} from './subscription-utils';

export const handler = withErrorHandler('business-access-pass', async (event, { headers }) => {
  const authResult = await authenticateAndResolveProfile(event);
  if (isErrorResponse(authResult)) return authResult;
  const { profileId, db } = authResult;

  const subIdResult = validateSubscriptionId(event, headers);
  if (typeof subIdResult !== 'string') return subIdResult;

  return await getAccessPass(db, subIdResult, profileId, headers);
});

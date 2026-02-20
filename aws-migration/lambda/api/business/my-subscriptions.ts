/**
 * My Business Subscriptions
 * GET /businesses/my/subscriptions
 * Returns all business subscriptions for the authenticated user
 */

import { withErrorHandler } from '../utils/error-handler';
import { authenticateAndResolveProfile, isErrorResponse, listUserSubscriptions } from './subscription-utils';

export const handler = withErrorHandler('business-my-subscriptions', async (event, { headers }) => {
  const authResult = await authenticateAndResolveProfile(event);
  if (isErrorResponse(authResult)) return authResult;
  const { profileId, db } = authResult;

  return await listUserSubscriptions(db, profileId, headers);
});

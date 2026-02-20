/**
 * Check Pending Follow Request Lambda Handler
 * Returns whether the current user has a pending follow request to a target user
 */

import { createFollowRequestHandler } from '../utils/create-follow-request-handler';
import { RATE_WINDOW_1_MIN } from '../utils/constants';

export const handler = createFollowRequestHandler({
  action: 'check-pending',
  loggerName: 'follow-requests-check-pending',
  authRole: 'requester',
  paramName: 'userId',
  rateLimitWindow: RATE_WINDOW_1_MIN,
  rateLimitMax: 30,
  onAction: async ({ request, headers }) => {
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ hasPending: request !== null }),
    };
  },
});

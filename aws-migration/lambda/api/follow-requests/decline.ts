/**
 * Decline Follow Request Lambda Handler
 * Declines a pending follow request
 */

import { createFollowRequestHandler } from '../utils/create-follow-request-handler';
import { RATE_WINDOW_30S } from '../utils/constants';

export const handler = createFollowRequestHandler({
  action: 'decline',
  loggerName: 'follow-requests-decline',
  authRole: 'target',
  paramName: 'id',
  rateLimitWindow: RATE_WINDOW_30S,
  rateLimitMax: 10,
  onAction: async ({ client, request, headers }) => {
    // request is guaranteed non-null by factory for paramName: 'id'
    if (!request) {
      return { statusCode: 404, headers, body: JSON.stringify({ message: 'Follow request not found' }) };
    }

    await client.query(
      'UPDATE follow_requests SET status = $1, updated_at = NOW() WHERE id = $2',
      ['declined', request.id],
    );

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ success: true, message: 'Follow request declined' }),
    };
  },
});

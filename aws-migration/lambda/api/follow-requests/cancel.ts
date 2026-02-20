/**
 * Cancel Follow Request Lambda Handler
 * Cancels a pending follow request from the current user to a target user
 */

import { createFollowRequestHandler } from '../utils/create-follow-request-handler';
import { RATE_WINDOW_1_MIN } from '../utils/constants';
import { createLogger } from '../utils/logger';

const log = createLogger('follow-requests-cancel');

export const handler = createFollowRequestHandler({
  action: 'cancel',
  loggerName: 'follow-requests-cancel',
  authRole: 'requester',
  paramName: 'userId',
  rateLimitWindow: RATE_WINDOW_1_MIN,
  rateLimitMax: 10,
  onAction: async ({ client, request, profileId, headers }) => {
    // request is null when no pending follow request exists (factory loaded by requester+target)
    if (!request) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ message: 'No pending follow request found' }),
      };
    }

    log.info('Cancelling follow request', {
      requesterId: profileId.substring(0, 2) + '***',
      targetId: request.target_id.substring(0, 2) + '***',
    });

    await client.query(
      'DELETE FROM follow_requests WHERE requester_id = $1 AND target_id = $2 AND status = $3',
      [profileId, request.target_id, 'pending'],
    );

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ success: true }),
    };
  },
});

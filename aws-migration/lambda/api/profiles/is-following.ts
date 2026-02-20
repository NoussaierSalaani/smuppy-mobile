/**
 * Check Follow Status Lambda Handler
 * Returns whether the current user is following the target user
 */

import { getPool } from '../../shared/db';
import { isValidUUID } from '../utils/security';
import { resolveProfileId } from '../utils/auth';
import { withErrorHandler } from '../utils/error-handler';

export const handler = withErrorHandler('profiles-is-following', async (event, { headers, log }) => {
    const currentUserId = event.requestContext.authorizer?.claims?.sub;

    if (!currentUserId) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ message: 'Unauthorized' }),
      };
    }

    const targetUserId = event.pathParameters?.id;

    if (!targetUserId || !isValidUUID(targetUserId)) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ message: 'Valid userId is required' }),
      };
    }

    const db = await getPool();

    // Resolve cognito_sub to profile ID
    const currentProfileId = await resolveProfileId(db, currentUserId);

    if (!currentProfileId) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ isFollowing: false, isPending: false, status: null }),
      };
    }

    // Check if current user is following the target user
    const result = await db.query(
      `SELECT id, status FROM follows WHERE follower_id = $1 AND following_id = $2`,
      [currentProfileId, targetUserId]
    );

    const isFollowing = result.rows.length > 0 && result.rows[0].status === 'accepted';
    const isPending = result.rows.length > 0 && result.rows[0].status === 'pending';

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        isFollowing,
        isPending,
        status: result.rows.length > 0 ? result.rows[0].status : null,
      }),
    };
});

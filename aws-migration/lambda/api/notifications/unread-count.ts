/**
 * Get Unread Notifications Count Lambda Handler
 * Returns the count of unread notifications
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getPool } from '../../shared/db';
import { requireRateLimit } from '../utils/rate-limit';
import { resolveProfileId } from '../utils/auth';
import { withErrorHandler } from '../utils/error-handler';

export const handler = withErrorHandler('notifications-unread-count', async (event, { headers }) => {
    const userId = event.requestContext.authorizer?.claims?.sub;
    if (!userId) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ message: 'Unauthorized' }),
      };
    }

    // Rate limit: 30 unread-count checks per minute (polled frequently)
    const rateLimitResponse = await requireRateLimit({ prefix: 'notif-unread', identifier: userId, windowSeconds: 60, maxRequests: 30, failOpen: true }, headers);
    if (rateLimitResponse) return rateLimitResponse;

    const db = await getPool();

    const profileId = await resolveProfileId(db, userId);
    if (!profileId) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ message: 'User profile not found' }),
      };
    }

    // Count unread notifications
    const result = await db.query(
      `SELECT COUNT(*) as count
       FROM notifications
       WHERE user_id = $1 AND read = false`,
      [profileId]
    );

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        unreadCount: Number.parseInt(result.rows[0].count),
      }),
    };
});

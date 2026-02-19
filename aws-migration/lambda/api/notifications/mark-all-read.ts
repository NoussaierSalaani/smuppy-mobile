/**
 * Mark All Notifications Read Lambda Handler
 * Marks all user's notifications as read
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getPool } from '../../shared/db';
import { createHeaders } from '../utils/cors';
import { createLogger } from '../utils/logger';
import { requireRateLimit } from '../utils/rate-limit';
import { resolveProfileId } from '../utils/auth';

const log = createLogger('notifications-mark-all-read');

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const headers = createHeaders(event);
  log.initFromEvent(event);

  try {
    const userId = event.requestContext.authorizer?.claims?.sub;
    if (!userId) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ message: 'Unauthorized' }),
      };
    }

    // Rate limit: 10 mark-all-read per minute
    const rateLimitResponse = await requireRateLimit({ prefix: 'notif-mark-read', identifier: userId, windowSeconds: 60, maxRequests: 10, failOpen: true }, headers);
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

    // Mark all notifications as read
    const result = await db.query(
      `UPDATE notifications
       SET read = true
       WHERE user_id = $1 AND read = false`,
      [profileId]
    );

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        message: 'All notifications marked as read',
        count: result.rowCount,
      }),
    };
  } catch (error: unknown) {
    log.error('Error marking all notifications read', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ message: 'Internal server error' }),
    };
  }
}

/**
 * Get Unread Notifications Count Lambda Handler
 * Returns the count of unread notifications
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getPool } from '../../shared/db';
import { createHeaders } from '../utils/cors';
import { createLogger } from '../utils/logger';
import { checkRateLimit } from '../utils/rate-limit';

const log = createLogger('notifications-unread-count');

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

    // Rate limit: 30 unread-count checks per minute (polled frequently)
    const { allowed } = await checkRateLimit({ prefix: 'notif-unread', identifier: userId, windowSeconds: 60, maxRequests: 30, failOpen: true });
    if (!allowed) {
      return {
        statusCode: 429,
        headers,
        body: JSON.stringify({ message: 'Too many requests. Please try again later.' }),
      };
    }

    const db = await getPool();

    // Get user's profile ID (check both id and cognito_sub for consistency)
    const userResult = await db.query(
      'SELECT id FROM profiles WHERE cognito_sub = $1',
      [userId]
    );

    if (userResult.rows.length === 0) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ message: 'User profile not found' }),
      };
    }

    const profileId = userResult.rows[0].id;

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
        unreadCount: parseInt(result.rows[0].count),
      }),
    };
  } catch (error: unknown) {
    log.error('Error getting unread count', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ message: 'Internal server error' }),
    };
  }
}

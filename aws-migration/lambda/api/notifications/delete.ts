/**
 * Delete Notification Lambda Handler
 * Deletes a single notification belonging to the authenticated user
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getPool } from '../../shared/db';
import { createHeaders } from '../utils/cors';
import { createLogger } from '../utils/logger';
import { requireRateLimit } from '../utils/rate-limit';
import { isValidUUID } from '../utils/security';
import { resolveProfileId } from '../utils/auth';

const log = createLogger('notifications-delete');

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

    const rateLimitResponse = await requireRateLimit({ prefix: 'notif-delete', identifier: userId, maxRequests: 30 }, headers);
    if (rateLimitResponse) return rateLimitResponse;

    const notificationId = event.pathParameters?.id;
    if (!notificationId) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ message: 'Notification ID is required' }),
      };
    }

    // Validate UUID format
    if (!isValidUUID(notificationId)) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ message: 'Invalid notification ID format' }),
      };
    }

    const db = await getPool();

    const profileId = await resolveProfileId(db, userId);
    if (!profileId) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ message: 'User profile not found' }),
      };
    }

    // Delete notification (only if it belongs to the user)
    const result = await db.query(
      `DELETE FROM notifications
       WHERE id = $1 AND user_id = $2
       RETURNING id`,
      [notificationId, profileId]
    );

    if (result.rows.length === 0) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ message: 'Notification not found' }),
      };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        message: 'Notification deleted',
      }),
    };
  } catch (error: unknown) {
    log.error('Error deleting notification', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ message: 'Internal server error' }),
    };
  }
}

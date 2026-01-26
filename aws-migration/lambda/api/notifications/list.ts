/**
 * List Notifications Lambda Handler
 * Returns user's notifications with pagination
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getPool } from '../../shared/db';
import { createHeaders } from '../utils/cors';
import { createLogger, getRequestId } from '../utils/logger';

const log = createLogger('notifications-list');

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const headers = createHeaders(event);

  try {
    const userId = event.requestContext.authorizer?.claims?.sub;
    if (!userId) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ message: 'Unauthorized' }),
      };
    }

    // Pagination params
    const limit = Math.min(parseInt(event.queryStringParameters?.limit || '20'), 50);
    const cursor = event.queryStringParameters?.cursor;
    const unreadOnly = event.queryStringParameters?.unread === 'true';

    const db = await getPool();

    // Get user's profile ID
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

    // Build query
    let query = `
      SELECT
        id,
        type,
        title,
        body,
        data,
        read,
        created_at
      FROM notifications
      WHERE user_id = $1
    `;

    const params: any[] = [profileId];
    let paramIndex = 2;

    // Filter unread only
    if (unreadOnly) {
      query += ` AND read = false`;
    }

    // Cursor pagination
    if (cursor) {
      query += ` AND created_at < $${paramIndex}`;
      params.push(new Date(parseInt(cursor)));
      paramIndex++;
    }

    query += ` ORDER BY created_at DESC LIMIT $${paramIndex}`;
    params.push(limit + 1);

    const result = await db.query(query, params);

    // Check if there are more results
    const hasMore = result.rows.length > limit;
    const notifications = hasMore ? result.rows.slice(0, -1) : result.rows;

    // Format response
    const formattedNotifications = notifications.map(n => ({
      id: n.id,
      type: n.type,
      title: n.title,
      body: n.body,
      data: n.data,
      read: n.read,
      createdAt: n.created_at,
    }));

    // Generate next cursor
    const nextCursor = hasMore && notifications.length > 0
      ? new Date(notifications[notifications.length - 1].created_at).getTime().toString()
      : null;

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        notifications: formattedNotifications,
        cursor: nextCursor,
        hasMore,
      }),
    };
  } catch (error: any) {
    log.error('Error listing notifications', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ message: 'Internal server error' }),
    };
  }
}

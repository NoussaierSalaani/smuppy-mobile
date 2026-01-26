/**
 * Mark Notification Read Lambda Handler
 * Marks a single notification as read
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getPool } from '../../shared/db';
import { createHeaders } from '../utils/cors';

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

    const notificationId = event.pathParameters?.id;
    if (!notificationId) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ message: 'Notification ID is required' }),
      };
    }

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(notificationId)) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ message: 'Invalid notification ID format' }),
      };
    }

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

    // Mark notification as read (only if it belongs to the user)
    const result = await db.query(
      `UPDATE notifications
       SET read = true
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
        message: 'Notification marked as read',
      }),
    };
  } catch (error: any) {
    console.error('Error marking notification read:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ message: 'Internal server error' }),
    };
  }
}

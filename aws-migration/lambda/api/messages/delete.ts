/**
 * Delete Message Lambda Handler
 * Deletes a message (only by sender)
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getPool } from '../../shared/db';
import { createHeaders } from '../utils/cors';
import { createLogger } from '../utils/logger';
import { isValidUUID } from '../utils/security';

const log = createLogger('messages-delete');

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

    const messageId = event.pathParameters?.id;
    if (!messageId) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ message: 'Message ID is required' }),
      };
    }

    // Validate UUID format
    if (!isValidUUID(messageId)) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ message: 'Invalid message ID format' }),
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

    // Soft-delete message only if user is the sender
    const result = await db.query(
      `UPDATE messages
       SET is_deleted = true, content = '', media_url = NULL
       WHERE id = $1 AND sender_id = $2 AND is_deleted = false
       RETURNING id`,
      [messageId, profileId]
    );

    if (result.rows.length === 0) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ message: 'Message not found or not authorized to delete' }),
      };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        message: 'Message deleted successfully',
      }),
    };
  } catch (error: unknown) {
    log.error('Error deleting message', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ message: 'Internal server error' }),
    };
  }
}

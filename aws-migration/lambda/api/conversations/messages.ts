/**
 * Get Conversation Messages Lambda Handler
 * Returns messages in a specific conversation
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getPool, SqlParam } from '../../shared/db';
import { createHeaders } from '../utils/cors';
import { createLogger } from '../utils/logger';

const log = createLogger('conversations-messages');

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

    const conversationId = event.pathParameters?.id;
    if (!conversationId) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ message: 'Conversation ID is required' }),
      };
    }

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(conversationId)) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ message: 'Invalid conversation ID format' }),
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

    // Check if user is participant in this conversation
    const conversationResult = await db.query(
      `SELECT id FROM conversations
       WHERE id = $1 AND (participant_1_id = $2 OR participant_2_id = $2)`,
      [conversationId, profileId]
    );

    if (conversationResult.rows.length === 0) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ message: 'Conversation not found' }),
      };
    }

    // Get pagination params
    const limit = Math.min(parseInt(event.queryStringParameters?.limit || '50'), 100);
    const cursor = event.queryStringParameters?.cursor;

    // Build query for messages
    let query = `
      SELECT
        m.id,
        m.content,
        m.sender_id,
        m.read,
        m.created_at,
        json_build_object(
          'id', p.id,
          'username', p.username,
          'display_name', p.display_name,
          'avatar_url', p.avatar_url
        ) as sender
      FROM messages m
      JOIN profiles p ON p.id = m.sender_id
      WHERE m.conversation_id = $1
    `;

    const params: SqlParam[] = [conversationId];

    if (cursor) {
      query += ` AND m.created_at < $${params.length + 1}`;
      params.push(new Date(cursor));
    }

    query += ` ORDER BY m.created_at DESC LIMIT $${params.length + 1}`;
    params.push(limit + 1);

    const result = await db.query(query, params);

    const hasMore = result.rows.length > limit;
    const messages = hasMore ? result.rows.slice(0, -1) : result.rows;

    // Mark messages as read (those sent by other user)
    await db.query(
      `UPDATE messages
       SET read = true
       WHERE conversation_id = $1 AND sender_id != $2 AND read = false`,
      [conversationId, profileId]
    );

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        messages: messages.reverse(), // Return in chronological order
        nextCursor: hasMore ? messages[0].created_at : null,
        hasMore,
      }),
    };
  } catch (error: unknown) {
    log.error('Error getting messages', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ message: 'Internal server error' }),
    };
  }
}

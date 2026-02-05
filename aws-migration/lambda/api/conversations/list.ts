/**
 * List Conversations Lambda Handler
 * Returns all conversations for the authenticated user
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getPool, SqlParam } from '../../shared/db';
import { createHeaders } from '../utils/cors';
import { createLogger } from '../utils/logger';

const log = createLogger('conversations-list');

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

    // Get pagination params
    const limit = Math.min(parseInt(event.queryStringParameters?.limit || '20'), 50);
    const cursor = event.queryStringParameters?.cursor;

    // Build query for conversations with last message
    let query = `
      SELECT
        c.id,
        c.created_at,
        COALESCE(c.last_message_at, c.created_at),
        (
          SELECT json_build_object(
            'id', m.id,
            'content', m.content,
            'media_type', m.media_type,
            'created_at', m.created_at,
            'sender_id', m.sender_id
          )
          FROM messages m
          WHERE m.conversation_id = c.id
          ORDER BY m.created_at DESC
          LIMIT 1
        ) as last_message,
        (
          SELECT COUNT(*)::int
          FROM messages m
          WHERE m.conversation_id = c.id
            AND m.sender_id != $1
            AND m.read = false
        ) as unread_count,
        (
          SELECT json_build_object(
            'id', p.id,
            'username', p.username,
            'full_name', p.full_name,
            'display_name', p.display_name,
            'avatar_url', p.avatar_url,
            'is_verified', p.is_verified,
            'account_type', p.account_type
          )
          FROM profiles p
          WHERE p.id = CASE
            WHEN c.participant_1_id = $1 THEN c.participant_2_id
            ELSE c.participant_1_id
          END
        ) as other_participant
      FROM conversations c
      WHERE c.participant_1_id = $1 OR c.participant_2_id = $1
    `;

    const params: SqlParam[] = [profileId];

    if (cursor) {
      query += ` AND COALESCE(c.last_message_at, c.created_at) < $${params.length + 1}`;
      params.push(new Date(cursor));
    }

    query += ` ORDER BY COALESCE(c.last_message_at, c.created_at) DESC LIMIT $${params.length + 1}`;
    params.push(limit + 1);

    const result = await db.query(query, params);

    const hasMore = result.rows.length > limit;
    const conversations = hasMore ? result.rows.slice(0, -1) : result.rows;

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        conversations,
        nextCursor: hasMore ? (conversations[conversations.length - 1].last_message_at || conversations[conversations.length - 1].created_at) : null,
        hasMore,
      }),
    };
  } catch (error: unknown) {
    log.error('Error listing conversations', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ message: 'Internal server error' }),
    };
  }
}

/**
 * Get Conversation Messages Lambda Handler
 * Returns messages in a specific conversation
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getPool, SqlParam } from '../../shared/db';
import { createHeaders } from '../utils/cors';
import { createLogger } from '../utils/logger';
import { isValidUUID } from '../utils/security';
import { checkRateLimit } from '../utils/rate-limit';

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

    // Rate limit: 60 requests per minute for message fetching
    // Per CLAUDE.md: rate limit ALL endpoints
    const { allowed } = await checkRateLimit({
      prefix: 'conversations-messages',
      identifier: userId,
      windowSeconds: 60,
      maxRequests: 60,
    });
    if (!allowed) {
      return {
        statusCode: 429,
        headers,
        body: JSON.stringify({ message: 'Too many requests. Please try again later.' }),
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
    if (!isValidUUID(conversationId)) {
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

    // Get pagination params with validation
    // Per CLAUDE.md: validate all input - parseInt('invalid') returns NaN
    const rawLimit = event.queryStringParameters?.limit;
    const parsedLimit = rawLimit ? parseInt(rawLimit, 10) : 50;
    const limit = Number.isNaN(parsedLimit) ? 50 : Math.max(1, Math.min(parsedLimit, 100));

    const cursor = event.queryStringParameters?.cursor;

    // Validate cursor is a valid ISO date if provided
    // Per CLAUDE.md: validate all user input
    if (cursor) {
      const cursorDate = new Date(cursor);
      if (Number.isNaN(cursorDate.getTime())) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ message: 'Invalid cursor format' }),
        };
      }
    }

    // Build query for messages (filter out soft-deleted)
    let query = `
      SELECT
        m.id,
        m.content,
        m.media_url,
        m.media_type,
        m.sender_id,
        m.read,
        m.created_at,
        m.reply_to_message_id,
        m.is_deleted,
        m.shared_post_id,
        m.shared_peak_id,
        json_build_object(
          'id', p.id,
          'username', p.username,
          'display_name', p.display_name,
          'avatar_url', p.avatar_url
        ) as sender
      FROM messages m
      JOIN profiles p ON p.id = m.sender_id
      WHERE m.conversation_id = $1
        AND (m.is_deleted IS NULL OR m.is_deleted = false)
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

    // Mark messages as read only when explicitly requested (no separate mark-read endpoint exists yet)
    const shouldMarkRead = event.queryStringParameters?.markAsRead === 'true';
    if (shouldMarkRead) {
      await db.query(
        `UPDATE messages
         SET read = true
         WHERE conversation_id = $1 AND sender_id != $2 AND read = false`,
        [conversationId, profileId]
      );
    }

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

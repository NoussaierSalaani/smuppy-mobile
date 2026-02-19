/**
 * List Conversations Lambda Handler
 * Returns all conversations for the authenticated user
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getPool, SqlParam } from '../../shared/db';
import { createHeaders } from '../utils/cors';
import { createLogger } from '../utils/logger';
import { checkRateLimit } from '../utils/rate-limit';
import { RATE_WINDOW_1_MIN } from '../utils/constants';

const log = createLogger('conversations-list');

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

    // Rate limit: 30 requests per minute for list operations
    // Per CLAUDE.md: rate limit ALL endpoints
    const { allowed } = await checkRateLimit({
      prefix: 'conversations-list',
      identifier: userId,
      windowSeconds: RATE_WINDOW_1_MIN,
      maxRequests: 30,
    });
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

    // Get pagination params with validation
    // Per CLAUDE.md: validate all input - Number.parseInt('invalid') returns NaN
    const rawLimit = event.queryStringParameters?.limit;
    const parsedLimit = rawLimit ? Number.parseInt(rawLimit, 10) : 20;
    const limit = Number.isNaN(parsedLimit) ? 20 : Math.max(1, Math.min(parsedLimit, 50));

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

    // Build query for conversations with last message (LATERAL JOINs for better planner flexibility)
    let query = `
      SELECT
        c.id,
        c.created_at,
        COALESCE(c.last_message_at, c.created_at) AS last_message_at,
        lm.last_message,
        uc.unread_count,
        op.other_participant
      FROM conversations c
      LEFT JOIN LATERAL (
        SELECT json_build_object(
          'id', m.id, 'content', m.content, 'media_type', m.media_type,
          'created_at', m.created_at, 'sender_id', m.sender_id
        ) as last_message
        FROM messages m
        WHERE m.conversation_id = c.id
          AND (m.is_deleted IS NULL OR m.is_deleted = false)
        ORDER BY m.created_at DESC
        LIMIT 1
      ) lm ON true
      LEFT JOIN LATERAL (
        SELECT COUNT(*)::int as unread_count
        FROM messages m
        WHERE m.conversation_id = c.id AND m.sender_id != $1 AND m.read = false
      ) uc ON true
      LEFT JOIN LATERAL (
        SELECT json_build_object(
          'id', p.id, 'username', p.username, 'full_name', p.full_name,
          'display_name', p.display_name, 'avatar_url', p.avatar_url,
          'is_verified', p.is_verified, 'account_type', p.account_type,
          'business_name', p.business_name
        ) as other_participant
        FROM profiles p
        WHERE p.id = CASE
          WHEN c.participant_1_id = $1 THEN c.participant_2_id
          ELSE c.participant_1_id
        END
      ) op ON true
      WHERE (c.participant_1_id = $1 OR c.participant_2_id = $1)
        AND NOT EXISTS (
          SELECT 1 FROM blocked_users bu
          WHERE (bu.blocker_id = $1 AND bu.blocked_id = CASE WHEN c.participant_1_id = $1 THEN c.participant_2_id ELSE c.participant_1_id END)
             OR (bu.blocked_id = $1 AND bu.blocker_id = CASE WHEN c.participant_1_id = $1 THEN c.participant_2_id ELSE c.participant_1_id END)
        )
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
        success: true,
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

/**
 * Get Conversation Messages Lambda Handler
 * Returns messages in a specific conversation
 */

import { SqlParam } from '../../shared/db';
import { withAuthHandler } from '../utils/with-auth-handler';
import { isValidUUID } from '../utils/security';
import { requireRateLimit } from '../utils/rate-limit';

export const handler = withAuthHandler('conversations-messages', async (event, { headers, cognitoSub, profileId, db }) => {
  // Rate limit: 60 requests per minute for message fetching
  // Per CLAUDE.md: rate limit ALL endpoints
  const rateLimitResponse = await requireRateLimit({
    prefix: 'conversations-messages',
    identifier: cognitoSub,
    windowSeconds: 60,
    maxRequests: 60,
  }, headers);
  if (rateLimitResponse) return rateLimitResponse;

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

  // Use writer connection for conversation reads to avoid replica lag right after send-message.
  // Chat UX requires read-your-write consistency when reopening a conversation immediately.
  const strongReadDb = db;

  // Check if user is participant in this conversation
  const conversationResult = await strongReadDb.query(
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
  // Per CLAUDE.md: validate all input - Number.parseInt('invalid') returns NaN
  const rawLimit = event.queryStringParameters?.limit;
  const parsedLimit = rawLimit ? Number.parseInt(rawLimit, 10) : 50;
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
      m.voice_duration_seconds,
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

  const result = await strongReadDb.query(query, params);

  const hasMore = result.rows.length > limit;
  const messages = hasMore ? result.rows.slice(0, -1) : result.rows;

  // Mark messages as read only when explicitly requested (uses writer pool for mutations)
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
      success: true,
      messages: messages.reverse(), // Return in chronological order
      nextCursor: hasMore ? messages[0].created_at : null,
      hasMore,
    }),
  };
});

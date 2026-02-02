/**
 * Send Message Lambda Handler
 * Sends a message in a conversation
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getPool } from '../../shared/db';
import { createHeaders } from '../utils/cors';
import { createLogger } from '../utils/logger';
import { checkRateLimit } from '../utils/rate-limit';

const log = createLogger('conversations-send-message');

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_MESSAGE_LENGTH = 5000;

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

    // Rate limit: 60 messages per minute
    const { allowed } = await checkRateLimit({ prefix: 'send-message', identifier: userId, windowSeconds: 60, maxRequests: 60 });
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

    if (!UUID_REGEX.test(conversationId)) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ message: 'Invalid conversation ID format' }),
      };
    }

    // Parse body
    const body = event.body ? JSON.parse(event.body) : {};
    const { content } = body;

    if (!content || typeof content !== 'string' || content.trim().length === 0) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ message: 'Message content is required' }),
      };
    }

    if (content.length > MAX_MESSAGE_LENGTH) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ message: `Message is too long (max ${MAX_MESSAGE_LENGTH} characters)` }),
      };
    }

    // Sanitize content: strip HTML tags and control characters
    const sanitizedContent = content.trim().replace(/<[^>]*>/g, '').replace(/[\x00-\x1F\x7F]/g, '');

    const db = await getPool();

    // Get user's profile
    const userResult = await db.query(
      'SELECT id, username, display_name, avatar_url FROM profiles WHERE cognito_sub = $1',
      [userId]
    );

    if (userResult.rows.length === 0) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ message: 'User profile not found' }),
      };
    }

    const profile = userResult.rows[0];

    // Check if user is participant in this conversation
    const conversationResult = await db.query(
      `SELECT id, participant_1_id, participant_2_id FROM conversations
       WHERE id = $1 AND (participant_1_id = $2 OR participant_2_id = $2)`,
      [conversationId, profile.id]
    );

    if (conversationResult.rows.length === 0) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ message: 'Conversation not found' }),
      };
    }

    const conversation = conversationResult.rows[0];
    const recipientId = conversation.participant_1_id === profile.id
      ? conversation.participant_2_id
      : conversation.participant_1_id;

    // Insert message and update conversation in a transaction
    const client = await db.connect();
    let message;
    try {
      await client.query('BEGIN');

      const messageResult = await client.query(
        `INSERT INTO messages (conversation_id, sender_id, recipient_id, content, read, created_at)
         VALUES ($1, $2, $3, $4, false, NOW())
         RETURNING id, content, sender_id, recipient_id, read, created_at`,
        [conversationId, profile.id, recipientId, sanitizedContent]
      );

      await client.query(
        'UPDATE conversations SET last_message_at = NOW() WHERE id = $1',
        [conversationId]
      );

      await client.query('COMMIT');
      message = messageResult.rows[0];
    } catch (txError) {
      await client.query('ROLLBACK');
      throw txError;
    } finally {
      client.release();
    }

    return {
      statusCode: 201,
      headers,
      body: JSON.stringify({
        message: {
          ...message,
          sender: {
            id: profile.id,
            username: profile.username,
            display_name: profile.display_name,
            avatar_url: profile.avatar_url,
          },
        },
      }),
    };
  } catch (error: unknown) {
    log.error('Error sending message', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ message: 'Internal server error' }),
    };
  }
}

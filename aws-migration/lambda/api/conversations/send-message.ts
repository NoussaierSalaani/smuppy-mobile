/**
 * Send Message Lambda Handler
 * Sends a message in a conversation
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

    const conversationId = event.pathParameters?.id;
    if (!conversationId) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ message: 'Conversation ID is required' }),
      };
    }

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(conversationId)) {
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

    // Limit message length
    if (content.length > 5000) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ message: 'Message is too long (max 5000 characters)' }),
      };
    }

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

    // Insert the message
    const messageResult = await db.query(
      `INSERT INTO messages (conversation_id, sender_id, content, read, created_at)
       VALUES ($1, $2, $3, false, NOW())
       RETURNING id, content, sender_id, read, created_at`,
      [conversationId, profile.id, content.trim()]
    );

    // Update conversation's last_message_at
    await db.query(
      'UPDATE conversations SET last_message_at = NOW() WHERE id = $1',
      [conversationId]
    );

    const message = messageResult.rows[0];

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
  } catch (error: any) {
    console.error('Error sending message:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ message: 'Internal server error' }),
    };
  }
}

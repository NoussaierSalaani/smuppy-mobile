/**
 * Create/Get Conversation Lambda Handler
 * Creates a new conversation with another user or returns existing one
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getPool } from '../../shared/db';
import { createHeaders } from '../utils/cors';
import { createLogger } from '../utils/logger';
import { checkRateLimit } from '../utils/rate-limit';
import { isValidUUID } from '../utils/security';

const log = createLogger('conversations-create');

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

    const rateLimit = await checkRateLimit({
      prefix: 'conversation-create',
      identifier: userId,
      windowSeconds: 60,
      maxRequests: 5,
    });
    if (!rateLimit.allowed) {
      return {
        statusCode: 429,
        headers,
        body: JSON.stringify({ message: 'Too many requests. Please try again later.' }),
      };
    }

    // Parse body
    const body = event.body ? JSON.parse(event.body) : {};
    const { participantId } = body;

    if (!participantId) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ message: 'participantId is required' }),
      };
    }

    // Validate UUID format
    if (!isValidUUID(participantId)) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ message: 'Invalid participantId format' }),
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

    // Cannot create conversation with yourself
    if (profileId === participantId) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ message: 'Cannot create conversation with yourself' }),
      };
    }

    // Check if other participant exists
    const participantResult = await db.query(
      'SELECT id, username, display_name, avatar_url, is_verified FROM profiles WHERE id = $1',
      [participantId]
    );

    if (participantResult.rows.length === 0) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ message: 'Participant not found' }),
      };
    }

    const otherParticipant = participantResult.rows[0];

    // Check if either user has blocked the other
    const blockCheck = await db.query(
      `SELECT 1 FROM blocks
       WHERE (user_id = $1 AND blocked_user_id = $2)
          OR (user_id = $2 AND blocked_user_id = $1)
       LIMIT 1`,
      [profileId, participantId]
    );
    if (blockCheck.rows.length > 0) {
      return {
        statusCode: 403,
        headers,
        body: JSON.stringify({ message: 'Cannot create conversation with this user' }),
      };
    }

    // Check if conversation already exists (order doesn't matter)
    const existingConversation = await db.query(
      `SELECT id, created_at, last_message_at
       FROM conversations
       WHERE (participant_1_id = $1 AND participant_2_id = $2)
          OR (participant_1_id = $2 AND participant_2_id = $1)`,
      [profileId, participantId]
    );

    if (existingConversation.rows.length > 0) {
      // Return existing conversation
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          conversation: {
            ...existingConversation.rows[0],
            other_participant: {
              id: otherParticipant.id,
              username: otherParticipant.username,
              display_name: otherParticipant.display_name,
              avatar_url: otherParticipant.avatar_url,
              is_verified: otherParticipant.is_verified,
            },
          },
          created: false,
        }),
      };
    }

    // Create new conversation — order participant IDs to satisfy chk_participants_ordered constraint
    // Use ON CONFLICT to handle race condition where two concurrent requests try to create the same conversation
    const [p1, p2] = profileId < participantId ? [profileId, participantId] : [participantId, profileId];
    const newConversation = await db.query(
      `INSERT INTO conversations (participant_1_id, participant_2_id, created_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (participant_1_id, participant_2_id)
       DO UPDATE SET participant_1_id = conversations.participant_1_id
       RETURNING id, created_at, last_message_at`,
      [p1, p2]
    );

    return {
      statusCode: 201,
      headers,
      body: JSON.stringify({
        conversation: {
          ...newConversation.rows[0],
          other_participant: {
            id: otherParticipant.id,
            username: otherParticipant.username,
            display_name: otherParticipant.display_name,
            avatar_url: otherParticipant.avatar_url,
            is_verified: otherParticipant.is_verified,
          },
        },
        created: true,
      }),
    };
  } catch (error: unknown) {
    log.error('Error creating conversation', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ message: 'Internal server error' }),
    };
  }
}

/**
 * Create/Get Conversation Lambda Handler
 * Creates a new conversation with another user or returns existing one
 */

import { withAuthHandler } from '../utils/with-auth-handler';
import { requireRateLimit } from '../utils/rate-limit';
import { RATE_WINDOW_1_MIN } from '../utils/constants';
import { isValidUUID } from '../utils/security';
import { isBidirectionallyBlocked } from '../utils/block-filter';
import { requireActiveAccount, isAccountError } from '../utils/account-status';

export const handler = withAuthHandler('conversations-create', async (event, { headers, cognitoSub, profileId, db }) => {
  const rateLimitResponse = await requireRateLimit({
    prefix: 'conversation-create',
    identifier: cognitoSub,
    windowSeconds: RATE_WINDOW_1_MIN,
    maxRequests: 5,
  }, headers);
  if (rateLimitResponse) return rateLimitResponse;

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

  // Check sender account status (suspended/banned users cannot create conversations)
  const accountCheck = await requireActiveAccount(cognitoSub, headers);
  if (isAccountError(accountCheck)) return accountCheck;

  // Cannot create conversation with yourself
  if (profileId === participantId) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ message: 'Cannot create conversation with yourself' }),
    };
  }

  // Check if other participant exists and is active
  const participantResult = await db.query(
    'SELECT id, username, full_name, display_name, avatar_url, is_verified, account_type, business_name, moderation_status FROM profiles WHERE id = $1',
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

  // Prevent creating conversations with suspended/banned users
  if (otherParticipant.moderation_status === 'suspended' || otherParticipant.moderation_status === 'banned') {
    return {
      statusCode: 403,
      headers,
      body: JSON.stringify({ message: 'Cannot create conversation with this user' }),
    };
  }

  // Check if either user has blocked the other
  if (await isBidirectionallyBlocked(db, profileId, participantId)) {
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
        success: true,
        conversation: {
          ...existingConversation.rows[0],
          other_participant: {
            id: otherParticipant.id,
            username: otherParticipant.username,
            full_name: otherParticipant.full_name,
            display_name: otherParticipant.display_name,
            avatar_url: otherParticipant.avatar_url,
            is_verified: otherParticipant.is_verified,
            account_type: otherParticipant.account_type,
            business_name: otherParticipant.business_name,
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
      success: true,
      conversation: {
        ...newConversation.rows[0],
        other_participant: {
          id: otherParticipant.id,
          username: otherParticipant.username,
          full_name: otherParticipant.full_name,
          display_name: otherParticipant.display_name,
          avatar_url: otherParticipant.avatar_url,
          is_verified: otherParticipant.is_verified,
          account_type: otherParticipant.account_type,
          business_name: otherParticipant.business_name,
        },
      },
      created: true,
    }),
  };
});

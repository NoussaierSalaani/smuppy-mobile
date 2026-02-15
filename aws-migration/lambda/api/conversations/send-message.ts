/**
 * Send Message Lambda Handler
 * Sends a message in a conversation
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getPool } from '../../shared/db';
import { createHeaders } from '../utils/cors';
import { createLogger } from '../utils/logger';
import { checkRateLimit } from '../utils/rate-limit';
import { sendPushToUser } from '../services/push-notification';
import { isValidUUID } from '../utils/security';
import { requireActiveAccount, isAccountError } from '../utils/account-status';
import { filterText } from '../../shared/moderation/textFilter';
import { analyzeTextToxicity } from '../../shared/moderation/textModeration';

const log = createLogger('conversations-send-message');

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

    if (!isValidUUID(conversationId)) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ message: 'Invalid conversation ID format' }),
      };
    }

    // Parse body
    let body: Record<string, unknown>;
    try {
      body = event.body ? JSON.parse(event.body) : {};
    } catch {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ message: 'Invalid request body' }),
      };
    }
    const { content, mediaUrl, mediaType, replyToMessageId, voiceDuration } = body;

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

    // Per-conversation rate limit: 10 messages per minute per conversation
    const { allowed: convAllowed } = await checkRateLimit({
      prefix: 'send-message-conv',
      identifier: `${userId}:${conversationId}`,
      windowSeconds: 60,
      maxRequests: 10,
    });
    if (!convAllowed) {
      return {
        statusCode: 429,
        headers,
        body: JSON.stringify({ message: 'You are sending messages too quickly in this conversation.' }),
      };
    }

    // Validate optional media fields — media_type is only valid when media_url is also valid
    const ALLOWED_MEDIA_TYPES = ['image', 'video', 'audio', 'voice'];
    const validMediaUrl = mediaUrl && typeof mediaUrl === 'string' && mediaUrl.startsWith('https://')
      ? mediaUrl
      : null;
    const validMediaType = validMediaUrl && mediaType && typeof mediaType === 'string' && ALLOWED_MEDIA_TYPES.includes(mediaType)
      ? mediaType
      : null;

    // Validate voice/audio media URLs match expected S3 path pattern
    if (validMediaUrl && (validMediaType === 'audio' || validMediaType === 'voice')) {
      const VOICE_URL_PATTERN = /^https:\/\/.+\/voice-messages\/[0-9a-f-]+\/[0-9a-f-]+\/[0-9a-f-]+\.m4a$/i;
      if (!VOICE_URL_PATTERN.test(validMediaUrl)) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ message: 'Invalid voice message URL' }),
        };
      }
    }

    // Validate voice duration if provided (1–300 seconds)
    const validVoiceDuration = validMediaUrl && (validMediaType === 'audio' || validMediaType === 'voice')
      && typeof voiceDuration === 'number' && Number.isInteger(voiceDuration) && voiceDuration >= 1 && voiceDuration <= 300
      ? voiceDuration
      : null;

    // Sanitize content: strip HTML tags and control characters (preserve tab, LF, CR)
    const sanitizedContent = content.trim().replace(/<[^>]*>/g, '').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

    // Detect shared content: [shared_post:UUID] or [shared_peak:UUID]
    const SHARED_CONTENT_PATTERN = /^\[shared_(post|peak):([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\]$/i;
    const sharedMatch = sanitizedContent.match(SHARED_CONTENT_PATTERN);
    let sharedPostId: string | null = null;
    let sharedPeakId: string | null = null;
    if (sharedMatch) {
      if (sharedMatch[1] === 'post') {
        sharedPostId = sharedMatch[2];
      } else {
        sharedPeakId = sharedMatch[2];
      }
    }

    // Check account status (suspended/banned users cannot send messages)
    const accountCheck = await requireActiveAccount(userId, headers);
    if (isAccountError(accountCheck)) return accountCheck;

    // Skip moderation for pure shared content messages (only contain the share token)
    if (!sharedMatch) {
      // Moderation: wordlist filter
      const filterResult = await filterText(sanitizedContent);
      if (!filterResult.clean && (filterResult.severity === 'critical' || filterResult.severity === 'high')) {
        log.warn('DM blocked by text filter', { userId: userId.substring(0, 8) + '***', severity: filterResult.severity });
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ message: 'Your message contains content that violates our community guidelines.' }),
        };
      }

      // Moderation: Comprehend toxicity analysis
      const toxicityResult = await analyzeTextToxicity(sanitizedContent);
      if (toxicityResult.action === 'block') {
        log.warn('DM blocked by toxicity', { userId: userId.substring(0, 8) + '***', category: toxicityResult.topCategory });
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ message: 'Your message contains content that violates our community guidelines.' }),
        };
      }
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

    // SECURITY: Participant check, block check, and message insert in a single transaction
    // to prevent TOCTOU race conditions (e.g., block happening between check and insert)
    const client = await db.connect();
    let message;
    let recipientId: string;
    try {
      await client.query('BEGIN');

      // Check if user is participant in this conversation
      const conversationResult = await client.query(
        `SELECT id, participant_1_id, participant_2_id FROM conversations
         WHERE id = $1 AND (participant_1_id = $2 OR participant_2_id = $2)`,
        [conversationId, profile.id]
      );

      if (conversationResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return {
          statusCode: 404,
          headers,
          body: JSON.stringify({ message: 'Conversation not found' }),
        };
      }

      const conversation = conversationResult.rows[0];
      recipientId = conversation.participant_1_id === profile.id
        ? conversation.participant_2_id
        : conversation.participant_1_id;

      // Check recipient account is active (suspended/banned users cannot receive messages)
      const recipientCheck = await client.query(
        'SELECT moderation_status FROM profiles WHERE id = $1',
        [recipientId]
      );
      if (recipientCheck.rows.length === 0 || recipientCheck.rows[0].moderation_status === 'suspended' || recipientCheck.rows[0].moderation_status === 'banned') {
        await client.query('ROLLBACK');
        return {
          statusCode: 403,
          headers,
          body: JSON.stringify({ message: 'Cannot send message to this user' }),
        };
      }

      // Check if either user has blocked the other
      const blockCheck = await client.query(
        `SELECT 1 FROM blocked_users
         WHERE (blocker_id = $1 AND blocked_id = $2)
            OR (blocker_id = $2 AND blocked_id = $1)
         LIMIT 1`,
        [profile.id, recipientId]
      );
      if (blockCheck.rows.length > 0) {
        await client.query('ROLLBACK');
        return {
          statusCode: 403,
          headers,
          body: JSON.stringify({ message: 'Cannot send message to this user' }),
        };
      }

      // Validate replyToMessageId if provided
      let validReplyToMessageId = null;
      if (typeof replyToMessageId === 'string' && isValidUUID(replyToMessageId)) {
        // Verify the replied message exists in this conversation
        const replyCheck = await client.query(
          'SELECT 1 FROM messages WHERE id = $1 AND conversation_id = $2 LIMIT 1',
          [replyToMessageId, conversationId]
        );
        if (replyCheck.rows.length > 0) {
          validReplyToMessageId = replyToMessageId;
        }
      }

      const messageResult = await client.query(
        `INSERT INTO messages (conversation_id, sender_id, recipient_id, content, media_url, media_type, voice_duration_seconds, reply_to_message_id, shared_post_id, shared_peak_id, read, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, false, NOW())
         RETURNING id, content, media_url, media_type, voice_duration_seconds, sender_id, recipient_id, reply_to_message_id, shared_post_id, shared_peak_id, read, created_at`,
        [conversationId, profile.id, recipientId, sanitizedContent, validMediaUrl, validMediaType, validVoiceDuration, validReplyToMessageId, sharedPostId, sharedPeakId]
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

    // Send push notification to recipient (non-blocking)
    // SECURITY: Don't include full message content in push (visible on lock screen, logged by APNs/FCM)
    const displayName = profile.display_name || 'Someone';
    const pushBody = sharedPostId ? 'Shared a post with you'
      : sharedPeakId ? 'Shared a peak with you'
      : (validMediaType === 'audio' || validMediaType === 'voice') ? 'Sent a voice message'
      : validMediaUrl ? 'Sent you a photo'
      : 'Sent you a message';
    sendPushToUser(db, recipientId, {
      title: displayName,
      body: pushBody,
      data: { type: 'message', conversationId, senderId: profile.id },
    }, profile.id).catch(err => log.error('Push notification failed', err));

    return {
      statusCode: 201,
      headers,
      body: JSON.stringify({
        success: true,
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

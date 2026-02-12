/**
 * WebSocket Send Message Handler
 * Handles sending messages via WebSocket and delivers to recipient in real-time
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { ApiGatewayManagementApiClient, PostToConnectionCommand } from '@aws-sdk/client-apigatewaymanagementapi';
import { getPool } from '../shared/db';
import { createLogger } from '../api/utils/logger';
import { hasStatusCode } from '../api/utils/error-handler';
import { filterText } from '../shared/moderation/textFilter';
import { analyzeTextToxicity } from '../shared/moderation/textModeration';

const log = createLogger('websocket-send-message');

// In-memory rate limiter per connectionId (WebSocket connections are persistent)
const rateLimits = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 30; // messages per window
const RATE_WINDOW = 10000; // 10 seconds

function checkWsRateLimit(connectionId: string): boolean {
  const now = Date.now();
  const entry = rateLimits.get(connectionId);
  if (!entry || now > entry.resetAt) {
    rateLimits.set(connectionId, { count: 1, resetAt: now + RATE_WINDOW });
    return true;
  }
  entry.count++;
  return entry.count <= RATE_LIMIT;
}

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const connectionId = event.requestContext.connectionId;
  const domainName = event.requestContext.domainName;
  const stage = event.requestContext.stage;

  if (connectionId && !checkWsRateLimit(connectionId)) {
    return { statusCode: 429, body: 'Rate limit exceeded' };
  }

  try {
    const db = await getPool();

    // Get user from connection
    const connectionResult = await db.query(
      'SELECT user_id FROM websocket_connections WHERE connection_id = $1',
      [connectionId]
    );

    if (connectionResult.rows.length === 0) {
      return {
        statusCode: 401,
        body: JSON.stringify({ message: 'Connection not authenticated' }),
      };
    }

    const senderId = connectionResult.rows[0].user_id;

    // Check account status (suspended/banned users cannot send messages)
    const statusResult = await db.query(
      'SELECT moderation_status FROM profiles WHERE id = $1',
      [senderId]
    );
    const moderationStatus = statusResult.rows[0]?.moderation_status || 'active';
    if (moderationStatus === 'suspended' || moderationStatus === 'banned') {
      return {
        statusCode: 403,
        body: JSON.stringify({ message: 'Your account is restricted. You cannot send messages.' }),
      };
    }

    // Parse message body
    const body = event.body ? JSON.parse(event.body) : {};
    const { action, conversationId, content } = body;

    if (action !== 'sendMessage') {
      return {
        statusCode: 400,
        body: JSON.stringify({ message: 'Invalid action' }),
      };
    }

    if (!conversationId || !content) {
      return {
        statusCode: 400,
        body: JSON.stringify({ message: 'conversationId and content are required' }),
      };
    }

    // Validate UUID
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(conversationId)) {
      return {
        statusCode: 400,
        body: JSON.stringify({ message: 'Invalid conversationId format' }),
      };
    }

    // Check if user is participant and get other participant
    const conversationResult = await db.query(
      `SELECT id, participant_1_id, participant_2_id FROM conversations
       WHERE id = $1 AND (participant_1_id = $2 OR participant_2_id = $2)`,
      [conversationId, senderId]
    );

    if (conversationResult.rows.length === 0) {
      return {
        statusCode: 404,
        body: JSON.stringify({ message: 'Conversation not found' }),
      };
    }

    const conversation = conversationResult.rows[0];
    const recipientId = conversation.participant_1_id === senderId
      ? conversation.participant_2_id
      : conversation.participant_1_id;

    // Get sender profile
    const senderResult = await db.query(
      'SELECT id, username, display_name, avatar_url FROM profiles WHERE id = $1',
      [senderId]
    );
    const sender = senderResult.rows[0];

    // Sanitize message content: strip HTML tags and control characters
    const sanitizedContent = content
      .substring(0, 5000)
      .replace(/<[^>]*>/g, '')  // Strip HTML tags
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, ''); // Strip control chars

    if (!sanitizedContent.trim()) {
      return {
        statusCode: 400,
        body: JSON.stringify({ message: 'Message content cannot be empty' }),
      };
    }

    // Moderation: wordlist filter
    const filterResult = await filterText(sanitizedContent);
    if (!filterResult.clean && (filterResult.severity === 'critical' || filterResult.severity === 'high')) {
      log.warn('WS DM blocked by text filter', { senderId: senderId.substring(0, 8) + '***', severity: filterResult.severity });
      return {
        statusCode: 400,
        body: JSON.stringify({ message: 'Your message contains content that violates our community guidelines.' }),
      };
    }

    // Moderation: Comprehend toxicity analysis
    const toxicityResult = await analyzeTextToxicity(sanitizedContent);
    if (toxicityResult.action === 'block') {
      log.warn('WS DM blocked by toxicity', { senderId: senderId.substring(0, 8) + '***', category: toxicityResult.topCategory });
      return {
        statusCode: 400,
        body: JSON.stringify({ message: 'Your message contains content that violates our community guidelines.' }),
      };
    }

    // Insert message + update conversation in a transaction
    const client = await db.connect();
    let message;
    try {
      await client.query('BEGIN');

      const messageResult = await client.query(
        `INSERT INTO messages (conversation_id, sender_id, recipient_id, content, read, created_at)
         VALUES ($1, $2, $3, $4, false, NOW())
         RETURNING id, content, sender_id, recipient_id, read, created_at`,
        [conversationId, senderId, recipientId, sanitizedContent]
      );

      message = {
        ...messageResult.rows[0],
        sender: {
          id: sender.id,
          username: sender.username,
          display_name: sender.display_name,
          avatar_url: sender.avatar_url,
        },
      };

      await client.query(
        'UPDATE conversations SET last_message_at = NOW(), updated_at = NOW() WHERE id = $1',
        [conversationId]
      );

      await client.query('COMMIT');
    } catch (txError) {
      await client.query('ROLLBACK');
      throw txError;
    } finally {
      client.release();
    }

    // Get recipient's active connections
    const recipientConnections = await db.query(
      'SELECT connection_id FROM websocket_connections WHERE user_id = $1',
      [recipientId]
    );

    // Create API Gateway Management API client
    const apiClient = new ApiGatewayManagementApiClient({
      endpoint: `https://${domainName}/${stage}`,
    });

    const messagePayload = JSON.stringify({
      type: 'newMessage',
      conversationId,
      message,
    });

    // Send to all recipient's connections
    const sendPromises = recipientConnections.rows.map(async (conn) => {
      try {
        await apiClient.send(new PostToConnectionCommand({
          ConnectionId: conn.connection_id,
          Data: Buffer.from(messagePayload),
        }));
      } catch (err: unknown) {
        // If connection is stale, remove it
        if (hasStatusCode(err) && err.statusCode === 410) {
          await db.query(
            'DELETE FROM websocket_connections WHERE connection_id = $1',
            [conn.connection_id]
          );
        }
        log.error('Failed to send to connection', err, { connectionId: conn.connection_id });
      }
    });

    await Promise.all(sendPromises);

    // Send confirmation back to sender
    return {
      statusCode: 200,
      body: JSON.stringify({
        type: 'messageSent',
        message,
      }),
    };
  } catch (error: unknown) {
    log.error('Error in WebSocket sendMessage', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ message: 'Internal server error' }),
    };
  }
}

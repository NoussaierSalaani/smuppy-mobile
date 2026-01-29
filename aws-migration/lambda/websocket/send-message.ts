/**
 * WebSocket Send Message Handler
 * Handles sending messages via WebSocket and delivers to recipient in real-time
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { ApiGatewayManagementApiClient, PostToConnectionCommand } from '@aws-sdk/client-apigatewaymanagementapi';
import { getPool } from '../shared/db';
import { createLogger } from '../api/utils/logger';

const log = createLogger('websocket-send-message');

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const connectionId = event.requestContext.connectionId;
  const domainName = event.requestContext.domainName;
  const stage = event.requestContext.stage;

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

    // Insert message
    const messageResult = await db.query(
      `INSERT INTO messages (conversation_id, sender_id, content, read, created_at)
       VALUES ($1, $2, $3, false, NOW())
       RETURNING id, content, sender_id, read, created_at`,
      [conversationId, senderId, content.substring(0, 5000)]
    );

    const message = {
      ...messageResult.rows[0],
      sender: {
        id: sender.id,
        username: sender.username,
        display_name: sender.display_name,
        avatar_url: sender.avatar_url,
      },
    };

    // Update conversation's updated_at
    await db.query(
      'UPDATE conversations SET updated_at = NOW() WHERE id = $1',
      [conversationId]
    );

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
      } catch (err: any) {
        // If connection is stale, remove it
        if (err.statusCode === 410) {
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
  } catch (error: any) {
    log.error('Error in WebSocket sendMessage', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ message: 'Internal server error' }),
    };
  }
}

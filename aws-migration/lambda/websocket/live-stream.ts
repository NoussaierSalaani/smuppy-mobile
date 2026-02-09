/**
 * WebSocket Live Stream Handler
 * Handles live streaming comments, reactions, and viewer management
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { ApiGatewayManagementApiClient, PostToConnectionCommand } from '@aws-sdk/client-apigatewaymanagementapi';
import { getPool } from '../shared/db';
import type { Pool } from 'pg';
import { createLogger } from '../api/utils/logger';
import { hasStatusCode } from '../api/utils/error-handler';
import { filterText } from '../shared/moderation/textFilter';
import { analyzeTextToxicity } from '../shared/moderation/textModeration';

const log = createLogger('websocket-live-stream');

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

interface LiveStreamAction {
  action: 'joinLive' | 'leaveLive' | 'liveComment' | 'liveReaction';
  channelName: string;
  content?: string;
  emoji?: string;
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

    const userId = connectionResult.rows[0].user_id;

    // Check account status (suspended/banned users cannot participate in live streams)
    const statusResult = await db.query(
      'SELECT moderation_status FROM profiles WHERE id = $1',
      [userId]
    );
    const moderationStatus = statusResult.rows[0]?.moderation_status || 'active';
    if (moderationStatus === 'suspended' || moderationStatus === 'banned') {
      return {
        statusCode: 403,
        body: JSON.stringify({ message: 'Your account is restricted.' }),
      };
    }

    // Parse body
    const body: LiveStreamAction = event.body ? JSON.parse(event.body) : {};
    const { action, channelName, content, emoji } = body;

    if (!channelName) {
      return {
        statusCode: 400,
        body: JSON.stringify({ message: 'channelName is required' }),
      };
    }

    // Get user profile
    const userResult = await db.query(
      'SELECT id, username, display_name, avatar_url FROM profiles WHERE id = $1',
      [userId]
    );
    const user = userResult.rows[0];

    // Create API Gateway Management API client
    const apiClient = new ApiGatewayManagementApiClient({
      endpoint: `https://${domainName}/${stage}`,
    });

    switch (action) {
      case 'joinLive': {
        // Add user to live stream viewers
        await db.query(
          `INSERT INTO live_stream_viewers (channel_name, user_id, connection_id, joined_at)
           VALUES ($1, $2, $3, NOW())
           ON CONFLICT (channel_name, user_id) DO UPDATE SET connection_id = $3, joined_at = NOW()`,
          [channelName, userId, connectionId]
        );

        // Get current viewer count
        const viewerCountResult = await db.query(
          'SELECT COUNT(*) as count FROM live_stream_viewers WHERE channel_name = $1',
          [channelName]
        );
        const viewerCount = parseInt(viewerCountResult.rows[0].count);

        // Broadcast join event to all viewers
        await broadcastToChannel(db, apiClient, channelName, {
          type: 'viewerJoined',
          channelName,
          user: {
            id: user.id,
            username: user.username,
            displayName: user.display_name,
            avatarUrl: user.avatar_url,
          },
          viewerCount,
        });

        return {
          statusCode: 200,
          body: JSON.stringify({ type: 'joinedLive', viewerCount }),
        };
      }

      case 'leaveLive': {
        // Remove user from live stream viewers
        await db.query(
          'DELETE FROM live_stream_viewers WHERE channel_name = $1 AND user_id = $2',
          [channelName, userId]
        );

        // Get updated viewer count
        const viewerCountResult = await db.query(
          'SELECT COUNT(*) as count FROM live_stream_viewers WHERE channel_name = $1',
          [channelName]
        );
        const viewerCount = parseInt(viewerCountResult.rows[0].count);

        // Broadcast leave event
        await broadcastToChannel(db, apiClient, channelName, {
          type: 'viewerLeft',
          channelName,
          userId,
          viewerCount,
        });

        return {
          statusCode: 200,
          body: JSON.stringify({ type: 'leftLive' }),
        };
      }

      case 'liveComment': {
        if (!content || content.trim().length === 0) {
          return {
            statusCode: 400,
            body: JSON.stringify({ message: 'content is required for comments' }),
          };
        }

        // Sanitize: strip HTML tags and control characters, limit length
        const sanitizedComment = content
          .substring(0, 500)
          .replace(/<[^>]*>/g, '')
          .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
          .trim();

        if (!sanitizedComment) {
          return {
            statusCode: 400,
            body: JSON.stringify({ message: 'Comment cannot be empty' }),
          };
        }

        // Moderation: wordlist filter
        const filterResult = await filterText(sanitizedComment);
        if (!filterResult.clean && (filterResult.severity === 'critical' || filterResult.severity === 'high')) {
          log.warn('Live comment blocked by filter', { userId: userId.substring(0, 8) + '***' });
          return {
            statusCode: 400,
            body: JSON.stringify({ message: 'Your comment violates community guidelines.' }),
          };
        }

        // Moderation: Comprehend toxicity analysis
        const toxicityResult = await analyzeTextToxicity(sanitizedComment);
        if (toxicityResult.action === 'block') {
          log.warn('Live comment blocked by toxicity', { userId: userId.substring(0, 8) + '***', category: toxicityResult.topCategory });
          return {
            statusCode: 400,
            body: JSON.stringify({ message: 'Your comment violates community guidelines.' }),
          };
        }

        const comment = {
          id: `${Date.now()}-${userId}`,
          user: {
            id: user.id,
            username: user.username,
            displayName: user.display_name,
            avatarUrl: user.avatar_url,
          },
          content: sanitizedComment,
          timestamp: new Date().toISOString(),
        };

        // Broadcast comment to all viewers
        await broadcastToChannel(db, apiClient, channelName, {
          type: 'liveComment',
          channelName,
          comment,
        });

        return {
          statusCode: 200,
          body: JSON.stringify({ type: 'commentSent', comment }),
        };
      }

      case 'liveReaction': {
        if (!emoji) {
          return {
            statusCode: 400,
            body: JSON.stringify({ message: 'emoji is required for reactions' }),
          };
        }

        // Validate emoji (simple check)
        const allowedEmojis = ['❤️', '🔥', '💪', '👏', '😍', '🎉', '💯', '🙌', '⚡', '🏆'];
        if (!allowedEmojis.includes(emoji)) {
          return {
            statusCode: 400,
            body: JSON.stringify({ message: 'Invalid emoji' }),
          };
        }

        const reaction = {
          id: `${Date.now()}-${userId}`,
          userId: user.id,
          username: user.username,
          emoji,
          timestamp: new Date().toISOString(),
        };

        // Broadcast reaction to all viewers
        await broadcastToChannel(db, apiClient, channelName, {
          type: 'liveReaction',
          channelName,
          reaction,
        });

        return {
          statusCode: 200,
          body: JSON.stringify({ type: 'reactionSent', reaction }),
        };
      }

      default:
        return {
          statusCode: 400,
          body: JSON.stringify({ message: 'Invalid action' }),
        };
    }
  } catch (error: unknown) {
    log.error('Error in WebSocket live stream handler', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ message: 'Internal server error' }),
    };
  }
}

/**
 * Broadcast a message to all viewers in a live stream channel
 */
async function broadcastToChannel(
  db: Pool,
  apiClient: ApiGatewayManagementApiClient,
  channelName: string,
  payload: object
): Promise<void> {
  // Get all connections for this channel
  const viewersResult = await db.query(
    'SELECT connection_id FROM live_stream_viewers WHERE channel_name = $1',
    [channelName]
  );

  const messagePayload = JSON.stringify(payload);

  // Send to all connections
  const sendPromises = viewersResult.rows.map(async (viewer: { connection_id: string }) => {
    try {
      await apiClient.send(new PostToConnectionCommand({
        ConnectionId: viewer.connection_id,
        Data: Buffer.from(messagePayload),
      }));
    } catch (err: unknown) {
      // If connection is stale, remove it
      if (hasStatusCode(err) && err.statusCode === 410) {
        await db.query(
          'DELETE FROM live_stream_viewers WHERE connection_id = $1',
          [viewer.connection_id]
        );
      }
    }
  });

  await Promise.all(sendPromises);
}

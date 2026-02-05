/**
 * List Notifications Lambda Handler
 * Returns user's notifications with pagination
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getReaderPool, SqlParam } from '../../shared/db';
import { createHeaders } from '../utils/cors';
import { createLogger } from '../utils/logger';

const log = createLogger('notifications-list');

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

    // Pagination params
    const limit = Math.min(parseInt(event.queryStringParameters?.limit || '20'), 50);
    const cursor = event.queryStringParameters?.cursor;
    const unreadOnly = event.queryStringParameters?.unread === 'true';

    const db = await getReaderPool();

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

    // Build query — join with profiles to enrich actor user data
    // Actor ID is stored in the JSONB data column under different keys
    // Use regex guard to avoid ::uuid cast errors on malformed data
    const UUID_REGEX = `'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'`;
    let query = `
      SELECT
        n.id,
        n.type,
        n.title,
        n.body,
        n.data,
        n.read,
        n.created_at,
        p.id AS actor_id,
        p.username AS actor_username,
        p.full_name AS actor_full_name,
        p.avatar_url AS actor_avatar_url,
        p.is_verified AS actor_is_verified,
        p.account_type AS actor_account_type,
        CASE WHEN f.id IS NOT NULL THEN true ELSE false END AS is_following_actor
      FROM notifications n
      LEFT JOIN profiles p ON p.id = COALESCE(
        CASE WHEN n.data->>'followerId' ~ ${UUID_REGEX} THEN (n.data->>'followerId')::uuid END,
        CASE WHEN n.data->>'likerId' ~ ${UUID_REGEX} THEN (n.data->>'likerId')::uuid END,
        CASE WHEN n.data->>'commenterId' ~ ${UUID_REGEX} THEN (n.data->>'commenterId')::uuid END,
        CASE WHEN n.data->>'requesterId' ~ ${UUID_REGEX} THEN (n.data->>'requesterId')::uuid END,
        CASE WHEN n.data->>'senderId' ~ ${UUID_REGEX} THEN (n.data->>'senderId')::uuid END
      )
      LEFT JOIN follows f ON f.follower_id = $1 AND f.following_id = p.id AND f.status = 'accepted'
      WHERE n.user_id = $1
    `;

    const params: SqlParam[] = [profileId];
    let paramIndex = 2;

    // Filter unread only
    if (unreadOnly) {
      query += ` AND n.read = false`;
    }

    // Cursor pagination
    if (cursor) {
      query += ` AND n.created_at < $${paramIndex}`;
      params.push(new Date(parseInt(cursor)));
      paramIndex++;
    }

    query += ` ORDER BY n.created_at DESC LIMIT $${paramIndex}`;
    params.push(limit + 1);

    const result = await db.query(query, params);

    // Check if there are more results (fetched limit+1 to detect hasMore)
    const hasMore = result.rows.length > limit;
    const notifications = result.rows.slice(0, limit);

    // Format response with enriched user data (spread to avoid mutating DB row)
    const formattedNotifications = notifications.map((n: Record<string, unknown>) => {
      const enrichedData: Record<string, unknown> = { ...(n.data || {}) };

      // Inject actor user info if we found a matching profile
      if (n.actor_id) {
        enrichedData.user = {
          id: n.actor_id,
          username: n.actor_username,
          name: n.actor_full_name || n.actor_username,
          avatar: n.actor_avatar_url,
          isVerified: n.actor_is_verified || false,
          accountType: n.actor_account_type,
        };
        enrichedData.isFollowing = n.is_following_actor || false;
      }

      return {
        id: n.id,
        type: n.type,
        title: n.title,
        body: n.body,
        data: enrichedData,
        read: n.read,
        createdAt: n.created_at,
      };
    });

    // Generate next cursor
    const nextCursor = hasMore && notifications.length > 0
      ? new Date(notifications[notifications.length - 1].created_at).getTime().toString()
      : null;

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        data: formattedNotifications,
        nextCursor,
        hasMore,
      }),
    };
  } catch (error: unknown) {
    log.error('Error listing notifications', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ message: 'Internal server error' }),
    };
  }
}

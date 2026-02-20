/**
 * List Notifications Lambda Handler
 * Returns user's notifications with pagination
 */

import { SqlParam } from '../../shared/db';
import { withNotificationContext } from '../utils/create-notification-handler';
import { RATE_WINDOW_1_MIN } from '../utils/constants';
import { blockExclusionSQL, muteExclusionSQL } from '../utils/block-filter';

export const handler = withNotificationContext(
  {
    loggerName: 'notifications-list',
    rateLimitPrefix: 'notifications-list',
    maxRequests: 60,
    windowSeconds: RATE_WINDOW_1_MIN,
    errorLabel: 'Error listing notifications',
  },
  async ({ profileId, db, headers, event }) => {
    // Pagination params
    const limit = Math.min(Number.parseInt(event.queryStringParameters?.limit || '20'), 50);
    const cursor = event.queryStringParameters?.cursor;
    const unreadOnly = event.queryStringParameters?.unread === 'true';

    // Build query — join with profiles to enrich actor user data
    // Actor ID is stored in the JSONB data column under different keys
    // UUID regex is a constant SQL pattern (not user input) used to guard ::uuid casts
    // against malformed JSONB data. Kept as a SQL literal since it's a hardcoded constant.
    const UUID_PATTERN = `'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'`;
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
        p.business_name AS actor_business_name,
        CASE WHEN f.id IS NOT NULL THEN true ELSE false END AS is_following_actor
      FROM notifications n
      LEFT JOIN profiles p ON p.id = COALESCE(
        CASE WHEN n.data->>'followerId' ~ ${UUID_PATTERN} THEN (n.data->>'followerId')::uuid END,
        CASE WHEN n.data->>'likerId' ~ ${UUID_PATTERN} THEN (n.data->>'likerId')::uuid END,
        CASE WHEN n.data->>'commenterId' ~ ${UUID_PATTERN} THEN (n.data->>'commenterId')::uuid END,
        CASE WHEN n.data->>'requesterId' ~ ${UUID_PATTERN} THEN (n.data->>'requesterId')::uuid END,
        CASE WHEN n.data->>'senderId' ~ ${UUID_PATTERN} THEN (n.data->>'senderId')::uuid END,
        CASE WHEN n.data->>'authorId' ~ ${UUID_PATTERN} THEN (n.data->>'authorId')::uuid END,
        CASE WHEN n.data->>'taggedById' ~ ${UUID_PATTERN} THEN (n.data->>'taggedById')::uuid END,
        CASE WHEN n.data->>'fanId' ~ ${UUID_PATTERN} THEN (n.data->>'fanId')::uuid END,
        CASE WHEN n.data->>'creatorId' ~ ${UUID_PATTERN} THEN (n.data->>'creatorId')::uuid END,
        CASE WHEN n.data->>'buyerId' ~ ${UUID_PATTERN} THEN (n.data->>'buyerId')::uuid END,
        CASE WHEN n.data->>'userId' ~ ${UUID_PATTERN} THEN (n.data->>'userId')::uuid END,
        CASE WHEN n.data->>'actor_id' ~ ${UUID_PATTERN} THEN (n.data->>'actor_id')::uuid END
      )
      LEFT JOIN follows f ON f.follower_id = $1 AND f.following_id = p.id AND f.status = 'accepted'
      WHERE n.user_id = $1
        -- Exclude notifications from blocked users (bidirectional) or muted users
        AND (
          p.id IS NULL
          OR (
            ${blockExclusionSQL(1, 'p.id').trimStart().replace(/^AND /, '')}
            ${muteExclusionSQL(1, 'p.id')}
          )
        )
        -- Exclude orphaned notifications whose referenced post/peak no longer exists
        AND (
          n.data->>'postId' IS NULL
          OR NOT (n.data->>'postId' ~ ${UUID_PATTERN})
          OR EXISTS (SELECT 1 FROM posts WHERE id = (n.data->>'postId')::uuid)
        )
        AND (
          n.data->>'peakId' IS NULL
          OR NOT (n.data->>'peakId' ~ ${UUID_PATTERN})
          OR EXISTS (SELECT 1 FROM peaks WHERE id = (n.data->>'peakId')::uuid)
        )
        AND (
          n.data->>'commentId' IS NULL
          OR NOT (n.data->>'commentId' ~ ${UUID_PATTERN})
          OR EXISTS (SELECT 1 FROM comments WHERE id = (n.data->>'commentId')::uuid)
          OR EXISTS (SELECT 1 FROM peak_comments WHERE id = (n.data->>'commentId')::uuid)
        )
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
      params.push(new Date(Number.parseInt(cursor)));
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
      const dataObj = (n.data as Record<string, unknown> | null) || {};
      const enrichedData: Record<string, unknown> = { ...dataObj };

      // Inject actor user info if we found a matching profile
      if (n.actor_id) {
        enrichedData.user = {
          id: n.actor_id,
          username: n.actor_username,
          name: n.actor_full_name || 'Someone',
          avatar: n.actor_avatar_url,
          isVerified: n.actor_is_verified || false,
          accountType: n.actor_account_type,
          businessName: n.actor_business_name,
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
      ? new Date(notifications.at(-1)!.created_at).getTime().toString()
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
  },
);

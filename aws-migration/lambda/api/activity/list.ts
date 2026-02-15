/**
 * Activity History Lambda Handler
 * Returns the user's own actions (likes, follows, comments) with cursor pagination
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getReaderPool, SqlParam } from '../../shared/db';
import { createHeaders } from '../utils/cors';
import { createLogger } from '../utils/logger';
import { checkRateLimit } from '../utils/rate-limit';

const log = createLogger('activity-list');

const VALID_TYPES = new Set(['post_like', 'peak_like', 'follow', 'comment', 'peak_comment']);

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

    const { allowed } = await checkRateLimit({ prefix: 'activity-list', identifier: userId, windowSeconds: 60, maxRequests: 60 });
    if (!allowed) {
      return {
        statusCode: 429,
        headers,
        body: JSON.stringify({ message: 'Too many requests' }),
      };
    }

    // Pagination params
    const limit = Math.min(parseInt(event.queryStringParameters?.limit || '20', 10), 50);
    const cursor = event.queryStringParameters?.cursor;
    const typeFilter = event.queryStringParameters?.type;

    // Validate type filter
    if (typeFilter && !VALID_TYPES.has(typeFilter)) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ message: 'Invalid type filter' }),
      };
    }

    const db = await getReaderPool();

    // Get user's profile ID
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

    // Build UNION ALL query for the user's own activity
    const subqueries: string[] = [];

    // BUG-2026-02-15: Add inner LIMIT to each subquery to prevent full-table materialization
    const innerLimit = limit + 1;

    if (!typeFilter || typeFilter === 'post_like') {
      subqueries.push(`
        SELECT 'post_like' AS activity_type, l.created_at,
          json_build_object('postId', p.id, 'mediaUrl', COALESCE(p.media_urls[1], p.media_url), 'content', left(p.content, 100)) AS target_data,
          json_build_object('id', pr.id, 'username', pr.username, 'fullName', pr.full_name, 'avatarUrl', pr.avatar_url) AS target_user
        FROM likes l
        JOIN posts p ON l.post_id = p.id
        JOIN profiles pr ON p.author_id = pr.id
        WHERE l.user_id = $1
        ORDER BY l.created_at DESC LIMIT ${innerLimit}
      `);
    }

    if (!typeFilter || typeFilter === 'peak_like') {
      subqueries.push(`
        SELECT 'peak_like' AS activity_type, pl.created_at,
          json_build_object('peakId', pk.id, 'thumbnailUrl', pk.thumbnail_url) AS target_data,
          json_build_object('id', pr.id, 'username', pr.username, 'fullName', pr.full_name, 'avatarUrl', pr.avatar_url) AS target_user
        FROM peak_likes pl
        JOIN peaks pk ON pl.peak_id = pk.id
        JOIN profiles pr ON pk.author_id = pr.id
        WHERE pl.user_id = $1
        ORDER BY pl.created_at DESC LIMIT ${innerLimit}
      `);
    }

    if (!typeFilter || typeFilter === 'follow') {
      subqueries.push(`
        SELECT 'follow' AS activity_type, f.created_at,
          NULL::json AS target_data,
          json_build_object('id', pr.id, 'username', pr.username, 'fullName', pr.full_name, 'avatarUrl', pr.avatar_url) AS target_user
        FROM follows f
        JOIN profiles pr ON f.following_id = pr.id
        WHERE f.follower_id = $1 AND f.status = 'accepted'
        ORDER BY f.created_at DESC LIMIT ${innerLimit}
      `);
    }

    if (!typeFilter || typeFilter === 'comment') {
      subqueries.push(`
        SELECT 'comment' AS activity_type, c.created_at,
          json_build_object('postId', c.post_id, 'text', left(c.text, 100)) AS target_data,
          json_build_object('id', pr.id, 'username', pr.username, 'fullName', pr.full_name, 'avatarUrl', pr.avatar_url) AS target_user
        FROM comments c
        JOIN posts p ON c.post_id = p.id
        JOIN profiles pr ON p.author_id = pr.id
        WHERE c.user_id = $1
        ORDER BY c.created_at DESC LIMIT ${innerLimit}
      `);
    }

    if (!typeFilter || typeFilter === 'peak_comment') {
      subqueries.push(`
        SELECT 'peak_comment' AS activity_type, pc.created_at,
          json_build_object('peakId', pc.peak_id, 'text', left(pc.text, 100)) AS target_data,
          json_build_object('id', pr.id, 'username', pr.username, 'fullName', pr.full_name, 'avatarUrl', pr.avatar_url) AS target_user
        FROM peak_comments pc
        JOIN peaks pk ON pc.peak_id = pk.id
        JOIN profiles pr ON pk.author_id = pr.id
        WHERE pc.user_id = $1
        ORDER BY pc.created_at DESC LIMIT ${innerLimit}
      `);
    }

    if (subqueries.length === 0) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ data: [], nextCursor: null, hasMore: false }),
      };
    }

    const params: SqlParam[] = [profileId];
    let paramIndex = 2;

    let query = `SELECT activity_type, created_at, target_data, target_user FROM (${subqueries.join(' UNION ALL ')}) AS activity`;

    // Cursor pagination
    if (cursor) {
      query += ` WHERE created_at < $${paramIndex}`;
      params.push(new Date(parseInt(cursor, 10)));
      paramIndex++;
    }

    query += ` ORDER BY created_at DESC LIMIT $${paramIndex}`;
    params.push(limit + 1);

    const result = await db.query(query, params);

    const hasMore = result.rows.length > limit;
    const activities = result.rows.slice(0, limit);

    // Format response — map snake_case DB to camelCase API
    const formattedActivities = activities.map((row: Record<string, unknown>) => ({
      activityType: row.activity_type,
      createdAt: row.created_at,
      targetData: row.target_data || null,
      targetUser: row.target_user,
    }));

    const nextCursor = hasMore && activities.length > 0
      ? new Date(activities[activities.length - 1].created_at as string).getTime().toString()
      : null;

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        data: formattedActivities,
        nextCursor,
        hasMore,
      }),
    };
  } catch (error: unknown) {
    log.error('Error listing activity', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ message: 'Internal server error' }),
    };
  }
}

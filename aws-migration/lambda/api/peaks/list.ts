/**
 * List Peaks Lambda Handler
 * Returns peaks (short videos) with pagination
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getPool, SqlParam } from '../../shared/db';
import { createHeaders } from '../utils/cors';
import { createLogger } from '../utils/logger';

const log = createLogger('peaks-list');

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const headers = createHeaders(event);

  try {
    // Get current user if authenticated (for isLiked status)
    const userId = event.requestContext.authorizer?.claims?.sub;

    // Pagination params
    const limit = Math.min(parseInt(event.queryStringParameters?.limit || '20'), 50);
    const cursor = event.queryStringParameters?.cursor;
    const authorId = event.queryStringParameters?.authorId;

    const db = await getPool();

    // Get current user's profile ID if authenticated (check both id and cognito_sub for consistency)
    let currentProfileId: string | null = null;
    if (userId) {
      const userResult = await db.query(
        'SELECT id FROM profiles WHERE cognito_sub = $1',
        [userId]
      );
      if (userResult.rows.length > 0) {
        currentProfileId = userResult.rows[0].id;
      }
    }

    // Build query
    let query = `
      SELECT
        pk.id,
        pk.author_id,
        pk.video_url,
        pk.thumbnail_url,
        pk.caption,
        pk.duration,
        pk.likes_count,
        pk.comments_count,
        pk.views_count,
        pk.created_at,
        p.username as author_username,
        p.full_name as author_full_name,
        p.avatar_url as author_avatar_url,
        p.is_verified as author_is_verified,
        p.account_type as author_account_type
    `;

    // Add isLiked subquery if user is authenticated
    if (currentProfileId) {
      query += `,
        EXISTS(
          SELECT 1 FROM peak_likes pl
          WHERE pl.peak_id = pk.id AND pl.user_id = $1
        ) as is_liked
      `;
    }

    query += `
      FROM peaks pk
      JOIN profiles p ON pk.author_id = p.id
      WHERE 1=1
    `;

    const params: SqlParam[] = currentProfileId ? [currentProfileId] : [];
    let paramIndex = currentProfileId ? 2 : 1;

    // Filter by author if provided
    if (authorId) {
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (uuidRegex.test(authorId)) {
        query += ` AND pk.author_id = $${paramIndex}`;
        params.push(authorId);
        paramIndex++;
      }
    }

    // Cursor pagination
    if (cursor) {
      query += ` AND pk.created_at < $${paramIndex}`;
      params.push(new Date(parseInt(cursor)));
      paramIndex++;
    }

    query += ` ORDER BY pk.created_at DESC LIMIT $${paramIndex}`;
    params.push(limit + 1);

    const result = await db.query(query, params);

    // Check if there are more results
    const hasMore = result.rows.length > limit;
    const peaks = hasMore ? result.rows.slice(0, -1) : result.rows;

    // Format response
    const formattedPeaks = peaks.map(peak => ({
      id: peak.id,
      videoUrl: peak.video_url,
      thumbnailUrl: peak.thumbnail_url,
      caption: peak.caption,
      duration: peak.duration,
      likesCount: peak.likes_count,
      commentsCount: peak.comments_count,
      viewsCount: peak.views_count,
      createdAt: peak.created_at,
      isLiked: currentProfileId ? peak.is_liked : false,
      author: {
        id: peak.author_id,
        username: peak.author_username,
        fullName: peak.author_full_name,
        avatarUrl: peak.author_avatar_url,
        isVerified: peak.author_is_verified || false,
        accountType: peak.author_account_type,
      },
    }));

    // Generate next cursor
    const nextCursor = hasMore && peaks.length > 0
      ? new Date(peaks[peaks.length - 1].created_at).getTime().toString()
      : null;

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        peaks: formattedPeaks,
        cursor: nextCursor,
        hasMore,
      }),
    };
  } catch (error: unknown) {
    log.error('Error listing peaks', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ message: 'Internal server error' }),
    };
  }
}

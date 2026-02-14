/**
 * Get Discover Feed Lambda Handler
 * Retrieves posts from non-followed users, ranked by engagement
 * Optionally filtered by interests/hashtags
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getReaderPool, SqlParam } from '../../shared/db';
import { createHeaders } from '../utils/cors';
import { createLogger } from '../utils/logger';

const log = createLogger('feed-discover');

const MAX_INTERESTS = 10;

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const headers = createHeaders(event);

  try {
    const cognitoSub = event.requestContext.authorizer?.claims?.sub;

    const limit = Math.min(parseInt(event.queryStringParameters?.limit || '20', 10), 50);
    // Discover feed uses offset-based pagination (engagement-ranked feeds can't use cursor on created_at)
    // Accept both ?cursor= (offset encoded) and ?page= for backward compatibility
    const cursorParam = event.queryStringParameters?.cursor;
    const offset = cursorParam ? parseInt(cursorParam, 10) : (() => {
      const page = Math.max(parseInt(event.queryStringParameters?.page || '1', 10), 1);
      return (page - 1) * limit;
    })();

    const interestsParam = event.queryStringParameters?.interests;
    const interests = interestsParam
      ? interestsParam.split(',').map(i => i.trim().toLowerCase()).filter(Boolean).slice(0, MAX_INTERESTS)
      : [];

    const db = await getReaderPool();

    let userId: string | null = null;

    if (cognitoSub) {
      const userResult = await db.query(
        'SELECT id FROM profiles WHERE cognito_sub = $1',
        [cognitoSub]
      );
      if (userResult.rows.length > 0) {
        userId = userResult.rows[0].id;
      }
    }

    const params: SqlParam[] = [];
    let paramIndex = 1;
    let userIdParamIndex: number | null = null;

    // Build WHERE clauses
    const whereClauses: string[] = [];

    if (userId) {
      params.push(userId);
      userIdParamIndex = paramIndex;
      whereClauses.push(
        `p.author_id NOT IN (SELECT following_id FROM follows WHERE follower_id = $${paramIndex} AND status = 'accepted')`
      );
      whereClauses.push(`p.author_id != $${paramIndex}`);
      // Exclude posts from users the current user has blocked
      whereClauses.push(
        `NOT EXISTS (SELECT 1 FROM blocked_users WHERE blocker_id = $${paramIndex} AND blocked_id = p.author_id)`
      );
      paramIndex++;
    }

    whereClauses.push(`p.visibility = 'public'`);
    whereClauses.push(`pr.moderation_status NOT IN ('banned', 'shadow_banned')`);

    if (interests.length > 0) {
      params.push(interests);
      whereClauses.push(`p.tags && $${paramIndex}::text[]`);
      paramIndex++;
    }

    const whereClause = whereClauses.length > 0 ? 'WHERE ' + whereClauses.join(' AND ') : '';

    // Build is_liked/is_saved subqueries using correct parameter index
    let isLikedExpr = 'false as is_liked';
    let isSavedExpr = 'false as is_saved';

    if (userId && userIdParamIndex !== null) {
      isLikedExpr = `EXISTS(SELECT 1 FROM likes l WHERE l.post_id = p.id AND l.user_id = $${userIdParamIndex}) as is_liked`;
      isSavedExpr = `EXISTS(SELECT 1 FROM saved_posts sp WHERE sp.post_id = p.id AND sp.user_id = $${userIdParamIndex}) as is_saved`;
    }

    params.push(limit + 1); // Fetch one extra to check hasMore
    const limitParam = paramIndex;
    paramIndex++;

    params.push(offset);
    const offsetParam = paramIndex;

    const result = await db.query(
      `SELECT p.id, p.author_id, p.content, p.media_urls, p.media_type, p.tags,
              p.likes_count, p.comments_count, p.created_at,
              pr.id as profile_id, pr.username, pr.full_name, pr.display_name, pr.avatar_url, pr.is_verified, pr.account_type, pr.business_name,
              ${isLikedExpr},
              ${isSavedExpr}
       FROM posts p
       JOIN profiles pr ON p.author_id = pr.id
       ${whereClause}
       ORDER BY (p.likes_count * 2 + p.comments_count) DESC, p.created_at DESC
       LIMIT $${limitParam} OFFSET $${offsetParam}`,
      params
    );

    const hasMore = result.rows.length > limit;
    const rows = result.rows.slice(0, limit);

    const data = rows.map((row: Record<string, unknown>) => ({
      id: row.id,
      authorId: row.author_id,
      content: row.content,
      mediaUrls: row.media_urls || [],
      mediaType: row.media_type,
      tags: row.tags || [],
      likesCount: row.likes_count || 0,
      commentsCount: row.comments_count || 0,
      createdAt: row.created_at,
      isLiked: row.is_liked,
      isSaved: row.is_saved,
      author: {
        id: row.profile_id,
        username: row.username,
        fullName: row.full_name,
        displayName: row.display_name,
        avatarUrl: row.avatar_url,
        isVerified: row.is_verified,
        accountType: row.account_type,
        businessName: row.business_name,
      },
    }));

    // nextCursor is the offset for the next page (encoded as string)
    const nextCursor = hasMore ? String(offset + limit) : null;

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ data, nextCursor, hasMore }),
    };
  } catch (error: unknown) {
    log.error('Error getting discover feed', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ message: 'Internal server error' }),
    };
  }
}

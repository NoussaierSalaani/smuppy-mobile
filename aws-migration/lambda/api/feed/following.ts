/**
 * Get Following Feed Lambda Handler
 * Retrieves posts from users the current user follows
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getPool } from '../../shared/db';
import { createHeaders } from '../utils/cors';
import { createLogger } from '../utils/logger';
import { checkRateLimit } from '../utils/rate-limit';
import { RATE_WINDOW_1_MIN } from '../utils/constants';

const log = createLogger('feed-following');

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const headers = createHeaders(event);
  log.initFromEvent(event);

  try {
    const cognitoSub = event.requestContext.authorizer?.claims?.sub;

    if (!cognitoSub) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ message: 'Unauthorized' }),
      };
    }

    // Per-user rate limit: 60 req/min, fail-open (WAF baseline protects)
    const { allowed } = await checkRateLimit({
      prefix: 'feed-following',
      identifier: cognitoSub,
      windowSeconds: RATE_WINDOW_1_MIN,
      maxRequests: 60,
      failOpen: true,
    });
    if (!allowed) {
      return {
        statusCode: 429,
        headers,
        body: JSON.stringify({ success: false, message: 'Too many requests. Please try again later.' }),
      };
    }

    const limit = Math.min(parseInt(event.queryStringParameters?.limit || '20', 10), 50);
    const cursor = event.queryStringParameters?.cursor;

    const db = await getPool();

    const userResult = await db.query(
      'SELECT id FROM profiles WHERE cognito_sub = $1',
      [cognitoSub]
    );

    if (userResult.rows.length === 0) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ data: [] }),
      };
    }

    const userId = userResult.rows[0].id;

    // Build cursor-based query (compound cursor: created_at|id, consistent with feed/get.ts)
    let cursorCondition = '';
    const queryParams: (string | number | Date)[] = [userId];

    if (cursor) {
      const pipeIndex = cursor.indexOf('|');
      if (pipeIndex !== -1) {
        // Compound cursor: created_at|id
        const cursorDate = cursor.substring(0, pipeIndex);
        const cursorId = cursor.substring(pipeIndex + 1);
        // SECURITY: Validate cursor UUID to prevent SQL injection via ::uuid cast
        const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (!UUID_REGEX.test(cursorId)) {
          return {
            statusCode: 400,
            headers,
            body: JSON.stringify({ message: 'Invalid cursor format' }),
          };
        }
        cursorCondition = `AND (p.created_at, p.id) < ($2::timestamptz, $3::uuid)`;
        queryParams.push(new Date(cursorDate));
        queryParams.push(cursorId);
      } else {
        // Legacy cursor: created_at only (backward compatibility)
        cursorCondition = `AND p.created_at < $2`;
        queryParams.push(new Date(cursor));
      }
    }

    queryParams.push(limit + 1); // Fetch one extra to check hasMore

    const result = await db.query(
      `SELECT p.id, p.author_id, p.content, p.media_urls, p.media_type, p.media_meta, p.tags,
              p.likes_count, p.comments_count, p.created_at,
              p.video_status, p.hls_url, p.thumbnail_url, p.video_variants, p.video_duration,
              pr.id as profile_id, pr.username, pr.full_name, pr.display_name, pr.avatar_url, pr.is_verified, pr.account_type, pr.business_name
       FROM posts p
       LEFT JOIN profiles pr ON p.author_id = pr.id
       WHERE pr.id IS NOT NULL
         AND p.author_id IN (SELECT following_id FROM follows WHERE follower_id = $1 AND status = 'accepted')
         AND pr.moderation_status NOT IN ('banned', 'shadow_banned')
         AND p.visibility NOT IN ('private', 'hidden')
         AND NOT EXISTS (
           SELECT 1 FROM blocked_users
           WHERE (blocker_id = $1 AND blocked_id = p.author_id)
              OR (blocker_id = p.author_id AND blocked_id = $1)
         )
         AND NOT EXISTS (
           SELECT 1 FROM muted_users WHERE muter_id = $1 AND muted_id = p.author_id
         )
         AND (
           p.visibility IN ('public', 'fans')
           OR (p.visibility = 'subscribers' AND EXISTS(
             SELECT 1 FROM channel_subscriptions
             WHERE fan_id = $1 AND creator_id = p.author_id AND status = 'active'
           ))
         )
         ${cursorCondition}
       ORDER BY p.created_at DESC, p.id DESC
       LIMIT $${queryParams.length}`,
      queryParams
    );

    const hasMore = result.rows.length > limit;
    const rows = result.rows.slice(0, limit);

    // Batch-fetch is_liked and is_saved (2 queries instead of 2×N EXISTS subqueries)
    const postIds = rows.map((r: Record<string, unknown>) => r.id);
    let likedSet = new Set<string>();
    let savedSet = new Set<string>();
    if (postIds.length > 0) {
      const [likedRes, savedRes] = await Promise.all([
        db.query('SELECT post_id FROM likes WHERE user_id = $1 AND post_id = ANY($2::uuid[])', [userId, postIds]),
        db.query('SELECT post_id FROM saved_posts WHERE user_id = $1 AND post_id = ANY($2::uuid[])', [userId, postIds]),
      ]);
      likedSet = new Set(likedRes.rows.map((r: Record<string, unknown>) => r.post_id as string));
      savedSet = new Set(savedRes.rows.map((r: Record<string, unknown>) => r.post_id as string));
    }

    const data = rows.map((row: Record<string, unknown>) => ({
      id: row.id,
      authorId: row.author_id,
      content: row.content,
      mediaUrls: row.media_urls || [],
      mediaType: row.media_type,
      mediaMeta: row.media_meta || {},
      tags: row.tags || [],
      likesCount: row.likes_count || 0,
      commentsCount: row.comments_count || 0,
      createdAt: row.created_at,
      videoStatus: row.video_status || null,
      hlsUrl: row.hls_url || null,
      thumbnailUrl: row.thumbnail_url || null,
      videoVariants: row.video_variants || null,
      videoDuration: row.video_duration || null,
      isLiked: likedSet.has(row.id as string),
      isSaved: savedSet.has(row.id as string),
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

    const lastRow = rows.length > 0 ? (rows[rows.length - 1] as Record<string, unknown>) : null;
    const nextCursor = hasMore && lastRow
      ? `${lastRow.created_at}|${lastRow.id}`
      : null;

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ success: true, data, nextCursor, hasMore }),
    };
  } catch (error: unknown) {
    log.error('Error getting following feed', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ message: 'Internal server error' }),
    };
  }
}

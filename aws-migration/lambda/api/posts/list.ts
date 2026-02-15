/**
 * Posts List Lambda - Instagram-Level Scale
 * Handles millions of requests with caching, cursor pagination, and feed algorithms
 */

import { APIGatewayProxyHandler } from 'aws-lambda';
import Redis from 'ioredis';
import { getPool, SqlParam } from '../../shared/db';
import { createHeaders } from '../utils/cors';
import { createLogger } from '../utils/logger';
import { isValidUUID, extractCognitoSub } from '../utils/security';

const log = createLogger('posts-list');

// Redis connection (reused across Lambda invocations)
let redis: Redis | null = null;

const {
  REDIS_HOST,
  REDIS_PORT = '6379',
} = process.env;

const CACHE_TTL = {
  POSTS_LIST: 60,
  POST_DETAIL: 300,
  USER_FEED: 30,
};

async function getRedis(): Promise<Redis | null> {
  if (!REDIS_HOST) return null;
  if (!redis) {
    redis = new Redis({
      host: REDIS_HOST,
      port: parseInt(REDIS_PORT),
      tls: {},
      maxRetriesPerRequest: 3,
      connectTimeout: 5000,
    });
  }
  return redis;
}

export const handler: APIGatewayProxyHandler = async (event) => {
  const startTime = Date.now();
  const headers = {
    ...createHeaders(event),
    'Cache-Control': 'no-cache',
  };

  try {
    const {
      limit = '20',
      cursor,
      type = 'all',
      userId,
    } = event.queryStringParameters || {};

    // Validate userId if provided (prevents SQL injection via malformed input)
    if (userId && !isValidUUID(userId)) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ success: false, message: 'Invalid userId format' }),
      };
    }

    const parsedLimit = Math.min(parseInt(limit), 50);

    const cognitoSub = extractCognitoSub(event);

    // BUG-2026-02-14: Include cognitoSub in cache key to prevent cross-user isLiked/blocked data leaks
    const cacheKey = `posts:list:${type}:${userId || 'all'}:${cognitoSub || 'anon'}:${cursor || 'first'}:${parsedLimit}`;

    // Try cache first (for public feeds)
    const redisClient = await getRedis();
    if (type !== 'following' && redisClient) {
      try {
        const cached = await redisClient.get(cacheKey);
        if (cached) {
          return { statusCode: 200, headers: { ...headers, 'Cache-Control': 'public, max-age=60' }, body: JSON.stringify({ ...JSON.parse(cached), cached: true, latency: Date.now() - startTime }) };
        }
      } catch { /* Cache miss, continue */ }
    }

    // Use reader pool for read-heavy list operations (distributed across read replicas)
    const pool = await getPool();

    // Resolve the user's profile ID from cognito_sub if authenticated
    let requesterId: string | null = null;
    if (cognitoSub) {
      const userResult = await pool.query(
        'SELECT id FROM profiles WHERE cognito_sub = $1',
        [cognitoSub]
      );
      requesterId = userResult.rows[0]?.id || null;
    }

    // Auth required for personalized feeds
    if (type === 'following' && !requesterId) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ success: false, message: 'Authentication required for following feed' }),
      };
    }

    let query: string;
    let params: SqlParam[];

    if (type === 'following' && requesterId) {
      // FanFeed: posts from people I follow OR people who follow me (mutual fan relationship)
      // Exclude business account posts — they belong in Xplorer, not FanFeed
      // Exclude banned/shadow_banned users and hidden posts
      // BUG-2026-02-15: Use CTE to pre-compute connections instead of double EXISTS per post row
      query = `
        WITH my_connections AS (
          SELECT following_id AS author_id FROM follows WHERE follower_id = $1 AND status = 'accepted'
          UNION
          SELECT follower_id AS author_id FROM follows WHERE following_id = $1 AND status = 'accepted'
        )
        SELECT p.id, p.author_id as "authorId", p.content, p.media_urls as "mediaUrls", p.media_type as "mediaType",
               p.is_peak as "isPeak", p.location, p.tags, p.likes_count as "likesCount", p.comments_count as "commentsCount", p.created_at as "createdAt",
               u.username, u.full_name as "fullName", u.avatar_url as "avatarUrl", u.is_verified as "isVerified", u.account_type as "accountType", u.business_name as "businessName",
               EXISTS(SELECT 1 FROM likes l WHERE l.post_id = p.id AND l.user_id = $1) as "isLiked",
               EXISTS(SELECT 1 FROM saved_posts sp WHERE sp.post_id = p.id AND sp.user_id = $1) as "isSaved"
        FROM posts p
        JOIN my_connections mc ON p.author_id = mc.author_id
        JOIN profiles u ON p.author_id = u.id
        WHERE p.author_id != $1
        AND u.account_type != 'pro_business'
        AND u.moderation_status NOT IN ('banned', 'shadow_banned')
        AND p.visibility NOT IN ('hidden', 'private')
        AND (
          p.visibility IN ('public', 'fans')
          OR (p.visibility = 'subscribers' AND EXISTS(
            SELECT 1 FROM channel_subscriptions
            WHERE fan_id = $1 AND creator_id = p.author_id AND status = 'active'
          ))
        )
        ${cursor ? 'AND p.created_at < $3' : ''}
        ORDER BY p.created_at DESC LIMIT $2
      `;
      params = cursor ? [requesterId, parsedLimit + 1, new Date(parseInt(cursor))] : [requesterId, parsedLimit + 1];
    } else if (userId) {
      // SECURITY: Check profile privacy + follow status in parallel (single follow query serves both checks)
      const isOwnProfile = requesterId === userId;
      let isFollowing = false;

      if (!isOwnProfile && requesterId) {
        const [privacyCheck, followResult] = await Promise.all([
          pool.query(`SELECT is_private FROM profiles WHERE id = $1`, [userId]),
          pool.query(
            `SELECT id FROM follows WHERE follower_id = $1 AND following_id = $2 AND status = 'accepted'`,
            [requesterId, userId]
          ),
        ]);
        isFollowing = followResult.rows.length > 0;
        if (privacyCheck.rows[0]?.is_private && !isFollowing) {
          return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ success: true, posts: [], nextCursor: null }),
          };
        }
      } else if (!isOwnProfile) {
        // No requesterId — check if private profile (no follow to check)
        const privacyCheck = await pool.query(
          `SELECT is_private FROM profiles WHERE id = $1`,
          [userId]
        );
        if (privacyCheck.rows[0]?.is_private) {
          return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ success: true, posts: [], nextCursor: null }),
          };
        }
      }
      // Build parameterized visibility filter
      // $1 = userId (profile), $2 = limit, $3 = cursor (optional), next = requesterId
      if (isOwnProfile) {
        query = `
          SELECT p.id, p.author_id as "authorId", p.content, p.media_urls as "mediaUrls", p.media_type as "mediaType",
                 p.is_peak as "isPeak", p.location, p.tags, p.likes_count as "likesCount", p.comments_count as "commentsCount", p.created_at as "createdAt",
                 u.username, u.full_name as "fullName", u.avatar_url as "avatarUrl", u.is_verified as "isVerified", u.account_type as "accountType", u.business_name as "businessName"
          FROM posts p JOIN profiles u ON p.author_id = u.id
          WHERE p.author_id = $1 ${cursor ? 'AND p.created_at < $3' : ''}
          ORDER BY p.created_at DESC LIMIT $2
        `;
        params = cursor ? [userId, parsedLimit + 1, new Date(parseInt(cursor))] : [userId, parsedLimit + 1];
      } else {
        // Non-own profile: parameterize requesterId for subscriber check
        const requesterParamIdx = cursor ? 4 : 3;
        query = `
          SELECT p.id, p.author_id as "authorId", p.content, p.media_urls as "mediaUrls", p.media_type as "mediaType",
                 p.is_peak as "isPeak", p.location, p.tags, p.likes_count as "likesCount", p.comments_count as "commentsCount", p.created_at as "createdAt",
                 u.username, u.full_name as "fullName", u.avatar_url as "avatarUrl", u.is_verified as "isVerified", u.account_type as "accountType", u.business_name as "businessName"
          FROM posts p JOIN profiles u ON p.author_id = u.id
          WHERE p.author_id = $1
            AND u.moderation_status NOT IN ('banned', 'shadow_banned')
            AND p.visibility NOT IN ('hidden', 'private')
            AND (
              p.visibility = 'public'
              ${isFollowing ? "OR p.visibility = 'fans'" : ''}
              ${requesterId ? `OR (p.visibility = 'subscribers' AND EXISTS(
                SELECT 1 FROM channel_subscriptions
                WHERE fan_id = $${requesterParamIdx} AND creator_id = p.author_id AND status = 'active'
              ))` : ''}
            )
            ${cursor ? 'AND p.created_at < $3' : ''}
          ORDER BY p.created_at DESC LIMIT $2
        `;
        params = cursor
          ? [userId, parsedLimit + 1, new Date(parseInt(cursor)), ...(requesterId ? [requesterId] : [])]
          : [userId, parsedLimit + 1, ...(requesterId ? [requesterId] : [])];
      }
    } else {
      // Explore/public feed: exclude banned/shadow_banned users and hidden posts
      // BUG-2026-02-15: Limit scan window to 30 days and use simpler scoring to reduce full-table sort
      query = `
        SELECT p.id, p.author_id as "authorId", p.content, p.media_urls as "mediaUrls", p.media_type as "mediaType",
               p.is_peak as "isPeak", p.location, p.tags, p.likes_count as "likesCount", p.comments_count as "commentsCount", p.created_at as "createdAt",
               u.username, u.full_name as "fullName", u.avatar_url as "avatarUrl", u.is_verified as "isVerified", u.account_type as "accountType", u.business_name as "businessName"
        FROM posts p JOIN profiles u ON p.author_id = u.id
        WHERE u.moderation_status NOT IN ('banned', 'shadow_banned')
        AND p.visibility != 'hidden'
        AND p.created_at > NOW() - INTERVAL '30 days'
        ${cursor ? 'AND p.created_at < $2' : ''}
        ORDER BY (p.likes_count + p.comments_count) DESC, p.created_at DESC
        LIMIT $1
      `;
      params = cursor ? [parsedLimit + 1, new Date(parseInt(cursor))] : [parsedLimit + 1];
    }

    const result = await pool.query(query, params);
    const hasMore = result.rows.length > parsedLimit;
    const posts = hasMore ? result.rows.slice(0, parsedLimit) : result.rows;

    // Batch-fetch tagged users for all returned posts
    const postIds = posts.map((p: { id: string }) => p.id);
    let tagsByPost: Record<string, Array<{ id: string; username: string; fullName: string; avatarUrl: string }>> = {};
    if (postIds.length > 0) {
      const tagResult = await pool.query(
        `SELECT pt.post_id, pt.tagged_user_id AS id, pr.username, pr.full_name, pr.avatar_url
         FROM post_tags pt
         JOIN profiles pr ON pt.tagged_user_id = pr.id
         WHERE pt.post_id = ANY($1)`,
        [postIds]
      );
      for (const row of tagResult.rows) {
        const pid = row.post_id as string;
        if (!tagsByPost[pid]) tagsByPost[pid] = [];
        tagsByPost[pid].push({ id: row.id, username: row.username, fullName: row.full_name, avatarUrl: row.avatar_url });
      }
    }

    const formattedPosts = posts.map((post: Record<string, unknown>) => ({
      id: post.id, authorId: post.authorId, content: post.content, mediaUrls: post.mediaUrls || [],
      mediaType: post.mediaType, isPeak: post.isPeak || false, location: post.location || null,
      tags: post.tags || [],
      taggedUsers: tagsByPost[post.id as string] || [],
      likesCount: parseInt(post.likesCount as string) || 0, commentsCount: parseInt(post.commentsCount as string) || 0,
      createdAt: post.createdAt, isLiked: post.isLiked || false, isSaved: post.isSaved || false,
      author: { id: post.authorId, username: post.username, fullName: post.fullName, avatarUrl: post.avatarUrl, isVerified: post.isVerified, accountType: post.accountType, businessName: post.businessName },
    }));

    const responseData = { posts: formattedPosts, nextCursor: hasMore ? posts[posts.length - 1].createdAt.getTime().toString() : null, hasMore, total: formattedPosts.length };

    if (type !== 'following' && redisClient) {
      try { await redisClient.setex(cacheKey, CACHE_TTL.POSTS_LIST, JSON.stringify(responseData)); } catch { /* Ignore */ }
    }

    return { statusCode: 200, headers: { ...headers, 'Cache-Control': 'public, max-age=60' }, body: JSON.stringify({ ...responseData, cached: false, latency: Date.now() - startTime }) };
  } catch (error: unknown) {
    log.error('Error fetching posts', error);
    return { statusCode: 500, headers, body: JSON.stringify({ success: false, message: 'Internal server error' }) };
  }
};

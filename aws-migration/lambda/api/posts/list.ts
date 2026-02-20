/**
 * Posts List Lambda - Instagram-Level Scale
 * Handles millions of requests with caching, cursor pagination, and feed algorithms
 */

import Redis from 'ioredis';
import { getPool, SqlParam } from '../../shared/db';
import { withErrorHandler } from '../utils/error-handler';
import { requireRateLimit } from '../utils/rate-limit';
import { isValidUUID, extractCognitoSub } from '../utils/security';
import { resolveProfileId } from '../utils/auth';
import { RATE_WINDOW_1_MIN } from '../utils/constants';

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
      port: Number.parseInt(REDIS_PORT),
      tls: {},
      maxRetriesPerRequest: 3,
      connectTimeout: 5000,
    });
  }
  return redis;
}

export const handler = withErrorHandler('posts-list', async (event, { headers: baseHeaders }) => {
  const startTime = Date.now();
  const headers = {
    ...baseHeaders,
    'Cache-Control': 'no-cache',
  };

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

    const parsedLimit = Math.min(Number.parseInt(limit), 50);

    const cognitoSub = extractCognitoSub(event);

    // Per-user rate limit (fail-open: WAF provides baseline protection for read endpoints)
    if (cognitoSub) {
      const rateLimitResponse = await requireRateLimit({
        prefix: 'feed-posts-list',
        identifier: cognitoSub,
        windowSeconds: RATE_WINDOW_1_MIN,
        maxRequests: 60,
        failOpen: true,
      }, headers);
      if (rateLimitResponse) return rateLimitResponse;
    }

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
      requesterId = await resolveProfileId(pool, cognitoSub);
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
      // Exclude banned/shadow_banned users and hidden/private posts
      // Defense-in-depth: CTE excludes blocked users (bidirectional) even if follow removal races

      // Parse cursor: compound (ISO|UUID) or legacy (ms timestamp)
      let followCursorCond = '';
      const followCursorParams: SqlParam[] = [];
      if (cursor) {
        const pipeIdx = cursor.indexOf('|');
        if (pipeIdx !== -1) {
          const cursorDate = cursor.substring(0, pipeIdx);
          const cursorId = cursor.substring(pipeIdx + 1);
          if (!isValidUUID(cursorId) || Number.isNaN(new Date(cursorDate).getTime())) {
            return { statusCode: 400, headers, body: JSON.stringify({ success: false, message: 'Invalid cursor format' }) };
          }
          followCursorCond = 'AND (p.created_at, p.id) < ($3::timestamptz, $4::uuid)';
          followCursorParams.push(new Date(cursorDate), cursorId);
        } else {
          const ts = Number.parseInt(cursor, 10);
          if (Number.isNaN(ts)) {
            return { statusCode: 400, headers, body: JSON.stringify({ success: false, message: 'Invalid cursor format' }) };
          }
          followCursorCond = 'AND p.created_at < $3::timestamptz';
          followCursorParams.push(new Date(ts));
        }
      }

      query = `
        WITH my_connections AS (
          SELECT following_id AS author_id FROM follows WHERE follower_id = $1 AND status = 'accepted'
          UNION
          SELECT follower_id AS author_id FROM follows WHERE following_id = $1 AND status = 'accepted'
        ),
        excluded_users AS (
          SELECT blocked_id AS user_id FROM blocked_users WHERE blocker_id = $1
          UNION
          SELECT blocker_id AS user_id FROM blocked_users WHERE blocked_id = $1
        )
        SELECT p.id, p.author_id as "authorId", p.content, p.media_urls as "mediaUrls", p.media_type as "mediaType", p.media_meta as "mediaMeta",
               p.is_peak as "isPeak", p.location, p.tags, p.likes_count as "likesCount", p.comments_count as "commentsCount", p.created_at as "createdAt",
               p.video_status as "videoStatus", p.hls_url as "hlsUrl", p.thumbnail_url as "thumbnailUrl", p.video_variants as "videoVariants", p.video_duration as "videoDuration",
               u.username, u.full_name as "fullName", u.avatar_url as "avatarUrl", u.is_verified as "isVerified", u.account_type as "accountType", u.business_name as "businessName"
        FROM posts p
        JOIN my_connections mc ON p.author_id = mc.author_id
        JOIN profiles u ON p.author_id = u.id
        WHERE p.author_id != $1
        AND p.author_id NOT IN (SELECT user_id FROM excluded_users)
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
        ${followCursorCond}
        ORDER BY p.created_at DESC, p.id DESC LIMIT $2
      `;
      params = [requesterId, parsedLimit + 1, ...followCursorParams];
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
          SELECT p.id, p.author_id as "authorId", p.content, p.media_urls as "mediaUrls", p.media_type as "mediaType", p.media_meta as "mediaMeta",
                 p.is_peak as "isPeak", p.location, p.tags, p.likes_count as "likesCount", p.comments_count as "commentsCount", p.created_at as "createdAt",
                 u.username, u.full_name as "fullName", u.avatar_url as "avatarUrl", u.is_verified as "isVerified", u.account_type as "accountType", u.business_name as "businessName"
          FROM posts p JOIN profiles u ON p.author_id = u.id
          WHERE p.author_id = $1 ${cursor ? 'AND p.created_at < $3' : ''}
          ORDER BY p.created_at DESC, p.id DESC LIMIT $2
        `;
        params = cursor ? [userId, parsedLimit + 1, new Date(Number.parseInt(cursor))] : [userId, parsedLimit + 1];
      } else {
        // Non-own profile: parameterize requesterId for subscriber check + block filter
        const requesterParamIdx = cursor ? 4 : 3;
        // Block filter uses the same requesterId param
        const blockFilter = requesterId
          ? `AND NOT EXISTS (SELECT 1 FROM blocked_users WHERE (blocker_id = $${requesterParamIdx} AND blocked_id = p.author_id) OR (blocker_id = p.author_id AND blocked_id = $${requesterParamIdx}))`
          : '';
        query = `
          SELECT p.id, p.author_id as "authorId", p.content, p.media_urls as "mediaUrls", p.media_type as "mediaType", p.media_meta as "mediaMeta",
                 p.is_peak as "isPeak", p.location, p.tags, p.likes_count as "likesCount", p.comments_count as "commentsCount", p.created_at as "createdAt",
                 u.username, u.full_name as "fullName", u.avatar_url as "avatarUrl", u.is_verified as "isVerified", u.account_type as "accountType", u.business_name as "businessName"
          FROM posts p JOIN profiles u ON p.author_id = u.id
          WHERE p.author_id = $1
            AND u.moderation_status NOT IN ('banned', 'shadow_banned')
            AND p.visibility NOT IN ('hidden', 'private')
            ${blockFilter}
            AND (
              p.visibility = 'public'
              ${isFollowing ? "OR p.visibility = 'fans'" : ''}
              ${requesterId ? `OR (p.visibility = 'subscribers' AND EXISTS(
                SELECT 1 FROM channel_subscriptions
                WHERE fan_id = $${requesterParamIdx} AND creator_id = p.author_id AND status = 'active'
              ))` : ''}
            )
            ${cursor ? 'AND p.created_at < $3' : ''}
          ORDER BY p.created_at DESC, p.id DESC LIMIT $2
        `;
        params = cursor
          ? [userId, parsedLimit + 1, new Date(Number.parseInt(cursor)), ...(requesterId ? [requesterId] : [])]
          : [userId, parsedLimit + 1, ...(requesterId ? [requesterId] : [])];
      }
    } else {
      // Explore/public feed: exclude banned/shadow_banned users and hidden posts
      // BUG-2026-02-15: Limit scan window to 30 days and use simpler scoring to reduce full-table sort
      const exploreParams: SqlParam[] = [parsedLimit + 1];
      let exploreCursorCond = '';
      if (cursor) {
        exploreParams.push(new Date(Number.parseInt(cursor)));
        exploreCursorCond = `AND p.created_at < $${exploreParams.length}`;
      }
      // Block + mute filter for authenticated users
      let exploreBlockFilter = '';
      if (requesterId) {
        exploreParams.push(requesterId);
        const rIdx = exploreParams.length;
        exploreBlockFilter = `
          AND NOT EXISTS (SELECT 1 FROM blocked_users WHERE (blocker_id = $${rIdx} AND blocked_id = p.author_id) OR (blocker_id = p.author_id AND blocked_id = $${rIdx}))
          AND NOT EXISTS (SELECT 1 FROM muted_users WHERE muter_id = $${rIdx} AND muted_id = p.author_id)`;
      }
      query = `
        SELECT p.id, p.author_id as "authorId", p.content, p.media_urls as "mediaUrls", p.media_type as "mediaType", p.media_meta as "mediaMeta",
               p.is_peak as "isPeak", p.location, p.tags, p.likes_count as "likesCount", p.comments_count as "commentsCount", p.created_at as "createdAt",
               p.video_status as "videoStatus", p.hls_url as "hlsUrl", p.thumbnail_url as "thumbnailUrl", p.video_variants as "videoVariants", p.video_duration as "videoDuration",
               u.username, u.full_name as "fullName", u.avatar_url as "avatarUrl", u.is_verified as "isVerified", u.account_type as "accountType", u.business_name as "businessName"
        FROM posts p JOIN profiles u ON p.author_id = u.id
        WHERE u.moderation_status NOT IN ('banned', 'shadow_banned')
        AND p.visibility != 'hidden'
        AND p.created_at > NOW() - INTERVAL '30 days'
        ${exploreCursorCond}
        ${exploreBlockFilter}
        ORDER BY (p.likes_count + p.comments_count) DESC, p.created_at DESC, p.id DESC
        LIMIT $1
      `;
      params = exploreParams;
    }

    const result = await pool.query(query, params);
    const hasMore = result.rows.length > parsedLimit;
    const posts = hasMore ? result.rows.slice(0, parsedLimit) : result.rows;

    // Batch-fetch tagged users for all returned posts
    const postIds = posts.map((p: { id: string }) => p.id);
    let tagsByPost: Record<string, Array<{ id: string; username: string; fullName: string; avatarUrl: string }>> = {};
    if (postIds.length > 0) {
      // Filter out blocked users from tagged users list
      const tagQuery = requesterId
        ? `SELECT pt.post_id, pt.tagged_user_id AS id, pr.username, pr.full_name, pr.avatar_url
           FROM post_tags pt
           JOIN profiles pr ON pt.tagged_user_id = pr.id
           WHERE pt.post_id = ANY($1)
             AND NOT EXISTS (SELECT 1 FROM blocked_users WHERE (blocker_id = $2 AND blocked_id = pt.tagged_user_id) OR (blocker_id = pt.tagged_user_id AND blocked_id = $2))`
        : `SELECT pt.post_id, pt.tagged_user_id AS id, pr.username, pr.full_name, pr.avatar_url
           FROM post_tags pt
           JOIN profiles pr ON pt.tagged_user_id = pr.id
           WHERE pt.post_id = ANY($1)`;
      const tagParams = requesterId ? [postIds, requesterId] : [postIds];
      const tagResult = await pool.query(tagQuery, tagParams);
      for (const row of tagResult.rows) {
        const pid = row.post_id as string;
        if (!tagsByPost[pid]) tagsByPost[pid] = [];
        tagsByPost[pid].push({ id: row.id, username: row.username, fullName: row.full_name, avatarUrl: row.avatar_url });
      }
    }

    // Batch-fetch is_liked and is_saved (2 queries instead of 2×N EXISTS subqueries)
    let likedSet = new Set<string>();
    let savedSet = new Set<string>();
    if (requesterId && postIds.length > 0) {
      const [likedRes, savedRes] = await Promise.all([
        pool.query('SELECT post_id FROM likes WHERE user_id = $1 AND post_id = ANY($2::uuid[])', [requesterId, postIds]),
        pool.query('SELECT post_id FROM saved_posts WHERE user_id = $1 AND post_id = ANY($2::uuid[])', [requesterId, postIds]),
      ]);
      likedSet = new Set(likedRes.rows.map((r: Record<string, unknown>) => r.post_id as string));
      savedSet = new Set(savedRes.rows.map((r: Record<string, unknown>) => r.post_id as string));
    }

    const formattedPosts = posts.map((post: Record<string, unknown>) => ({
      id: post.id, authorId: post.authorId, content: post.content, mediaUrls: post.mediaUrls || [],
      mediaType: post.mediaType, mediaMeta: post.mediaMeta || {}, isPeak: post.isPeak || false, location: post.location || null,
      tags: post.tags || [],
      taggedUsers: tagsByPost[post.id as string] || [],
      likesCount: Number.parseInt(post.likesCount as string) || 0, commentsCount: Number.parseInt(post.commentsCount as string) || 0,
      createdAt: post.createdAt, isLiked: likedSet.has(post.id as string), isSaved: savedSet.has(post.id as string),
      videoStatus: post.videoStatus || null,
      hlsUrl: post.hlsUrl || null,
      thumbnailUrl: post.thumbnailUrl || null,
      videoVariants: post.videoVariants || null,
      videoDuration: post.videoDuration || null,
      author: { id: post.authorId, username: post.username, fullName: post.fullName, avatarUrl: post.avatarUrl, isVerified: post.isVerified, accountType: post.accountType, businessName: post.businessName },
    }));

    // Compound cursor for following feed (deterministic); ms timestamp for other types
    let nextCursor: string | null = null;
    if (hasMore && posts.length > 0) {
      const lastPost = posts[posts.length - 1] as Record<string, unknown>;
      if (type === 'following') {
        nextCursor = `${new Date(lastPost.createdAt as string | number).toISOString()}|${lastPost.id}`;
      } else {
        nextCursor = new Date(lastPost.createdAt as string | number).getTime().toString();
      }
    }

    const responseData = { success: true, posts: formattedPosts, nextCursor, hasMore, total: formattedPosts.length };

    if (type !== 'following' && redisClient) {
      try { await redisClient.setex(cacheKey, CACHE_TTL.POSTS_LIST, JSON.stringify(responseData)); } catch { /* Ignore */ }
    }

    return { statusCode: 200, headers: { ...headers, 'Cache-Control': 'public, max-age=60' }, body: JSON.stringify({ ...responseData, cached: false, latency: Date.now() - startTime }) };
});

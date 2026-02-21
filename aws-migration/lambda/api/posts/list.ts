/**
 * Posts List Lambda - Instagram-Level Scale
 * Handles millions of requests with caching, cursor pagination, and feed algorithms
 */

import Redis from 'ioredis';
import { Pool } from 'pg';
import { APIGatewayProxyResult } from 'aws-lambda';
import { getPool, SqlParam } from '../../shared/db';
import { withErrorHandler } from '../utils/error-handler';
import { requireRateLimit } from '../utils/rate-limit';
import { isValidUUID, extractCognitoSub } from '../utils/security';
import { resolveProfileId } from '../utils/auth';
import { RATE_WINDOW_1_MIN } from '../utils/constants';
import { blockExclusionSQL, muteExclusionSQL } from '../utils/block-filter';
import { parseLimit, applyHasMore } from '../utils/pagination';
import { parseCursor, cursorToSql } from '../utils/cursor';

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

// ── Column selections (shared across feed types) ──

const POST_COLUMNS_BASE = `p.id, p.author_id as "authorId", p.content, p.media_urls as "mediaUrls", p.media_type as "mediaType", p.media_meta as "mediaMeta",
               p.is_peak as "isPeak", p.location, p.tags, p.likes_count as "likesCount", p.comments_count as "commentsCount", p.created_at as "createdAt"`;

const POST_COLUMNS_VIDEO = `,
               p.video_status as "videoStatus", p.hls_url as "hlsUrl", p.thumbnail_url as "thumbnailUrl", p.video_variants as "videoVariants", p.video_duration as "videoDuration"`;

const AUTHOR_COLUMNS = `,
               u.username, u.full_name as "fullName", u.avatar_url as "avatarUrl", u.is_verified as "isVerified", u.account_type as "accountType", u.business_name as "businessName"`;

// ── Feed Query Builders ──

interface FeedQuery {
  query: string;
  params: SqlParam[];
}

function buildFollowingFeedQuery(
  requesterId: string,
  parsedLimit: number,
  cursor: string | undefined,
  headers: Record<string, string>,
): FeedQuery | APIGatewayProxyResult {
  // Parse cursor: compound (ISO|UUID) or legacy (ms timestamp)
  let cursorCond = '';
  const cursorParams: SqlParam[] = [];

  if (cursor) {
    const parsed = parseCursor(cursor, 'compound');
    if (!parsed) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ success: false, message: 'Invalid cursor format' }),
      };
    }
    const sql = cursorToSql(parsed, 'p.created_at', 3);
    cursorCond = sql.condition;
    cursorParams.push(...sql.params);
  }

  const query = `
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
        SELECT ${POST_COLUMNS_BASE}${POST_COLUMNS_VIDEO}${AUTHOR_COLUMNS}
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
        ${cursorCond}
        ORDER BY p.created_at DESC, p.id DESC LIMIT $2
      `;
  const params: SqlParam[] = [requesterId, parsedLimit + 1, ...cursorParams];
  return { query, params };
}

/**
 * Check privacy for a user profile and return whether the caller should see posts.
 * Returns { allowed: true, isFollowing } or { allowed: false, response }.
 */
async function checkProfilePrivacy(
  pool: Pool,
  userId: string,
  requesterId: string | null,
  isOwnProfile: boolean,
  headers: Record<string, string>,
): Promise<{ allowed: true; isFollowing: boolean } | { allowed: false; response: APIGatewayProxyResult }> {
  const emptyResponse: APIGatewayProxyResult = {
    statusCode: 200,
    headers,
    body: JSON.stringify({ success: true, posts: [], nextCursor: null }),
  };

  if (isOwnProfile) {
    return { allowed: true, isFollowing: false };
  }

  if (requesterId) {
    const [privacyCheck, followResult] = await Promise.all([
      pool.query(`SELECT is_private FROM profiles WHERE id = $1`, [userId]),
      pool.query(
        `SELECT id FROM follows WHERE follower_id = $1 AND following_id = $2 AND status = 'accepted'`,
        [requesterId, userId]
      ),
    ]);
    const isFollowing = followResult.rows.length > 0;
    if (privacyCheck.rows[0]?.is_private && !isFollowing) {
      return { allowed: false, response: emptyResponse };
    }
    return { allowed: true, isFollowing };
  }

  // No requesterId — check if private profile (no follow to check)
  const privacyCheck = await pool.query(
    `SELECT is_private FROM profiles WHERE id = $1`,
    [userId]
  );
  if (privacyCheck.rows[0]?.is_private) {
    return { allowed: false, response: emptyResponse };
  }
  return { allowed: true, isFollowing: false };
}

function buildOwnProfileFeedQuery(
  userId: string,
  parsedLimit: number,
  cursor: string | undefined,
): FeedQuery {
  const query = `
          SELECT ${POST_COLUMNS_BASE}${AUTHOR_COLUMNS}
          FROM posts p JOIN profiles u ON p.author_id = u.id
          WHERE p.author_id = $1 ${cursor ? 'AND p.created_at < $3' : ''}
          ORDER BY p.created_at DESC, p.id DESC LIMIT $2
        `;
  const params: SqlParam[] = cursor
    ? [userId, parsedLimit + 1, new Date(Number.parseInt(cursor))]
    : [userId, parsedLimit + 1];
  return { query, params };
}

function buildOtherProfileFeedQuery(
  userId: string,
  parsedLimit: number,
  cursor: string | undefined,
  requesterId: string | null,
  isFollowing: boolean,
): FeedQuery {
  const requesterParamIdx = cursor ? 4 : 3;
  const blockFilter = requesterId
    ? blockExclusionSQL(requesterParamIdx, 'p.author_id')
    : '';
  const query = `
          SELECT ${POST_COLUMNS_BASE}${AUTHOR_COLUMNS}
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
  const params: SqlParam[] = cursor
    ? [userId, parsedLimit + 1, new Date(Number.parseInt(cursor)), ...(requesterId ? [requesterId] : [])]
    : [userId, parsedLimit + 1, ...(requesterId ? [requesterId] : [])];
  return { query, params };
}

function buildExploreFeedQuery(
  parsedLimit: number,
  cursor: string | undefined,
  requesterId: string | null,
): FeedQuery {
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
    exploreBlockFilter = blockExclusionSQL(rIdx, 'p.author_id') + muteExclusionSQL(rIdx, 'p.author_id');
  }
  const query = `
        SELECT ${POST_COLUMNS_BASE}${POST_COLUMNS_VIDEO}${AUTHOR_COLUMNS}
        FROM posts p JOIN profiles u ON p.author_id = u.id
        WHERE u.moderation_status NOT IN ('banned', 'shadow_banned')
        AND p.visibility != 'hidden'
        AND p.created_at > NOW() - INTERVAL '30 days'
        ${exploreCursorCond}
        ${exploreBlockFilter}
        ORDER BY (p.likes_count + p.comments_count) DESC, p.created_at DESC, p.id DESC
        LIMIT $1
      `;
  return { query, params: exploreParams };
}

// ── Post Metadata Batch Fetching ──

interface TaggedUser {
  id: string;
  username: string;
  fullName: string;
  avatarUrl: string;
}

async function batchFetchTagsByPost(
  pool: Pool,
  postIds: string[],
  requesterId: string | null,
): Promise<Record<string, TaggedUser[]>> {
  if (postIds.length === 0) return {};

  const tagQuery = requesterId
    ? `SELECT pt.post_id, pt.tagged_user_id AS id, pr.username, pr.full_name, pr.avatar_url
       FROM post_tags pt
       JOIN profiles pr ON pt.tagged_user_id = pr.id
       WHERE pt.post_id = ANY($1)
         ${blockExclusionSQL(2, 'pt.tagged_user_id')}`
    : `SELECT pt.post_id, pt.tagged_user_id AS id, pr.username, pr.full_name, pr.avatar_url
       FROM post_tags pt
       JOIN profiles pr ON pt.tagged_user_id = pr.id
       WHERE pt.post_id = ANY($1)`;
  const tagParams = requesterId ? [postIds, requesterId] : [postIds];
  const tagResult = await pool.query(tagQuery, tagParams);

  const tagsByPost: Record<string, TaggedUser[]> = {};
  for (const row of tagResult.rows) {
    const pid = row.post_id as string;
    if (!tagsByPost[pid]) tagsByPost[pid] = [];
    tagsByPost[pid].push({ id: row.id, username: row.username, fullName: row.full_name, avatarUrl: row.avatar_url });
  }
  return tagsByPost;
}

async function batchFetchLikesAndSaves(
  pool: Pool,
  postIds: string[],
  requesterId: string | null,
): Promise<{ likedSet: Set<string>; savedSet: Set<string> }> {
  if (!requesterId || postIds.length === 0) {
    return { likedSet: new Set(), savedSet: new Set() };
  }
  const [likedRes, savedRes] = await Promise.all([
    pool.query('SELECT post_id FROM likes WHERE user_id = $1 AND post_id = ANY($2::uuid[])', [requesterId, postIds]),
    pool.query('SELECT post_id FROM saved_posts WHERE user_id = $1 AND post_id = ANY($2::uuid[])', [requesterId, postIds]),
  ]);
  return {
    likedSet: new Set(likedRes.rows.map((r: Record<string, unknown>) => r.post_id as string)),
    savedSet: new Set(savedRes.rows.map((r: Record<string, unknown>) => r.post_id as string)),
  };
}

// ── Post Formatting ──

function formatPost(
  post: Record<string, unknown>,
  tagsByPost: Record<string, TaggedUser[]>,
  likedSet: Set<string>,
  savedSet: Set<string>,
): Record<string, unknown> {
  return {
    id: post.id, authorId: post.authorId, content: post.content, mediaUrls: post.mediaUrls || [],
    mediaType: post.mediaType, mediaMeta: post.mediaMeta || {}, isPeak: !!post.isPeak, location: post.location || null,
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
  };
}

// ── Cursor Generation ──

function buildNextCursor(
  hasMore: boolean,
  posts: Record<string, unknown>[],
  feedType: string,
): string | null {
  if (!hasMore || posts.length === 0) return null;
  const lastPost = posts.at(-1)!;
  if (feedType === 'following') {
    return `${new Date(lastPost.createdAt as string | number).toISOString()}|${lastPost.id}`;
  }
  return new Date(lastPost.createdAt as string | number).getTime().toString();
}

// ── Main Handler ──

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

    const parsedLimit = parseLimit(limit);

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
      } catch { /* Expected: Redis cache miss or connection error — fall through to DB query */ }
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

    // Build feed query based on type
    const feedQuery = await buildFeedQuery(pool, type, userId, requesterId, parsedLimit, cursor, headers);
    if ('statusCode' in feedQuery) return feedQuery;

    const { query, params } = feedQuery;
    const result = await pool.query(query, params);
    const { data: posts, hasMore } = applyHasMore(result.rows, parsedLimit);

    // Batch-fetch tagged users, likes, and saves
    const postIds = posts.map((p: { id: string }) => p.id);
    const [tagsByPost, { likedSet, savedSet }] = await Promise.all([
      batchFetchTagsByPost(pool, postIds, requesterId),
      batchFetchLikesAndSaves(pool, postIds, requesterId),
    ]);

    const formattedPosts = posts.map((post: Record<string, unknown>) =>
      formatPost(post, tagsByPost, likedSet, savedSet),
    );

    const nextCursor = buildNextCursor(hasMore, posts as Record<string, unknown>[], type);

    const responseData = { success: true, posts: formattedPosts, nextCursor, hasMore, total: formattedPosts.length };

    if (type !== 'following' && redisClient) {
      try { await redisClient.setex(cacheKey, CACHE_TTL.POSTS_LIST, JSON.stringify(responseData)); } catch { /* Expected: Redis write failure is non-critical — response already sent */ }
    }

    return { statusCode: 200, headers: { ...headers, 'Cache-Control': 'public, max-age=60' }, body: JSON.stringify({ ...responseData, cached: false, latency: Date.now() - startTime }) };
});

// ── Feed Query Router ──

async function buildFeedQuery(
  pool: Pool,
  type: string,
  userId: string | undefined,
  requesterId: string | null,
  parsedLimit: number,
  cursor: string | undefined,
  headers: Record<string, string>,
): Promise<FeedQuery | APIGatewayProxyResult> {
  if (type === 'following' && requesterId) {
    return buildFollowingFeedQuery(requesterId, parsedLimit, cursor, headers);
  }

  if (userId) {
    return buildUserProfileFeedQuery(pool, userId, requesterId, parsedLimit, cursor, headers);
  }

  return buildExploreFeedQuery(parsedLimit, cursor, requesterId);
}

async function buildUserProfileFeedQuery(
  pool: Pool,
  userId: string,
  requesterId: string | null,
  parsedLimit: number,
  cursor: string | undefined,
  headers: Record<string, string>,
): Promise<FeedQuery | APIGatewayProxyResult> {
  const isOwnProfile = requesterId === userId;

  const privacyResult = await checkProfilePrivacy(pool, userId, requesterId, isOwnProfile, headers);
  if (!privacyResult.allowed) return privacyResult.response;

  if (isOwnProfile) {
    return buildOwnProfileFeedQuery(userId, parsedLimit, cursor);
  }

  return buildOtherProfileFeedQuery(userId, parsedLimit, cursor, requesterId, privacyResult.isFollowing);
}

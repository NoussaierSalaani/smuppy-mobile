/**
 * Get Feed Lambda Handler
 * Retrieves personalized feed for authenticated user
 * Uses DynamoDB for feed caching and PostgreSQL for data
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import Redis from 'ioredis';
import { getReaderPool, SqlParam } from '../../shared/db';
import { createHeaders } from '../utils/cors';
import { createLogger } from '../utils/logger';

const log = createLogger('feed-get');

let redis: Redis | null = null;

async function getRedis(): Promise<Redis | null> {
  if (!process.env.REDIS_ENDPOINT) {
    return null;
  }
  if (!redis) {
    redis = new Redis({
      host: process.env.REDIS_ENDPOINT,
      port: parseInt(process.env.REDIS_PORT || '6379'),
      // TLS required - ElastiCache has transit encryption enabled
      tls: {},
      maxRetriesPerRequest: 3,
      connectTimeout: 5000,
      commandTimeout: 3000,
    });
  }
  return redis;
}

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const headers = createHeaders(event);

  try {
    const cognitoSub = event.requestContext.authorizer?.claims?.sub;
    const limit = Math.min(parseInt(event.queryStringParameters?.limit || '20'), 50);
    const cursor = event.queryStringParameters?.cursor;

    if (!cognitoSub) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ message: 'Unauthorized' }),
      };
    }

    // Use reader pool for read-heavy feed operations (distributed across read replicas)
    const db = await getReaderPool();

    // Resolve the user's profile ID from cognito_sub
    const userResult = await db.query(
      'SELECT id FROM profiles WHERE cognito_sub = $1',
      [cognitoSub]
    );

    if (userResult.rows.length === 0) {
      // User has no profile - return empty feed
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ data: [], nextCursor: null, hasMore: false, total: 0 }),
      };
    }

    const userId = userResult.rows[0].id;

    // Try to get cached feed from Redis
    const cacheKey = `feed:${userId}:${cursor || 'start'}`;
    let cachedFeed: string | null = null;

    const redisClient = await getRedis();
    if (redisClient) {
      try {
        cachedFeed = await redisClient.get(cacheKey);
        if (cachedFeed) {
          return {
            statusCode: 200,
            headers,
            body: cachedFeed,
          };
        }
      } catch {
        // Redis failure shouldn't break the feed - fallback to DB
        log.warn('Redis cache error, falling back to DB');
      }
    }

    // Get user's following list
    const followingResult = await db.query(
      `SELECT following_id FROM follows WHERE follower_id = $1 AND status = 'accepted'`,
      [userId]
    );

    const followingIds = followingResult.rows.map((row: Record<string, unknown>) => row.following_id);

    // Include user's own posts
    const allAuthorIds = [userId, ...followingIds];

    // Build cursor condition (compound cursor: created_at|id to avoid skipping posts with same timestamp)
    let cursorCondition = '';
    const queryParams: SqlParam[] = [allAuthorIds];

    if (cursor) {
      const pipeIndex = cursor.indexOf('|');
      if (pipeIndex !== -1) {
        // Compound cursor: created_at|id
        const cursorDate = cursor.substring(0, pipeIndex);
        const cursorId = cursor.substring(pipeIndex + 1);
        cursorCondition = `AND (p.created_at, p.id) < ($2::timestamptz, $3::uuid)`;
        queryParams.push(new Date(cursorDate));
        queryParams.push(cursorId);
      } else {
        // Legacy cursor: created_at only (backward compatibility)
        cursorCondition = 'AND p.created_at < $2';
        queryParams.push(new Date(cursor));
      }
    }

    queryParams.push(limit + 1); // Fetch one extra to check hasMore

    // Get user's channel subscriptions (for subscribers-only content)
    const subscriptionsResult = await db.query(
      `SELECT creator_id FROM channel_subscriptions WHERE fan_id = $1 AND status = 'active'`,
      [userId]
    );
    const subscribedCreatorIds = subscriptionsResult.rows.map((row: Record<string, unknown>) => row.creator_id);

    // Get feed posts with visibility filtering
    // - public: anyone can see
    // - fans/followers: only followers can see (covered by following list)
    // - subscribers: only paid channel subscribers can see
    // - private: only author can see
    const result = await db.query(
      `SELECT
        p.id, p.author_id, p.content, p.media_urls, p.media_type, p.tags,
        p.likes_count, p.comments_count, p.created_at, p.visibility,
        json_build_object(
          'id', pr.id,
          'username', pr.username,
          'full_name', pr.full_name,
          'avatar_url', pr.avatar_url,
          'is_verified', pr.is_verified,
          'account_type', pr.account_type
        ) as author,
        EXISTS(SELECT 1 FROM likes l WHERE l.post_id = p.id AND l.user_id = $${queryParams.length + 1}) as is_liked,
        EXISTS(SELECT 1 FROM saved_posts sp WHERE sp.post_id = p.id AND sp.user_id = $${queryParams.length + 1}) as is_saved
      FROM posts p
      LEFT JOIN profiles pr ON p.author_id = pr.id
      WHERE p.author_id = ANY($1)
        AND (
          p.visibility = 'public'
          OR p.author_id = $${queryParams.length + 1}
          OR (p.visibility IN ('fans', 'followers') AND p.author_id = ANY($1))
          OR (p.visibility = 'subscribers' AND p.author_id = ANY($${queryParams.length + 2}::uuid[]))
        )
        ${cursorCondition}
      ORDER BY p.created_at DESC, p.id DESC
      LIMIT $${queryParams.length}`,
      [...queryParams, userId, subscribedCreatorIds.length > 0 ? subscribedCreatorIds : []]
    );

    const hasMore = result.rows.length > limit;
    const posts = result.rows.slice(0, limit);

    const response = {
      data: posts.map((post: Record<string, unknown>) => ({
        id: post.id,
        authorId: post.author_id,
        content: post.content,
        mediaUrls: post.media_urls || [],
        mediaType: post.media_type,
        tags: post.tags || [],
        likesCount: post.likes_count || 0,
        commentsCount: post.comments_count || 0,
        createdAt: post.created_at,
        isLiked: post.is_liked,
        isSaved: post.is_saved,
        author: post.author,
      })),
      nextCursor: hasMore ? `${posts[posts.length - 1].created_at}|${posts[posts.length - 1].id}` : null,
      hasMore,
      total: posts.length,
    };

    // Cache the response in Redis
    if (redisClient) {
      try {
        await redisClient.setex(cacheKey, 15, JSON.stringify(response)); // 15s TTL — short to reflect like/save changes
      } catch {
        // Redis write failure is non-critical
        log.warn('Redis cache write error');
      }
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(response),
    };
  } catch (error: unknown) {
    log.error('Error getting feed', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ message: 'Internal server error' }),
    };
  }
}

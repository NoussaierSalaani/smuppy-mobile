/**
 * Get Feed Lambda Handler
 * Retrieves personalized feed for authenticated user
 * Uses DynamoDB for feed caching and PostgreSQL for data
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import Redis from 'ioredis';
import { getReaderPool } from '../../shared/db';
import { createHeaders } from '../utils/cors';
import { createLogger, getRequestId } from '../utils/logger';

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
    const userId = event.requestContext.authorizer?.claims?.sub;
    const limit = Math.min(parseInt(event.queryStringParameters?.limit || '20'), 50);
    const cursor = event.queryStringParameters?.cursor;

    if (!userId) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ message: 'Unauthorized' }),
      };
    }

    // Use reader pool for read-heavy feed operations (distributed across read replicas)
    const db = await getReaderPool();

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

    const followingIds = followingResult.rows.map(row => row.following_id);

    // Include user's own posts
    const allAuthorIds = [userId, ...followingIds];

    // Build cursor condition
    let cursorCondition = '';
    const queryParams: any[] = [allAuthorIds];

    if (cursor) {
      cursorCondition = 'AND p.created_at < $2';
      queryParams.push(new Date(cursor));
    }

    queryParams.push(limit + 1); // Fetch one extra to check hasMore

    // Get feed posts
    const result = await db.query(
      `SELECT
        p.*,
        json_build_object(
          'id', pr.id,
          'username', pr.username,
          'full_name', pr.full_name,
          'avatar_url', pr.avatar_url,
          'is_verified', pr.is_verified,
          'account_type', pr.account_type
        ) as author,
        EXISTS(SELECT 1 FROM likes l WHERE l.post_id = p.id AND l.user_id = $${queryParams.length + 1}) as is_liked
      FROM posts p
      LEFT JOIN profiles pr ON p.author_id = pr.id
      WHERE p.author_id = ANY($1)
        AND (p.visibility = 'public' OR p.author_id = $${queryParams.length + 1})
        ${cursorCondition}
      ORDER BY p.created_at DESC
      LIMIT $${cursorCondition ? 3 : 2}`,
      [...queryParams, userId]
    );

    const hasMore = result.rows.length > limit;
    const posts = result.rows.slice(0, limit);

    const response = {
      data: posts.map(post => ({
        id: post.id,
        authorId: post.author_id,
        content: post.content,
        mediaUrls: post.media_urls || [],
        mediaType: post.media_type,
        likesCount: post.likes_count || 0,
        commentsCount: post.comments_count || 0,
        createdAt: post.created_at,
        isLiked: post.is_liked,
        author: post.author,
      })),
      nextCursor: hasMore ? posts[posts.length - 1].created_at : null,
      hasMore,
      total: posts.length,
    };

    // Cache the response in Redis
    if (redisClient) {
      try {
        await redisClient.setex(cacheKey, 60, JSON.stringify(response)); // 60 seconds TTL
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
  } catch (error: any) {
    log.error('Error getting feed', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ message: 'Internal server error' }),
    };
  }
}

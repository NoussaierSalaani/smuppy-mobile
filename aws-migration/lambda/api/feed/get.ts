/**
 * Get Feed Lambda Handler
 * Retrieves personalized feed for authenticated user
 * Uses DynamoDB for feed caching and PostgreSQL for data
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { Pool } from 'pg';
import Redis from 'ioredis';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { DynamoDBClient, QueryCommand } from '@aws-sdk/client-dynamodb';

let pool: Pool | null = null;
let redis: Redis | null = null;

const secretsClient = new SecretsManagerClient({});
const dynamoClient = new DynamoDBClient({});

async function getDbCredentials(): Promise<{ host: string; port: number; database: string; username: string; password: string }> {
  const command = new GetSecretValueCommand({
    SecretId: process.env.DB_SECRET_ARN,
  });
  const response = await secretsClient.send(command);
  return JSON.parse(response.SecretString || '{}');
}

async function getPool(): Promise<Pool> {
  if (!pool) {
    const credentials = await getDbCredentials();
    pool = new Pool({
      host: credentials.host,
      port: credentials.port,
      database: credentials.dbname || 'smuppy',
      user: credentials.username,
      password: credentials.password,
      ssl: { rejectUnauthorized: false },
      max: 20,
      idleTimeoutMillis: 30000,
    });
  }
  return pool;
}

function getRedis(): Redis {
  if (!redis && process.env.REDIS_ENDPOINT) {
    redis = new Redis({
      host: process.env.REDIS_ENDPOINT,
      port: 6379,
      maxRetriesPerRequest: 3,
      lazyConnect: true,
    });
  }
  return redis!;
}

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    'Cache-Control': 'private, max-age=60',
  };

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

    const db = await getPool();

    // Try to get cached feed from Redis
    const cacheKey = `feed:${userId}:${cursor || 'start'}`;
    let cachedFeed: string | null = null;

    if (process.env.REDIS_ENDPOINT) {
      try {
        const redisClient = getRedis();
        cachedFeed = await redisClient.get(cacheKey);

        if (cachedFeed) {
          return {
            statusCode: 200,
            headers,
            body: cachedFeed,
          };
        }
      } catch (redisError) {
        console.warn('Redis cache miss:', redisError);
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

    // Cache the response
    if (process.env.REDIS_ENDPOINT) {
      try {
        const redisClient = getRedis();
        await redisClient.setex(cacheKey, 60, JSON.stringify(response)); // 60 seconds TTL
      } catch (redisError) {
        console.warn('Redis cache write error:', redisError);
      }
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(response),
    };
  } catch (error: any) {
    console.error('Error getting feed:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ message: 'Internal server error' }),
    };
  }
}

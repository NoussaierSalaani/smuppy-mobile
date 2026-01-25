/**
 * Posts List Lambda - Instagram-Level Scale
 * Handles millions of requests with caching, cursor pagination, and feed algorithms
 */

import { APIGatewayProxyHandler, APIGatewayProxyResult } from 'aws-lambda';
import { Pool, PoolConfig } from 'pg';
import Redis from 'ioredis';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

// Connection pools (reused across Lambda invocations for performance)
let pgPool: Pool | null = null;
let redis: Redis | null = null;
let dbCredentials: any = null;

const secretsManager = new SecretsManagerClient({});

const {
  DB_SECRET_ARN,
  REDIS_HOST,
  REDIS_PORT = '6379',
  ENVIRONMENT = 'staging',
} = process.env;

const CACHE_TTL = {
  POSTS_LIST: 60,
  POST_DETAIL: 300,
  USER_FEED: 30,
};

async function getDbCredentials(): Promise<any> {
  if (dbCredentials) return dbCredentials;
  const command = new GetSecretValueCommand({ SecretId: DB_SECRET_ARN });
  const response = await secretsManager.send(command);
  dbCredentials = JSON.parse(response.SecretString || '{}');
  return dbCredentials;
}

async function getPgPool(): Promise<Pool> {
  if (pgPool) return pgPool;
  const creds = await getDbCredentials();
  const config: PoolConfig = {
    host: creds.host,
    port: creds.port || 5432,
    database: creds.dbname || 'smuppy',
    user: creds.username,
    password: creds.password,
    ssl: { rejectUnauthorized: false },
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  };
  pgPool = new Pool(config);
  return pgPool;
}

function getRedis(): Redis {
  if (redis) return redis;
  redis = new Redis({
    host: REDIS_HOST,
    port: parseInt(REDIS_PORT),
    tls: {},
    maxRetriesPerRequest: 3,
    lazyConnect: true,
  });
  return redis;
}

function response(statusCode: number, body: any): APIGatewayProxyResult {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Credentials': 'true',
      'Cache-Control': statusCode === 200 ? 'public, max-age=60' : 'no-cache',
    },
    body: JSON.stringify(body),
  };
}

export const handler: APIGatewayProxyHandler = async (event) => {
  const startTime = Date.now();

  try {
    const {
      limit = '20',
      cursor,
      type = 'all',
      userId,
    } = event.queryStringParameters || {};

    const parsedLimit = Math.min(parseInt(limit), 100);
    const requesterId = event.requestContext.authorizer?.claims?.sub;
    const cacheKey = `posts:list:${type}:${userId || 'all'}:${cursor || 'first'}:${parsedLimit}`;

    // Try cache first (for public feeds)
    const redisClient = getRedis();
    if (type !== 'following') {
      try {
        const cached = await redisClient.get(cacheKey);
        if (cached) {
          return response(200, { ...JSON.parse(cached), cached: true, latency: Date.now() - startTime });
        }
      } catch (e) { /* Cache miss, continue */ }
    }

    const pool = await getPgPool();
    let query: string;
    let params: any[];

    if (type === 'following' && requesterId) {
      query = `
        SELECT p.id, p.user_id as "authorId", p.content, p.media_urls as "mediaUrls", p.media_type as "mediaType",
               p.likes_count as "likesCount", p.comments_count as "commentsCount", p.created_at as "createdAt",
               u.username, u.full_name as "fullName", u.avatar_url as "avatarUrl", u.is_verified as "isVerified", u.account_type as "accountType",
               EXISTS(SELECT 1 FROM likes l WHERE l.post_id = p.id AND l.user_id = $1) as "isLiked"
        FROM posts p
        JOIN users u ON p.user_id = u.id
        JOIN follows f ON f.following_id = p.user_id AND f.follower_id = $1 AND f.status = 'accepted'
        WHERE p.deleted_at IS NULL ${cursor ? 'AND p.created_at < $3' : ''}
        ORDER BY p.created_at DESC LIMIT $2
      `;
      params = cursor ? [requesterId, parsedLimit + 1, new Date(parseInt(cursor))] : [requesterId, parsedLimit + 1];
    } else if (userId) {
      query = `
        SELECT p.id, p.user_id as "authorId", p.content, p.media_urls as "mediaUrls", p.media_type as "mediaType",
               p.likes_count as "likesCount", p.comments_count as "commentsCount", p.created_at as "createdAt",
               u.username, u.full_name as "fullName", u.avatar_url as "avatarUrl", u.is_verified as "isVerified", u.account_type as "accountType"
        FROM posts p JOIN users u ON p.user_id = u.id
        WHERE p.user_id = $1 AND p.deleted_at IS NULL ${cursor ? 'AND p.created_at < $3' : ''}
        ORDER BY p.created_at DESC LIMIT $2
      `;
      params = cursor ? [userId, parsedLimit + 1, new Date(parseInt(cursor))] : [userId, parsedLimit + 1];
    } else {
      query = `
        SELECT p.id, p.user_id as "authorId", p.content, p.media_urls as "mediaUrls", p.media_type as "mediaType",
               p.likes_count as "likesCount", p.comments_count as "commentsCount", p.created_at as "createdAt",
               u.username, u.full_name as "fullName", u.avatar_url as "avatarUrl", u.is_verified as "isVerified", u.account_type as "accountType"
        FROM posts p JOIN users u ON p.user_id = u.id
        WHERE p.deleted_at IS NULL ${cursor ? 'AND p.created_at < $2' : ''}
        ORDER BY CASE WHEN p.created_at > NOW() - INTERVAL '24 hours' THEN p.likes_count * 2 + p.comments_count ELSE p.likes_count + p.comments_count END DESC, p.created_at DESC
        LIMIT $1
      `;
      params = cursor ? [parsedLimit + 1, new Date(parseInt(cursor))] : [parsedLimit + 1];
    }

    const result = await pool.query(query, params);
    const hasMore = result.rows.length > parsedLimit;
    const posts = hasMore ? result.rows.slice(0, parsedLimit) : result.rows;

    const formattedPosts = posts.map(post => ({
      id: post.id, authorId: post.authorId, content: post.content, mediaUrls: post.mediaUrls || [],
      mediaType: post.mediaType, likesCount: parseInt(post.likesCount) || 0, commentsCount: parseInt(post.commentsCount) || 0,
      createdAt: post.createdAt, isLiked: post.isLiked || false,
      author: { id: post.authorId, username: post.username, fullName: post.fullName, avatarUrl: post.avatarUrl, isVerified: post.isVerified, accountType: post.accountType },
    }));

    const responseData = { posts: formattedPosts, nextCursor: hasMore ? posts[posts.length - 1].createdAt.getTime().toString() : null, hasMore, total: formattedPosts.length };

    if (type !== 'following') {
      try { await redisClient.setex(cacheKey, CACHE_TTL.POSTS_LIST, JSON.stringify(responseData)); } catch (e) { /* Ignore */ }
    }

    return response(200, { ...responseData, cached: false, latency: Date.now() - startTime });
  } catch (error: any) {
    console.error('Error fetching posts:', error);
    return response(500, { error: 'Internal server error', message: ENVIRONMENT === 'staging' ? error.message : undefined });
  }
};

/**
 * Lambda Function: List Posts
 * Endpoint: GET /posts
 */

import { APIGatewayProxyHandler, APIGatewayProxyResult } from 'aws-lambda';
import { Pool } from 'pg';
import { SecretsManager } from '@aws-sdk/client-secrets-manager';
import { Redis } from 'ioredis';

// Database connection pool (reused across invocations)
let pool: Pool | null = null;
let redis: Redis | null = null;

// Initialize database connection
async function getDbPool(): Promise<Pool> {
  if (pool) return pool;

  const secretsManager = new SecretsManager();
  const secret = await secretsManager.getSecretValue({
    SecretId: process.env.DB_SECRET_ARN!,
  });

  const credentials = JSON.parse(secret.SecretString!);

  pool = new Pool({
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME,
    user: credentials.username,
    password: credentials.password,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
  });

  return pool;
}

// Initialize Redis connection
function getRedis(): Redis {
  if (redis) return redis;

  redis = new Redis({
    host: process.env.REDIS_HOST,
    port: parseInt(process.env.REDIS_PORT || '6379'),
    maxRetriesPerRequest: 3,
  });

  return redis;
}

// Response helper
function response(statusCode: number, body: any): APIGatewayProxyResult {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Credentials': true,
    },
    body: JSON.stringify(body),
  };
}

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    // Parse query parameters
    const limit = parseInt(event.queryStringParameters?.limit || '20');
    const offset = parseInt(event.queryStringParameters?.offset || '0');
    const authorId = event.queryStringParameters?.author_id;
    const visibility = event.queryStringParameters?.visibility || 'public';

    // Try cache first
    const cacheKey = `posts:${visibility}:${authorId || 'all'}:${offset}:${limit}`;
    const redisClient = getRedis();

    const cached = await redisClient.get(cacheKey);
    if (cached) {
      return response(200, JSON.parse(cached));
    }

    // Query database
    const db = await getDbPool();

    let query = `
      SELECT
        p.id,
        p.author_id,
        p.content,
        p.media_urls,
        p.media_type,
        p.visibility,
        p.likes_count,
        p.comments_count,
        p.created_at,
        p.updated_at,
        json_build_object(
          'id', pr.id,
          'username', pr.username,
          'full_name', pr.full_name,
          'avatar_url', pr.avatar_url,
          'is_verified', pr.is_verified,
          'account_type', pr.account_type
        ) as author
      FROM posts p
      LEFT JOIN profiles pr ON p.author_id = pr.id
      WHERE p.visibility = $1
    `;

    const params: any[] = [visibility];
    let paramIndex = 2;

    if (authorId) {
      query += ` AND p.author_id = $${paramIndex}`;
      params.push(authorId);
      paramIndex++;
    }

    query += ` ORDER BY p.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, offset);

    const result = await db.query(query, params);

    const posts = result.rows.map((row) => ({
      id: row.id,
      author_id: row.author_id,
      content: row.content,
      media_urls: row.media_urls,
      media_type: row.media_type,
      visibility: row.visibility,
      likes_count: row.likes_count,
      comments_count: row.comments_count,
      created_at: row.created_at,
      updated_at: row.updated_at,
      author: row.author,
    }));

    // Cache for 60 seconds
    await redisClient.setex(cacheKey, 60, JSON.stringify(posts));

    return response(200, posts);
  } catch (error) {
    console.error('Error listing posts:', error);
    return response(500, { error: 'Internal server error' });
  }
};

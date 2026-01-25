/**
 * Get Single Post Lambda Handler
 * Retrieves a single post by ID with author data
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { Pool } from 'pg';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

let pool: Pool | null = null;

const secretsClient = new SecretsManagerClient({});

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
      max: 10,
      idleTimeoutMillis: 30000,
    });
  }
  return pool;
}

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  };

  try {
    const postId = event.pathParameters?.id;

    if (!postId) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ message: 'Post ID is required' }),
      };
    }

    const db = await getPool();

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
        ) as author
      FROM posts p
      LEFT JOIN profiles pr ON p.author_id = pr.id
      WHERE p.id = $1`,
      [postId]
    );

    if (result.rows.length === 0) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ message: 'Post not found' }),
      };
    }

    const post = result.rows[0];

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        id: post.id,
        authorId: post.author_id,
        content: post.content,
        mediaUrls: post.media_urls || [],
        mediaType: post.media_type,
        likesCount: post.likes_count || 0,
        commentsCount: post.comments_count || 0,
        createdAt: post.created_at,
        author: post.author,
      }),
    };
  } catch (error: any) {
    console.error('Error getting post:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ message: 'Internal server error' }),
    };
  }
}

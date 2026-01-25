/**
 * Create Post Lambda Handler
 * Creates a new post with media support
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { Pool } from 'pg';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { v4 as uuidv4 } from 'uuid';

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

interface CreatePostInput {
  content?: string;
  mediaUrls?: string[];
  mediaType?: 'image' | 'video';
  visibility?: 'public' | 'followers' | 'private';
}

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  };

  try {
    // Get user ID from Cognito authorizer
    const userId = event.requestContext.authorizer?.claims?.sub;

    if (!userId) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ message: 'Unauthorized' }),
      };
    }

    const body: CreatePostInput = JSON.parse(event.body || '{}');

    // Validate input
    if (!body.content && (!body.mediaUrls || body.mediaUrls.length === 0)) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ message: 'Content or media is required' }),
      };
    }

    const db = await getPool();
    const postId = uuidv4();

    // Insert post
    const result = await db.query(
      `INSERT INTO posts (id, author_id, content, media_urls, media_type, visibility, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())
       RETURNING *`,
      [
        postId,
        userId,
        body.content || '',
        body.mediaUrls || [],
        body.mediaType || null,
        body.visibility || 'public',
      ]
    );

    // Get author data
    const authorResult = await db.query(
      `SELECT id, username, full_name, avatar_url, is_verified, account_type
       FROM profiles WHERE id = $1`,
      [userId]
    );

    const post = result.rows[0];
    const author = authorResult.rows[0] || null;

    // Update user's post count
    await db.query(
      `UPDATE profiles SET post_count = COALESCE(post_count, 0) + 1 WHERE id = $1`,
      [userId]
    );

    return {
      statusCode: 201,
      headers,
      body: JSON.stringify({
        id: post.id,
        authorId: post.author_id,
        content: post.content,
        mediaUrls: post.media_urls || [],
        mediaType: post.media_type,
        likesCount: 0,
        commentsCount: 0,
        createdAt: post.created_at,
        author,
      }),
    };
  } catch (error: any) {
    console.error('Error creating post:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ message: 'Internal server error' }),
    };
  }
}

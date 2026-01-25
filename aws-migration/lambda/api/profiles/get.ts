/**
 * Get Profile Lambda Handler
 * Retrieves a user profile by ID or username
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
    const profileId = event.pathParameters?.id;
    const username = event.pathParameters?.username;
    const currentUserId = event.requestContext.authorizer?.claims?.sub;

    if (!profileId && !username) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ message: 'Profile ID or username is required' }),
      };
    }

    const db = await getPool();

    let result;
    if (username) {
      result = await db.query(
        `SELECT * FROM profiles WHERE username = $1`,
        [username]
      );
    } else {
      result = await db.query(
        `SELECT * FROM profiles WHERE id = $1`,
        [profileId]
      );
    }

    if (result.rows.length === 0) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ message: 'Profile not found' }),
      };
    }

    const profile = result.rows[0];

    // Check follow status if authenticated
    let isFollowing = false;
    let isFollowedBy = false;

    if (currentUserId && currentUserId !== profile.id) {
      const followResult = await db.query(
        `SELECT
          EXISTS(SELECT 1 FROM follows WHERE follower_id = $1 AND following_id = $2 AND status = 'accepted') as is_following,
          EXISTS(SELECT 1 FROM follows WHERE follower_id = $2 AND following_id = $1 AND status = 'accepted') as is_followed_by`,
        [currentUserId, profile.id]
      );

      if (followResult.rows.length > 0) {
        isFollowing = followResult.rows[0].is_following;
        isFollowedBy = followResult.rows[0].is_followed_by;
      }
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        id: profile.id,
        username: profile.username,
        fullName: profile.full_name,
        avatarUrl: profile.avatar_url,
        coverUrl: profile.cover_url,
        bio: profile.bio,
        isVerified: profile.is_verified || false,
        isPrivate: profile.is_private || false,
        accountType: profile.account_type || 'personal',
        followersCount: profile.fan_count || 0,
        followingCount: profile.following_count || 0,
        postsCount: profile.post_count || 0,
        isFollowing,
        isFollowedBy,
      }),
    };
  } catch (error: any) {
    console.error('Error getting profile:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ message: 'Internal server error' }),
    };
  }
}

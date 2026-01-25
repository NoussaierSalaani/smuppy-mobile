/**
 * Search Profiles Lambda Handler
 * Full-text search for user profiles
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
    const query = event.queryStringParameters?.search || event.queryStringParameters?.q || '';
    const limit = Math.min(parseInt(event.queryStringParameters?.limit || '20'), 50);

    if (!query || query.length < 2) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify([]),
      };
    }

    const db = await getPool();

    // Search using ILIKE for partial matching
    const result = await db.query(
      `SELECT
        id, username, full_name, avatar_url, bio,
        is_verified, is_private, account_type,
        fan_count as followers_count, following_count, post_count as posts_count
      FROM profiles
      WHERE username ILIKE $1 OR full_name ILIKE $1
      ORDER BY
        CASE WHEN username = $2 THEN 0
             WHEN username ILIKE $3 THEN 1
             ELSE 2
        END,
        fan_count DESC NULLS LAST
      LIMIT $4`,
      [`%${query}%`, query, `${query}%`, limit]
    );

    const profiles = result.rows.map(profile => ({
      id: profile.id,
      username: profile.username,
      fullName: profile.full_name,
      avatarUrl: profile.avatar_url,
      bio: profile.bio,
      isVerified: profile.is_verified || false,
      isPrivate: profile.is_private || false,
      accountType: profile.account_type || 'personal',
      followersCount: profile.followers_count || 0,
      followingCount: profile.following_count || 0,
      postsCount: profile.posts_count || 0,
    }));

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(profiles),
    };
  } catch (error: any) {
    console.error('Error searching profiles:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ message: 'Internal server error' }),
    };
  }
}

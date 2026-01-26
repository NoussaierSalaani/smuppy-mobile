/**
 * Search Profiles Lambda Handler
 * Full-text search for user profiles
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getReaderPool } from '../../shared/db';
import { createHeaders } from '../utils/cors';
import { createLogger, getRequestId } from '../utils/logger';

const log = createLogger('profiles-search');

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const headers = createHeaders(event);

  try {
    const query = event.queryStringParameters?.search || event.queryStringParameters?.q || '';
    const limit = Math.min(parseInt(event.queryStringParameters?.limit || '20'), 50);

    // Use reader pool for read-heavy search operations
    const db = await getReaderPool();

    let result;

    if (!query || query.length < 1) {
      // No query - return popular/recent profiles
      result = await db.query(
        `SELECT
          id, username, full_name, avatar_url, bio,
          is_verified, is_private, account_type,
          fan_count as followers_count, following_count, post_count as posts_count
        FROM profiles
        WHERE is_private = false
        ORDER BY
          CASE WHEN is_verified THEN 0 ELSE 1 END,
          CASE WHEN account_type = 'pro_creator' THEN 0
               WHEN account_type = 'pro_local' THEN 1
               ELSE 2 END,
          fan_count DESC NULLS LAST,
          created_at DESC
        LIMIT $1`,
        [limit]
      );
    } else {
      // Search using ILIKE for partial matching
      result = await db.query(
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
    }

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
    log.error('Error searching profiles', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ message: 'Internal server error' }),
    };
  }
}

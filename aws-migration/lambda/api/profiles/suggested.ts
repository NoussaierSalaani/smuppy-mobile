/**
 * Get Suggested Profiles Lambda Handler
 * Returns profiles that the current user might want to follow
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getPool } from '../../shared/db';
import { createHeaders } from '../utils/cors';

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const headers = createHeaders(event);

  try {
    // Get current user ID from Cognito authorizer
    const currentUserId = event.requestContext.authorizer?.claims?.sub;

    // Get limit from query params
    const limit = Math.min(parseInt(event.queryStringParameters?.limit || '10'), 50);

    const db = await getPool();

    // Get suggested profiles:
    // 1. Users that the current user is NOT following
    // 2. Ordered by popularity (fan_count) and recency
    // 3. Exclude the current user
    // 4. Prioritize verified accounts and pro creators

    let query: string;
    let params: any[];

    // Get offset for pagination (to get fresh results each time)
    const offset = parseInt(event.queryStringParameters?.offset || '0');

    if (currentUserId) {
      // Authenticated: exclude users already in FanFeed relationship (following or followed by)
      query = `
        SELECT
          p.id,
          p.username,
          p.full_name,
          p.avatar_url,
          p.cover_url,
          p.bio,
          p.is_verified,
          p.is_private,
          p.account_type,
          p.fan_count,
          p.following_count,
          p.post_count
        FROM profiles p
        WHERE p.id != $1
          AND p.is_private = false
          -- Exclude people I follow
          AND p.id NOT IN (
            SELECT following_id FROM follows
            WHERE follower_id = $1 AND status = 'accepted'
          )
          -- Exclude people who follow me
          AND p.id NOT IN (
            SELECT follower_id FROM follows
            WHERE following_id = $1 AND status = 'accepted'
          )
        ORDER BY
          CASE WHEN p.is_verified THEN 0 ELSE 1 END,
          CASE WHEN p.account_type = 'pro_creator' THEN 0
               WHEN p.account_type = 'pro_local' THEN 1
               ELSE 2 END,
          p.fan_count DESC,
          p.created_at DESC
        LIMIT $2 OFFSET $3
      `;
      params = [currentUserId, limit, offset];
    } else {
      // Unauthenticated: just get popular profiles
      query = `
        SELECT
          p.id,
          p.username,
          p.full_name,
          p.avatar_url,
          p.cover_url,
          p.bio,
          p.is_verified,
          p.is_private,
          p.account_type,
          p.fan_count,
          p.following_count,
          p.post_count
        FROM profiles p
        WHERE p.is_private = false
        ORDER BY
          CASE WHEN p.is_verified THEN 0 ELSE 1 END,
          p.fan_count DESC,
          p.created_at DESC
        LIMIT $1 OFFSET $2
      `;
      params = [limit, offset];
    }

    const result = await db.query(query, params);

    const profiles = result.rows.map(profile => ({
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
    }));

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        profiles,
        total: profiles.length,
      }),
    };
  } catch (error: any) {
    console.error('Error getting suggested profiles:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ message: 'Internal server error' }),
    };
  }
}

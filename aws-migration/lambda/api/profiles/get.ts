/**
 * Get Profile Lambda Handler
 * Retrieves a user profile by ID or username
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getReaderPool } from '../../shared/db';
import { createHeaders } from '../utils/cors';
import { createLogger, getRequestId } from '../utils/logger';

const log = createLogger('profiles-get');

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const headers = createHeaders(event);

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

    // SECURITY: Validate UUID format for profileId
    if (profileId) {
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(profileId)) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ message: 'Invalid profile ID format' }),
        };
      }
    }

    // Use reader pool for read operations
    const db = await getReaderPool();

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

    // Check follow status and resolve current user ID
    let isFollowing = false;
    let isFollowedBy = false;
    let resolvedUserId: string | null = null;
    let isOwner = false;

    if (currentUserId) {
      // Resolve the current user's profile ID from cognito_sub
      const userResult = await db.query(
        'SELECT id FROM profiles WHERE id = $1 OR cognito_sub = $1',
        [currentUserId]
      );
      resolvedUserId = userResult.rows[0]?.id || null;
      isOwner = resolvedUserId === profile.id;

      if (resolvedUserId && !isOwner) {
        const followResult = await db.query(
          `SELECT
            EXISTS(SELECT 1 FROM follows WHERE follower_id = $1 AND following_id = $2 AND status = 'accepted') as is_following,
            EXISTS(SELECT 1 FROM follows WHERE follower_id = $2 AND following_id = $1 AND status = 'accepted') as is_followed_by`,
          [resolvedUserId, profile.id]
        );

        if (followResult.rows.length > 0) {
          isFollowing = followResult.rows[0].is_following;
          isFollowedBy = followResult.rows[0].is_followed_by;
        }
      }
    }

    // PRIVACY CHECK: If profile is private and user is not owner/follower, return limited info
    const isPrivate = profile.is_private || false;
    const canViewFullProfile = isOwner || isFollowing || !isPrivate;

    if (!canViewFullProfile) {
      // Return limited public information for private profiles
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          id: profile.id,
          username: profile.username,
          fullName: profile.full_name,
          avatarUrl: profile.avatar_url,
          isVerified: profile.is_verified || false,
          isPrivate: true,
          accountType: profile.account_type || 'personal',
          followersCount: profile.fan_count || 0,
          followingCount: profile.following_count || 0,
          isFollowing,
          isFollowedBy,
          // Bio, cover, posts count hidden for private profiles
        }),
      };
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
        isPrivate,
        accountType: profile.account_type || 'personal',
        followersCount: profile.fan_count || 0,
        followingCount: profile.following_count || 0,
        postsCount: profile.post_count || 0,
        isFollowing,
        isFollowedBy,
      }),
    };
  } catch (error: any) {
    log.error('Error getting profile', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ message: 'Internal server error' }),
    };
  }
}

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

    const PROFILE_COLUMNS = `id, username, full_name, display_name, avatar_url, cover_url,
      bio, website, is_verified, is_premium, is_private, account_type, gender, date_of_birth,
      interests, expertise, social_links, business_name, business_category,
      business_address, business_latitude, business_longitude, business_phone,
      locations_mode, onboarding_completed,
      fan_count, following_count, post_count`;

    let result;
    if (username) {
      result = await db.query(
        `SELECT ${PROFILE_COLUMNS} FROM profiles WHERE username = $1`,
        [username]
      );
    } else {
      result = await db.query(
        `SELECT ${PROFILE_COLUMNS} FROM profiles WHERE id = $1`,
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
        'SELECT id FROM profiles WHERE cognito_sub = $1',
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
        displayName: profile.display_name,
        avatarUrl: profile.avatar_url,
        coverUrl: profile.cover_url,
        bio: profile.bio,
        website: profile.website,
        isVerified: profile.is_verified || false,
        isPremium: profile.is_premium || false,
        isPrivate,
        accountType: profile.account_type || 'personal',
        gender: profile.gender,
        dateOfBirth: profile.date_of_birth,
        interests: profile.interests,
        expertise: profile.expertise,
        socialLinks: profile.social_links,
        businessName: profile.business_name,
        businessCategory: profile.business_category,
        businessAddress: profile.business_address,
        businessLatitude: profile.business_latitude ? parseFloat(profile.business_latitude) : null,
        businessLongitude: profile.business_longitude ? parseFloat(profile.business_longitude) : null,
        businessPhone: profile.business_phone,
        locationsMode: profile.locations_mode,
        onboardingCompleted: profile.onboarding_completed,
        followersCount: profile.fan_count || 0,
        followingCount: profile.following_count || 0,
        postsCount: profile.post_count || 0,
        isFollowing,
        isFollowedBy,
      }),
    };
  } catch (error: unknown) {
    log.error('Error getting profile', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ message: 'Internal server error' }),
    };
  }
}

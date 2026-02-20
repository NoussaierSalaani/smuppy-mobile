/**
 * Get Profile Lambda Handler
 * Retrieves a user profile by ID or username
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getPool } from '../../shared/db';
import { createCacheableHeaders } from '../utils/cors';
import { isValidUUID } from '../utils/security';
import { resolveProfileId } from '../utils/auth';
import { withErrorHandler } from '../utils/error-handler';

export const handler = withErrorHandler('profiles-get', async (event, { headers }) => {
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
    if (profileId && !isValidUUID(profileId)) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ message: 'Invalid profile ID format' }),
      };
    }

    // Use reader pool for read operations
    // Use writer pool to avoid replica lag on follow status / counts
    const db = await getPool();

    const PROFILE_COLUMNS = `id, username, full_name, display_name, avatar_url, cover_url,
      bio, website, is_verified, is_premium, is_private, account_type, gender, date_of_birth,
      interests, expertise, social_links, business_name, business_category,
      business_address, business_latitude, business_longitude, business_phone,
      locations_mode, onboarding_completed, moderation_status,
      fan_count, following_count, post_count,
      (SELECT COUNT(*) FROM peaks WHERE author_id = profiles.id AND (expires_at IS NULL OR expires_at > NOW() OR saved_to_profile = true)) AS peak_count`;

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

    // SECURITY: Enforce moderation status — banned/suspended profiles are not viewable
    if (profile.moderation_status === 'banned') {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ message: 'Profile not found' }),
      };
    }

    if (profile.moderation_status === 'suspended') {
      return {
        statusCode: 403,
        headers,
        body: JSON.stringify({ message: 'This account has been suspended' }),
      };
    }

    // Check follow status and resolve current user ID
    let isFollowing = false;
    let isFollowedBy = false;
    let resolvedUserId: string | null = null;
    let isOwner = false;

    if (currentUserId) {
      // Resolve the current user's profile ID from cognito_sub
      resolvedUserId = await resolveProfileId(db, currentUserId);
      isOwner = resolvedUserId === profile.id;

      if (resolvedUserId && !isOwner) {
        // SECURITY: Check if either user has blocked the other
        const blockCheck = await db.query(
          `SELECT 1 FROM blocked_users
           WHERE (blocker_id = $1 AND blocked_id = $2)
              OR (blocker_id = $2 AND blocked_id = $1)
           LIMIT 1`,
          [resolvedUserId, profile.id]
        );
        if (blockCheck.rows.length > 0) {
          return {
            statusCode: 404,
            headers,
            body: JSON.stringify({ message: 'Profile not found' }),
          };
        }

        // Query actual follow rows instead of EXISTS() to avoid boolean conversion issues
        const followResult = await db.query(
          `SELECT status, follower_id, following_id FROM follows
           WHERE (follower_id = $1 AND following_id = $2)
              OR (follower_id = $2 AND following_id = $1)`,
          [resolvedUserId, profile.id]
        );

        for (const row of followResult.rows) {
          if (row.follower_id === resolvedUserId && row.following_id === profile.id && row.status === 'accepted') {
            isFollowing = true;
          }
          if (row.follower_id === profile.id && row.following_id === resolvedUserId && row.status === 'accepted') {
            isFollowedBy = true;
          }
        }
      }
    }

    // PRIVACY CHECK: If profile is private and user is not owner/follower, return limited info
    const isPrivate = !!profile.is_private;
    const canViewFullProfile = isOwner || isFollowing || !isPrivate;

    if (!canViewFullProfile) {
      // Return limited public information for private profiles
      return {
        statusCode: 200,
        headers: createCacheableHeaders(event, 'private, max-age=60'),
        body: JSON.stringify({
          id: profile.id,
          username: profile.username,
          fullName: profile.full_name,
          avatarUrl: profile.avatar_url,
          isVerified: !!profile.is_verified,
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
      headers: createCacheableHeaders(event, 'private, max-age=60'),
      body: JSON.stringify({
        id: profile.id,
        username: profile.username,
        fullName: profile.full_name,
        displayName: profile.display_name,
        avatarUrl: profile.avatar_url,
        coverUrl: profile.cover_url,
        bio: profile.bio,
        website: profile.website,
        isVerified: !!profile.is_verified,
        isPremium: !!profile.is_premium,
        isPrivate,
        accountType: profile.account_type || 'personal',
        gender: profile.gender,
        dateOfBirth: isOwner ? profile.date_of_birth : undefined,
        interests: profile.interests,
        expertise: profile.expertise,
        socialLinks: profile.social_links,
        businessName: profile.business_name,
        businessCategory: profile.business_category,
        businessAddress: profile.business_address,
        businessLatitude: profile.business_latitude ? Number.parseFloat(profile.business_latitude) : null,
        businessLongitude: profile.business_longitude ? Number.parseFloat(profile.business_longitude) : null,
        businessPhone: (isOwner || profile.account_type === 'pro_business') ? profile.business_phone : undefined,
        locationsMode: profile.locations_mode,
        onboardingCompleted: profile.onboarding_completed,
        followersCount: profile.fan_count || 0,
        followingCount: profile.following_count || 0,
        postsCount: profile.post_count || 0,
        peaksCount: Number.parseInt(profile.peak_count, 10) || 0,
        isFollowing,
        isFollowedBy,
      }),
    };
});

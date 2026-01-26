/**
 * Update Profile Lambda Handler
 * Updates the current user's profile
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getPool } from '../../shared/db';
import { createHeaders } from '../utils/cors';

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const headers = createHeaders(event);

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

    const body = JSON.parse(event.body || '{}');
    const db = await getPool();

    // Build update fields dynamically
    const updateFields: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    // Map of allowed fields (camelCase from API to snake_case in DB)
    const fieldMapping: Record<string, string> = {
      username: 'username',
      fullName: 'full_name',
      displayName: 'display_name',
      bio: 'bio',
      avatarUrl: 'avatar_url',
      coverUrl: 'cover_url',
      website: 'website',
      isPrivate: 'is_private',
      accountType: 'account_type',
      gender: 'gender',
      dateOfBirth: 'date_of_birth',
      interests: 'interests',
      expertise: 'expertise',
      socialLinks: 'social_links',
      businessName: 'business_name',
      businessCategory: 'business_category',
      businessAddress: 'business_address',
      businessPhone: 'business_phone',
      locationsMode: 'locations_mode',
      onboardingCompleted: 'onboarding_completed',
    };

    for (const [apiField, dbField] of Object.entries(fieldMapping)) {
      if (body[apiField] !== undefined) {
        updateFields.push(`${dbField} = $${paramIndex}`);
        values.push(body[apiField]);
        paramIndex++;
      }
    }

    if (updateFields.length === 0) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ message: 'No fields to update' }),
      };
    }

    // Add updated_at
    updateFields.push(`updated_at = NOW()`);

    // Add user ID for WHERE clause
    values.push(userId);

    // First, check if profile exists
    const existingProfile = await db.query(
      `SELECT id FROM profiles WHERE id = $1`,
      [userId]
    );

    let result;
    if (existingProfile.rows.length === 0) {
      // Create new profile
      const insertFields = ['id'];
      const insertValues = [userId];
      const insertParams = ['$1'];
      let insertIndex = 2;

      for (const [apiField, dbField] of Object.entries(fieldMapping)) {
        if (body[apiField] !== undefined) {
          insertFields.push(dbField);
          insertValues.push(body[apiField]);
          insertParams.push(`$${insertIndex}`);
          insertIndex++;
        }
      }

      insertFields.push('created_at', 'updated_at');
      insertParams.push('NOW()', 'NOW()');

      result = await db.query(
        `INSERT INTO profiles (${insertFields.join(', ')})
         VALUES (${insertParams.join(', ')})
         RETURNING *`,
        insertValues
      );
    } else {
      // Update existing profile
      result = await db.query(
        `UPDATE profiles
         SET ${updateFields.join(', ')}
         WHERE id = $${paramIndex}
         RETURNING *`,
        values
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
        isPrivate: profile.is_private || false,
        accountType: profile.account_type || 'personal',
        gender: profile.gender,
        dateOfBirth: profile.date_of_birth,
        interests: profile.interests,
        expertise: profile.expertise,
        socialLinks: profile.social_links,
        businessName: profile.business_name,
        businessCategory: profile.business_category,
        businessAddress: profile.business_address,
        businessPhone: profile.business_phone,
        locationsMode: profile.locations_mode,
        onboardingCompleted: profile.onboarding_completed,
        followersCount: profile.fan_count || 0,
        followingCount: profile.following_count || 0,
        postsCount: profile.post_count || 0,
      }),
    };
  } catch (error: any) {
    console.error('Error updating profile:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ message: 'Internal server error' }),
    };
  }
}

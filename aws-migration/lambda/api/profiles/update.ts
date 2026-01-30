/**
 * Update Profile Lambda Handler
 * Updates the current user's profile
 *
 * SECURITY: Input validation and sanitization
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getPool, SqlParam } from '../../shared/db';
import { createHeaders } from '../utils/cors';
import { sanitizeInput, isValidUsername, logSecurityEvent } from '../utils/security';
import { createLogger, getRequestId } from '../utils/logger';
import { checkRateLimit } from '../utils/rate-limit';
import { hasErrorCode } from '../utils/error-handler';

const log = createLogger('profiles-update');

// Validation rules for profile fields
const VALIDATION_RULES: Record<string, { maxLength: number; pattern?: RegExp; required?: boolean }> = {
  username: { maxLength: 30, pattern: /^[a-zA-Z0-9_.]{3,30}$/ },
  fullName: { maxLength: 100 },
  displayName: { maxLength: 50 },
  bio: { maxLength: 500 },
  avatarUrl: { maxLength: 500, pattern: /^https?:\/\/.+/ },
  coverUrl: { maxLength: 500, pattern: /^https?:\/\/.+/ },
  website: { maxLength: 255, pattern: /^https?:\/\/.+/ },
  gender: { maxLength: 20 },
  businessName: { maxLength: 100 },
  businessCategory: { maxLength: 50 },
  businessAddress: { maxLength: 500 },
  businessPhone: { maxLength: 20, pattern: /^[+\d\s\-()]{0,20}$/ },
};

// Validate and sanitize a single field
function validateField(field: string, value: unknown): { valid: boolean; sanitized: unknown; error?: string } {
  const rules = VALIDATION_RULES[field];

  // Boolean fields
  if (field === 'isPrivate' || field === 'onboardingCompleted') {
    if (typeof value !== 'boolean') {
      return { valid: false, sanitized: null, error: `${field} must be a boolean` };
    }
    return { valid: true, sanitized: value };
  }

  // Array fields (interests, expertise)
  if (field === 'interests' || field === 'expertise') {
    if (!Array.isArray(value)) {
      return { valid: false, sanitized: null, error: `${field} must be an array` };
    }
    if (value.length > 20) {
      return { valid: false, sanitized: null, error: `${field} cannot have more than 20 items` };
    }
    const sanitized = value.map(v => typeof v === 'string' ? sanitizeInput(v, 50) : '').filter(Boolean);
    return { valid: true, sanitized };
  }

  // Object fields (socialLinks)
  if (field === 'socialLinks') {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      return { valid: false, sanitized: null, error: `${field} must be an object` };
    }
    const sanitized: Record<string, string> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      if (typeof val === 'string') {
        sanitized[sanitizeInput(key, 30)] = sanitizeInput(val, 200);
      }
    }
    return { valid: true, sanitized };
  }

  // Date field
  if (field === 'dateOfBirth') {
    if (typeof value !== 'string') {
      return { valid: false, sanitized: null, error: `${field} must be a string` };
    }
    // Accept both YYYY-MM-DD and full ISO format (extract date part)
    const datePattern = /^\d{4}-\d{2}-\d{2}$/;
    const isoPattern = /^\d{4}-\d{2}-\d{2}T/;
    let sanitizedDate = value;
    if (isoPattern.test(value)) {
      // Extract just the date part from ISO string
      sanitizedDate = value.split('T')[0];
    }
    if (!datePattern.test(sanitizedDate)) {
      return { valid: false, sanitized: null, error: `${field} must be in YYYY-MM-DD format` };
    }
    return { valid: true, sanitized: sanitizedDate };
  }

  // Account type validation
  // All types are allowed during initial profile creation (onboarding).
  // Pro upgrades on existing accounts are enforced server-side via Stripe webhook.
  if (field === 'accountType') {
    const validTypes = ['personal', 'pro_creator', 'pro_business'];
    if (!validTypes.includes(value as string)) {
      return { valid: false, sanitized: null, error: `Invalid account type '${value}'.` };
    }
    return { valid: true, sanitized: value };
  }

  // Numeric coordinate fields
  if (field === 'businessLatitude' || field === 'businessLongitude') {
    if (typeof value !== 'number' || !isFinite(value)) {
      return { valid: false, sanitized: null, error: `${field} must be a valid number` };
    }
    if (field === 'businessLatitude' && (value < -90 || value > 90)) {
      return { valid: false, sanitized: null, error: `${field} must be between -90 and 90` };
    }
    if (field === 'businessLongitude' && (value < -180 || value > 180)) {
      return { valid: false, sanitized: null, error: `${field} must be between -180 and 180` };
    }
    return { valid: true, sanitized: value };
  }

  // Locations mode validation
  if (field === 'locationsMode') {
    const validModes = ['all', 'followers', 'none', 'single', 'multiple'];
    if (!validModes.includes(value as string)) {
      return { valid: false, sanitized: null, error: `${field} must be one of: ${validModes.join(', ')}` };
    }
    return { valid: true, sanitized: value };
  }

  // String fields with rules
  if (rules) {
    if (typeof value !== 'string') {
      return { valid: false, sanitized: null, error: `${field} must be a string` };
    }
    const sanitized = sanitizeInput(value, rules.maxLength);
    if (rules.pattern && !rules.pattern.test(sanitized)) {
      return { valid: false, sanitized: null, error: `${field} has invalid format` };
    }
    return { valid: true, sanitized };
  }

  // Unknown field - skip
  return { valid: false, sanitized: null, error: 'Unknown field' };
}

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

    const rateLimit = await checkRateLimit({
      prefix: 'profile-update',
      identifier: userId,
      windowSeconds: 60,
      maxRequests: 10,
    });
    if (!rateLimit.allowed) {
      return {
        statusCode: 429,
        headers,
        body: JSON.stringify({ message: 'Too many requests. Please try again later.' }),
      };
    }

    const rawBody = JSON.parse(event.body || '{}');

    // Validate and sanitize all input fields
    const body: Record<string, unknown> = {};
    const errors: string[] = [];

    for (const [field, value] of Object.entries(rawBody)) {
      const result = validateField(field, value);
      if (result.valid) {
        body[field] = result.sanitized;
      } else if (result.error && result.error !== 'Unknown field') {
        errors.push(result.error);
      }
    }

    if (errors.length > 0) {
      logSecurityEvent('invalid_input', {
        userId,
        errors,
        ip: event.requestContext.identity?.sourceIp,
      });
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ message: 'Validation failed', errors }),
      };
    }

    // Special validation for username
    if (body.username && !isValidUsername(body.username as string)) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ message: 'Username must be 3-30 characters, alphanumeric and underscores only' }),
      };
    }
    const db = await getPool();

    // Build update fields dynamically
    const updateFields: string[] = [];
    const values: SqlParam[] = [];
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
      businessLatitude: 'business_latitude',
      businessLongitude: 'business_longitude',
      businessPhone: 'business_phone',
      locationsMode: 'locations_mode',
      onboardingCompleted: 'onboarding_completed',
    };

    // JSONB fields need JSON.stringify for pg driver
    const jsonbFields = new Set(['social_links']);

    for (const [apiField, dbField] of Object.entries(fieldMapping)) {
      if (body[apiField] !== undefined) {
        updateFields.push(`${dbField} = $${paramIndex}`);
        const val = jsonbFields.has(dbField) ? JSON.stringify(body[apiField]) : body[apiField];
        values.push(val as SqlParam);
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

    // First, check if profile exists (by both id and cognito_sub for compatibility)
    const existingProfile = await db.query(
      `SELECT id FROM profiles WHERE cognito_sub = $1`,
      [userId]
    );

    // SECURITY: Prevent account type changes on existing profiles
    // Account type upgrades can ONLY happen via Stripe webhook
    if (existingProfile.rows.length > 0 && body.accountType !== undefined) {
      const currentType = await db.query(
        `SELECT account_type FROM profiles WHERE cognito_sub = $1`,
        [userId]
      );
      if (currentType.rows.length > 0 && currentType.rows[0].account_type !== body.accountType) {
        logSecurityEvent('account_type_change_blocked', {
          userId,
          currentType: currentType.rows[0].account_type,
          requestedType: body.accountType,
          ip: event.requestContext.identity?.sourceIp,
        });
        return {
          statusCode: 403,
          headers,
          body: JSON.stringify({ message: 'Account type cannot be changed directly.' }),
        };
      }
    }

    let result;
    if (existingProfile.rows.length === 0) {
      // Create new profile - use cognito_sub as the primary id for simplicity
      // This ensures all other queries using id = cognito_sub will work
      const insertFields = ['id', 'cognito_sub'];
      const insertValues = [userId, userId];
      const insertParams = ['$1', '$2'];
      let insertIndex = 3;

      for (const [apiField, dbField] of Object.entries(fieldMapping)) {
        if (body[apiField] !== undefined) {
          insertFields.push(dbField);
          const val = jsonbFields.has(dbField) ? JSON.stringify(body[apiField]) : body[apiField];
          insertValues.push(val);
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
      // Update existing profile using the resolved profile ID
      const profileId = existingProfile.rows[0].id;
      values.push(profileId);

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
        isPremium: profile.is_premium || false,
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
        businessLatitude: profile.business_latitude ? parseFloat(profile.business_latitude) : null,
        businessLongitude: profile.business_longitude ? parseFloat(profile.business_longitude) : null,
        businessPhone: profile.business_phone,
        locationsMode: profile.locations_mode,
        onboardingCompleted: profile.onboarding_completed,
        followersCount: profile.fan_count || 0,
        followingCount: profile.following_count || 0,
        postsCount: profile.post_count || 0,
      }),
    };
  } catch (error: unknown) {
    log.error('Error updating profile', error);

    // Handle unique constraint violations without leaking schema details
    if (hasErrorCode(error) && error.code === '23505') {
      return {
        statusCode: 409,
        headers,
        body: JSON.stringify({ message: 'This value is already taken.' }),
      };
    }

    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ message: 'Internal server error' }),
    };
  }
}

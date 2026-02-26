/**
 * Update Profile Lambda Handler
 * Updates the current user's profile
 *
 * SECURITY: Input validation and sanitization
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { HeadObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getPool, SqlParam } from '../../shared/db';
import { sanitizeInput, isValidUsername, isReservedUsername, logSecurityEvent } from '../utils/security';
import { resolveProfileId } from '../utils/auth';
import { requireRateLimit } from '../utils/rate-limit';
import { hasErrorCode, withErrorHandler } from '../utils/error-handler';
import { requireActiveAccount, isAccountError } from '../utils/account-status';
import { moderateTexts } from '../utils/text-moderation';

// ── Types ──

interface FieldValidationResult {
  valid: boolean;
  sanitized: unknown;
  error?: string;
}

type FieldValidator = (field: string, value: unknown) => FieldValidationResult;

// ── Constants ──

// Validation rules for string profile fields
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

// Map of allowed fields (camelCase from API to snake_case in DB)
const FIELD_MAPPING: Record<string, string> = {
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
const JSONB_FIELDS = new Set(['social_links']);

const VALID_LOCATIONS_MODES = ['all', 'followers', 'none', 'single', 'multiple'];

const CLEARABLE_URL_FIELDS = new Set(['avatarUrl', 'coverUrl']);
const MEDIA_BUCKET = process.env.MEDIA_BUCKET?.trim() || '';
const s3Client = MEDIA_BUCKET ? new S3Client({}) : null;
const MIN_MEDIA_FILE_BYTES = 512;

// Columns returned after INSERT or UPDATE
const RETURNING_COLUMNS = [
  'id', 'cognito_sub', 'username', 'full_name', 'display_name',
  'avatar_url', 'cover_url', 'bio', 'website', 'is_verified',
  'is_premium', 'is_private', 'account_type', 'gender', 'date_of_birth',
  'interests', 'expertise', 'social_links', 'business_name',
  'business_category', 'business_address', 'business_latitude',
  'business_longitude', 'business_phone', 'locations_mode',
  'onboarding_completed', 'fan_count', 'following_count', 'post_count',
  'created_at', 'updated_at',
].join(', ');

// ── Field Validators ──

function validateBoolean(field: string, value: unknown): FieldValidationResult {
  if (typeof value !== 'boolean') {
    return { valid: false, sanitized: null, error: `${field} must be a boolean` };
  }
  return { valid: true, sanitized: value };
}

function validateArray(field: string, value: unknown): FieldValidationResult {
  if (!Array.isArray(value)) {
    return { valid: false, sanitized: null, error: `${field} must be an array` };
  }
  if (value.length > 20) {
    return { valid: false, sanitized: null, error: `${field} cannot have more than 20 items` };
  }
  const sanitized = value.map(v => typeof v === 'string' ? sanitizeInput(v, 50) : '').filter(Boolean);
  return { valid: true, sanitized };
}

function validateSocialLinks(field: string, value: unknown): FieldValidationResult {
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

function validateDateOfBirth(field: string, value: unknown): FieldValidationResult {
  if (typeof value !== 'string') {
    return { valid: false, sanitized: null, error: `${field} must be a string` };
  }
  // Accept both YYYY-MM-DD and full ISO format (extract date part)
  const datePattern = /^\d{4}-\d{2}-\d{2}$/;
  const isoPattern = /^\d{4}-\d{2}-\d{2}T/;
  const sanitizedDate = isoPattern.test(value) ? value.split('T')[0] : value;
  if (!datePattern.test(sanitizedDate)) {
    return { valid: false, sanitized: null, error: `${field} must be in YYYY-MM-DD format` };
  }
  return { valid: true, sanitized: sanitizedDate };
}

// SECURITY: Only 'personal' is allowed via API. Pro upgrades ONLY happen via Stripe webhook.
function validateAccountType(_field: string, value: unknown): FieldValidationResult {
  if (value !== 'personal') {
    return { valid: false, sanitized: null, error: 'Account type can only be set to personal. Pro upgrades require a subscription.' };
  }
  return { valid: true, sanitized: value };
}

function validateCoordinate(field: string, value: unknown): FieldValidationResult {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return { valid: false, sanitized: null, error: `${field} must be a valid number` };
  }
  const isLatitude = field === 'businessLatitude';
  const min = isLatitude ? -90 : -180;
  const max = isLatitude ? 90 : 180;
  if (value < min || value > max) {
    return { valid: false, sanitized: null, error: `${field} must be between ${min} and ${max}` };
  }
  return { valid: true, sanitized: value };
}

function validateLocationsMode(field: string, value: unknown): FieldValidationResult {
  if (!VALID_LOCATIONS_MODES.includes(value as string)) {
    return { valid: false, sanitized: null, error: `${field} must be one of: ${VALID_LOCATIONS_MODES.join(', ')}` };
  }
  return { valid: true, sanitized: value };
}

// Dispatch map: field name → validator function
const FIELD_VALIDATORS: Record<string, FieldValidator> = {
  isPrivate: validateBoolean,
  onboardingCompleted: validateBoolean,
  interests: validateArray,
  expertise: validateArray,
  socialLinks: validateSocialLinks,
  dateOfBirth: validateDateOfBirth,
  accountType: validateAccountType,
  businessLatitude: validateCoordinate,
  businessLongitude: validateCoordinate,
  locationsMode: validateLocationsMode,
};

// Validate string fields using VALIDATION_RULES
function validateStringField(field: string, value: unknown): FieldValidationResult {
  const rules = VALIDATION_RULES[field];
  if (!rules) {
    return { valid: false, sanitized: null, error: 'Unknown field' };
  }

  // Allow null or empty string for clearable URL fields (avatar, cover)
  if ((value === null || value === '') && CLEARABLE_URL_FIELDS.has(field)) {
    return { valid: true, sanitized: '' };
  }
  if (typeof value !== 'string') {
    return { valid: false, sanitized: null, error: `${field} must be a string` };
  }
  const sanitized = sanitizeInput(value, rules.maxLength);
  if (rules.pattern && sanitized !== '' && !rules.pattern.test(sanitized)) {
    return { valid: false, sanitized: null, error: `${field} has invalid format` };
  }
  return { valid: true, sanitized };
}

function extractObjectKeyFromUrl(mediaUrl: string): string | null {
  const trimmed = mediaUrl.trim();
  if (!trimmed) return null;
  if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
    return trimmed.replace(/^\/+/, '');
  }
  try {
    const parsed = new URL(trimmed);
    return decodeURIComponent(parsed.pathname).replace(/^\/+/, '') || null;
  } catch {
    return null;
  }
}

function isStorageNotFoundError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const err = error as { name?: string; Code?: string; $metadata?: { httpStatusCode?: number } };
  return (
    err.name === 'NotFound' ||
    err.name === 'NoSuchKey' ||
    err.Code === 'NotFound' ||
    err.Code === 'NoSuchKey' ||
    err.$metadata?.httpStatusCode === 404
  );
}

async function ensureMediaUrlReady(
  mediaUrl: unknown,
  headers: Record<string, string>,
): Promise<APIGatewayProxyResult | null> {
  if (process.env.NODE_ENV === 'test') return null;
  if (!MEDIA_BUCKET || !s3Client) return null;
  if (typeof mediaUrl !== 'string') return null;

  const trimmed = mediaUrl.trim();
  if (!trimmed) return null;

  const objectKey = extractObjectKeyFromUrl(trimmed);
  if (!objectKey) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ message: 'Invalid media URL format' }),
    };
  }
  if (objectKey.startsWith('pending-scan/')) {
    return {
      statusCode: 409,
      headers,
      body: JSON.stringify({ success: false, code: 'MEDIA_NOT_READY', message: 'Media is still processing. Please retry in a few seconds.' }),
    };
  }

  try {
    const metadata = await s3Client.send(new HeadObjectCommand({
      Bucket: MEDIA_BUCKET,
      Key: objectKey,
    }));
    if (typeof metadata.ContentLength === 'number' && metadata.ContentLength > 0 && metadata.ContentLength < MIN_MEDIA_FILE_BYTES) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ success: false, code: 'MEDIA_INVALID', message: 'Uploaded media is invalid or corrupted. Please upload a different file.' }),
      };
    }
    return null;
  } catch (error_) {
    if (isStorageNotFoundError(error_)) {
      return {
        statusCode: 409,
        headers,
        body: JSON.stringify({ success: false, code: 'MEDIA_NOT_READY', message: 'Media is still processing. Please retry in a few seconds.' }),
      };
    }
    throw error_;
  }
}

// Validate and sanitize a single field — dispatches to the appropriate validator
function validateField(field: string, value: unknown): FieldValidationResult {
  const validator = FIELD_VALIDATORS[field];
  if (validator) {
    return validator(field, value);
  }
  return validateStringField(field, value);
}

// ── SQL Helpers ──

/** Convert body fields to parameterized UPDATE SET clauses */
function buildUpdateParams(body: Record<string, unknown>): {
  setClauses: string[];
  values: SqlParam[];
  nextIndex: number;
} {
  const setClauses: string[] = [];
  const values: SqlParam[] = [];
  let paramIndex = 1;

  for (const [apiField, dbField] of Object.entries(FIELD_MAPPING)) {
    if (body[apiField] !== undefined) {
      setClauses.push(`${dbField} = $${paramIndex}`);
      const val = JSONB_FIELDS.has(dbField) ? JSON.stringify(body[apiField]) : body[apiField];
      values.push(val as SqlParam);
      paramIndex++;
    }
  }

  return { setClauses, values, nextIndex: paramIndex };
}

/** Build parameterized INSERT columns, placeholders, and values */
function buildInsertParams(userId: string, body: Record<string, unknown>): {
  columns: string[];
  placeholders: string[];
  values: SqlParam[];
} {
  const columns = ['id', 'cognito_sub'];
  const values: SqlParam[] = [userId, userId];
  const placeholders = ['$1', '$2'];
  let paramIndex = 3;

  for (const [apiField, dbField] of Object.entries(FIELD_MAPPING)) {
    if (body[apiField] !== undefined) {
      columns.push(dbField);
      const val = JSONB_FIELDS.has(dbField) ? JSON.stringify(body[apiField]) : body[apiField];
      values.push(val as SqlParam);
      placeholders.push(`$${paramIndex}`);
      paramIndex++;
    }
  }

  columns.push('created_at', 'updated_at');
  placeholders.push('NOW()', 'NOW()');

  return { columns, placeholders, values };
}

// ── Response Helpers ──

/** Parse a nullable numeric DB column (business_latitude/longitude) */
function parseNullableCoordinate(value: unknown): number | null {
  if (value && String(value).trim()) {
    return Number.parseFloat(String(value));
  }
  return null;
}

/** Map a DB profile row to the camelCase API response body */
function mapProfileToResponse(profile: Record<string, unknown>): Record<string, unknown> {
  return {
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
    isPrivate: !!profile.is_private,
    accountType: profile.account_type || 'personal',
    gender: profile.gender,
    dateOfBirth: profile.date_of_birth,
    interests: profile.interests,
    expertise: profile.expertise,
    socialLinks: profile.social_links,
    businessName: profile.business_name,
    businessCategory: profile.business_category,
    businessAddress: profile.business_address,
    businessLatitude: parseNullableCoordinate(profile.business_latitude),
    businessLongitude: parseNullableCoordinate(profile.business_longitude),
    businessPhone: profile.business_phone,
    locationsMode: profile.locations_mode,
    onboardingCompleted: profile.onboarding_completed,
    followersCount: (profile.fan_count as number) || 0,
    followingCount: (profile.following_count as number) || 0,
    postsCount: (profile.post_count as number) || 0,
  };
}

// ── Security Helpers ──

/** SECURITY: Prevent account type changes on existing profiles (Stripe webhook only) */
async function checkAccountTypeChange(
  db: Awaited<ReturnType<typeof getPool>>,
  userId: string,
  requestedType: unknown,
  event: APIGatewayProxyEvent,
  headers: Record<string, string>,
): Promise<APIGatewayProxyResult | null> {
  const currentType = await db.query(
    `SELECT account_type FROM profiles WHERE cognito_sub = $1`,
    [userId]
  );
  if (currentType.rows.length > 0 && currentType.rows[0].account_type !== requestedType) {
    logSecurityEvent('suspicious_activity', {
      userId,
      currentType: currentType.rows[0].account_type,
      requestedType,
      ip: event.requestContext.identity?.sourceIp,
    });
    return {
      statusCode: 403,
      headers,
      body: JSON.stringify({ message: 'Account type cannot be changed directly.' }),
    };
  }
  return null;
}

/** SECURITY: Prevent setting pro account type on profile CREATE */
function enforcePersonalOnCreate(
  body: Record<string, unknown>,
  userId: string,
  event: APIGatewayProxyEvent,
): void {
  if (!body.accountType || body.accountType === 'personal') return;
  logSecurityEvent('suspicious_activity', {
    userId,
    requestedType: body.accountType,
    ip: event.requestContext.identity?.sourceIp,
  });
  // Silently downgrade to personal — don't reveal the guard to the client
  body.accountType = 'personal';
}

// ── Main Handler ──

export const handler = withErrorHandler('profiles-update', async (event, { headers, log }) => {
    const userId = event.requestContext.authorizer?.claims?.sub;
    if (!userId) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ message: 'Unauthorized' }),
      };
    }

    const rateLimitResponse = await requireRateLimit({
      prefix: 'profile-update',
      identifier: userId,
      windowSeconds: 60,
      maxRequests: 10,
    }, headers);
    if (rateLimitResponse) return rateLimitResponse;

    // Validate and sanitize all input fields
    const rawBody = JSON.parse(event.body || '{}');
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
    if (body.username) {
      const usernameStr = body.username as string;
      if (!isValidUsername(usernameStr)) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ message: 'Username must be 3-30 characters, alphanumeric and underscores only' }),
        };
      }
      if (isReservedUsername(usernameStr)) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ message: 'This username is not available' }),
        };
      }
    }

    // Moderation: check text fields for violations (keyword filter + Comprehend toxicity)
    const textFieldsToCheck = ['bio', 'fullName', 'displayName', 'username', 'businessName']
      .filter(f => body[f] && typeof body[f] === 'string')
      .map(f => body[f] as string);

    if (textFieldsToCheck.length > 0) {
      const modResult = await moderateTexts(textFieldsToCheck, headers, log, 'profile');
      if (modResult.blocked) return modResult.blockResponse!;
    }

    const avatarReadyError = await ensureMediaUrlReady(body.avatarUrl, headers);
    if (avatarReadyError) return avatarReadyError;
    const coverReadyError = await ensureMediaUrlReady(body.coverUrl, headers);
    if (coverReadyError) return coverReadyError;

    // Build update fields and check for empty update
    const { setClauses, values, nextIndex } = buildUpdateParams(body);
    if (setClauses.length === 0) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ message: 'No fields to update' }),
      };
    }
    setClauses.push('updated_at = NOW()');

    const db = await getPool();
    const existingProfileId = await resolveProfileId(db, userId);

    // Account status check — only for existing profiles (not during onboarding/creation)
    if (existingProfileId) {
      const accountCheck = await requireActiveAccount(userId, headers);
      if (isAccountError(accountCheck)) return accountCheck;
    }

    // SECURITY: Account type guards
    if (existingProfileId && body.accountType !== undefined) {
      const blockResponse = await checkAccountTypeChange(db, userId, body.accountType, event, headers);
      if (blockResponse) return blockResponse;
    }
    if (!existingProfileId) {
      enforcePersonalOnCreate(body, userId, event);
    }

    let result;
    try {
      if (!existingProfileId) {
        const { columns, placeholders, values: insertValues } = buildInsertParams(userId, body);
        result = await db.query(
          `INSERT INTO profiles (${columns.join(', ')})
           VALUES (${placeholders.join(', ')})
           RETURNING ${RETURNING_COLUMNS}`,
          insertValues
        );
      } else {
        values.push(existingProfileId);
        result = await db.query(
          `UPDATE profiles
           SET ${setClauses.join(', ')}
           WHERE id = $${nextIndex}
           RETURNING ${RETURNING_COLUMNS}`,
          values
        );
      }
    } catch (error_: unknown) {
      // Handle unique constraint violations without leaking schema details
      if (hasErrorCode(error_) && error_.code === '23505') {
        return {
          statusCode: 409,
          headers,
          body: JSON.stringify({ message: 'This value is already taken.' }),
        };
      }
      throw error_;
    }

    if (result.rows.length === 0) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ message: 'Profile not found' }),
      };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(mapProfileToResponse(result.rows[0])),
    };
});

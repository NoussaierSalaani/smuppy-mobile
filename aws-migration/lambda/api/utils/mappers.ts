/**
 * Response Mappers — snake_case DB rows → camelCase API DTOs
 *
 * 3 separate focused functions (not one parametric mapper).
 * Each maps a specific prefix pattern used in JOINed queries.
 */

// ── Author DTO (peaks, comments, saved-posts) ──

export interface AuthorDTO {
  id: unknown;
  username: unknown;
  fullName: unknown;
  avatarUrl: unknown;
  isVerified: boolean;
  accountType: unknown;
  businessName: unknown;
}

/**
 * Map `author_*` prefixed columns from a JOINed row.
 */
export function mapAuthor(row: Record<string, unknown>): AuthorDTO {
  return {
    id: row.author_id,
    username: row.author_username,
    fullName: row.author_full_name,
    avatarUrl: row.author_avatar_url,
    isVerified: !!row.author_is_verified,
    accountType: row.author_account_type || 'personal',
    businessName: row.author_business_name || null,
  };
}

// ── Requester DTO (follow-requests) ──

export interface RequesterDTO {
  id: unknown;
  username: unknown;
  fullName: unknown;
  avatarUrl: unknown;
  bio: unknown;
  isVerified: boolean;
  accountType: unknown;
  businessName: unknown;
}

/**
 * Map `requester_*` prefixed columns from a JOINed row.
 */
export function mapRequester(row: Record<string, unknown>): RequesterDTO {
  return {
    id: row.requester_id,
    username: row.requester_username,
    fullName: row.requester_full_name,
    avatarUrl: row.requester_avatar_url,
    bio: row.requester_bio || null,
    isVerified: !!row.requester_is_verified,
    accountType: row.requester_account_type || 'personal',
    businessName: row.requester_business_name || null,
  };
}

// ── Creator DTO (challenges) ──

export interface CreatorDTO {
  id: unknown;
  username: unknown;
  fullName: unknown;
  displayName: unknown;
  avatarUrl: unknown;
  isVerified: boolean;
  accountType: unknown;
  businessName: unknown;
}

/**
 * Map `creator_*` prefixed columns from a JOINed row.
 */
export function mapCreator(row: Record<string, unknown>): CreatorDTO {
  return {
    id: row.creator_id,
    username: row.creator_username,
    fullName: row.creator_full_name,
    displayName: row.creator_display_name || null,
    avatarUrl: row.creator_avatar_url,
    isVerified: !!row.creator_is_verified,
    accountType: row.creator_account_type || 'personal',
    businessName: row.creator_business_name || null,
  };
}

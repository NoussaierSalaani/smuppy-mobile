/**
 * Shared Test Data Builders
 *
 * Domain-agnostic data factories used across multiple test files.
 */

// ── Author Fields (shared by comments, peaks, saved-posts, challenges) ──

interface AuthorFieldOverrides {
  author_id?: string;
  author_username?: string;
  author_full_name?: string;
  author_avatar_url?: string | null;
  author_is_verified?: boolean;
  author_account_type?: string;
  author_business_name?: string | null;
}

/**
 * Build the 7 standard `author_*` columns returned by JOINed queries.
 */
export function makeAuthorFields(overrides: AuthorFieldOverrides = {}): Record<string, unknown> {
  return {
    author_id: overrides.author_id ?? 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    author_username: overrides.author_username ?? 'testauthor',
    author_full_name: overrides.author_full_name ?? 'Test Author',
    author_avatar_url: overrides.author_avatar_url ?? 'https://cdn.example.com/avatar.jpg',
    author_is_verified: overrides.author_is_verified ?? false,
    author_account_type: overrides.author_account_type ?? 'personal',
    author_business_name: overrides.author_business_name ?? null,
  };
}

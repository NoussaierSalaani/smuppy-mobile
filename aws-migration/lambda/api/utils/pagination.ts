/**
 * Pagination Utilities
 *
 * Pure functions for limit parsing and hasMore detection.
 * Eliminates duplicated `Math.min(parseInt(...), 50)` across handlers.
 */

import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants';

/**
 * Parse and clamp a raw limit string.
 * NaN-safe: defaults to DEFAULT_PAGE_SIZE (20), clamps to [1, MAX_PAGE_SIZE].
 */
export function parseLimit(raw: string | undefined): number {
  const parsed = Number.parseInt(raw || '', 10);
  if (Number.isNaN(parsed) || parsed < 1) return DEFAULT_PAGE_SIZE;
  return Math.min(parsed, MAX_PAGE_SIZE);
}

/**
 * Slice rows to `limit` and detect whether more exist.
 *
 * Handlers fetch `limit + 1` rows; this function standardizes the
 * `slice(0, limit)` + hasMore pattern.
 */
export function applyHasMore<T>(rows: T[], limit: number): { data: T[]; hasMore: boolean } {
  const hasMore = rows.length > limit;
  const data = hasMore ? rows.slice(0, limit) : rows;
  return { data, hasMore };
}

/**
 * Shared formatting and validation utilities.
 * @module utils/formatters
 */

/** UUID v4 regex (case-insensitive). */
export const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Check whether a string is a valid UUID.
 * @param id - The string to test
 * @returns true when the string matches a UUID pattern
 */
export const isValidUUID = (id: string | null | undefined): boolean =>
  !!id && UUID_REGEX.test(id);

/**
 * Format a number for compact display (1.2K, 3.4M).
 * @param num - The number to format
 * @returns Human-readable compact string
 */
export const formatNumber = (num: number): string => {
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
  return num.toString();
};

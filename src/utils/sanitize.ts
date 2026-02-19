/**
 * Shared text sanitization utilities.
 * Used across the app to strip HTML tags and control characters from user input.
 * Per CLAUDE.md: "ALL user input is hostile: validate, sanitize, truncate"
 */

// Regex to strip HTML tags
const HTML_TAG_RE = /<[^>]*>/g;

// Regex to strip control characters (C0 set + DEL), preserving normal whitespace
// NOSONAR — intentional security sanitization of control characters
const CONTROL_CHAR_RE = /[\x00-\x1F\x7F]/g; // NOSONAR

// Regex to strip control characters, preserving TAB (\x09), LF (\x0A), CR (\x0D)
// NOSONAR — intentional security sanitization of control characters
const CONTROL_CHAR_RELAXED_RE = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g; // NOSONAR

/**
 * Strip HTML tags and control characters from text, then trim.
 * Use for display-only sanitization (profile names, post content, etc.)
 */
export function sanitizeDisplayText(text: string): string {
  return text.replace(HTML_TAG_RE, '').replace(CONTROL_CHAR_RE, '').trim();
}

/**
 * Strip HTML tags and control characters, preserving tabs and newlines.
 * Use for multi-line content (bios, descriptions, messages).
 */
export function sanitizeContentText(text: string): string {
  return text.replace(HTML_TAG_RE, '').replace(CONTROL_CHAR_RELAXED_RE, '').trim();
}

/**
 * Strip HTML tags and control characters from nullable text.
 * Returns empty string for null/undefined input.
 */
export function sanitizeOptionalText(text: string | null | undefined): string {
  if (!text) return '';
  return sanitizeDisplayText(text);
}

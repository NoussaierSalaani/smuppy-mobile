/**
 * Extract unique, lowercased hashtags from text.
 * Matches #word patterns (alphanumeric + underscore).
 */
export function extractHashtags(text: string): string[] {
  const matches = text.match(/#[a-zA-Z0-9_]+/g);
  if (!matches) return [];
  return [...new Set(matches.map((t) => t.slice(1).toLowerCase()))];
}

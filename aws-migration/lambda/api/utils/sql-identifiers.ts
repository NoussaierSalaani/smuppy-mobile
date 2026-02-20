/**
 * SQL Identifier Safety — Defense-in-Depth
 *
 * All table and column names in handler factory configs are compile-time
 * constants defined at module scope, never derived from user input.
 *
 * These runtime assertions provide an extra safety layer: they reject any
 * string that could alter SQL semantics (quotes, semicolons, comments, etc.).
 *
 * Called once at factory initialization (module load), not per request —
 * so the cost is zero at runtime.
 */

// Strict: letters, digits, underscores only (e.g. "posts", "author_id")
const SAFE_IDENTIFIER_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

// Column token: qualified name with optional alias
// e.g. "id", "e.id", "p.username as creator_username"
const SAFE_COLUMN_TOKEN_RE = /^[a-zA-Z_*][a-zA-Z0-9_.*]*(\s+as\s+[a-zA-Z_][a-zA-Z0-9_]*)?$/i;

// Characters that must never appear in a SQL clause built from config
const DANGEROUS_CHARS_RE = /[;'"\\]|--|\\\*|\/\*/;

/**
 * Assert that a value is a safe SQL table or column name.
 * Only letters, digits, and underscores are allowed.
 * Throws at module load time if the value is unsafe.
 */
export function assertSafeIdentifier(value: string, context: string): void {
  if (!SAFE_IDENTIFIER_RE.test(value)) {
    throw new Error(
      `[sql-identifiers] Unsafe SQL identifier in ${context}: "${value}". ` +
      'Only letters, digits, and underscores are allowed.',
    );
  }
}

/**
 * Assert that a comma-separated column list contains only safe identifiers.
 * Supports qualified names ("e.id") and aliases ("p.username as creator_username").
 * Throws at module load time if any column is unsafe.
 */
export function assertSafeColumnList(value: string, context: string): void {
  const columns = value.split(',').map(c => c.trim()).filter(Boolean);
  if (columns.length === 0) {
    throw new Error(`[sql-identifiers] Empty column list in ${context}.`);
  }
  for (const col of columns) {
    if (!SAFE_COLUMN_TOKEN_RE.test(col)) {
      throw new Error(
        `[sql-identifiers] Unsafe SQL column in ${context}: "${col}". ` +
        'Only letters, digits, underscores, dots, and "as" aliases are allowed.',
      );
    }
  }
}

/**
 * Assert that a SQL JOIN clause is free from injection characters.
 * Blocks semicolons, quotes, backslashes, and comment markers.
 * Throws at module load time if the clause is unsafe.
 */
export function assertSafeJoinClause(value: string, context: string): void {
  if (DANGEROUS_CHARS_RE.test(value)) {
    throw new Error(
      `[sql-identifiers] Unsafe SQL join clause in ${context}: ` +
      'contains dangerous characters (quotes, semicolons, or comments).',
    );
  }
}

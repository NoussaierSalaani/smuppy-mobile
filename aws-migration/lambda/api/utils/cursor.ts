/**
 * Cursor Utilities — 2-layer design (pure parsing + SQL condition builder)
 *
 * Cursor policy: TOLERANT (200).
 * Invalid cursor → parseCursor returns null → caller skips cursor condition
 * → returns first page. No 400 errors for bad cursors.
 *
 * Fixes the silent `new Date(NaN)` bug in 6 handlers.
 */

import { isValidUUID } from './security';

// ── Types ──

export type CursorType = 'timestamp-ms' | 'iso' | 'compound' | 'offset';

interface ParsedTimestampMs { type: 'timestamp-ms'; date: Date }
interface ParsedIso { type: 'iso'; date: Date }
interface ParsedCompound { type: 'compound'; date: Date; id: string }
interface ParsedOffset { type: 'offset'; offset: number }

export type ParsedCursorValue =
  | ParsedTimestampMs
  | ParsedIso
  | ParsedCompound
  | ParsedOffset;

// ── Layer 1: Pure Parsing (no SQL knowledge) ──

/**
 * Parse a raw cursor string into a structured value.
 *
 * Returns `null` on invalid input (NaN, bad UUID, etc.) —
 * callers skip the cursor condition and return the first page.
 */
export function parseCursor(raw: string | undefined | null, type: 'timestamp-ms'): ParsedTimestampMs | null;
export function parseCursor(raw: string | undefined | null, type: 'iso'): ParsedIso | null;
export function parseCursor(raw: string | undefined | null, type: 'compound'): (ParsedCompound | ParsedTimestampMs) | null;
export function parseCursor(raw: string | undefined | null, type: 'offset'): ParsedOffset | null;
export function parseCursor(raw: string | undefined | null, type: CursorType): ParsedCursorValue | null;
export function parseCursor(raw: string | undefined | null, type: CursorType): ParsedCursorValue | null {
  if (!raw || typeof raw !== 'string' || raw.trim() === '') return null;

  switch (type) {
    case 'timestamp-ms': {
      const ts = Number.parseInt(raw, 10);
      if (Number.isNaN(ts)) return null;
      const date = new Date(ts);
      if (Number.isNaN(date.getTime())) return null;
      return { type: 'timestamp-ms', date };
    }

    case 'iso': {
      const date = new Date(raw);
      if (Number.isNaN(date.getTime())) return null;
      return { type: 'iso', date };
    }

    case 'compound': {
      const pipeIdx = raw.indexOf('|');
      if (pipeIdx === -1) {
        // Fallback: try as timestamp-ms
        const ts = Number.parseInt(raw, 10);
        if (Number.isNaN(ts)) return null;
        const date = new Date(ts);
        if (Number.isNaN(date.getTime())) return null;
        return { type: 'timestamp-ms', date };
      }
      const datePart = raw.substring(0, pipeIdx);
      const idPart = raw.substring(pipeIdx + 1);
      if (!isValidUUID(idPart)) return null;
      const date = new Date(datePart);
      if (Number.isNaN(date.getTime())) return null;
      return { type: 'compound', date, id: idPart };
    }

    case 'offset': {
      const offset = Number.parseInt(raw, 10);
      if (Number.isNaN(offset) || offset < 0) return null;
      return { type: 'offset', offset };
    }
  }
}

// ── Layer 2: SQL Condition Builder ──

interface CursorSqlResult {
  condition: string;
  params: (string | number | Date)[];
}

/**
 * Convert a parsed cursor to a SQL WHERE fragment.
 *
 * @param parsed  The output of `parseCursor()`.
 * @param columnAlias  The SQL column alias (e.g. `c.created_at`, `pk.created_at`).
 * @param startParamIndex  The next `$N` index to use.
 */
export function cursorToSql(
  parsed: ParsedCursorValue,
  columnAlias: string,
  startParamIndex: number,
): CursorSqlResult {
  switch (parsed.type) {
    case 'timestamp-ms':
    case 'iso':
      return {
        condition: ` AND ${columnAlias} < $${startParamIndex}`,
        params: [parsed.date],
      };

    case 'compound': {
      // Deterministic compound cursor: (date, id) < ($N, $N+1)
      const idColumn = columnAlias.replace(/\.created_at$/, '.id');
      return {
        condition: ` AND (${columnAlias}, ${idColumn}) < ($${startParamIndex}::timestamptz, $${startParamIndex + 1}::uuid)`,
        params: [parsed.date, parsed.id],
      };
    }

    case 'offset':
      return {
        condition: ` OFFSET $${startParamIndex}`,
        params: [parsed.offset],
      };
  }
}

// ── Cursor Generation ──

/**
 * Generate a cursor string from the last row of a result set.
 *
 * @param type  The cursor type to generate.
 * @param lastRow  The last row in the result set.
 * @param dateColumn  The column name to read the date from (default: `created_at`).
 */
export function generateCursor(
  type: CursorType,
  lastRow: Record<string, unknown>,
  dateColumn: string = 'created_at',
): string {
  const dateValue = lastRow[dateColumn];
  const date = dateValue instanceof Date ? dateValue : new Date(dateValue as string | number);

  switch (type) {
    case 'timestamp-ms':
      return date.getTime().toString();

    case 'iso':
      return date.toISOString();

    case 'compound':
      return `${date.toISOString()}|${lastRow.id}`;

    case 'offset':
      // Offset cursors don't depend on the row; caller tracks offset externally
      return String(lastRow.offset ?? 0);
  }
}

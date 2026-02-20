/**
 * Shared Dispute Helpers
 *
 * Offset-cursor pagination and row-mapping utilities shared by
 * disputes/list.ts and disputes/admin-list.ts.
 */

// ── Pagination ──────────────────────────────────────────────────────

/** Upper bound for offset to prevent unbounded scans. */
const MAX_OFFSET = 500;

/**
 * Parse an offset-encoded cursor string and a limit string into
 * safe integers suitable for SQL LIMIT / OFFSET clauses.
 *
 * @param cursor  - Raw cursor value from query params (may be undefined)
 * @param limit   - Raw limit value from query params (defaults to "20")
 * @param maxLimit - Upper bound for the parsed limit (defaults to 50)
 * @returns { offset, parsedLimit } both clamped to safe bounds
 */
export function parseOffsetCursor(
  cursor: string | undefined,
  limit: string,
  maxLimit = 50,
): { offset: number; parsedLimit: number } {
  const offset = cursor
    ? Math.min(Number.parseInt(cursor, 10) || 0, MAX_OFFSET)
    : 0;
  const parsedLimit = Math.min(Number.parseInt(limit, 10) || 20, maxLimit);
  return { offset, parsedLimit };
}

/**
 * Given a query result that fetched `parsedLimit + 1` rows, derive
 * the trimmed rows array plus pagination metadata.
 */
export function deriveOffsetPage<T>(
  rows: T[],
  parsedLimit: number,
  offset: number,
): { data: T[]; nextCursor: string | null; hasMore: boolean } {
  const hasMore = rows.length > parsedLimit;
  const data = rows.slice(0, parsedLimit);
  const nextCursor = hasMore ? String(offset + parsedLimit) : null;
  return { data, nextCursor, hasMore };
}

// ── Status ORDER BY Fragment ────────────────────────────────────────

/**
 * SQL CASE expression that ranks dispute statuses for ORDER BY.
 * Matches both admin-list and user-list ordering semantics.
 */
export const DISPUTE_STATUS_ORDER_SQL = `
      CASE d.status
        WHEN 'open' THEN 1
        WHEN 'under_review' THEN 2
        WHEN 'evidence_requested' THEN 3
        ELSE 4
      END`;

// ── Row Mappers ─────────────────────────────────────────────────────

/** Fields common to both admin and user dispute list responses. */
export interface DisputeParticipant {
  username: string;
  avatar: string | null;
}

/** Map the complainant / respondent columns that both handlers SELECT. */
export function mapDisputeParticipants(row: Record<string, unknown>): {
  complainant: DisputeParticipant;
  respondent: DisputeParticipant;
} {
  return {
    complainant: {
      username: row.complainant_username as string,
      avatar: (row.complainant_avatar as string | null) ?? null,
    },
    respondent: {
      username: row.respondent_username as string,
      avatar: (row.respondent_avatar as string | null) ?? null,
    },
  };
}

/** Shared base fields present in every dispute list response. */
export function mapDisputeBase(row: Record<string, unknown>) {
  return {
    id: row.id as string,
    disputeNumber: row.dispute_number as string,
    type: row.type as string,
    status: row.status as string,
    priority: row.priority as string,
    createdAt: row.created_at as string,
    amount: (row.amount_cents as number) / 100,
    currency: row.currency as string,
    autoVerification: row.auto_verification,
    ...mapDisputeParticipants(row),
  };
}

/**
 * Blocked Users SQL Filter Utilities
 *
 * Shared helpers for bidirectional block checks across Lambda handlers.
 * Eliminates duplicated blocked_users SQL patterns in 33+ handlers.
 *
 * Two main patterns:
 * 1. isBidirectionallyBlocked() — for action-blocking checks (prevent like, comment, follow, etc.)
 * 2. blockExclusionSQL() — for list query filtering (hide blocked users from feeds, comments, etc.)
 */

import type { Pool, PoolClient } from 'pg';

/**
 * Check if two users have a bidirectional block relationship.
 * Returns true if either user has blocked the other.
 *
 * Usage (action check):
 * ```ts
 * if (await isBidirectionallyBlocked(db, currentUserId, targetUserId)) {
 *   return { statusCode: 403, headers, body: JSON.stringify({ message: 'Action not allowed' }) };
 * }
 * ```
 */
export async function isBidirectionallyBlocked(
  db: Pool | PoolClient,
  user1Id: string,
  user2Id: string,
): Promise<boolean> {
  const result = await db.query(
    `SELECT 1 FROM blocked_users
     WHERE (blocker_id = $1 AND blocked_id = $2)
        OR (blocker_id = $2 AND blocked_id = $1)
     LIMIT 1`,
    [user1Id, user2Id],
  );
  return result.rows.length > 0;
}

/**
 * Build a SQL NOT EXISTS clause for bidirectional block exclusion in list queries.
 * Returns the SQL fragment to append to a WHERE clause.
 *
 * @param userParamIndex - The $N parameter index for the current user's profile ID
 * @param targetColumn   - The SQL column referencing the other user (e.g., 'p.author_id', 'c.user_id')
 * @returns SQL fragment: `AND NOT EXISTS (SELECT 1 FROM blocked_users bu WHERE ...)`
 *
 * Usage:
 * ```ts
 * query += blockExclusionSQL(2, 'p.author_id');
 * // Produces: AND NOT EXISTS (SELECT 1 FROM blocked_users bu WHERE (bu.blocker_id = $2 AND bu.blocked_id = p.author_id) OR (bu.blocker_id = p.author_id AND bu.blocked_id = $2))
 * ```
 */
export function blockExclusionSQL(userParamIndex: number, targetColumn: string): string {
  return `
        AND NOT EXISTS (
          SELECT 1 FROM blocked_users bu
          WHERE (bu.blocker_id = $${userParamIndex} AND bu.blocked_id = ${targetColumn})
             OR (bu.blocker_id = ${targetColumn} AND bu.blocked_id = $${userParamIndex})
        )`;
}

/**
 * Build a SQL NOT EXISTS clause for muted users exclusion.
 * Often used alongside blockExclusionSQL.
 *
 * @param muterParamIndex - The $N parameter index for the current user
 * @param mutedColumn     - The SQL column referencing the other user
 */
export function muteExclusionSQL(muterParamIndex: number, mutedColumn: string): string {
  return `
        AND NOT EXISTS (
          SELECT 1 FROM muted_users WHERE muter_id = $${muterParamIndex} AND muted_id = ${mutedColumn}
        )`;
}

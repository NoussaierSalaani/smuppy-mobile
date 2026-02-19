/**
 * Factory: Toggle Handlers (block/unblock, mute/unmute)
 *
 * Two sub-patterns:
 *   1. createToggleDeleteHandler — DELETE row (unblock, unmute)
 *   2. createToggleListHandler   — SELECT + JOIN list (get-blocked, get-muted)
 *
 * All table/column names are compile-time constants from handler config, never user input.
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getPool } from '../../shared/db';
import { createHeaders } from './cors';
import { createLogger } from './logger';
import { requireRateLimit } from './rate-limit';
import { isValidUUID } from './security';
import { resolveProfileId } from './auth';

// ── Delete Handler (unblock / unmute) ────────────────────────────────

interface ToggleDeleteConfig {
  /** Logger name (e.g. 'profiles-unblock') */
  loggerName: string;
  /**
   * Table to DELETE from (e.g. 'blocked_users', 'muted_users').
   * NOTE: Compile-time constant, not user input.
   */
  tableName: string;
  /**
   * Column for the actor (e.g. 'blocker_id', 'muter_id').
   * NOTE: Compile-time constant, not user input.
   */
  actorColumn: string;
  /**
   * Column for the target (e.g. 'blocked_id', 'muted_id').
   * NOTE: Compile-time constant, not user input.
   */
  targetColumn: string;
  /** Rate limit prefix (e.g. 'unblock-user') */
  rateLimitPrefix: string;
  /** Max requests per rate limit window */
  rateLimitMax: number;
  /** Error log message (e.g. 'Error unblocking user') */
  errorMessage: string;
}

export function createToggleDeleteHandler(config: ToggleDeleteConfig) {
  const log = createLogger(config.loggerName);

  return async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
    const headers = createHeaders(event);
    log.initFromEvent(event);

    try {
      const cognitoSub = event.requestContext.authorizer?.claims?.sub;
      if (!cognitoSub) {
        return { statusCode: 401, headers, body: JSON.stringify({ message: 'Unauthorized' }) };
      }

      const targetUserId = event.pathParameters?.id;
      if (!targetUserId || !isValidUUID(targetUserId)) {
        return { statusCode: 400, headers, body: JSON.stringify({ message: 'Invalid user ID format' }) };
      }

      const rateLimitResponse = await requireRateLimit({
        prefix: config.rateLimitPrefix,
        identifier: cognitoSub,
        windowSeconds: 60,
        maxRequests: config.rateLimitMax,
      }, headers);
      if (rateLimitResponse) return rateLimitResponse;

      const db = await getPool();

      const actorId = await resolveProfileId(db, cognitoSub);
      if (!actorId) {
        return { statusCode: 404, headers, body: JSON.stringify({ message: 'Profile not found' }) };
      }

      // NOTE: tableName, actorColumn, targetColumn are compile-time constants from handler config, not user input.
      await db.query(
        `DELETE FROM ${config.tableName} WHERE ${config.actorColumn} = $1 AND ${config.targetColumn} = $2`,
        [actorId, targetUserId]
      );

      return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
    } catch (error: unknown) {
      log.error(config.errorMessage, error);
      return { statusCode: 500, headers, body: JSON.stringify({ message: 'Internal server error' }) };
    }
  };
}

// ── List Handler (get-blocked / get-muted) ───────────────────────────

interface ToggleListConfig {
  /** Logger name (e.g. 'profiles-get-blocked') */
  loggerName: string;
  /**
   * Table alias used in the query (e.g. 'bu' for blocked_users, 'mu' for muted_users).
   * NOTE: Compile-time constant, not user input.
   */
  tableAlias: string;
  /**
   * Full table name (e.g. 'blocked_users', 'muted_users').
   * NOTE: Compile-time constant, not user input.
   */
  tableName: string;
  /**
   * Column for the actor's WHERE filter (e.g. 'blocker_id', 'muter_id').
   * NOTE: Compile-time constant, not user input.
   */
  actorColumn: string;
  /**
   * Column for the target user (e.g. 'blocked_id', 'muted_id').
   * NOTE: Compile-time constant, not user input.
   */
  targetColumn: string;
  /**
   * Maps each DB row to a camelCase response object.
   * This allows each handler to define its own output shape.
   */
  mapRow: (row: Record<string, unknown>) => Record<string, unknown>;
  /** Error log message (e.g. 'Error getting blocked users') */
  errorMessage: string;
}

export function createToggleListHandler(config: ToggleListConfig) {
  const log = createLogger(config.loggerName);

  return async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
    const headers = createHeaders(event);
    log.initFromEvent(event);

    try {
      const cognitoSub = event.requestContext.authorizer?.claims?.sub;
      if (!cognitoSub) {
        return { statusCode: 401, headers, body: JSON.stringify({ message: 'Unauthorized' }) };
      }

      const db = await getPool();

      const userId = await resolveProfileId(db, cognitoSub);
      if (!userId) {
        return { statusCode: 404, headers, body: JSON.stringify({ message: 'Profile not found' }) };
      }

      // NOTE: All interpolated identifiers are compile-time constants from handler config, not user input.
      const result = await db.query(
        `SELECT ${config.tableAlias}.id, ${config.tableAlias}.${config.targetColumn} AS target_user_id, ${config.tableAlias}.created_at AS action_at,
                p.id AS "target_user.id", p.username AS "target_user.username",
                p.display_name AS "target_user.display_name", p.avatar_url AS "target_user.avatar_url"
         FROM ${config.tableName} ${config.tableAlias}
         JOIN profiles p ON p.id = ${config.tableAlias}.${config.targetColumn}
         WHERE ${config.tableAlias}.${config.actorColumn} = $1
         ORDER BY ${config.tableAlias}.created_at DESC
         LIMIT 50`,
        [userId]
      );

      const data = result.rows.map(config.mapRow);

      return { statusCode: 200, headers, body: JSON.stringify({ data }) };
    } catch (error: unknown) {
      log.error(config.errorMessage, error);
      return { statusCode: 500, headers, body: JSON.stringify({ message: 'Internal server error' }) };
    }
  };
}

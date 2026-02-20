/**
 * Group Action Handler Factory
 * Eliminates shared boilerplate across groups/join.ts and groups/leave.ts.
 *
 * Handles: OPTIONS -> auth -> rate limit -> validate groupId UUID -> get DB
 *          -> resolve profile -> get group -> transaction wrapper.
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import type { PoolClient } from 'pg';
import { getPool } from '../../shared/db';
import { cors, handleOptions, getSecureHeaders } from './cors';
import { createLogger, Logger } from './logger';
import { isValidUUID } from './security';
import { requireRateLimit } from './rate-limit';
import { resolveProfileId } from './auth';

interface GroupRow {
  id: string;
  [key: string]: unknown;
}

interface GroupActionConfig {
  /** 'join' or 'leave' — used in error messages */
  action: 'join' | 'leave';
  /** Logger name for createLogger (e.g. 'groups-join') */
  loggerName: string;
  /** Rate limit key prefix (e.g. 'groups-join') */
  rateLimitPrefix: string;
  /** Max requests per 1-minute window */
  rateLimitMax: number;
  /** Columns to SELECT from groups table (default: 'id') */
  groupColumns?: string;
  /**
   * Custom action executed inside a transaction.
   * The transaction is already BEGINned; the factory handles COMMIT, ROLLBACK, and client.release().
   * Return an APIGatewayProxyResult to send to the caller,
   * or return null to let the factory COMMIT and send a default success response.
   */
  onAction: (
    client: PoolClient,
    group: GroupRow,
    profileId: string,
    groupId: string,
    headers: Record<string, string>,
    log: Logger,
  ) => Promise<APIGatewayProxyResult>;
}

/**
 * Create a group action Lambda handler with shared boilerplate.
 */
export function createGroupActionHandler(config: GroupActionConfig) {
  const {
    action,
    loggerName,
    rateLimitPrefix,
    rateLimitMax,
    groupColumns = 'id',
    onAction,
  } = config;

  const log = createLogger(loggerName);
  const corsHeaders = getSecureHeaders();

  async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
    log.initFromEvent(event);
    if (event.httpMethod === 'OPTIONS') return handleOptions();

    const pool = await getPool();
    const client = await pool.connect();

    try {
      // Auth
      const cognitoSub = event.requestContext.authorizer?.claims?.sub;
      if (!cognitoSub) {
        return cors({
          statusCode: 401,
          body: JSON.stringify({ success: false, message: 'Unauthorized' }),
        });
      }

      // Rate limit
      const rateLimitResponse = await requireRateLimit({
        prefix: rateLimitPrefix,
        identifier: cognitoSub,
        windowSeconds: 60,
        maxRequests: rateLimitMax,
      }, corsHeaders);
      if (rateLimitResponse) return rateLimitResponse;

      // Validate groupId
      const groupId = event.pathParameters?.groupId;
      if (!groupId || !isValidUUID(groupId)) {
        return cors({
          statusCode: 400,
          body: JSON.stringify({ success: false, message: 'Invalid ID format' }),
        });
      }

      // Resolve profile
      const profileId = await resolveProfileId(client, cognitoSub);
      if (!profileId) {
        return cors({
          statusCode: 404,
          body: JSON.stringify({ success: false, message: 'Profile not found' }),
        });
      }

      // Get group
      const groupResult = await client.query(
        `SELECT ${groupColumns} FROM groups WHERE id = $1`,
        [groupId]
      );

      if (groupResult.rows.length === 0) {
        return cors({
          statusCode: 404,
          body: JSON.stringify({ success: false, message: 'Group not found' }),
        });
      }

      const group: GroupRow = groupResult.rows[0];

      // Transaction + custom action
      await client.query('BEGIN');
      const result = await onAction(client, group, profileId, groupId, corsHeaders, log);
      await client.query('COMMIT');
      return result;
    } catch (error: unknown) {
      await client.query('ROLLBACK');
      log.error(`${action === 'join' ? 'Join' : 'Leave'} group error`, error);
      return cors({
        statusCode: 500,
        body: JSON.stringify({ success: false, message: `Failed to ${action} group` }),
      });
    } finally {
      client.release();
    }
  }

  return { handler };
}

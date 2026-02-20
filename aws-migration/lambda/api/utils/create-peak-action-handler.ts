/**
 * Peak Action Handler Factory
 * Eliminates shared boilerplate across peaks/like.ts, peaks/unlike.ts, peaks/react.ts.
 *
 * Handles: auth (requireAuth) -> rate limit -> validate UUID (peakId) -> get DB
 *          -> resolve profile -> get peak -> bidirectional block check -> transaction wrapper.
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import type { Pool, PoolClient } from 'pg';
import { getPool } from '../../shared/db';
import { createHeaders } from './cors';
import { createLogger, Logger } from './logger';
import { requireAuth, validateUUIDParam, isErrorResponse } from './validators';
import { resolveProfileId } from './auth';
import { requireRateLimit } from './rate-limit';
import { RATE_WINDOW_1_MIN } from './constants';

interface PeakRow {
  id: string;
  author_id: string;
}

interface PeakActionConfig {
  /** Logger name for createLogger (e.g. 'peaks-like') */
  loggerName: string;
  /** Rate limit key prefix (e.g. 'peak-like') */
  rateLimitPrefix: string;
  /** Max requests per 1-minute window (default: 30) */
  rateLimitMax?: number;
  /**
   * Custom action executed inside a transaction.
   * The transaction is already BEGINned; the factory handles COMMIT, ROLLBACK, and client.release().
   * Return an APIGatewayProxyResult to send to the caller.
   */
  onAction: (
    client: PoolClient,
    peak: PeakRow,
    profileId: string,
    db: Pool,
    headers: Record<string, string>,
    log: Logger,
    event: APIGatewayProxyEvent,
  ) => Promise<APIGatewayProxyResult>;
}

/**
 * Create a peak action Lambda handler with shared boilerplate.
 */
export function createPeakActionHandler(config: PeakActionConfig) {
  const {
    loggerName,
    rateLimitPrefix,
    rateLimitMax = 30,
    onAction,
  } = config;

  const log = createLogger(loggerName);

  async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
    const headers = createHeaders(event);
    log.initFromEvent(event);

    try {
      // Auth
      const userId = requireAuth(event, headers);
      if (isErrorResponse(userId)) return userId;

      // Rate limit
      const rateLimitResponse = await requireRateLimit({
        prefix: rateLimitPrefix,
        identifier: userId,
        windowSeconds: RATE_WINDOW_1_MIN,
        maxRequests: rateLimitMax,
      }, headers);
      if (rateLimitResponse) return rateLimitResponse;

      // Validate peakId
      const peakId = validateUUIDParam(event, headers, 'id', 'Peak');
      if (isErrorResponse(peakId)) return peakId;

      // Get DB pool
      const db = await getPool();

      // Resolve profile
      const profileId = await resolveProfileId(db, userId);
      if (!profileId) {
        return {
          statusCode: 404,
          headers,
          body: JSON.stringify({ message: 'User profile not found' }),
        };
      }

      // Get peak
      const peakResult = await db.query(
        'SELECT id, author_id FROM peaks WHERE id = $1',
        [peakId]
      );

      if (peakResult.rows.length === 0) {
        return {
          statusCode: 404,
          headers,
          body: JSON.stringify({ message: 'Peak not found' }),
        };
      }

      const peak: PeakRow = peakResult.rows[0];

      // Bidirectional block check
      const blockCheck = await db.query(
        `SELECT 1 FROM blocked_users
         WHERE (blocker_id = $1 AND blocked_id = $2)
            OR (blocker_id = $2 AND blocked_id = $1)
         LIMIT 1`,
        [profileId, peak.author_id]
      );
      if (blockCheck.rows.length > 0) {
        return {
          statusCode: 403,
          headers,
          body: JSON.stringify({ message: 'Action not allowed' }),
        };
      }

      // Transaction wrapper
      const client = await db.connect();
      try {
        await client.query('BEGIN');
        const result = await onAction(client, peak, profileId, db, headers, log, event);
        await client.query('COMMIT');
        return result;
      } catch (error: unknown) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    } catch (error: unknown) {
      log.error(`Error in ${loggerName}`, error);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ message: 'Internal server error' }),
      };
    }
  }

  return { handler };
}

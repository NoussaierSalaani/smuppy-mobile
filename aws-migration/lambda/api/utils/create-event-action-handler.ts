/**
 * Event Action Handler Factory
 * Eliminates shared boilerplate across events/join.ts and events/leave.ts.
 *
 * Handles: OPTIONS -> auth -> rate limit -> validate eventId UUID -> get DB
 *          -> resolve profile -> get event -> transaction wrapper.
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import type { PoolClient } from 'pg';
import { getPool } from '../../shared/db';
import { cors, handleOptions, getSecureHeaders } from './cors';
import { createLogger, Logger } from './logger';
import { isValidUUID } from './security';
import { requireRateLimit } from './rate-limit';
import { resolveProfileId } from './auth';

export interface EventRow {
  id: string;
  [key: string]: unknown;
}

interface EventActionConfig {
  /** 'join' or 'leave' — used in error messages */
  action: 'join' | 'leave';
  /** Logger name for createLogger (e.g. 'events-join') */
  loggerName: string;
  /** Rate limit key prefix (e.g. 'events-join') */
  rateLimitPrefix: string;
  /** Max requests per 1-minute window */
  rateLimitMax: number;
  /** Columns to SELECT from events table (default: 'id'). Use table alias when eventJoins is set. */
  eventColumns?: string;
  /** Optional JOIN clauses appended after 'FROM events e' (e.g. 'JOIN profiles p ON e.creator_id = p.id') */
  eventJoins?: string;
  /**
   * Custom action executed inside a transaction.
   * The transaction is already BEGINned; the factory handles COMMIT, ROLLBACK, and client.release().
   * Return an APIGatewayProxyResult to send to the caller.
   */
  onAction: (ctx: EventActionContext) => Promise<APIGatewayProxyResult>;
}

export interface EventActionContext {
  client: PoolClient;
  eventData: EventRow;
  profileId: string;
  cognitoSub: string;
  eventId: string;
  headers: Record<string, string>;
  log: Logger;
  /** Raw API Gateway event for accessing body, query params, etc. */
  rawEvent: APIGatewayProxyEvent;
}

/**
 * Create an event action Lambda handler with shared boilerplate.
 */
export function createEventActionHandler(config: EventActionConfig) {
  const {
    action,
    loggerName,
    rateLimitPrefix,
    rateLimitMax,
    eventColumns = 'id',
    eventJoins,
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

      // Validate eventId
      const eventId = event.pathParameters?.eventId;
      if (!eventId || !isValidUUID(eventId)) {
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

      // Get event
      const tableRef = eventJoins ? 'events e' : 'events';
      const whereCol = eventJoins ? 'e.id' : 'id';
      const joinClause = eventJoins ? ` ${eventJoins}` : '';
      const eventResult = await client.query(
        `SELECT ${eventColumns} FROM ${tableRef}${joinClause} WHERE ${whereCol} = $1`,
        [eventId]
      );

      if (eventResult.rows.length === 0) {
        return cors({
          statusCode: 404,
          body: JSON.stringify({ success: false, message: 'Event not found' }),
        });
      }

      const eventData: EventRow = eventResult.rows[0];

      // Transaction + custom action
      await client.query('BEGIN');
      const result = await onAction({
        client,
        eventData,
        profileId,
        cognitoSub,
        eventId,
        headers: corsHeaders,
        log,
        rawEvent: event,
      });
      await client.query('COMMIT');
      return result;
    } catch (error: unknown) {
      await client.query('ROLLBACK');
      log.error(`${action === 'join' ? 'Join' : 'Leave'} event error`, error);
      return cors({
        statusCode: 500,
        body: JSON.stringify({ success: false, message: `Failed to ${action} event` }),
      });
    } finally {
      client.release();
    }
  }

  return { handler };
}

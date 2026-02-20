/**
 * Entity Action Handler Factory — Shared Base
 *
 * Provides the common auth/rate-limit/validate/profile-resolution/transaction
 * pipeline used by both createGroupActionHandler and createEventActionHandler.
 *
 * Handles: OPTIONS -> auth -> rate limit -> validate entity UUID -> get DB pool
 *          -> resolve profile -> fetch entity -> BEGIN transaction -> onAction -> COMMIT.
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import type { PoolClient } from 'pg';
import { getPool } from '../../shared/db';
import type { Logger } from './logger';
import { isValidUUID } from './security';
import { requireRateLimit } from './rate-limit';
import { resolveProfileId } from './auth';
import { withErrorHandler } from './error-handler';

/** Generic entity row returned from the DB fetch query */
export interface EntityRow {
  id: string;
  [key: string]: unknown;
}

/** Context passed to the onAction callback */
export interface EntityActionContext {
  client: PoolClient;
  entity: EntityRow;
  profileId: string;
  cognitoSub: string;
  entityId: string;
  headers: Record<string, string>;
  log: Logger;
  rawEvent: APIGatewayProxyEvent;
}

export interface EntityActionConfig {
  /** Friendly action name — used in error messages (e.g. 'join group', 'leave event') */
  actionLabel: string;
  /** Logger name for createLogger (e.g. 'groups-join') */
  loggerName: string;
  /** Rate limit key prefix (e.g. 'groups-join') */
  rateLimitPrefix: string;
  /** Max requests per 1-minute window */
  rateLimitMax: number;
  /** Path parameter key containing the entity UUID (e.g. 'groupId', 'eventId') */
  pathParamKey: string;
  /**
   * Build the SQL query to fetch the entity.
   * Receives the entity UUID as `$1`.
   * Must return `{ text: string }` where the query SELECTs at least `id`.
   */
  buildEntityQuery: (entityId: string) => { text: string; params: unknown[] };
  /** 404 message when the entity is not found */
  entityNotFoundMessage: string;
  /**
   * Custom action executed inside a transaction.
   * The transaction is already BEGINned; the factory handles COMMIT, ROLLBACK, and client.release().
   * Return an APIGatewayProxyResult to send to the caller.
   */
  onAction: (ctx: EntityActionContext) => Promise<APIGatewayProxyResult>;
}

/**
 * Create a Lambda handler with shared auth/rate-limit/validate/profile/transaction boilerplate.
 */
export function createEntityActionHandler(config: EntityActionConfig) {
  const {
    actionLabel,
    loggerName,
    rateLimitPrefix,
    rateLimitMax,
    pathParamKey,
    buildEntityQuery,
    entityNotFoundMessage,
    onAction,
  } = config;

  const handler = withErrorHandler(loggerName, async (event, { headers, log }) => {
    const pool = await getPool();
    const client = await pool.connect();

    try {
      // Auth
      const cognitoSub = event.requestContext.authorizer?.claims?.sub;
      if (!cognitoSub) {
        return {
          statusCode: 401,
          headers,
          body: JSON.stringify({ success: false, message: 'Unauthorized' }),
        };
      }

      // Rate limit
      const rateLimitResponse = await requireRateLimit({
        prefix: rateLimitPrefix,
        identifier: cognitoSub,
        windowSeconds: 60,
        maxRequests: rateLimitMax,
      }, headers);
      if (rateLimitResponse) return rateLimitResponse;

      // Validate entity ID
      const entityId = event.pathParameters?.[pathParamKey];
      if (!entityId || !isValidUUID(entityId)) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ success: false, message: 'Invalid ID format' }),
        };
      }

      // Resolve profile
      const profileId = await resolveProfileId(client, cognitoSub);
      if (!profileId) {
        return {
          statusCode: 404,
          headers,
          body: JSON.stringify({ success: false, message: 'Profile not found' }),
        };
      }

      // Fetch entity
      const entityQuery = buildEntityQuery(entityId);
      const entityResult = await client.query(entityQuery.text, entityQuery.params);

      if (entityResult.rows.length === 0) {
        return {
          statusCode: 404,
          headers,
          body: JSON.stringify({ success: false, message: entityNotFoundMessage }),
        };
      }

      const entity: EntityRow = entityResult.rows[0];

      // Transaction + custom action
      await client.query('BEGIN');
      const result = await onAction({
        client,
        entity,
        profileId,
        cognitoSub,
        entityId,
        headers,
        log,
        rawEvent: event,
      });
      await client.query('COMMIT');
      return result;
    } catch (error: unknown) {
      await client.query('ROLLBACK');
      log.error(`${actionLabel} error`, error);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ success: false, message: `Failed to ${actionLabel}` }),
      };
    } finally {
      client.release();
    }
  });

  return { handler };
}

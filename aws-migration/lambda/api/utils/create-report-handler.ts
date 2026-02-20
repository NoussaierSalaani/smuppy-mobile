/**
 * Factory: Report Handler
 *
 * Eliminates duplication across 6 report handlers (comment, post, user, message, peak, livestream).
 * All share: auth, rate limiting, reason validation, sanitization, transaction pattern, escalation.
 *
 * NOTE: Table/column names in config are compile-time constants, never user input.
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { Pool } from 'pg';
import { getPool } from '../../shared/db';
import { createHeaders } from './cors';
import { createLogger } from './logger';
import { requireRateLimit } from './rate-limit';
import { isValidUUID } from './security';
import { resolveProfileId } from './auth';
import { RATE_WINDOW_5_MIN, MAX_REPORT_REASON_LENGTH, MAX_REPORT_DETAILS_LENGTH } from './constants';
import { assertSafeIdentifier, assertSafeColumnList } from './sql-identifiers';

type Logger = ReturnType<typeof createLogger>;

interface ReportHandlerConfig {
  loggerName: string;
  resourceType: string;
  idField: string;

  /** Simple entity check: SELECT id FROM {entityTable} WHERE id = $1 */
  entityTable?: string;
  /** Custom entity check for complex cases (e.g. message with participant verification) */
  customEntityCheck?: (db: Pool, resourceId: string, reporterId: string, body: Record<string, unknown>) => Promise<boolean>;

  /** Report table name (compile-time constant) */
  reportTable: string;
  /** Column in report table for the resource ID (compile-time constant) */
  resourceIdColumn: string;

  /** Extra body fields to validate as UUID (e.g. ['conversationId']) */
  extraIdFields?: string[];
  /** Extra columns to include in INSERT (e.g. [{ bodyField: 'conversationId', column: 'conversation_id' }]) */
  extraInsertFields?: { bodyField: string; column: string }[];

  /** Validate reason against allowed list */
  validReasons?: string[];
  /** Prevent self-reporting (for user reports) */
  preventSelfReport?: boolean;

  /** Escalation callback (runs in try/catch, non-blocking) */
  runEscalation: (db: Pool, log: Logger, resourceId: string) => Promise<void>;
}

export function createReportHandler(config: ReportHandlerConfig) {
  // Defense-in-depth: validate config-provided identifiers at factory init time.
  // These are compile-time constants, never user input.
  assertSafeIdentifier(config.reportTable, `${config.loggerName}.reportTable`);
  assertSafeIdentifier(config.resourceIdColumn, `${config.loggerName}.resourceIdColumn`);
  if (config.entityTable) {
    assertSafeIdentifier(config.entityTable, `${config.loggerName}.entityTable`);
  }
  if (config.extraInsertFields) {
    assertSafeColumnList(
      config.extraInsertFields.map(f => f.column).join(', '),
      `${config.loggerName}.extraInsertFields`,
    );
  }

  const log = createLogger(config.loggerName);

  return async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
    const headers = createHeaders(event);
    log.initFromEvent(event);

    try {
      const cognitoSub = event.requestContext.authorizer?.claims?.sub;
      if (!cognitoSub) {
        return { statusCode: 401, headers, body: JSON.stringify({ message: 'Unauthorized' }) };
      }

      const rateLimitResponse = await requireRateLimit({
        prefix: 'report-all',
        identifier: cognitoSub,
        windowSeconds: RATE_WINDOW_5_MIN,
        maxRequests: 5,
      }, headers);
      if (rateLimitResponse) return rateLimitResponse;

      const body = JSON.parse(event.body || '{}');
      const resourceId = body[config.idField];

      if (!resourceId || !isValidUUID(resourceId)) {
        return { statusCode: 400, headers, body: JSON.stringify({ message: `Invalid ${config.resourceType} ID format` }) };
      }

      // Validate extra ID fields (e.g. conversationId)
      if (config.extraIdFields) {
        for (const field of config.extraIdFields) {
          if (!body[field] || !isValidUUID(body[field])) {
            return { statusCode: 400, headers, body: JSON.stringify({ message: `Invalid ${field} format` }) };
          }
        }
      }

      if (!body.reason || typeof body.reason !== 'string' || body.reason.trim().length === 0) {
        return { statusCode: 400, headers, body: JSON.stringify({ message: 'Reason is required' }) };
      }

      if (config.validReasons && !config.validReasons.includes(body.reason.trim().toLowerCase())) {
        return { statusCode: 400, headers, body: JSON.stringify({ message: 'Invalid report reason' }) };
      }

      const sanitizedReason = body.reason.replaceAll(/<[^>]*>/g, '').trim().slice(0, MAX_REPORT_REASON_LENGTH); // NOSONAR
      const sanitizedDetails = body.details
        ? String(body.details).replaceAll(/<[^>]*>/g, '').trim().slice(0, MAX_REPORT_DETAILS_LENGTH) // NOSONAR
        : null;

      const db = await getPool();

      const reporterId = await resolveProfileId(db, cognitoSub);
      if (!reporterId) {
        return { statusCode: 404, headers, body: JSON.stringify({ message: 'Profile not found' }) };
      }

      if (config.preventSelfReport && reporterId === resourceId) {
        return { statusCode: 400, headers, body: JSON.stringify({ message: 'Cannot report yourself' }) };
      }

      // Verify entity exists
      if (config.customEntityCheck) {
        const exists = await config.customEntityCheck(db, resourceId, reporterId, body);
        if (!exists) {
          return { statusCode: 404, headers, body: JSON.stringify({ message: `${config.resourceType.charAt(0).toUpperCase() + config.resourceType.slice(1)} not found` }) };
        }
      } else if (config.entityTable) {
        // NOTE: entityTable is a compile-time constant from handler config, not user input.
        const entityResult = await db.query(`SELECT id FROM ${config.entityTable} WHERE id = $1`, [resourceId]);
        if (entityResult.rows.length === 0) {
          return { statusCode: 404, headers, body: JSON.stringify({ message: `${config.resourceType.charAt(0).toUpperCase() + config.resourceType.slice(1)} not found` }) };
        }
      }

      // Build INSERT query dynamically from config
      // NOTE: All table/column names are compile-time constants from handler config.
      const insertColumns = ['reporter_id', config.resourceIdColumn, 'reason', 'description'];
      const insertValues = [reporterId, resourceId, sanitizedReason, sanitizedDetails];

      if (config.extraInsertFields) {
        for (const field of config.extraInsertFields) {
          insertColumns.push(field.column);
          insertValues.push(body[field.bodyField]);
        }
      }

      const placeholders = insertValues.map((_, i) => `$${i + 1}`).join(', ');

      // Atomic duplicate check + insert
      const client = await db.connect();
      let result;
      try {
        await client.query('BEGIN');

        const existing = await client.query(
          `SELECT id FROM ${config.reportTable} WHERE reporter_id = $1 AND ${config.resourceIdColumn} = $2 FOR UPDATE`,
          [reporterId, resourceId]
        );
        if (existing.rows.length > 0) {
          await client.query('ROLLBACK');
          client.release();
          return { statusCode: 409, headers, body: JSON.stringify({ message: `You have already reported this ${config.resourceType}` }) };
        }

        result = await client.query(
          `INSERT INTO ${config.reportTable} (${insertColumns.join(', ')}) VALUES (${placeholders}) RETURNING id`,
          insertValues
        );

        await client.query('COMMIT');
      } catch (txErr) {
        await client.query('ROLLBACK');
        throw txErr;
      } finally {
        client.release();
      }

      log.info(`${config.resourceType} report created`, { reportId: result.rows[0].id });

      // Auto-escalation (non-blocking)
      try {
        await config.runEscalation(db, log, resourceId);
      } catch (escErr) {
        log.error('Auto-escalation check failed (non-blocking)', escErr);
      }

      return {
        statusCode: 201,
        headers,
        body: JSON.stringify({ id: result.rows[0].id, success: true }),
      };
    } catch (error: unknown) {
      log.error(`Error reporting ${config.resourceType}`, error);
      return { statusCode: 500, headers, body: JSON.stringify({ message: 'Internal server error' }) };
    }
  };
}

/**
 * Factory for delete handler Lambdas.
 *
 * Encapsulates the common pipeline shared by every delete/cancel endpoint:
 *   auth check -> rate limit -> UUID validation -> profile resolution
 *   -> ownership check -> transaction (custom delete logic) -> response
 *
 * Each handler supplies a config object with hooks for the parts that differ.
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { Pool, PoolClient } from 'pg';
import { getPool } from '../../shared/db';
import { createHeaders } from './cors';
import { createLogger } from './logger';
import { requireAuth, validateUUIDParam, isErrorResponse } from './validators';
import { resolveProfileId } from './auth';
import { requireRateLimit } from './rate-limit';
import { RATE_WINDOW_1_MIN } from './constants';

// ── Types ────────────────────────────────────────────────────────────

/** Row returned by the ownership SELECT — always includes at least `id` plus the ownership column. */
export type ResourceRow = Record<string, unknown>;

/** The context passed into every hook so custom logic has everything it needs. */
export interface DeleteContext {
  /** Transaction-scoped DB client (use for all queries inside onDelete) */
  client: PoolClient;
  /** The full row returned by the ownership SELECT */
  resource: ResourceRow;
  /** The authenticated user's profile UUID */
  profileId: string;
  /** The validated resource UUID from the path */
  resourceId: string;
  /** Connection pool — useful for post-transaction best-effort work (e.g. S3 cleanup) */
  db: Pool;
  /** CORS + security headers for the current request */
  headers: Record<string, string>;
}

/**
 * Return type for the `onDelete` hook.
 *
 * - `void` / `undefined` — the factory returns the default 200 success response.
 * - `APIGatewayProxyResult` — the factory returns that response verbatim
 *     (useful when the hook needs to short-circuit, e.g. review-delete returning 404/403).
 */
export type OnDeleteResult = void | APIGatewayProxyResult;

/**
 * Optional hook that runs *after* the transaction commits.
 * Use for best-effort side-effects like S3 cleanup or CloudFront invalidation.
 */
export type AfterCommitHook = (ctx: Omit<DeleteContext, 'client'>) => Promise<void>;

/** Configuration object accepted by `createDeleteHandler`. */
export interface DeleteHandlerConfig {
  /** Human-readable name, used in log messages and error responses (e.g. "Post", "Peak") */
  resourceName: string;

  /** DB table that holds the resource (e.g. "posts", "peaks") */
  resourceTable: string;

  /** Logger namespace (e.g. "posts-delete") */
  loggerName: string;

  /** Column in `resourceTable` that stores the owner profile ID. Default: `'author_id'` */
  ownershipField?: string;

  /** Columns to SELECT when checking ownership. Default: `'id, author_id'` */
  selectColumns?: string;

  /** Path parameter key that holds the resource UUID. Default: `'id'` */
  pathParam?: string;

  // ── Rate Limiting ─────────────────────────────────────────────────

  /** DynamoDB rate-limit key prefix (e.g. "post-delete") */
  rateLimitPrefix: string;

  /** Max requests per window */
  rateLimitMax: number;

  /** Window duration in seconds. Default: `RATE_WINDOW_1_MIN` (60) */
  rateLimitWindow?: number;

  // ── Hooks ─────────────────────────────────────────────────────────

  /**
   * Optional hook that runs after auth + rate limit, before UUID validation.
   * Use for additional pre-checks like `requireActiveAccount`.
   *
   * Receives the Cognito sub (userId) and response headers.
   * Return `null` to continue, or an `APIGatewayProxyResult` to short-circuit.
   */
  afterAuth?: (
    userId: string,
    headers: Record<string, string>,
  ) => Promise<APIGatewayProxyResult | null>;

  /**
   * Custom ownership check. When provided, replaces the default
   * `resource[ownershipField] !== profileId` check.
   *
   * Return `null` to indicate the user IS authorized.
   * Return an `APIGatewayProxyResult` to short-circuit with that response.
   */
  checkOwnership?: (
    resource: ResourceRow,
    profileId: string,
    headers: Record<string, string>,
    ctx: { db: Pool; resourceId: string },
  ) => Promise<APIGatewayProxyResult | null>;

  /**
   * The core delete logic, executed inside a BEGIN/COMMIT transaction.
   * The factory already owns the transaction boundaries — do NOT call
   * BEGIN/COMMIT/ROLLBACK inside this hook.
   */
  onDelete: (ctx: DeleteContext) => Promise<OnDeleteResult>;

  /**
   * Optional hook that runs after the transaction commits successfully.
   * Use for best-effort cleanup (S3, CloudFront, etc.).
   * Errors here are logged but do NOT fail the response.
   */
  afterCommit?: AfterCommitHook;
}

// ── Factory ──────────────────────────────────────────────────────────

export function createDeleteHandler(config: DeleteHandlerConfig) {
  const {
    resourceName,
    resourceTable,
    loggerName,
    ownershipField = 'author_id',
    selectColumns = `id, ${ownershipField}`,
    pathParam = 'id',
    rateLimitPrefix,
    rateLimitMax,
    rateLimitWindow = RATE_WINDOW_1_MIN,
    afterAuth,
    checkOwnership,
    onDelete,
    afterCommit,
  } = config;

  const log = createLogger(loggerName);

  async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
    const headers = createHeaders(event);
    log.initFromEvent(event);

    try {
      // ── Auth ────────────────────────────────────────────────────
      const userId = requireAuth(event, headers);
      if (isErrorResponse(userId)) return userId;

      // ── Rate limit ─────────────────────────────────────────────
      const rateLimitResponse = await requireRateLimit(
        { prefix: rateLimitPrefix, identifier: userId, windowSeconds: rateLimitWindow, maxRequests: rateLimitMax },
        headers,
      );
      if (rateLimitResponse) return rateLimitResponse;

      // ── After-auth hook (e.g. account status check) ────────────
      if (afterAuth) {
        const afterAuthResponse = await afterAuth(userId, headers);
        if (afterAuthResponse) return afterAuthResponse;
      }

      // ── UUID validation ────────────────────────────────────────
      const resourceId = validateUUIDParam(event, headers, pathParam, resourceName);
      if (isErrorResponse(resourceId)) return resourceId;

      // ── Profile resolution ─────────────────────────────────────
      const db = await getPool();
      const profileId = await resolveProfileId(db, userId);
      if (!profileId) {
        return {
          statusCode: 404,
          headers,
          body: JSON.stringify({ message: 'User profile not found' }),
        };
      }

      // ── Ownership check ────────────────────────────────────────
      const resourceResult = await db.query(
        `SELECT ${selectColumns} FROM ${resourceTable} WHERE id = $1`,
        [resourceId],
      );

      if (resourceResult.rows.length === 0) {
        return {
          statusCode: 404,
          headers,
          body: JSON.stringify({ message: `${resourceName} not found` }),
        };
      }

      const resource: ResourceRow = resourceResult.rows[0];

      if (checkOwnership) {
        const ownershipError = await checkOwnership(resource, profileId, headers, { db, resourceId });
        if (ownershipError) return ownershipError;
      } else if (resource[ownershipField] !== profileId) {
        return {
          statusCode: 403,
          headers,
          body: JSON.stringify({ message: `Not authorized to delete this ${resourceName.toLowerCase()}` }),
        };
      }

      // ── Transaction ────────────────────────────────────────────
      const client = await db.connect();
      let hookResult: OnDeleteResult;

      try {
        await client.query('BEGIN');

        hookResult = await onDelete({ client, resource, profileId, resourceId, db, headers });

        await client.query('COMMIT');
      } catch (txError: unknown) {
        await client.query('ROLLBACK');
        throw txError;
      } finally {
        client.release();
      }

      // If the hook returned a custom response, use it.
      if (hookResult) return hookResult;

      // ── After-commit side-effects (best-effort) ────────────────
      if (afterCommit) {
        try {
          await afterCommit({ resource, profileId, resourceId, db, headers });
        } catch (afterError: unknown) {
          log.error(`After-commit hook failed for ${resourceName.toLowerCase()}`, afterError);
        }
      }

      // ── Default success response ──────────────────────────────
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: true, message: `${resourceName} deleted successfully` }),
      };
    } catch (error: unknown) {
      log.error(`Error deleting ${resourceName.toLowerCase()}`, error);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ message: 'Internal server error' }),
      };
    }
  }

  return handler;
}

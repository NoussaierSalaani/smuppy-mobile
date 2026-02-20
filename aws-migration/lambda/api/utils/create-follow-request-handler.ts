/**
 * Factory for Follow Request Handlers
 *
 * Eliminates boilerplate across accept, decline, cancel, and check-pending
 * follow-request handlers. Each handler becomes a config + custom action.
 *
 * Flow: auth -> validate UUID param -> get DB -> resolve profile -> rate limit
 *       -> load follow request -> verify authorization role -> check status is pending
 *       -> execute onAction -> return response
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { Pool, PoolClient } from 'pg';
import { getPool } from '../../shared/db';
import { createHeaders } from './cors';
import { createLogger } from './logger';
import { requireRateLimit } from './rate-limit';
import { isValidUUID } from './security';

type FollowRequestAction = 'accept' | 'decline' | 'cancel' | 'check-pending';
type AuthRole = 'target' | 'requester';

/** The follow request row loaded from the database */
interface FollowRequest {
  id: string;
  requester_id: string;
  target_id: string;
  status: string;
}

/** Context passed to the onAction callback */
interface ActionContext {
  /** Database pool (for non-transactional queries or push notifications) */
  db: Pool;
  /** Database client — equals a transaction client when useTransaction is true, otherwise the pool */
  client: Pool | PoolClient;
  /** The loaded follow request row. Null for userId-based lookups (cancel, check-pending) when no pending request exists. */
  request: FollowRequest | null;
  /** The authenticated user's profile ID */
  profileId: string;
  /** CORS + security response headers */
  headers: Record<string, string>;
}

interface FollowRequestHandlerConfig {
  /** Which action this handler performs */
  action: FollowRequestAction;
  /** Logger name for CloudWatch structured logging */
  loggerName: string;
  /** Who can perform this action: 'target' (accept/decline) or 'requester' (cancel/check-pending) */
  authRole: AuthRole;
  /** Path parameter name: 'id' for request ID, 'userId' for target user */
  paramName: string;
  /** Rate limit window in seconds */
  rateLimitWindow: number;
  /** Max requests per rate limit window */
  rateLimitMax: number;
  /** Custom action logic — returns the final APIGatewayProxyResult */
  onAction: (ctx: ActionContext) => Promise<APIGatewayProxyResult>;
  /** Whether to wrap onAction in a BEGIN/COMMIT transaction (default: false) */
  useTransaction?: boolean;
}

/**
 * Creates a Lambda handler for follow-request operations.
 *
 * @param config - Handler configuration
 * @returns A Lambda handler function
 */
export function createFollowRequestHandler(
  config: FollowRequestHandlerConfig,
): (event: APIGatewayProxyEvent) => Promise<APIGatewayProxyResult> {
  const {
    action,
    loggerName,
    authRole,
    paramName,
    rateLimitWindow,
    rateLimitMax,
    onAction,
    useTransaction = false,
  } = config;

  const log = createLogger(loggerName);

  return async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    const headers = createHeaders(event);
    log.initFromEvent(event);

    try {
      // 1. Auth check
      const userId = event.requestContext.authorizer?.claims?.sub;
      if (!userId) {
        return {
          statusCode: 401,
          headers,
          body: JSON.stringify({ message: 'Unauthorized' }),
        };
      }

      // 2. Rate limit
      const rateLimitResponse = await requireRateLimit(
        { prefix: `follow-${action}`, identifier: userId, windowSeconds: rateLimitWindow, maxRequests: rateLimitMax },
        headers,
      );
      if (rateLimitResponse) return rateLimitResponse;

      // 3. Validate UUID path parameter
      const paramValue = event.pathParameters?.[paramName];
      if (!paramValue || !isValidUUID(paramValue)) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ message: `Invalid ${paramName === 'userId' ? 'user' : 'request'} ID format` }),
        };
      }

      // 4. Get DB pool
      const db = await getPool();

      // 5. Resolve cognito_sub to profile ID
      const userResult = await db.query(
        'SELECT id FROM profiles WHERE cognito_sub = $1',
        [userId],
      );
      if (userResult.rows.length === 0) {
        return {
          statusCode: 404,
          headers,
          body: JSON.stringify({ message: 'User profile not found' }),
        };
      }
      const profileId: string = userResult.rows[0].id;

      // 6. Load follow request
      let request: FollowRequest | null = null;

      if (paramName === 'id') {
        // Load by request ID (accept, decline)
        const requestResult = await db.query(
          'SELECT id, requester_id, target_id, status FROM follow_requests WHERE id = $1',
          [paramValue],
        );
        if (requestResult.rows.length === 0) {
          return {
            statusCode: 404,
            headers,
            body: JSON.stringify({ message: 'Follow request not found' }),
          };
        }
        request = requestResult.rows[0] as FollowRequest;
      } else {
        // Load by requester + target (cancel, check-pending) — paramValue is the target userId
        const requestResult = await db.query(
          'SELECT id, requester_id, target_id, status FROM follow_requests WHERE requester_id = $1 AND target_id = $2 AND status = $3',
          [profileId, paramValue, 'pending'],
        );
        // For check-pending, no request is a valid state (hasPending: false)
        // For cancel, no request means 404
        if (requestResult.rows.length === 0) {
          request = null;
        } else {
          request = requestResult.rows[0] as FollowRequest;
        }
      }

      // 7. Verify authorization role (only for request-ID-based lookups)
      if (request && paramName === 'id') {
        const authorizedId = authRole === 'target' ? request.target_id : request.requester_id;
        if (authorizedId !== profileId) {
          return {
            statusCode: 403,
            headers,
            body: JSON.stringify({ message: `Not authorized to ${action} this request` }),
          };
        }

        // 8. Check status is pending
        if (request.status !== 'pending') {
          return {
            statusCode: 400,
            headers,
            body: JSON.stringify({ message: `Request already ${request.status}` }),
          };
        }
      }

      // 9. Execute onAction (with optional transaction wrapper)
      if (useTransaction) {
        const client = await db.connect();
        try {
          await client.query('BEGIN');
          const result = await onAction({ db, client, request, profileId, headers });
          await client.query('COMMIT');
          return result;
        } catch (error: unknown) {
          await client.query('ROLLBACK');
          throw error;
        } finally {
          client.release();
        }
      }

      return await onAction({ db, client: db, request, profileId, headers });
    } catch (error: unknown) {
      log.error(`Error in ${action} follow request`, error);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ message: 'Internal server error' }),
      };
    }
  };
}

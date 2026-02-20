import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { Pool } from 'pg';
import { getPool } from '../../shared/db';
import { createHeaders } from './cors';
import { createLogger, Logger } from './logger';
import { requireRateLimit } from './rate-limit';
import { isValidUUID } from './security';
import { resolveProfileId } from './auth';

// ── Shared context passed to all notification handler callbacks ──────

export interface NotificationContext {
  /** Resolved DB profile UUID (not Cognito sub) */
  profileId: string;
  /** Database connection pool */
  db: Pool;
  /** CORS-aware response headers */
  headers: Record<string, string>;
  /** Structured logger already initialised from the event */
  log: Logger;
  /** Original API Gateway event */
  event: APIGatewayProxyEvent;
}

interface WithNotificationContextConfig {
  loggerName: string;
  rateLimitPrefix: string;
  maxRequests: number;
  /** Rate-limit window in seconds (default: 60) */
  windowSeconds?: number;
  /** If true, allow requests when DynamoDB is unavailable (default: false) */
  failOpen?: boolean;
  /** Error message logged on unhandled exceptions */
  errorLabel: string;
}

/**
 * Higher-order wrapper that eliminates the auth / rate-limit / profile-resolution
 * boilerplate shared by every notification endpoint.
 *
 * Usage:
 * ```ts
 * export const handler = withNotificationContext(
 *   { loggerName: '...', rateLimitPrefix: '...', maxRequests: 60, errorLabel: '...' },
 *   async (ctx) => { ... return { statusCode: 200, ... }; },
 * );
 * ```
 */
export function withNotificationContext(
  config: WithNotificationContextConfig,
  action: (ctx: NotificationContext) => Promise<APIGatewayProxyResult>,
): (event: APIGatewayProxyEvent) => Promise<APIGatewayProxyResult> {
  const log = createLogger(config.loggerName);

  return async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
    const headers = createHeaders(event);
    log.initFromEvent(event);

    try {
      const userId = event.requestContext.authorizer?.claims?.sub;
      if (!userId) {
        return {
          statusCode: 401,
          headers,
          body: JSON.stringify({ message: 'Unauthorized' }),
        };
      }

      const rateLimitResponse = await requireRateLimit(
        {
          prefix: config.rateLimitPrefix,
          identifier: userId,
          maxRequests: config.maxRequests,
          windowSeconds: config.windowSeconds,
          failOpen: config.failOpen,
        },
        headers,
      );
      if (rateLimitResponse) return rateLimitResponse;

      const db = await getPool();

      const profileId = await resolveProfileId(db, userId);
      if (!profileId) {
        return {
          statusCode: 404,
          headers,
          body: JSON.stringify({ message: 'User profile not found' }),
        };
      }

      return await action({ profileId, db, headers, log, event });
    } catch (error: unknown) {
      log.error(config.errorLabel, error);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ message: 'Internal server error' }),
      };
    }
  };
}

// ── Single-notification factory (mark-read / delete) ─────────────────

interface NotificationHandlerConfig {
  operation: 'read' | 'delete';
  maxRequests: number;
  loggerName: string;
  successMessage: string;
}

const QUERIES: Record<'read' | 'delete', string> = {
  read: `UPDATE notifications SET read = true WHERE id = $1 AND user_id = $2 RETURNING id`,
  delete: `DELETE FROM notifications WHERE id = $1 AND user_id = $2 RETURNING id`,
};

const RATE_LIMIT_PREFIXES: Record<'read' | 'delete', string> = {
  read: 'notif-mark-read',
  delete: 'notif-delete',
};

const ERROR_LABELS: Record<'read' | 'delete', string> = {
  read: 'Error marking notification read',
  delete: 'Error deleting notification',
};

export function createNotificationHandler(config: NotificationHandlerConfig) {
  return withNotificationContext(
    {
      loggerName: config.loggerName,
      rateLimitPrefix: RATE_LIMIT_PREFIXES[config.operation],
      maxRequests: config.maxRequests,
      errorLabel: ERROR_LABELS[config.operation],
    },
    async ({ profileId, db, headers, event }) => {
      const notificationId = event.pathParameters?.id;
      if (!notificationId) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ message: 'Notification ID is required' }),
        };
      }

      if (!isValidUUID(notificationId)) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ message: 'Invalid notification ID format' }),
        };
      }

      const result = await db.query(QUERIES[config.operation], [notificationId, profileId]);

      if (result.rows.length === 0) {
        return {
          statusCode: 404,
          headers,
          body: JSON.stringify({ message: 'Notification not found' }),
        };
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          message: config.successMessage,
        }),
      };
    },
  );
}

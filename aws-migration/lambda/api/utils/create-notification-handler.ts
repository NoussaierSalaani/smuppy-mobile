import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getPool } from '../../shared/db';
import { createHeaders } from './cors';
import { createLogger } from './logger';
import { requireRateLimit } from './rate-limit';
import { isValidUUID } from './security';
import { resolveProfileId } from './auth';

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
        { prefix: RATE_LIMIT_PREFIXES[config.operation], identifier: userId, maxRequests: config.maxRequests },
        headers
      );
      if (rateLimitResponse) return rateLimitResponse;

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

      const db = await getPool();

      const profileId = await resolveProfileId(db, userId);
      if (!profileId) {
        return {
          statusCode: 404,
          headers,
          body: JSON.stringify({ message: 'User profile not found' }),
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
    } catch (error: unknown) {
      log.error(ERROR_LABELS[config.operation], error);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ message: 'Internal server error' }),
      };
    }
  };
}

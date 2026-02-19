import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getPool } from '../../shared/db';
import { createHeaders } from './cors';
import { createLogger } from './logger';
import { isValidUUID } from './security';
import { resolveProfileId } from './auth';

const MAX_BATCH_SIZE = 50;

interface BatchCheckHandlerConfig {
  tableName: string;
  responseKey: string;
  loggerName: string;
}

export function createBatchCheckHandler(config: BatchCheckHandlerConfig) {
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

      if (!event.body) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ message: 'Request body is required' }),
        };
      }

      let body: { postIds?: unknown };
      try {
        body = JSON.parse(event.body);
      } catch {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ message: 'Invalid JSON body' }),
        };
      }
      const { postIds } = body;

      if (!Array.isArray(postIds) || postIds.length === 0) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ message: 'postIds must be a non-empty array' }),
        };
      }

      if (postIds.length > MAX_BATCH_SIZE) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ message: `postIds cannot exceed ${MAX_BATCH_SIZE} items` }),
        };
      }

      for (const id of postIds) {
        if (typeof id !== 'string' || !isValidUUID(id)) {
          return {
            statusCode: 400,
            headers,
            body: JSON.stringify({ message: 'All postIds must be valid UUIDs' }),
          };
        }
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

      const queryResult = await db.query(
        `SELECT post_id FROM ${config.tableName} WHERE user_id = $1 AND post_id = ANY($2::uuid[])`,
        [profileId, postIds]
      );

      const matchedSet = new Set(queryResult.rows.map((row: { post_id: string }) => row.post_id));

      const result: Record<string, boolean> = {};
      for (const id of postIds) {
        result[id] = matchedSet.has(id);
      }

      log.info(`Batch ${config.responseKey} check`, { profileId: profileId.slice(0, 8) + '***', count: postIds.length });

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: true, [config.responseKey]: result }),
      };
    } catch (error: unknown) {
      log.error(`Error checking batch ${config.responseKey}`, error);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ message: 'Internal server error' }),
      };
    }
  };
}

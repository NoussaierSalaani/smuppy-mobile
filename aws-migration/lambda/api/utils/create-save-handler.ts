/**
 * Factory for Save/Unsave/Check Handlers
 *
 * Eliminates boilerplate across save-post, unsave-post, save-spot, unsave-spot, is-saved-spot
 * handlers. Each handler becomes a one-liner config call.
 *
 * Flow: auth -> validate UUID -> get DB -> resolve profile -> rate limit -> check resource exists -> execute action -> return response
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getPool } from '../../shared/db';
import { createHeaders } from './cors';
import { createLogger } from './logger';
import { requireRateLimit } from './rate-limit';
import { isValidUUID } from './security';
import { resolveProfileId } from './auth';
import { RATE_WINDOW_1_MIN } from './constants';

type SaveAction = 'save' | 'unsave' | 'check';
type ResourceType = 'post' | 'spot';

interface SaveHandlerConfig {
  /** Which action this handler performs */
  action: SaveAction;
  /** Resource type — determines table names (saved_posts/saved_spots, posts/spots) */
  resourceType: ResourceType;
  /** Logger name for CloudWatch structured logging */
  loggerName: string;
  /** Rate limit key prefix (e.g. 'post-save', 'spot-unsave') */
  rateLimitPrefix: string;
  /** Max requests per rate limit window (default: 30) */
  rateLimitMax?: number;
}

/** Map resource type to table names */
const TABLE_MAP: Record<ResourceType, { saveTable: string; resourceTable: string; fkColumn: string }> = {
  post: { saveTable: 'saved_posts', resourceTable: 'posts', fkColumn: 'post_id' },
  spot: { saveTable: 'saved_spots', resourceTable: 'spots', fkColumn: 'spot_id' },
};

/** Map resource type to human label for error messages */
const LABEL_MAP: Record<ResourceType, string> = {
  post: 'Post',
  spot: 'Spot',
};

/**
 * Creates a Lambda handler for save/unsave/check operations on a resource.
 *
 * @param config - Handler configuration
 * @returns A Lambda handler function
 */
export function createSaveHandler(config: SaveHandlerConfig): (event: APIGatewayProxyEvent) => Promise<APIGatewayProxyResult> {
  const {
    action,
    resourceType,
    loggerName,
    rateLimitPrefix,
    rateLimitMax = 30,
  } = config;

  const log = createLogger(loggerName);
  const { saveTable, resourceTable, fkColumn } = TABLE_MAP[resourceType];
  const label = LABEL_MAP[resourceType];

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

      // 2. Validate UUID path parameter
      const resourceId = event.pathParameters?.id;
      if (!resourceId || !isValidUUID(resourceId)) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ message: `Invalid ${label.toLowerCase()} ID format` }),
        };
      }

      // 3. Get DB pool
      const db = await getPool();

      // 4. Resolve cognito_sub to profile ID
      const profileId = await resolveProfileId(db, userId);
      if (!profileId) {
        return {
          statusCode: 404,
          headers,
          body: JSON.stringify({ message: 'User profile not found' }),
        };
      }

      // 5. Rate limit (skip for check — read-only operation)
      if (action !== 'check') {
        const rateLimitResponse = await requireRateLimit(
          { prefix: rateLimitPrefix, identifier: profileId, maxRequests: rateLimitMax, windowSeconds: RATE_WINDOW_1_MIN },
          headers,
        );
        if (rateLimitResponse) return rateLimitResponse;
      }

      // 6. Check resource exists (skip for unsave — DELETE is idempotent)
      if (action === 'save') {
        const existsResult = await db.query(
          `SELECT id FROM ${resourceTable} WHERE id = $1`,
          [resourceId],
        );
        if (existsResult.rows.length === 0) {
          return {
            statusCode: 404,
            headers,
            body: JSON.stringify({ message: `${label} not found` }),
          };
        }
      }

      // 7. Execute action
      if (action === 'save') {
        await db.query(
          `INSERT INTO ${saveTable} (user_id, ${fkColumn}) VALUES ($1, $2) ON CONFLICT (user_id, ${fkColumn}) DO NOTHING`,
          [profileId, resourceId],
        );

        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({ success: true, saved: true }),
        };
      }

      if (action === 'unsave') {
        await db.query(
          `DELETE FROM ${saveTable} WHERE user_id = $1 AND ${fkColumn} = $2`,
          [profileId, resourceId],
        );

        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({ success: true, saved: false }),
        };
      }

      // action === 'check'
      const result = await db.query(
        `SELECT EXISTS(SELECT 1 FROM ${saveTable} WHERE user_id = $1 AND ${fkColumn} = $2) AS saved`,
        [profileId, resourceId],
      );

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: true, saved: result.rows[0].saved }),
      };
    } catch (error: unknown) {
      log.error(`Error in ${action} ${resourceType}`, error);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ message: 'Internal server error' }),
      };
    }
  };
}

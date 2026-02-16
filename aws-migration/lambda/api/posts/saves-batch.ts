/**
 * Batch Check Saves Lambda Handler
 * Returns which posts in a batch the current user has saved
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getPool } from '../../shared/db';
import { createHeaders } from '../utils/cors';
import { createLogger } from '../utils/logger';
import { isValidUUID } from '../utils/security';

const log = createLogger('posts-saves-batch');
const MAX_BATCH_SIZE = 50;

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
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

    const userResult = await db.query(
      'SELECT id FROM profiles WHERE cognito_sub = $1',
      [userId]
    );

    if (userResult.rows.length === 0) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ message: 'User profile not found' }),
      };
    }

    const profileId = userResult.rows[0].id;

    const savedResult = await db.query(
      'SELECT post_id FROM saved_posts WHERE user_id = $1 AND post_id = ANY($2::uuid[])',
      [profileId, postIds]
    );

    const savedSet = new Set(savedResult.rows.map((row: { post_id: string }) => row.post_id));

    const saves: Record<string, boolean> = {};
    for (const id of postIds) {
      saves[id] = savedSet.has(id);
    }

    log.info('Batch saves check', { profileId: profileId.slice(0, 8) + '***', count: postIds.length });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ success: true, saves }),
    };
  } catch (error: unknown) {
    log.error('Error checking batch saves', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ message: 'Internal server error' }),
    };
  }
}

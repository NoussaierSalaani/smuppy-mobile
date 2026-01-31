/**
 * Batch Check Likes Lambda Handler
 * Returns which posts in a batch the current user has liked
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getReaderPool } from '../../shared/db';
import { createHeaders } from '../utils/cors';
import { createLogger } from '../utils/logger';

const log = createLogger('posts-likes-batch');

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_BATCH_SIZE = 50;

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const headers = createHeaders(event);

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

    const body = JSON.parse(event.body);
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
      if (typeof id !== 'string' || !UUID_REGEX.test(id)) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ message: 'All postIds must be valid UUIDs' }),
        };
      }
    }

    const db = await getReaderPool();

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

    const likedResult = await db.query(
      'SELECT post_id FROM likes WHERE user_id = $1 AND post_id = ANY($2::uuid[])',
      [profileId, postIds]
    );

    const likedSet = new Set(likedResult.rows.map((row: { post_id: string }) => row.post_id));

    const likes: Record<string, boolean> = {};
    for (const id of postIds) {
      likes[id] = likedSet.has(id);
    }

    log.info('Batch likes check', { profileId: profileId.slice(0, 8) + '***', count: postIds.length });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ success: true, likes }),
    };
  } catch (error: unknown) {
    log.error('Error checking batch likes', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ message: 'Internal server error' }),
    };
  }
}

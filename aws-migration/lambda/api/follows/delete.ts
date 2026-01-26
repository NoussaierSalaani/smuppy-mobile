/**
 * Unfollow User Lambda Handler
 * Removes a follow relationship between users
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getPool } from '../../shared/db';
import { createHeaders } from '../utils/cors';
import { createLogger, getRequestId } from '../utils/logger';

const log = createLogger('follows-delete');

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const headers = createHeaders(event);

  try {
    const followerId = event.requestContext.authorizer?.claims?.sub;

    if (!followerId) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ message: 'Unauthorized' }),
      };
    }

    const followingId = event.pathParameters?.userId;

    if (!followingId) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ message: 'userId is required' }),
      };
    }

    const db = await getPool();

    // Check if follow relationship exists
    const existingResult = await db.query(
      `SELECT id, status FROM follows WHERE follower_id = $1 AND following_id = $2`,
      [followerId, followingId]
    );

    if (existingResult.rows.length === 0) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          message: 'Not following this user',
        }),
      };
    }

    const existingFollow = existingResult.rows[0];

    // Delete follow record
    await db.query(
      `DELETE FROM follows WHERE follower_id = $1 AND following_id = $2`,
      [followerId, followingId]
    );

    // Update follower counts only if was accepted
    if (existingFollow.status === 'accepted') {
      await Promise.all([
        db.query(
          `UPDATE profiles SET fan_count = GREATEST(COALESCE(fan_count, 0) - 1, 0) WHERE id = $1`,
          [followingId]
        ),
        db.query(
          `UPDATE profiles SET following_count = GREATEST(COALESCE(following_count, 0) - 1, 0) WHERE id = $1`,
          [followerId]
        ),
      ]);
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        message: 'Successfully unfollowed user',
      }),
    };
  } catch (error: any) {
    log.error('Error deleting follow', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ message: 'Internal server error' }),
    };
  }
}

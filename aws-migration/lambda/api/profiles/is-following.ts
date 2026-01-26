/**
 * Check Follow Status Lambda Handler
 * Returns whether the current user is following the target user
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getPool } from '../../shared/db';
import { createHeaders } from '../utils/cors';

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const headers = createHeaders(event);

  try {
    const currentUserId = event.requestContext.authorizer?.claims?.sub;

    if (!currentUserId) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ message: 'Unauthorized' }),
      };
    }

    const targetUserId = event.pathParameters?.id;

    if (!targetUserId) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ message: 'userId is required' }),
      };
    }

    const db = await getPool();

    // Check if current user is following the target user
    const result = await db.query(
      `SELECT id, status FROM follows WHERE follower_id = $1 AND following_id = $2`,
      [currentUserId, targetUserId]
    );

    const isFollowing = result.rows.length > 0 && result.rows[0].status === 'accepted';
    const isPending = result.rows.length > 0 && result.rows[0].status === 'pending';

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        isFollowing,
        isPending,
        status: result.rows.length > 0 ? result.rows[0].status : null,
      }),
    };
  } catch (error: any) {
    console.error('Error checking follow status:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ message: 'Internal server error' }),
    };
  }
}

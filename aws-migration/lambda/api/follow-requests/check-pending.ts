/**
 * Check Pending Follow Request Lambda Handler
 * Returns whether the current user has a pending follow request to a target user
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getPool } from '../../shared/db';
import { createHeaders } from '../utils/cors';
import { createLogger } from '../utils/logger';
import { isValidUUID } from '../utils/security';

const log = createLogger('follow-requests-check-pending');

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

    const targetUserId = event.pathParameters?.userId;
    if (!targetUserId || !isValidUUID(targetUserId)) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ message: 'Invalid user ID format' }),
      };
    }

    const db = await getPool();

    // Resolve cognito_sub to profileId
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

    const result = await db.query(
      'SELECT EXISTS(SELECT 1 FROM follow_requests WHERE requester_id = $1 AND target_id = $2 AND status = $3) as has_pending',
      [profileId, targetUserId, 'pending']
    );

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        hasPending: result.rows[0].has_pending,
      }),
    };
  } catch (error: unknown) {
    log.error('Error checking pending follow request', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ message: 'Internal server error' }),
    };
  }
}

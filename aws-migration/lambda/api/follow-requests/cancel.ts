/**
 * Cancel Follow Request Lambda Handler
 * Cancels a pending follow request from the current user to a target user
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getPool } from '../../shared/db';
import { createHeaders } from '../utils/cors';
import { createLogger } from '../utils/logger';
import { checkRateLimit } from '../utils/rate-limit';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const log = createLogger('follow-requests-cancel');

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

    // Rate limit: 10 per minute
    const { allowed } = await checkRateLimit({ prefix: 'follow-cancel', identifier: userId, windowSeconds: 60, maxRequests: 10 });
    if (!allowed) {
      return {
        statusCode: 429,
        headers,
        body: JSON.stringify({ message: 'Too many requests. Please try again later.' }),
      };
    }

    const targetUserId = event.pathParameters?.userId;
    if (!targetUserId || !UUID_REGEX.test(targetUserId)) {
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

    log.info('Cancelling follow request', {
      requesterId: profileId.substring(0, 2) + '***',
      targetId: targetUserId.substring(0, 2) + '***',
    });

    const result = await db.query(
      'DELETE FROM follow_requests WHERE requester_id = $1 AND target_id = $2 AND status = $3',
      [profileId, targetUserId, 'pending']
    );

    if (result.rowCount === 0) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ message: 'No pending follow request found' }),
      };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ success: true }),
    };
  } catch (error: unknown) {
    log.error('Error cancelling follow request', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ message: 'Internal server error' }),
    };
  }
}

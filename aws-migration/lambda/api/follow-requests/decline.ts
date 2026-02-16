/**
 * Decline Follow Request Lambda Handler
 * Declines a pending follow request
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getPool } from '../../shared/db';
import { createHeaders } from '../utils/cors';
import { createLogger } from '../utils/logger';
import { isValidUUID } from '../utils/security';
import { checkRateLimit } from '../utils/rate-limit';
import { RATE_WINDOW_30S } from '../utils/constants';

const log = createLogger('follow-requests-decline');

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

    const { allowed } = await checkRateLimit({ prefix: 'follow-decline', identifier: userId, windowSeconds: RATE_WINDOW_30S, maxRequests: 10 });
    if (!allowed) {
      return { statusCode: 429, headers, body: JSON.stringify({ message: 'Too many requests. Please try again later.' }) };
    }

    const requestId = event.pathParameters?.id;
    if (!requestId) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ message: 'Request ID is required' }),
      };
    }

    // Validate UUID format
    if (!isValidUUID(requestId)) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ message: 'Invalid request ID format' }),
      };
    }

    const db = await getPool();

    // Get user's profile ID (check both id and cognito_sub for consistency)
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

    // Get the follow request
    const requestResult = await db.query(
      'SELECT id, requester_id, target_id, status FROM follow_requests WHERE id = $1',
      [requestId]
    );

    if (requestResult.rows.length === 0) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ message: 'Follow request not found' }),
      };
    }

    const request = requestResult.rows[0];

    // Verify user is the target of the request
    if (request.target_id !== profileId) {
      return {
        statusCode: 403,
        headers,
        body: JSON.stringify({ message: 'Not authorized to decline this request' }),
      };
    }

    // Check if already processed
    if (request.status !== 'pending') {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ message: `Request already ${request.status}` }),
      };
    }

    // Decline the request
    await db.query(
      'UPDATE follow_requests SET status = $1, updated_at = NOW() WHERE id = $2',
      ['declined', requestId]
    );

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        message: 'Follow request declined',
      }),
    };
  } catch (error: unknown) {
    log.error('Error declining follow request', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ message: 'Internal server error' }),
    };
  }
}

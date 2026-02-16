/**
 * Unblock User Lambda Handler
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getPool } from '../../shared/db';
import { createHeaders } from '../utils/cors';
import { createLogger } from '../utils/logger';
import { checkRateLimit } from '../utils/rate-limit';
import { isValidUUID } from '../utils/security';

const log = createLogger('profiles-unblock');

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const headers = createHeaders(event);
  log.initFromEvent(event);

  try {
    const cognitoSub = event.requestContext.authorizer?.claims?.sub;
    if (!cognitoSub) {
      return { statusCode: 401, headers, body: JSON.stringify({ message: 'Unauthorized' }) };
    }

    const targetUserId = event.pathParameters?.id;
    if (!targetUserId || !isValidUUID(targetUserId)) {
      return { statusCode: 400, headers, body: JSON.stringify({ message: 'Invalid user ID format' }) };
    }

    const rateLimit = await checkRateLimit({
      prefix: 'unblock-user',
      identifier: cognitoSub,
      windowSeconds: 60,
      maxRequests: 10,
    });
    if (!rateLimit.allowed) {
      return { statusCode: 429, headers, body: JSON.stringify({ message: 'Too many requests. Please try again later.' }) };
    }

    const db = await getPool();

    const userResult = await db.query('SELECT id FROM profiles WHERE cognito_sub = $1', [cognitoSub]);
    if (userResult.rows.length === 0) {
      return { statusCode: 404, headers, body: JSON.stringify({ message: 'Profile not found' }) };
    }
    const blockerId = userResult.rows[0].id;

    await db.query(
      'DELETE FROM blocked_users WHERE blocker_id = $1 AND blocked_id = $2',
      [blockerId, targetUserId]
    );

    return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
  } catch (error: unknown) {
    log.error('Error unblocking user', error);
    return { statusCode: 500, headers, body: JSON.stringify({ message: 'Internal server error' }) };
  }
}

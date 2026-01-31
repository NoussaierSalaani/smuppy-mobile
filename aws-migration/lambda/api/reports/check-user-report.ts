/**
 * Check User Report Lambda Handler
 * Checks if the current user has already reported a specific user
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getReaderPool } from '../../shared/db';
import { createHeaders } from '../utils/cors';
import { createLogger } from '../utils/logger';

const log = createLogger('reports-check-user');
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const headers = createHeaders(event);

  try {
    const cognitoSub = event.requestContext.authorizer?.claims?.sub;
    if (!cognitoSub) {
      return { statusCode: 401, headers, body: JSON.stringify({ message: 'Unauthorized' }) };
    }

    const userId = event.pathParameters?.id;
    if (!userId || !UUID_REGEX.test(userId)) {
      return { statusCode: 400, headers, body: JSON.stringify({ message: 'Invalid user ID format' }) };
    }

    const db = await getReaderPool();

    const userResult = await db.query('SELECT id FROM profiles WHERE cognito_sub = $1', [cognitoSub]);
    if (userResult.rows.length === 0) {
      return { statusCode: 200, headers, body: JSON.stringify({ hasReported: false }) };
    }
    const reporterId = userResult.rows[0].id;

    const result = await db.query(
      `SELECT EXISTS(SELECT 1 FROM user_reports WHERE reporter_id = $1 AND reported_user_id = $2) AS has_reported`,
      [reporterId, userId]
    );

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ hasReported: result.rows[0].has_reported }),
    };
  } catch (error: unknown) {
    log.error('Error checking user report', error);
    return { statusCode: 500, headers, body: JSON.stringify({ message: 'Internal server error' }) };
  }
}

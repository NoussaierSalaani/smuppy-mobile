/**
 * Check Post Report Lambda Handler
 * Checks if the current user has already reported a specific post
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getPool } from '../../shared/db';
import { createHeaders } from '../utils/cors';
import { createLogger } from '../utils/logger';
import { isValidUUID } from '../utils/security';

const log = createLogger('reports-check-post');

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const headers = createHeaders(event);
  log.initFromEvent(event);

  try {
    const cognitoSub = event.requestContext.authorizer?.claims?.sub;
    if (!cognitoSub) {
      return { statusCode: 401, headers, body: JSON.stringify({ message: 'Unauthorized' }) };
    }

    const postId = event.pathParameters?.id;
    if (!postId || !isValidUUID(postId)) {
      return { statusCode: 400, headers, body: JSON.stringify({ message: 'Invalid post ID format' }) };
    }

    const db = await getPool();

    const userResult = await db.query('SELECT id FROM profiles WHERE cognito_sub = $1', [cognitoSub]);
    if (userResult.rows.length === 0) {
      return { statusCode: 200, headers, body: JSON.stringify({ hasReported: false }) };
    }
    const reporterId = userResult.rows[0].id;

    const result = await db.query(
      `SELECT EXISTS(SELECT 1 FROM post_reports WHERE reporter_id = $1 AND post_id = $2) AS has_reported`,
      [reporterId, postId]
    );

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ hasReported: result.rows[0].has_reported }),
    };
  } catch (error: unknown) {
    log.error('Error checking post report', error);
    return { statusCode: 500, headers, body: JSON.stringify({ message: 'Internal server error' }) };
  }
}

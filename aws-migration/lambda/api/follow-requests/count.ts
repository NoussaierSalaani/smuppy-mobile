/**
 * Count Follow Requests Lambda Handler
 * Returns the count of pending follow requests for the current user
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getPool } from '../../shared/db';
import { createHeaders } from '../utils/cors';
import { createLogger } from '../utils/logger';

const log = createLogger('follow-requests-count');

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

    const countResult = await db.query(
      'SELECT COUNT(*) as count FROM follow_requests WHERE target_id = $1 AND status = $2',
      [profileId, 'pending']
    );

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        count: Number.parseInt(countResult.rows[0].count),
      }),
    };
  } catch (error: unknown) {
    log.error('Error counting follow requests', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ message: 'Internal server error' }),
    };
  }
}

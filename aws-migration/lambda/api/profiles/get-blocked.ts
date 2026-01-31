/**
 * Get Blocked Users Lambda Handler
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getReaderPool } from '../../shared/db';
import { createHeaders } from '../utils/cors';
import { createLogger } from '../utils/logger';

const log = createLogger('profiles-get-blocked');

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const headers = createHeaders(event);

  try {
    const cognitoSub = event.requestContext.authorizer?.claims?.sub;
    if (!cognitoSub) {
      return { statusCode: 401, headers, body: JSON.stringify({ message: 'Unauthorized' }) };
    }

    const db = await getReaderPool();

    const userResult = await db.query('SELECT id FROM profiles WHERE cognito_sub = $1', [cognitoSub]);
    if (userResult.rows.length === 0) {
      return { statusCode: 404, headers, body: JSON.stringify({ message: 'Profile not found' }) };
    }
    const userId = userResult.rows[0].id;

    const result = await db.query(
      `SELECT bu.id, bu.blocked_id AS blocked_user_id, bu.created_at AS blocked_at,
              p.id AS "blocked_user.id", p.username AS "blocked_user.username",
              p.display_name AS "blocked_user.display_name", p.avatar_url AS "blocked_user.avatar_url"
       FROM blocked_users bu
       JOIN profiles p ON p.id = bu.blocked_id
       WHERE bu.blocker_id = $1
       ORDER BY bu.created_at DESC
       LIMIT 50`,
      [userId]
    );

    const data = result.rows.map(row => ({
      id: row.id,
      blocked_user_id: row.blocked_user_id,
      blocked_at: row.blocked_at,
      blocked_user: {
        id: row['blocked_user.id'],
        username: row['blocked_user.username'],
        display_name: row['blocked_user.display_name'],
        avatar_url: row['blocked_user.avatar_url'],
      },
    }));

    return { statusCode: 200, headers, body: JSON.stringify({ data }) };
  } catch (error: unknown) {
    log.error('Error getting blocked users', error);
    return { statusCode: 500, headers, body: JSON.stringify({ message: 'Internal server error' }) };
  }
}

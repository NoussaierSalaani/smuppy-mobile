/**
 * Get Muted Users Lambda Handler
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getPool } from '../../shared/db';
import { createHeaders } from '../utils/cors';
import { createLogger } from '../utils/logger';

const log = createLogger('profiles-get-muted');

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const headers = createHeaders(event);

  try {
    const cognitoSub = event.requestContext.authorizer?.claims?.sub;
    if (!cognitoSub) {
      return { statusCode: 401, headers, body: JSON.stringify({ message: 'Unauthorized' }) };
    }

    const db = await getPool();

    const userResult = await db.query('SELECT id FROM profiles WHERE cognito_sub = $1', [cognitoSub]);
    if (userResult.rows.length === 0) {
      return { statusCode: 404, headers, body: JSON.stringify({ message: 'Profile not found' }) };
    }
    const userId = userResult.rows[0].id;

    const result = await db.query(
      `SELECT mu.id, mu.muted_id AS muted_user_id, mu.created_at AS muted_at,
              p.id AS "muted_user.id", p.username AS "muted_user.username",
              p.display_name AS "muted_user.display_name", p.avatar_url AS "muted_user.avatar_url"
       FROM muted_users mu
       JOIN profiles p ON p.id = mu.muted_id
       WHERE mu.muter_id = $1
       ORDER BY mu.created_at DESC
       LIMIT 50`,
      [userId]
    );

    const data = result.rows.map((row: Record<string, unknown>) => ({
      id: row.id,
      muted_user_id: row.muted_user_id,
      muted_at: row.muted_at,
      muted_user: {
        id: row['muted_user.id'],
        username: row['muted_user.username'],
        display_name: row['muted_user.display_name'],
        avatar_url: row['muted_user.avatar_url'],
      },
    }));

    return { statusCode: 200, headers, body: JSON.stringify({ data }) };
  } catch (error: unknown) {
    log.error('Error getting muted users', error);
    return { statusCode: 500, headers, body: JSON.stringify({ message: 'Internal server error' }) };
  }
}

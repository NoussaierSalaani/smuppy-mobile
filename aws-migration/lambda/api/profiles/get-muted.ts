/**
 * Get Muted Users Lambda Handler
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getPool } from '../../shared/db';
import { createHeaders } from '../utils/cors';
import { createLogger } from '../utils/logger';
import { resolveProfileId } from '../utils/auth';

const log = createLogger('profiles-get-muted');

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const headers = createHeaders(event);
  log.initFromEvent(event);

  try {
    const cognitoSub = event.requestContext.authorizer?.claims?.sub;
    if (!cognitoSub) {
      return { statusCode: 401, headers, body: JSON.stringify({ message: 'Unauthorized' }) };
    }

    const db = await getPool();

    const userId = await resolveProfileId(db, cognitoSub);
    if (!userId) {
      return { statusCode: 404, headers, body: JSON.stringify({ message: 'Profile not found' }) };
    }

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
      mutedUserId: row.muted_user_id,
      mutedAt: row.muted_at,
      mutedUser: {
        id: row['muted_user.id'],
        username: row['muted_user.username'],
        displayName: row['muted_user.display_name'],
        avatarUrl: row['muted_user.avatar_url'],
      },
    }));

    return { statusCode: 200, headers, body: JSON.stringify({ data }) };
  } catch (error: unknown) {
    log.error('Error getting muted users', error);
    return { statusCode: 500, headers, body: JSON.stringify({ message: 'Internal server error' }) };
  }
}

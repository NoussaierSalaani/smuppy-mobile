/**
 * Mute User Lambda Handler
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getPool } from '../../shared/db';
import { createHeaders } from '../utils/cors';
import { createLogger } from '../utils/logger';
import { checkRateLimit } from '../utils/rate-limit';

const log = createLogger('profiles-mute');
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const headers = createHeaders(event);

  try {
    const cognitoSub = event.requestContext.authorizer?.claims?.sub;
    if (!cognitoSub) {
      return { statusCode: 401, headers, body: JSON.stringify({ message: 'Unauthorized' }) };
    }

    const targetUserId = event.pathParameters?.id;
    if (!targetUserId || !UUID_REGEX.test(targetUserId)) {
      return { statusCode: 400, headers, body: JSON.stringify({ message: 'Invalid user ID format' }) };
    }

    const rateLimit = await checkRateLimit({
      prefix: 'mute-user',
      identifier: cognitoSub,
      windowSeconds: 60,
      maxRequests: 20,
    });
    if (!rateLimit.allowed) {
      return { statusCode: 429, headers, body: JSON.stringify({ message: 'Too many requests. Please try again later.' }) };
    }

    const db = await getPool();

    const userResult = await db.query('SELECT id FROM profiles WHERE cognito_sub = $1', [cognitoSub]);
    if (userResult.rows.length === 0) {
      return { statusCode: 404, headers, body: JSON.stringify({ message: 'Profile not found' }) };
    }
    const muterId = userResult.rows[0].id;

    if (muterId === targetUserId) {
      return { statusCode: 400, headers, body: JSON.stringify({ message: 'Cannot mute yourself' }) };
    }

    // Verify target exists
    const targetResult = await db.query('SELECT id FROM profiles WHERE id = $1', [targetUserId]);
    if (targetResult.rows.length === 0) {
      return { statusCode: 404, headers, body: JSON.stringify({ message: 'User not found' }) };
    }

    await db.query(
      `INSERT INTO muted_users (muter_id, muted_id) VALUES ($1, $2) ON CONFLICT (muter_id, muted_id) DO NOTHING`,
      [muterId, targetUserId]
    );

    // Return muted user info
    const mutedInfo = await db.query(
      `SELECT mu.id, mu.muted_id AS muted_user_id, mu.created_at AS muted_at,
              p.id AS "muted_user.id", p.username AS "muted_user.username",
              p.display_name AS "muted_user.display_name", p.avatar_url AS "muted_user.avatar_url"
       FROM muted_users mu
       JOIN profiles p ON p.id = mu.muted_id
       WHERE mu.muter_id = $1 AND mu.muted_id = $2`,
      [muterId, targetUserId]
    );

    const row = mutedInfo.rows[0];
    const response = row ? {
      id: row.id,
      muted_user_id: row.muted_user_id,
      muted_at: row.muted_at,
      muted_user: {
        id: row['muted_user.id'],
        username: row['muted_user.username'],
        display_name: row['muted_user.display_name'],
        avatar_url: row['muted_user.avatar_url'],
      },
    } : { success: true };

    return { statusCode: 201, headers, body: JSON.stringify(response) };
  } catch (error: unknown) {
    log.error('Error muting user', error);
    return { statusCode: 500, headers, body: JSON.stringify({ message: 'Internal server error' }) };
  }
}

/**
 * Block User Lambda Handler
 * Blocks a user and removes mutual follow relationships
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getPool } from '../../shared/db';
import { createHeaders } from '../utils/cors';
import { createLogger } from '../utils/logger';
import { checkRateLimit } from '../utils/rate-limit';
import { isValidUUID } from '../utils/security';

const log = createLogger('profiles-block');

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const headers = createHeaders(event);

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
      prefix: 'block-user',
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

    if (blockerId === targetUserId) {
      return { statusCode: 400, headers, body: JSON.stringify({ message: 'Cannot block yourself' }) };
    }

    // Verify target exists
    const targetResult = await db.query('SELECT id FROM profiles WHERE id = $1', [targetUserId]);
    if (targetResult.rows.length === 0) {
      return { statusCode: 404, headers, body: JSON.stringify({ message: 'User not found' }) };
    }

    // Transaction: insert block + remove mutual follows + update counts
    const client = await db.connect();
    try {
      await client.query('BEGIN');

      // Insert block (ON CONFLICT = already blocked, idempotent)
      await client.query(
        `INSERT INTO blocked_users (blocker_id, blocked_id)
         VALUES ($1, $2)
         ON CONFLICT (blocker_id, blocked_id) DO NOTHING`,
        [blockerId, targetUserId]
      );

      // Remove mutual follows (DB trigger auto-decrements fan_count/following_count)
      // 1) blocker was following target
      await client.query(
        `DELETE FROM follows WHERE follower_id = $1 AND following_id = $2 AND status = 'accepted'`,
        [blockerId, targetUserId]
      );

      // 2) target was following blocker
      await client.query(
        `DELETE FROM follows WHERE follower_id = $1 AND following_id = $2 AND status = 'accepted'`,
        [targetUserId, blockerId]
      );

      // Also remove any pending follow requests both ways
      await client.query(
        `DELETE FROM follows WHERE follower_id = $1 AND following_id = $2 AND status = 'pending'`,
        [blockerId, targetUserId]
      );
      await client.query(
        `DELETE FROM follows WHERE follower_id = $1 AND following_id = $2 AND status = 'pending'`,
        [targetUserId, blockerId]
      );

      await client.query('COMMIT');
    } catch (txErr: unknown) {
      await client.query('ROLLBACK');
      throw txErr;
    } finally {
      client.release();
    }

    // Return the blocked user info
    const blockedInfo = await db.query(
      `SELECT bu.id, bu.blocked_id AS blocked_user_id, bu.created_at AS blocked_at,
              p.id AS "blocked_user.id", p.username AS "blocked_user.username",
              p.display_name AS "blocked_user.display_name", p.avatar_url AS "blocked_user.avatar_url"
       FROM blocked_users bu
       JOIN profiles p ON p.id = bu.blocked_id
       WHERE bu.blocker_id = $1 AND bu.blocked_id = $2`,
      [blockerId, targetUserId]
    );

    const row = blockedInfo.rows[0];
    const response = row ? {
      id: row.id,
      blocked_user_id: row.blocked_user_id,
      blocked_at: row.blocked_at,
      blocked_user: {
        id: row['blocked_user.id'],
        username: row['blocked_user.username'],
        display_name: row['blocked_user.display_name'],
        avatar_url: row['blocked_user.avatar_url'],
      },
    } : { success: true };

    return { statusCode: 201, headers, body: JSON.stringify(response) };
  } catch (error: unknown) {
    log.error('Error blocking user', error);
    return { statusCode: 500, headers, body: JSON.stringify({ message: 'Internal server error' }) };
  }
}

/**
 * Leave Group Lambda Handler
 * Leave an activity group
 */

import { APIGatewayProxyHandler } from 'aws-lambda';
import { getPool } from '../../shared/db';
import { cors, handleOptions } from '../utils/cors';
import { createLogger } from '../utils/logger';
import { isValidUUID } from '../utils/security';
import { checkRateLimit } from '../utils/rate-limit';

const log = createLogger('groups-leave');

export const handler: APIGatewayProxyHandler = async (event) => {
  log.initFromEvent(event);
  if (event.httpMethod === 'OPTIONS') return handleOptions();

  const pool = await getPool();
  const client = await pool.connect();

  try {
    const cognitoSub = event.requestContext.authorizer?.claims?.sub;
    if (!cognitoSub) {
      return cors({
        statusCode: 401,
        body: JSON.stringify({ success: false, message: 'Unauthorized' }),
      });
    }

    // Rate limit
    const rateLimit = await checkRateLimit({
      prefix: 'groups-leave',
      identifier: cognitoSub,
      windowSeconds: 60,
      maxRequests: 10,
    });
    if (!rateLimit.allowed) {
      return cors({
        statusCode: 429,
        body: JSON.stringify({ success: false, message: 'Too many requests. Please try again later.' }),
      });
    }

    const groupId = event.pathParameters?.groupId;
    if (!groupId || !isValidUUID(groupId)) {
      return cors({
        statusCode: 400,
        body: JSON.stringify({ success: false, message: 'Invalid ID format' }),
      });
    }

    // Resolve profile
    const profileResult = await client.query(
      'SELECT id FROM profiles WHERE cognito_sub = $1',
      [cognitoSub]
    );
    if (profileResult.rows.length === 0) {
      return cors({
        statusCode: 404,
        body: JSON.stringify({ success: false, message: 'Profile not found' }),
      });
    }
    const profileId = profileResult.rows[0].id;

    // Check group exists and user is not the creator
    const groupResult = await client.query(
      `SELECT id, creator_id FROM groups WHERE id = $1`,
      [groupId]
    );

    if (groupResult.rows.length === 0) {
      return cors({
        statusCode: 404,
        body: JSON.stringify({ success: false, message: 'Group not found' }),
      });
    }

    if (groupResult.rows[0].creator_id === profileId) {
      return cors({
        statusCode: 400,
        body: JSON.stringify({ success: false, message: 'Group creator cannot leave the group' }),
      });
    }

    // Check if user is a member
    const memberResult = await client.query(
      `SELECT id FROM group_participants
       WHERE group_id = $1 AND user_id = $2`,
      [groupId, profileId]
    );

    if (memberResult.rows.length === 0) {
      return cors({
        statusCode: 400,
        body: JSON.stringify({ success: false, message: 'You are not a member of this group' }),
      });
    }

    await client.query('BEGIN');

    // Remove participant
    await client.query(
      `DELETE FROM group_participants
       WHERE group_id = $1 AND user_id = $2`,
      [groupId, profileId]
    );

    // Update participant count
    await client.query(
      `UPDATE groups SET current_participants = GREATEST(current_participants - 1, 0)
       WHERE id = $1`,
      [groupId]
    );

    await client.query('COMMIT');

    return cors({
      statusCode: 200,
      body: JSON.stringify({ success: true, message: 'Left group successfully' }),
    });
  } catch (error: unknown) {
    await client.query('ROLLBACK');
    log.error('Leave group error', error);
    return cors({
      statusCode: 500,
      body: JSON.stringify({ success: false, message: 'Failed to leave group' }),
    });
  } finally {
    client.release();
  }
};

/**
 * Join Group Lambda Handler
 * Join an activity group
 */

import { APIGatewayProxyHandler } from 'aws-lambda';
import { getPool } from '../../shared/db';
import { cors, handleOptions } from '../utils/cors';
import { createLogger } from '../utils/logger';
import { isValidUUID } from '../utils/security';

const log = createLogger('groups-join');

export const handler: APIGatewayProxyHandler = async (event) => {
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

    // Check group exists and is active
    const groupResult = await client.query(
      `SELECT id, status, max_participants, current_participants
       FROM groups WHERE id = $1`,
      [groupId]
    );

    if (groupResult.rows.length === 0) {
      return cors({
        statusCode: 404,
        body: JSON.stringify({ success: false, message: 'Group not found' }),
      });
    }

    const group = groupResult.rows[0];

    if (group.status !== 'active') {
      return cors({
        statusCode: 400,
        body: JSON.stringify({ success: false, message: 'Group is no longer active' }),
      });
    }

    // Check capacity
    if (group.max_participants && group.current_participants >= group.max_participants) {
      return cors({
        statusCode: 400,
        body: JSON.stringify({ success: false, message: 'Group is full' }),
      });
    }

    // Check if already joined
    const existingResult = await client.query(
      `SELECT id FROM group_participants
       WHERE group_id = $1 AND user_id = $2`,
      [groupId, profileId]
    );

    if (existingResult.rows.length > 0) {
      return cors({
        statusCode: 200,
        body: JSON.stringify({ success: true, message: 'Already a member of this group' }),
      });
    }

    await client.query('BEGIN');

    // Insert participant
    await client.query(
      `INSERT INTO group_participants (group_id, user_id)
       VALUES ($1, $2)`,
      [groupId, profileId]
    );

    // Update participant count
    await client.query(
      `UPDATE groups SET current_participants = current_participants + 1
       WHERE id = $1`,
      [groupId]
    );

    await client.query('COMMIT');

    return cors({
      statusCode: 200,
      body: JSON.stringify({ success: true, message: 'Joined group successfully' }),
    });
  } catch (error: unknown) {
    await client.query('ROLLBACK');
    log.error('Join group error', error);
    return cors({
      statusCode: 500,
      body: JSON.stringify({ success: false, message: 'Failed to join group' }),
    });
  } finally {
    client.release();
  }
};

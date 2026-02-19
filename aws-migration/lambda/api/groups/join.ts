/**
 * Join Group Lambda Handler
 * Join an activity group
 */

import { APIGatewayProxyHandler } from 'aws-lambda';
import { getPool } from '../../shared/db';
import { cors, handleOptions, getSecureHeaders } from '../utils/cors';
import { createLogger } from '../utils/logger';
import { isValidUUID } from '../utils/security';
import { requireRateLimit } from '../utils/rate-limit';
import { resolveProfileId } from '../utils/auth';

const log = createLogger('groups-join');
const corsHeaders = getSecureHeaders();

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
    const rateLimitResponse = await requireRateLimit({
      prefix: 'groups-join',
      identifier: cognitoSub,
      windowSeconds: 60,
      maxRequests: 10,
    }, corsHeaders);
    if (rateLimitResponse) return rateLimitResponse;

    const groupId = event.pathParameters?.groupId;
    if (!groupId || !isValidUUID(groupId)) {
      return cors({
        statusCode: 400,
        body: JSON.stringify({ success: false, message: 'Invalid ID format' }),
      });
    }

    // Resolve profile
    const profileId = await resolveProfileId(client, cognitoSub);
    if (!profileId) {
      return cors({
        statusCode: 404,
        body: JSON.stringify({ success: false, message: 'Profile not found' }),
      });
    }

    // Check group exists and is active (include pricing fields for payment check)
    const groupResult = await client.query(
      `SELECT id, status, max_participants, current_participants, is_free, price, currency
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

    // Check if paid group — return payment required signal (same pattern as events/join.ts)
    if (!group.is_free && group.price > 0) {
      return cors({
        statusCode: 200,
        body: JSON.stringify({
          success: true,
          requiresPayment: true,
          price: typeof group.price === 'number' ? group.price : Number.parseInt(group.price, 10),
          currency: group.currency || 'EUR',
          message: 'Payment required to join this group',
        }),
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

    // BUG-2026-02-14: Atomic capacity check + increment to prevent race conditions
    if (group.max_participants) {
      const capacityResult = await client.query(
        `UPDATE groups SET current_participants = current_participants + 1
         WHERE id = $1 AND current_participants < max_participants
         RETURNING current_participants`,
        [groupId]
      );
      if (capacityResult.rowCount === 0) {
        await client.query('ROLLBACK');
        return cors({
          statusCode: 400,
          body: JSON.stringify({ success: false, message: 'Group is full' }),
        });
      }
    } else {
      await client.query(
        `UPDATE groups SET current_participants = current_participants + 1
         WHERE id = $1`,
        [groupId]
      );
    }

    // Insert participant
    await client.query(
      `INSERT INTO group_participants (group_id, user_id)
       VALUES ($1, $2)`,
      [groupId, profileId]
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

/**
 * Cancel Group Lambda Handler
 * Soft-delete a group by setting status to 'cancelled' (creator only)
 */

import { APIGatewayProxyHandler } from 'aws-lambda';
import { getPool } from '../../shared/db';
import { cors, handleOptions, getSecureHeaders } from '../utils/cors';
import { createLogger } from '../utils/logger';
import { isValidUUID } from '../utils/security';
import { requireRateLimit } from '../utils/rate-limit';
import { requireActiveAccount, isAccountError } from '../utils/account-status';

const log = createLogger('groups-cancel');
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
      prefix: 'group-cancel',
      identifier: cognitoSub,
      windowSeconds: 60,
      maxRequests: 5,
    }, corsHeaders);
    if (rateLimitResponse) return rateLimitResponse;

    // Account status check
    const accountCheck = await requireActiveAccount(cognitoSub, {});
    if (isAccountError(accountCheck)) {
      return cors({ statusCode: accountCheck.statusCode, body: accountCheck.body });
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

    // Check group exists and verify ownership
    const groupResult = await client.query(
      'SELECT id, creator_id, status FROM groups WHERE id = $1',
      [groupId]
    );

    if (groupResult.rows.length === 0) {
      return cors({
        statusCode: 404,
        body: JSON.stringify({ success: false, message: 'Group not found' }),
      });
    }

    if (groupResult.rows[0].creator_id !== profileId) {
      return cors({
        statusCode: 403,
        body: JSON.stringify({ success: false, message: 'Only the group creator can cancel the group' }),
      });
    }

    if (groupResult.rows[0].status === 'cancelled') {
      return cors({
        statusCode: 400,
        body: JSON.stringify({ success: false, message: 'Group is already cancelled' }),
      });
    }

    await client.query('BEGIN');

    // Soft delete: set status to cancelled
    await client.query(
      `UPDATE groups SET status = 'cancelled', updated_at = NOW()
       WHERE id = $1 AND creator_id = $2`,
      [groupId, profileId]
    );

    // Remove all participants
    await client.query(
      'DELETE FROM group_participants WHERE group_id = $1',
      [groupId]
    );

    await client.query('COMMIT');

    return cors({
      statusCode: 200,
      body: JSON.stringify({ success: true, message: 'Group cancelled successfully' }),
    });
  } catch (error: unknown) {
    await client.query('ROLLBACK');
    log.error('Cancel group error', error);
    return cors({
      statusCode: 500,
      body: JSON.stringify({ success: false, message: 'Failed to cancel group' }),
    });
  } finally {
    client.release();
  }
};

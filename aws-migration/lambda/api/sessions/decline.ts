/**
 * Decline/Cancel Session Handler
 * POST /sessions/{id}/decline - Creator declines OR fan cancels a session request
 */

import { APIGatewayProxyHandler } from 'aws-lambda';
import { getPool, corsHeaders } from '../../shared/db';
import { isValidUUID } from '../utils/security';
import { checkRateLimit } from '../utils/rate-limit';
import { createLogger } from '../utils/logger';

const log = createLogger('sessions-decline');

interface DeclineBody {
  reason?: string;
}

export const handler: APIGatewayProxyHandler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders, body: '' };
  }

  const cognitoSub = event.requestContext.authorizer?.claims?.sub;
  if (!cognitoSub) {
    return {
      statusCode: 401,
      headers: corsHeaders,
      body: JSON.stringify({ success: false, message: 'Unauthorized' }),
    };
  }

  const sessionId = event.pathParameters?.id;
  if (!sessionId || !isValidUUID(sessionId)) {
    return {
      statusCode: 400,
      headers: corsHeaders,
      body: JSON.stringify({ success: false, message: 'Valid session ID required' }),
    };
  }

  const { allowed } = await checkRateLimit({ prefix: 'session-decline', identifier: cognitoSub, windowSeconds: 60, maxRequests: 10 });
  if (!allowed) {
    return { statusCode: 429, headers: corsHeaders, body: JSON.stringify({ success: false, message: 'Too many requests' }) };
  }

  const pool = await getPool();

  // Resolve cognitoSub → profile ID
  const profileLookup = await pool.query('SELECT id FROM profiles WHERE cognito_sub = $1', [cognitoSub]);
  if (profileLookup.rows.length === 0) {
    return { statusCode: 404, headers: corsHeaders, body: JSON.stringify({ success: false, message: 'Profile not found' }) };
  }
  const profileId = profileLookup.rows[0].id as string;

  const client = await pool.connect();

  try {
    const body: DeclineBody = JSON.parse(event.body || '{}');

    await client.query('BEGIN');

    // Get session and determine role
    const sessionResult = await client.query(
      `SELECT s.*, fp.full_name as fan_name, cp.full_name as creator_name
       FROM private_sessions s
       JOIN profiles fp ON s.fan_id = fp.id
       JOIN profiles cp ON s.creator_id = cp.id
       WHERE s.id = $1 AND s.status IN ('pending', 'confirmed')`,
      [sessionId]
    );

    if (sessionResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return {
        statusCode: 404,
        headers: corsHeaders,
        body: JSON.stringify({ success: false, message: 'Session not found or already processed' }),
      };
    }

    const session = sessionResult.rows[0];
    const isCreator = session.creator_id === profileId;
    const isFan = session.fan_id === profileId;

    if (!isCreator && !isFan) {
      await client.query('ROLLBACK');
      return {
        statusCode: 403,
        headers: corsHeaders,
        body: JSON.stringify({ success: false, message: 'Forbidden' }),
      };
    }

    if (isCreator && session.status !== 'pending') {
      await client.query('ROLLBACK');
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ success: false, message: 'Only pending sessions can be declined by creator' }),
      };
    }

    const cancellationReason = body.reason || (isCreator ? 'Declined by creator' : 'Cancelled by fan');

    // Update session status to cancelled
    await client.query(
      `UPDATE private_sessions
       SET status = 'cancelled', cancellation_reason = $1, updated_at = NOW()
       WHERE id = $2`,
      [cancellationReason, sessionId]
    );

    // If session was from a pack, refund the session credit
    if (session.pack_id) {
      await client.query(
        `UPDATE user_session_packs SET sessions_remaining = sessions_remaining + 1 WHERE id = $1`,
        [session.pack_id]
      );
    }

    // Notify counterpart
    if (isCreator) {
      await client.query(
        `INSERT INTO notifications (user_id, type, title, body, data)
         VALUES ($1, 'session_declined', 'Session non disponible', $2, $3)`,
        [
          session.fan_id,
          cancellationReason,
          JSON.stringify({
            sessionId,
            scheduledAt: session.scheduled_at,
            creatorId: profileId,
          }),
        ]
      );
    } else if (isFan) {
      await client.query(
        `INSERT INTO notifications (user_id, type, title, body, data)
         VALUES ($1, 'session_cancelled', 'Session annulee', $2, $3)`,
        [
          session.creator_id,
          cancellationReason,
          JSON.stringify({
            sessionId,
            scheduledAt: session.scheduled_at,
            fanId: profileId,
          }),
        ]
      );
    }

    await client.query('COMMIT');

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        success: true,
        message: isCreator ? 'Session declined' : 'Session cancelled',
      }),
    };
  } catch (error) {
    await client.query('ROLLBACK');
    log.error('Decline session error', error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ success: false, message: 'Failed to decline session' }),
    };
  } finally {
    client.release();
  }
};

/**
 * Accept Session Handler
 * POST /sessions/{id}/accept - Creator accepts a session request
 */

import { APIGatewayProxyHandler } from 'aws-lambda';
import { getPool } from '../../shared/db';
import { createHeaders } from '../utils/cors';
import { v4 as uuidv4 } from 'uuid';
import { createLogger } from '../utils/logger';
import { isValidUUID } from '../utils/security';
import { requireRateLimit } from '../utils/rate-limit';
import { RATE_WINDOW_1_MIN } from '../utils/constants';
import { resolveProfileId } from '../utils/auth';

const log = createLogger('sessions-accept');

export const handler: APIGatewayProxyHandler = async (event) => {
  log.initFromEvent(event);
  const headers = createHeaders(event);
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  const cognitoSub = event.requestContext.authorizer?.claims?.sub;
  if (!cognitoSub) {
    return {
      statusCode: 401,
      headers: headers,
      body: JSON.stringify({ success: false, message: 'Unauthorized' }),
    };
  }

  const sessionId = event.pathParameters?.id;
  if (!sessionId || !isValidUUID(sessionId)) {
    return {
      statusCode: 400,
      headers: headers,
      body: JSON.stringify({ success: false, message: 'Valid session ID required' }),
    };
  }

  const rateLimitResponse = await requireRateLimit({ prefix: 'session-accept', identifier: cognitoSub, windowSeconds: RATE_WINDOW_1_MIN, maxRequests: 10 }, headers);
  if (rateLimitResponse) return rateLimitResponse;

  const pool = await getPool();

  // Resolve cognitoSub → profile ID
  const profileId = await resolveProfileId(pool, cognitoSub);
  if (!profileId) {
    return { statusCode: 404, headers: headers, body: JSON.stringify({ success: false, message: 'Profile not found' }) };
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Get session and verify creator
    const sessionResult = await client.query(
      `SELECT s.*, fp.full_name as fan_name
       FROM private_sessions s
       JOIN profiles fp ON s.fan_id = fp.id
       WHERE s.id = $1 AND s.creator_id = $2 AND s.status = 'pending'`,
      [sessionId, profileId]
    );

    if (sessionResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return {
        statusCode: 404,
        headers: headers,
        body: JSON.stringify({ success: false, message: 'Session not found or already processed' }),
      };
    }

    const session = sessionResult.rows[0];

    // Generate Agora channel name for the session
    const agoraChannel = `session_${sessionId}_${uuidv4().substring(0, 8)}`;

    // Update session status to confirmed
    await client.query(
      `UPDATE private_sessions
       SET status = 'confirmed', agora_channel = $1, updated_at = NOW()
       WHERE id = $2`,
      [agoraChannel, sessionId]
    );

    // Notify the fan
    await client.query(
      `INSERT INTO notifications (user_id, type, title, body, data)
       VALUES ($1, 'session_confirmed', 'Session confirmee', $2, $3)`,
      [
        session.fan_id,
        `Votre session a ete confirmee`,
        JSON.stringify({
          sessionId,
          scheduledAt: session.scheduled_at,
          creatorId: profileId,
        }),
      ]
    );

    await client.query('COMMIT');

    return {
      statusCode: 200,
      headers: headers,
      body: JSON.stringify({
        success: true,
        message: 'Session confirmed',
        session: {
          id: sessionId,
          status: 'confirmed',
          agoraChannel,
        },
      }),
    };
  } catch (error_) {
    await client.query('ROLLBACK');
    log.error('Accept session error', error_);
    return {
      statusCode: 500,
      headers: headers,
      body: JSON.stringify({ success: false, message: 'Failed to accept session' }),
    };
  } finally {
    client.release();
  }
};

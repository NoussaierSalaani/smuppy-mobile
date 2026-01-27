/**
 * Session Token Handler
 * POST /sessions/{id}/token - Generate Agora token for session
 */

import { APIGatewayProxyHandler } from 'aws-lambda';
import { getPool, corsHeaders } from '../../shared/db';
import { RtcTokenBuilder, RtcRole } from 'agora-access-token';

const AGORA_APP_ID = process.env.AGORA_APP_ID || '';
const AGORA_APP_CERTIFICATE = process.env.AGORA_APP_CERTIFICATE || '';

export const handler: APIGatewayProxyHandler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders, body: '' };
  }

  const userId = event.requestContext.authorizer?.claims?.sub;
  if (!userId) {
    return {
      statusCode: 401,
      headers: corsHeaders,
      body: JSON.stringify({ success: false, message: 'Unauthorized' }),
    };
  }

  const sessionId = event.pathParameters?.id;
  if (!sessionId) {
    return {
      statusCode: 400,
      headers: corsHeaders,
      body: JSON.stringify({ success: false, message: 'Session ID required' }),
    };
  }

  try {
    const pool = await getPool();

    // Get session and verify user is participant
    const sessionResult = await pool.query(
      `SELECT * FROM private_sessions
       WHERE id = $1 AND (creator_id = $2 OR fan_id = $2)
       AND status = 'confirmed'`,
      [sessionId, userId]
    );

    if (sessionResult.rows.length === 0) {
      return {
        statusCode: 404,
        headers: corsHeaders,
        body: JSON.stringify({ success: false, message: 'Session not found or not authorized' }),
      };
    }

    const session = sessionResult.rows[0];

    // Check if session is within valid time window (5 min before to session duration after)
    const scheduledAt = new Date(session.scheduled_at).getTime();
    const now = Date.now();
    const fiveMinBefore = scheduledAt - 5 * 60 * 1000;
    const sessionEnd = scheduledAt + session.duration * 60 * 1000;

    if (now < fiveMinBefore) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({
          success: false,
          message: 'Session has not started yet',
          startsIn: Math.ceil((fiveMinBefore - now) / 1000 / 60), // minutes
        }),
      };
    }

    if (now > sessionEnd) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ success: false, message: 'Session has ended' }),
      };
    }

    // Generate channel name if not exists
    let channelName = session.agora_channel;
    if (!channelName) {
      channelName = `session_${sessionId}`;
      await pool.query(
        `UPDATE private_sessions SET agora_channel = $1 WHERE id = $2`,
        [channelName, sessionId]
      );
    }

    // Determine user role
    const isCreator = session.creator_id === userId;
    const role = isCreator ? RtcRole.PUBLISHER : RtcRole.PUBLISHER; // Both can publish in 1:1

    // Generate UID from user ID (use hash of UUID)
    const uid = Math.abs(hashCode(userId)) % 1000000000;

    // Token expires after session duration + 30 min buffer
    const tokenExpireSeconds = Math.ceil((sessionEnd - now) / 1000) + 30 * 60;

    // Build token
    const token = RtcTokenBuilder.buildTokenWithUid(
      AGORA_APP_ID,
      AGORA_APP_CERTIFICATE,
      channelName,
      uid,
      role,
      tokenExpireSeconds
    );

    // Update session status to in_progress if not already
    if (!session.started_at) {
      await pool.query(
        `UPDATE private_sessions SET status = 'in_progress', started_at = NOW() WHERE id = $1`,
        [sessionId]
      );
    }

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        success: true,
        token,
        channelName,
        uid,
        appId: AGORA_APP_ID,
        isCreator,
        expiresIn: tokenExpireSeconds,
      }),
    };
  } catch (error) {
    console.error('Generate token error:', error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ success: false, message: 'Failed to generate token' }),
    };
  }
};

// Simple hash function for generating UID from UUID
function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return hash;
}

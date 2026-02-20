/**
 * Session Token Handler
 * POST /sessions/{id}/token - Generate Agora token for session
 */

import { RtcTokenBuilder, RtcRole } from 'agora-access-token';
import { isValidUUID } from '../utils/security';
import { withAuthHandler } from '../utils/with-auth-handler';
import { requireRateLimit } from '../utils/rate-limit';
import { RATE_WINDOW_1_MIN } from '../utils/constants';

const AGORA_APP_ID = process.env.AGORA_APP_ID || '';
const AGORA_APP_CERTIFICATE = process.env.AGORA_APP_CERTIFICATE || '';

export const handler = withAuthHandler('sessions-token', async (event, { headers, cognitoSub, profileId, db }) => {
  const sessionId = event.pathParameters?.id;
  if (!sessionId || !isValidUUID(sessionId)) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ success: false, message: 'Valid session ID required' }),
    };
  }

  const rateLimitResponse = await requireRateLimit({ prefix: 'session-token', identifier: cognitoSub, windowSeconds: RATE_WINDOW_1_MIN, maxRequests: 10 }, headers);
  if (rateLimitResponse) return rateLimitResponse;

    // Get session and verify user is participant
    const sessionResult = await db.query(
      `SELECT id, creator_id, fan_id, scheduled_at, duration, agora_channel, started_at
       FROM private_sessions
       WHERE id = $1 AND (creator_id = $2 OR fan_id = $2)
       AND status = 'confirmed'`,
      [sessionId, profileId]
    );

    if (sessionResult.rows.length === 0) {
      return {
        statusCode: 404,
        headers,
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
        headers,
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
        headers,
        body: JSON.stringify({ success: false, message: 'Session has ended' }),
      };
    }

    // Generate channel name if not exists
    let channelName = session.agora_channel;
    if (!channelName) {
      channelName = `session_${sessionId}`;
      await db.query(
        `UPDATE private_sessions SET agora_channel = $1 WHERE id = $2`,
        [channelName, sessionId]
      );
    }

    // Determine user role
    const isCreator = session.creator_id === profileId;
    const role = RtcRole.PUBLISHER; // Both can publish in 1:1

    // Generate UID from profile ID (deterministic hash)
    const uid = Math.abs(hashCode(profileId)) % 1000000000;

    // Token expires at session end + 5 min grace period (not 30 min)
    const tokenExpireSeconds = Math.ceil((sessionEnd - now) / 1000) + 5 * 60;

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
      await db.query(
        `UPDATE private_sessions SET status = 'in_progress', started_at = NOW() WHERE id = $1`,
        [sessionId]
      );
    }

    return {
      statusCode: 200,
      headers,
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
});

// Simple hash function for generating UID from UUID
function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.codePointAt(i) ?? 0;
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return hash;
}

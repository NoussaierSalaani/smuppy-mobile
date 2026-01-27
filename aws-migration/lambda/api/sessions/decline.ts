/**
 * Decline Session Handler
 * POST /sessions/{id}/decline - Creator declines a session request
 */

import { APIGatewayProxyHandler } from 'aws-lambda';
import { getPool, corsHeaders } from '../../shared/db';

interface DeclineBody {
  reason?: string;
}

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
    const body: DeclineBody = JSON.parse(event.body || '{}');
    const pool = await getPool();

    // Get session and verify creator
    const sessionResult = await pool.query(
      `SELECT s.*, fp.full_name as fan_name
       FROM private_sessions s
       JOIN profiles fp ON s.fan_id = fp.id
       WHERE s.id = $1 AND s.creator_id = $2 AND s.status = 'pending'`,
      [sessionId, userId]
    );

    if (sessionResult.rows.length === 0) {
      return {
        statusCode: 404,
        headers: corsHeaders,
        body: JSON.stringify({ success: false, message: 'Session not found or already processed' }),
      };
    }

    const session = sessionResult.rows[0];

    // Update session status to declined
    await pool.query(
      `UPDATE private_sessions
       SET status = 'cancelled', cancellation_reason = $1, updated_at = NOW()
       WHERE id = $2`,
      [body.reason || 'Declined by creator', sessionId]
    );

    // If session was from a pack, refund the session credit
    if (session.pack_id) {
      await pool.query(
        `UPDATE user_session_packs SET sessions_remaining = sessions_remaining + 1 WHERE id = $1`,
        [session.pack_id]
      );
    }

    // Notify the fan
    await pool.query(
      `INSERT INTO notifications (user_id, type, title, body, data)
       VALUES ($1, 'session_declined', 'Session non disponible', $2, $3)`,
      [
        session.fan_id,
        body.reason || 'Le createur n\'est pas disponible pour ce creneau',
        JSON.stringify({
          sessionId,
          scheduledAt: session.scheduled_at,
          creatorId: userId,
        }),
      ]
    );

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        success: true,
        message: 'Session declined',
      }),
    };
  } catch (error) {
    console.error('Decline session error:', error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ success: false, message: 'Failed to decline session' }),
    };
  }
};

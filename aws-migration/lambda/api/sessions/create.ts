/**
 * Create Session Handler
 * POST /sessions - Book a new private session
 */

import { APIGatewayProxyHandler } from 'aws-lambda';
import { getPool, corsHeaders } from '../../shared/db';

interface CreateSessionBody {
  creatorId: string;
  scheduledAt: string;
  duration: number;
  notes?: string;
  fromPackId?: string; // If using a session pack
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

  try {
    const body: CreateSessionBody = JSON.parse(event.body || '{}');
    const { creatorId, scheduledAt, duration, notes, fromPackId } = body;

    if (!creatorId || !scheduledAt || !duration) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ success: false, message: 'Missing required fields' }),
      };
    }

    // Validate scheduledAt is a valid ISO 8601 date
    const scheduledDate = new Date(scheduledAt);
    if (isNaN(scheduledDate.getTime()) || scheduledDate <= new Date()) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ success: false, message: 'Invalid or past scheduled date' }),
      };
    }

    // SECURITY: Validate duration is a safe integer (prevent SQL injection)
    const safeDuration = Math.min(Math.max(Math.round(Number(duration)), 15), 480);
    if (isNaN(safeDuration)) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ success: false, message: 'Invalid duration' }),
      };
    }

    const pool = await getPool();

    // Check if creator exists and accepts sessions
    const creatorResult = await pool.query(
      `SELECT id, full_name, username, sessions_enabled, session_price, session_duration
       FROM profiles WHERE id = $1`,
      [creatorId]
    );

    if (creatorResult.rows.length === 0) {
      return {
        statusCode: 404,
        headers: corsHeaders,
        body: JSON.stringify({ success: false, message: 'Creator not found' }),
      };
    }

    const creator = creatorResult.rows[0];
    if (!creator.sessions_enabled) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ success: false, message: 'Creator does not accept sessions' }),
      };
    }

    // Check for scheduling conflicts — use parameterized interval via make_interval()
    const conflictResult = await pool.query(
      `SELECT id FROM private_sessions
       WHERE creator_id = $1
       AND status IN ('pending', 'confirmed')
       AND scheduled_at BETWEEN $2::timestamp - make_interval(mins => $3) AND $2::timestamp + make_interval(mins => $3)`,
      [creatorId, scheduledAt, safeDuration]
    );

    if (conflictResult.rows.length > 0) {
      return {
        statusCode: 409,
        headers: corsHeaders,
        body: JSON.stringify({ success: false, message: 'Time slot not available' }),
      };
    }

    // If using a pack, verify and decrement
    let packUsed = false;
    if (fromPackId) {
      const packResult = await pool.query(
        `SELECT id, sessions_remaining FROM user_session_packs
         WHERE id = $1 AND user_id = $2 AND creator_id = $3 AND sessions_remaining > 0
         AND expires_at > NOW()`,
        [fromPackId, userId, creatorId]
      );

      if (packResult.rows.length === 0) {
        return {
          statusCode: 400,
          headers: corsHeaders,
          body: JSON.stringify({ success: false, message: 'Invalid or expired pack' }),
        };
      }

      // SECURITY: Atomic decrement with WHERE guard to prevent race conditions
      const decrementResult = await pool.query(
        `UPDATE user_session_packs SET sessions_remaining = sessions_remaining - 1
         WHERE id = $1 AND sessions_remaining > 0
         RETURNING sessions_remaining`,
        [fromPackId]
      );

      if (decrementResult.rowCount === 0) {
        return {
          statusCode: 400,
          headers: corsHeaders,
          body: JSON.stringify({ success: false, message: 'No sessions remaining in pack' }),
        };
      }
      packUsed = true;
    }

    // Create the session
    const sessionResult = await pool.query(
      `INSERT INTO private_sessions (
        creator_id, fan_id, scheduled_at, duration, price, notes, status, pack_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *`,
      [
        creatorId,
        userId,
        scheduledAt,
        duration,
        packUsed ? 0 : creator.session_price,
        notes || null,
        'pending', // Creator needs to accept
        fromPackId || null,
      ]
    );

    const session = sessionResult.rows[0];

    // Send notification to creator
    await pool.query(
      `INSERT INTO notifications (user_id, type, title, body, data)
       VALUES ($1, 'session_request', 'Nouvelle demande de session', $2, $3)`,
      [
        creatorId,
        `Vous avez une nouvelle demande de session`,
        JSON.stringify({
          sessionId: session.id,
          fanId: userId,
          scheduledAt,
        }),
      ]
    );

    return {
      statusCode: 201,
      headers: corsHeaders,
      body: JSON.stringify({
        success: true,
        session: {
          id: session.id,
          status: session.status,
          scheduledAt: session.scheduled_at,
          duration: session.duration,
          price: parseFloat(session.price),
          creatorId: session.creator_id,
          creatorName: creator.full_name,
        },
      }),
    };
  } catch (error) {
    console.error('Create session error:', error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ success: false, message: 'Failed to create session' }),
    };
  }
};

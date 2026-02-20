/**
 * Create Session Handler
 * POST /sessions - Book a new private session
 */

import { isValidUUID } from '../utils/security';
import { withAuthHandler } from '../utils/with-auth-handler';
import { requireRateLimit } from '../utils/rate-limit';
import { RATE_WINDOW_1_MIN, MIN_SESSION_DURATION_MINUTES, MAX_SESSION_DURATION_MINUTES } from '../utils/constants';

interface CreateSessionBody {
  creatorId: string;
  scheduledAt: string;
  duration: number;
  notes?: string;
  fromPackId?: string; // If using a session pack
}

export const handler = withAuthHandler('sessions-create', async (event, { headers, cognitoSub, profileId, db }) => {
  const rateLimitResponse = await requireRateLimit({ prefix: 'session-create', identifier: cognitoSub, windowSeconds: RATE_WINDOW_1_MIN, maxRequests: 5 }, headers);
  if (rateLimitResponse) return rateLimitResponse;

    const body: CreateSessionBody = JSON.parse(event.body || '{}');
    const { creatorId, scheduledAt, duration, notes, fromPackId } = body;

    if (!creatorId || !scheduledAt || !duration) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ success: false, message: 'Missing required fields' }),
      };
    }

    if (!isValidUUID(creatorId) || (fromPackId && !isValidUUID(fromPackId))) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ success: false, message: 'Invalid ID format' }),
      };
    }

    // Validate scheduledAt is a valid ISO 8601 date
    const scheduledDate = new Date(scheduledAt);
    if (Number.isNaN(scheduledDate.getTime()) || scheduledDate <= new Date()) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ success: false, message: 'Invalid or past scheduled date' }),
      };
    }

    // SECURITY: Validate duration is a safe integer (prevent SQL injection)
    const safeDuration = Math.min(Math.max(Math.round(Number(duration)), MIN_SESSION_DURATION_MINUTES), MAX_SESSION_DURATION_MINUTES);
    if (Number.isNaN(safeDuration)) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ success: false, message: 'Invalid duration' }),
      };
    }

    const client = await db.connect();

    try {
      await client.query('BEGIN');

      // Check if creator exists and accepts sessions
      const creatorResult = await client.query(
        `SELECT id, full_name, username, sessions_enabled, session_price, session_duration
         FROM profiles WHERE id = $1`,
        [creatorId]
      );

      if (creatorResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return {
          statusCode: 404,
          headers,
          body: JSON.stringify({ success: false, message: 'Creator not found' }),
        };
      }

      const creator = creatorResult.rows[0];
      if (!creator.sessions_enabled) {
        await client.query('ROLLBACK');
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ success: false, message: 'Creator does not accept sessions' }),
        };
      }

      // SECURITY: Advisory lock on creator prevents concurrent inserts for the same creator
      // FOR UPDATE alone doesn't help when no conflicting rows exist yet
      await client.query(
        `SELECT pg_advisory_xact_lock(hashtext($1))`,
        [creatorId]
      );

      const conflictResult = await client.query(
        `SELECT id FROM private_sessions
         WHERE creator_id = $1
         AND status IN ('pending', 'confirmed')
         AND scheduled_at BETWEEN $2::timestamp - make_interval(mins => $3) AND $2::timestamp + make_interval(mins => $3)`,
        [creatorId, scheduledAt, safeDuration]
      );

      if (conflictResult.rows.length > 0) {
        await client.query('ROLLBACK');
        return {
          statusCode: 409,
          headers,
          body: JSON.stringify({ success: false, message: 'Time slot not available' }),
        };
      }

      // If using a pack, verify and decrement
      let packUsed = false;
      if (fromPackId) {
        const packResult = await client.query(
          `SELECT id, sessions_remaining FROM user_session_packs
           WHERE id = $1 AND user_id = $2 AND creator_id = $3 AND sessions_remaining > 0
           AND expires_at > NOW()
           FOR UPDATE`,
          [fromPackId, profileId, creatorId]
        );

        if (packResult.rows.length === 0) {
          await client.query('ROLLBACK');
          return {
            statusCode: 400,
            headers,
            body: JSON.stringify({ success: false, message: 'Invalid or expired pack' }),
          };
        }

        // SECURITY: Atomic decrement with WHERE guard to prevent race conditions
        const decrementResult = await client.query(
          `UPDATE user_session_packs SET sessions_remaining = sessions_remaining - 1
           WHERE id = $1 AND sessions_remaining > 0
           RETURNING sessions_remaining`,
          [fromPackId]
        );

        if (decrementResult.rowCount === 0) {
          await client.query('ROLLBACK');
          return {
            statusCode: 400,
            headers,
            body: JSON.stringify({ success: false, message: 'No sessions remaining in pack' }),
          };
        }
        packUsed = true;
      }

      // Create the session
      const sessionResult = await client.query(
        `INSERT INTO private_sessions (
          creator_id, fan_id, scheduled_at, duration, price, notes, status, pack_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING id, creator_id, fan_id, scheduled_at, duration, price, status, created_at`,
        [
          creatorId,
          profileId,
          scheduledAt,
          duration,
          packUsed ? 0 : creator.session_price,
          notes || null,
          'pending',
          fromPackId || null,
        ]
      );

      const session = sessionResult.rows[0];

      // Send notification to creator
      await client.query(
        `INSERT INTO notifications (user_id, type, title, body, data)
         VALUES ($1, 'session_request', 'New session request', $2, $3)`,
        [
          creatorId,
          `You have a new session request`,
          JSON.stringify({
            sessionId: session.id,
            fanId: profileId,
            scheduledAt,
          }),
        ]
      );

      await client.query('COMMIT');

      return {
        statusCode: 201,
        headers,
        body: JSON.stringify({
          success: true,
          session: {
            id: session.id,
            status: session.status,
            scheduledAt: session.scheduled_at,
            duration: session.duration,
            price: Number.parseFloat(session.price),
            creatorId: session.creator_id,
            creatorName: creator.full_name,
          },
        }),
      };
    } catch (txError) {
      await client.query('ROLLBACK');
      throw txError;
    } finally {
      client.release();
    }
});

/**
 * Leave Event Lambda Handler
 * Leave an event the user has joined
 * POST /events/{eventId}/leave
 */

import { APIGatewayProxyHandler } from 'aws-lambda';
import { getPool } from '../../shared/db';
import { cors, handleOptions } from '../utils/cors';
import { createLogger } from '../utils/logger';
import { isValidUUID } from '../utils/security';
import { checkRateLimit } from '../utils/rate-limit';

const log = createLogger('events-leave');

export const handler: APIGatewayProxyHandler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return handleOptions();

  const pool = await getPool();
  const client = await pool.connect();

  try {
    const userId = event.requestContext.authorizer?.claims?.sub;
    if (!userId) {
      return cors({
        statusCode: 401,
        body: JSON.stringify({ success: false, message: 'Unauthorized' }),
      });
    }

    const { allowed } = await checkRateLimit({ prefix: 'event-leave', identifier: userId, windowSeconds: 60, maxRequests: 10 });
    if (!allowed) {
      return cors({ statusCode: 429, body: JSON.stringify({ success: false, message: 'Too many requests. Please try again later.' }) });
    }

    const eventId = event.pathParameters?.eventId;
    if (!eventId || !isValidUUID(eventId)) {
      return cors({
        statusCode: 400,
        body: JSON.stringify({ success: false, message: 'Invalid ID format' }),
      });
    }

    // Resolve cognito_sub to profile ID
    const profileResult = await client.query(
      'SELECT id FROM profiles WHERE cognito_sub = $1',
      [userId]
    );
    if (profileResult.rows.length === 0) {
      return cors({
        statusCode: 404,
        body: JSON.stringify({ success: false, message: 'Profile not found' }),
      });
    }
    const profileId = profileResult.rows[0].id;

    // Check event exists
    const eventResult = await client.query(
      `SELECT id, title, status, creator_id FROM events WHERE id = $1`,
      [eventId]
    );
    if (eventResult.rows.length === 0) {
      return cors({
        statusCode: 404,
        body: JSON.stringify({ success: false, message: 'Event not found' }),
      });
    }

    const eventData = eventResult.rows[0];

    // Creator cannot leave their own event
    if (eventData.creator_id === profileId) {
      return cors({
        statusCode: 400,
        body: JSON.stringify({ success: false, message: 'Event creator cannot leave their own event. Use cancel instead.' }),
      });
    }

    // Check user is a participant with an active status
    const participantResult = await client.query(
      `SELECT id, status FROM event_participants
       WHERE event_id = $1 AND user_id = $2`,
      [eventId, profileId]
    );

    if (participantResult.rows.length === 0) {
      return cors({
        statusCode: 400,
        body: JSON.stringify({ success: false, message: 'You are not a participant of this event' }),
      });
    }

    const currentStatus = participantResult.rows[0].status;
    if (currentStatus === 'cancelled') {
      return cors({
        statusCode: 400,
        body: JSON.stringify({ success: false, message: 'You have already left this event' }),
      });
    }

    await client.query('BEGIN');

    // Cancel participation
    await client.query(
      `UPDATE event_participants SET status = 'cancelled'
       WHERE event_id = $1 AND user_id = $2`,
      [eventId, profileId]
    );

    // Decrement cached participant count (never go below 0)
    await client.query(
      `UPDATE events SET current_participants = GREATEST(current_participants - 1, 0)
       WHERE id = $1`,
      [eventId]
    );

    await client.query('COMMIT');

    // Get updated participant count
    const updatedEvent = await client.query(
      `SELECT current_participants, max_participants FROM events WHERE id = $1`,
      [eventId]
    );
    const currentParticipants = updatedEvent.rows[0]?.current_participants ?? 0;
    const maxParticipants = updatedEvent.rows[0]?.max_participants;

    return cors({
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        message: 'Successfully left the event',
        currentParticipants,
        spotsLeft: maxParticipants
          ? maxParticipants - currentParticipants
          : null,
      }),
    });
  } catch (error: unknown) {
    await client.query('ROLLBACK');
    log.error('Leave event error', error);
    return cors({
      statusCode: 500,
      body: JSON.stringify({
        success: false,
        message: 'Failed to leave event',
      }),
    });
  } finally {
    client.release();
  }
};

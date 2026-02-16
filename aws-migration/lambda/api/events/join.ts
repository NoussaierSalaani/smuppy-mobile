/**
 * Join Event Lambda Handler
 * Register for / leave an event
 */

import { APIGatewayProxyHandler } from 'aws-lambda';
import { getPool } from '../../shared/db';
import { cors, handleOptions } from '../utils/cors';
import { createLogger } from '../utils/logger';
import { isValidUUID } from '../utils/security';
import { checkRateLimit } from '../utils/rate-limit';

const log = createLogger('events-join');

interface JoinEventRequest {
  action: 'register' | 'cancel' | 'interested';
  notes?: string;
}

export const handler: APIGatewayProxyHandler = async (event) => {
  log.initFromEvent(event);
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

    // Rate limit
    const rateLimit = await checkRateLimit({
      prefix: 'events-join',
      identifier: userId,
      windowSeconds: 60,
      maxRequests: 10,
    });
    if (!rateLimit.allowed) {
      return cors({
        statusCode: 429,
        body: JSON.stringify({ success: false, message: 'Too many requests. Please try again later.' }),
      });
    }

    const eventId = event.pathParameters?.eventId;
    if (!eventId || !isValidUUID(eventId)) {
      return cors({
        statusCode: 400,
        body: JSON.stringify({ success: false, message: 'Invalid ID format' }),
      });
    }

    const body: JoinEventRequest = JSON.parse(event.body || '{}');
    const { action, notes } = body;

    if (!['register', 'cancel', 'interested'].includes(action)) {
      return cors({
        statusCode: 400,
        body: JSON.stringify({ success: false, message: 'Invalid action' }),
      });
    }

    // Get user profile ID
    const userProfileResult = await client.query(
      'SELECT id, full_name, username FROM profiles WHERE cognito_sub = $1',
      [userId]
    );
    if (userProfileResult.rows.length === 0) {
      return cors({
        statusCode: 404,
        body: JSON.stringify({ success: false, message: 'User profile not found' }),
      });
    }
    const userProfile = userProfileResult.rows[0];
    const userProfileId = userProfile.id;

    // Get event details
    const eventResult = await client.query(
      `SELECT e.id, e.title, e.starts_at, e.status, e.is_fans_only, e.creator_id,
              e.is_free, e.price, e.currency, e.max_participants, e.current_participants,
              p.username as creator_username, p.display_name as creator_display_name
       FROM events e
       JOIN profiles p ON e.creator_id = p.id
       WHERE e.id = $1`,
      [eventId]
    );

    if (eventResult.rows.length === 0) {
      return cors({
        statusCode: 404,
        body: JSON.stringify({ success: false, message: 'Event not found' }),
      });
    }

    const eventData = eventResult.rows[0];

    // Check if event is still upcoming
    if (new Date(eventData.starts_at) < new Date() && action === 'register') {
      return cors({
        statusCode: 400,
        body: JSON.stringify({
          success: false,
          message: 'This event has already started',
        }),
      });
    }

    // Check if event is cancelled
    if (eventData.status === 'cancelled') {
      return cors({
        statusCode: 400,
        body: JSON.stringify({
          success: false,
          message: 'This event has been cancelled',
        }),
      });
    }

    // BUG-2026-02-14: Fans-only check must use profile IDs (not Cognito sub)
    if (eventData.is_fans_only && eventData.creator_id !== userProfileId) {
      const followCheck = await client.query(
        `SELECT id FROM follows
         WHERE follower_id = $1 AND following_id = $2 AND status = 'accepted'`,
        [userProfileId, eventData.creator_id]
      );

      if (followCheck.rows.length === 0) {
        return cors({
          statusCode: 403,
          body: JSON.stringify({
            success: false,
            message: 'This event is only for fans of the creator',
          }),
        });
      }
    }

    // Get existing participation (use profile ID, not Cognito sub)
    const existingResult = await client.query(
      `SELECT id FROM event_participants
       WHERE event_id = $1 AND user_id = $2`,
      [eventId, userProfileId]
    );

    await client.query('BEGIN');

    let message: string;
    let participationStatus: string | null = null;

    switch (action) {
      case 'register':
        // Check if paid event (before capacity to avoid holding spots)
        if (!eventData.is_free && eventData.price > 0) {
          return cors({
            statusCode: 200,
            body: JSON.stringify({
              success: true,
              requiresPayment: true,
              price: parseFloat(eventData.price),
              currency: eventData.currency,
              message: 'Payment required to register',
            }),
          });
        }

        // SECURITY: Atomic capacity check + increment to prevent race conditions
        if (eventData.max_participants) {
          const capacityResult = await client.query(
            `UPDATE events SET current_participants = current_participants + 1
             WHERE id = $1 AND current_participants < max_participants
             RETURNING current_participants`,
            [eventId]
          );
          if (capacityResult.rowCount === 0) {
            return cors({
              statusCode: 400,
              body: JSON.stringify({ success: false, message: 'Event is full' }),
            });
          }
        }

        if (existingResult.rows.length > 0) {
          await client.query(
            `UPDATE event_participants
             SET status = 'registered', notes = $1
             WHERE event_id = $2 AND user_id = $3`,
            [notes, eventId, userProfileId]
          );
        } else {
          await client.query(
            `INSERT INTO event_participants (event_id, user_id, status, notes)
             VALUES ($1, $2, 'registered', $3)`,
            [eventId, userProfileId, notes]
          );
        }

        participationStatus = 'registered';
        message = 'Successfully registered for the event';

        // BUG-2026-02-14: Only increment when max_participants is NOT set
        // (atomic capacity check above already increments for capped events)
        if (!eventData.max_participants) {
          await client.query(
            `UPDATE events SET current_participants = current_participants + 1 WHERE id = $1`,
            [eventId]
          );
        }

        // Notify creator
        if (eventData.creator_id !== userProfileId) {
          const registrantName = userProfile.full_name || 'Someone';
          await client.query(
            `INSERT INTO notifications (user_id, type, title, body, data)
             VALUES ($1, 'event_registration', 'New Registration', $2, $3)`,
            [
              eventData.creator_id,
              `${registrantName} registered for your event!`,
              JSON.stringify({ eventId, eventTitle: eventData.title, senderId: userProfileId }),
            ]
          );
        }
        break;

      case 'interested':
        if (existingResult.rows.length > 0) {
          await client.query(
            `UPDATE event_participants
             SET status = 'interested'
             WHERE event_id = $1 AND user_id = $2`,
            [eventId, userProfileId]
          );
        } else {
          await client.query(
            `INSERT INTO event_participants (event_id, user_id, status)
             VALUES ($1, $2, 'interested')`,
            [eventId, userProfileId]
          );
        }

        participationStatus = 'interested';
        message = 'Marked as interested';
        break;

      case 'cancel':
        if (existingResult.rows.length === 0) {
          return cors({
            statusCode: 400,
            body: JSON.stringify({
              success: false,
              message: 'You are not registered for this event',
            }),
          });
        }

        await client.query(
          `UPDATE event_participants
           SET status = 'cancelled'
           WHERE event_id = $1 AND user_id = $2`,
          [eventId, userProfileId]
        );

        // Decrement cached participant count
        await client.query(
          `UPDATE events SET current_participants = GREATEST(current_participants - 1, 0) WHERE id = $1`,
          [eventId]
        );

        participationStatus = 'cancelled';
        message = 'Registration cancelled';
        break;
    }

    await client.query('COMMIT');

    // Get updated participant count from cached column (faster than COUNT)
    const updatedEvent = await client.query(
      `SELECT current_participants FROM events WHERE id = $1`,
      [eventId]
    );
    const currentParticipants = updatedEvent.rows[0]?.current_participants ?? 0;

    return cors({
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        message,
        participationStatus,
        currentParticipants,
        spotsLeft: eventData.max_participants
          ? eventData.max_participants - currentParticipants
          : null,
      }),
    });
  } catch (error: unknown) {
    await client.query('ROLLBACK');
    log.error('Join event error', error);
    return cors({
      statusCode: 500,
      body: JSON.stringify({
        success: false,
        message: 'Failed to process request',
      }),
    });
  } finally {
    client.release();
  }
};

/**
 * Join Event Lambda Handler
 * Register for / leave an event
 */

import { APIGatewayProxyHandler } from 'aws-lambda';
import { Pool } from 'pg';
import { cors, handleOptions } from '../utils/cors';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

interface JoinEventRequest {
  action: 'register' | 'cancel' | 'interested';
  notes?: string;
}

export const handler: APIGatewayProxyHandler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return handleOptions();

  const client = await pool.connect();

  try {
    const userId = event.requestContext.authorizer?.claims?.sub;
    if (!userId) {
      return cors({
        statusCode: 401,
        body: JSON.stringify({ success: false, message: 'Unauthorized' }),
      });
    }

    const eventId = event.pathParameters?.eventId;
    if (!eventId) {
      return cors({
        statusCode: 400,
        body: JSON.stringify({ success: false, message: 'Event ID required' }),
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

    // Get event details
    const eventResult = await client.query(
      `SELECT e.*, p.username as creator_username, p.display_name as creator_display_name
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

    // Check if fans-only and user is following
    if (eventData.is_fans_only && eventData.creator_id !== userId) {
      const followCheck = await client.query(
        `SELECT id FROM follows
         WHERE follower_id = $1 AND following_id = $2`,
        [userId, eventData.creator_id]
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

    // Get existing participation
    const existingResult = await client.query(
      `SELECT * FROM event_participants
       WHERE event_id = $1 AND user_id = $2`,
      [eventId, userId]
    );

    await client.query('BEGIN');

    let message: string;
    let participationStatus: string | null = null;

    switch (action) {
      case 'register':
        // Check capacity
        if (
          eventData.max_participants &&
          eventData.current_participants >= eventData.max_participants
        ) {
          return cors({
            statusCode: 400,
            body: JSON.stringify({
              success: false,
              message: 'Event is full',
            }),
          });
        }

        // Check if paid event
        if (!eventData.is_free && eventData.price > 0) {
          // For paid events, redirect to payment flow
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

        if (existingResult.rows.length > 0) {
          // Update existing
          await client.query(
            `UPDATE event_participants
             SET status = 'registered', notes = $1
             WHERE event_id = $2 AND user_id = $3`,
            [notes, eventId, userId]
          );
        } else {
          // Create new
          await client.query(
            `INSERT INTO event_participants (event_id, user_id, status, notes)
             VALUES ($1, $2, 'registered', $3)`,
            [eventId, userId, notes]
          );
        }

        participationStatus = 'registered';
        message = 'Successfully registered for the event';

        // Notify creator
        if (eventData.creator_id !== userId) {
          await client.query(
            `INSERT INTO notifications (
              user_id, type, title, message, data, from_user_id
            ) VALUES ($1, 'event_registration', 'New Registration',
              'Someone registered for your event!', $2, $3)`,
            [
              eventData.creator_id,
              JSON.stringify({ eventId, eventTitle: eventData.title }),
              userId,
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
            [eventId, userId]
          );
        } else {
          await client.query(
            `INSERT INTO event_participants (event_id, user_id, status)
             VALUES ($1, $2, 'interested')`,
            [eventId, userId]
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
          [eventId, userId]
        );

        participationStatus = 'cancelled';
        message = 'Registration cancelled';
        break;
    }

    await client.query('COMMIT');

    // Get updated participant count
    const countResult = await client.query(
      `SELECT COUNT(*) as count FROM event_participants
       WHERE event_id = $1 AND status IN ('registered', 'confirmed', 'attended')`,
      [eventId]
    );

    return cors({
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        message,
        participationStatus,
        currentParticipants: parseInt(countResult.rows[0].count),
        spotsLeft: eventData.max_participants
          ? eventData.max_participants - parseInt(countResult.rows[0].count)
          : null,
      }),
    });
  } catch (error: any) {
    await client.query('ROLLBACK');
    console.error('Join event error:', error);
    return cors({
      statusCode: 500,
      body: JSON.stringify({
        success: false,
        message: error.message || 'Failed to process request',
      }),
    });
  } finally {
    client.release();
  }
};

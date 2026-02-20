/**
 * Join Event Lambda Handler
 * Register for / leave an event
 */

import { cors } from '../utils/cors';
import { createEventActionHandler } from '../utils/create-event-action-handler';

interface JoinEventRequest {
  action: 'register' | 'cancel' | 'interested';
  notes?: string;
}

export const { handler } = createEventActionHandler({
  action: 'join',
  loggerName: 'events-join',
  rateLimitPrefix: 'events-join',
  rateLimitMax: 10,
  eventColumns: `e.id, e.title, e.starts_at, e.status, e.is_fans_only, e.creator_id,
                 e.is_free, e.price, e.currency, e.max_participants, e.current_participants,
                 p.username as creator_username, p.display_name as creator_display_name`,
  eventJoins: 'JOIN profiles p ON e.creator_id = p.id',
  onAction: async ({ client, eventData, profileId, eventId, rawEvent }) => {
    const body: JoinEventRequest = JSON.parse(rawEvent.body || '{}');
    const { action, notes } = body;

    if (!['register', 'cancel', 'interested'].includes(action)) {
      return cors({
        statusCode: 400,
        body: JSON.stringify({ success: false, message: 'Invalid action' }),
      });
    }

    // Check if event is still upcoming
    if (new Date(eventData.starts_at as string) < new Date() && action === 'register') {
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
    if (eventData.is_fans_only && eventData.creator_id !== profileId) {
      const followCheck = await client.query(
        `SELECT id FROM follows
         WHERE follower_id = $1 AND following_id = $2 AND status = 'accepted'`,
        [profileId, eventData.creator_id as string]
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
      `SELECT id FROM event_participants
       WHERE event_id = $1 AND user_id = $2`,
      [eventId, profileId]
    );

    let message: string;
    let participationStatus: string | null = null;

    switch (action) {
      case 'register':
        // Check if paid event (before capacity to avoid holding spots)
        if (!eventData.is_free && (eventData.price as number) > 0) {
          return cors({
            statusCode: 200,
            body: JSON.stringify({
              success: true,
              requiresPayment: true,
              price: Number.parseFloat(eventData.price as string),
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
            [notes, eventId, profileId]
          );
        } else {
          await client.query(
            `INSERT INTO event_participants (event_id, user_id, status, notes)
             VALUES ($1, $2, 'registered', $3)`,
            [eventId, profileId, notes]
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
        if (eventData.creator_id !== profileId) {
          // Fetch registrant name for notification
          const registrantResult = await client.query(
            `SELECT full_name FROM profiles WHERE id = $1`,
            [profileId]
          );
          const registrantName = registrantResult.rows[0]?.full_name || 'Someone';

          await client.query(
            `INSERT INTO notifications (user_id, type, title, body, data)
             VALUES ($1, 'event_registration', 'New Registration', $2, $3)`,
            [
              eventData.creator_id as string,
              `${registrantName} registered for your event!`,
              JSON.stringify({ eventId, eventTitle: eventData.title, senderId: profileId }),
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
            [eventId, profileId]
          );
        } else {
          await client.query(
            `INSERT INTO event_participants (event_id, user_id, status)
             VALUES ($1, $2, 'interested')`,
            [eventId, profileId]
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
          [eventId, profileId]
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
          ? (eventData.max_participants as number) - currentParticipants
          : null,
      }),
    });
  },
});

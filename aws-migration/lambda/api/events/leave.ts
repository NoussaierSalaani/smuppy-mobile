/**
 * Leave Event Lambda Handler
 * Leave an event the user has joined
 * POST /events/{eventId}/leave
 */

import { cors } from '../utils/cors';
import { createEventActionHandler } from '../utils/create-event-action-handler';

export const { handler } = createEventActionHandler({
  action: 'leave',
  loggerName: 'events-leave',
  rateLimitPrefix: 'event-leave',
  rateLimitMax: 10,
  eventColumns: 'id, title, status, creator_id, max_participants',
  onAction: async ({ client, eventData, profileId, eventId }) => {
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
  },
});

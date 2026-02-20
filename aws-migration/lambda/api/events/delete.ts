/**
 * Cancel Event Lambda Handler
 * Soft-delete (cancel) an event — creator only
 * POST /events/{eventId}/cancel
 */

import { createDeleteHandler } from '../utils/create-delete-handler';
import { requireActiveAccount, isAccountError } from '../utils/account-status';
import { RATE_WINDOW_1_MIN } from '../utils/constants';

export const handler = createDeleteHandler({
  resourceName: 'Event',
  resourceTable: 'events',
  loggerName: 'events-delete',
  ownershipField: 'creator_id',
  selectColumns: 'id, creator_id, title, status',
  pathParam: 'eventId',
  rateLimitPrefix: 'event-cancel',
  rateLimitMax: 5,
  rateLimitWindow: RATE_WINDOW_1_MIN,

  async afterAuth(userId, headers) {
    const accountCheck = await requireActiveAccount(userId, headers);
    if (isAccountError(accountCheck)) {
      return { statusCode: accountCheck.statusCode, headers, body: accountCheck.body };
    }
    return null;
  },

  async checkOwnership(resource, profileId, headers) {
    if (resource.creator_id !== profileId) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ success: false, message: 'Event not found or you are not the creator' }),
      };
    }

    if (resource.status === 'cancelled') {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ success: false, message: 'Event is already cancelled' }),
      };
    }

    return null;
  },

  async onDelete({ client, resource, resourceId, profileId }) {
    const eventTitle = resource.title as string;

    // Soft delete: set status to cancelled
    await client.query(
      `UPDATE events SET status = 'cancelled', updated_at = NOW()
       WHERE id = $1 AND creator_id = $2`,
      [resourceId, profileId],
    );

    // Cancel all pending/registered participants
    await client.query(
      `UPDATE event_participants SET status = 'cancelled'
       WHERE event_id = $1 AND status IN ('registered', 'confirmed')`,
      [resourceId],
    );

    // Notify all affected participants about the cancellation
    const participantsResult = await client.query(
      `SELECT user_id FROM event_participants
       WHERE event_id = $1 AND user_id != $2
       AND status = 'cancelled'`,
      [resourceId, profileId],
    );

    if (participantsResult.rows.length > 0) {
      // Build bulk notification insert
      const notificationValues: string[] = [];
      const notificationParams: (string | null)[] = [];
      let paramIdx = 0;

      for (const row of participantsResult.rows) {
        const userIdIdx = ++paramIdx;
        const bodyIdx = ++paramIdx;
        const dataIdx = ++paramIdx;
        notificationValues.push(
          `($${userIdIdx}, 'event_cancellation', 'Event Cancelled', $${bodyIdx}, $${dataIdx})`,
        );
        notificationParams.push(
          row.user_id,
          `The event "${eventTitle}" has been cancelled by the organizer.`,
          JSON.stringify({ eventId: resourceId, eventTitle }),
        );
      }

      await client.query(
        `INSERT INTO notifications (user_id, type, title, body, data)
         VALUES ${notificationValues.join(', ')}`,
        notificationParams,
      );
    }
  },
});

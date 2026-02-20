/**
 * Cancel Group Lambda Handler
 * Soft-delete a group by setting status to 'cancelled' (creator only)
 */

import { createDeleteHandler } from '../utils/create-delete-handler';
import { requireActiveAccount, isAccountError } from '../utils/account-status';
import { RATE_WINDOW_1_MIN } from '../utils/constants';

export const handler = createDeleteHandler({
  resourceName: 'Group',
  resourceTable: 'groups',
  loggerName: 'groups-cancel',
  ownershipField: 'creator_id',
  selectColumns: 'id, creator_id, status',
  rateLimitPrefix: 'group-cancel',
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
        statusCode: 403,
        headers,
        body: JSON.stringify({ success: false, message: 'Only the group creator can cancel the group' }),
      };
    }

    if (resource.status === 'cancelled') {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ success: false, message: 'Group is already cancelled' }),
      };
    }

    return null;
  },

  async onDelete({ client, resourceId, profileId }) {
    // Soft delete: set status to cancelled
    await client.query(
      `UPDATE groups SET status = 'cancelled', updated_at = NOW()
       WHERE id = $1 AND creator_id = $2`,
      [resourceId, profileId],
    );

    // Remove all participants
    await client.query(
      'DELETE FROM group_participants WHERE group_id = $1',
      [resourceId],
    );
  },
});

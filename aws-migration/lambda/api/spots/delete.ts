/**
 * Delete Spot Lambda Handler
 * Deletes a spot (owner only)
 */

import { createDeleteHandler } from '../utils/create-delete-handler';
import { RATE_WINDOW_1_MIN } from '../utils/constants';

export const handler = createDeleteHandler({
  resourceName: 'Spot',
  resourceTable: 'spots',
  loggerName: 'spots-delete',
  ownershipField: 'creator_id',
  selectColumns: 'id, creator_id',
  rateLimitPrefix: 'spot-delete',
  rateLimitMax: 10,
  rateLimitWindow: RATE_WINDOW_1_MIN,

  async onDelete({ client, resourceId }) {
    await client.query('DELETE FROM spots WHERE id = $1', [resourceId]);
  },
});

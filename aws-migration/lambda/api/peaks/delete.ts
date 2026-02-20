/**
 * Delete Peak Lambda Handler
 * Deletes a peak, cleans up S3 media, and removes orphaned notifications
 */

import { createDeleteHandler } from '../utils/create-delete-handler';
import { cleanupMedia } from '../utils/media-cleanup';
import { RATE_WINDOW_1_MIN } from '../utils/constants';

export const handler = createDeleteHandler({
  resourceName: 'Peak',
  resourceTable: 'peaks',
  loggerName: 'peaks-delete',
  ownershipField: 'author_id',
  selectColumns: 'id, author_id, video_url, thumbnail_url',
  rateLimitPrefix: 'peak-delete',
  rateLimitMax: 10,
  rateLimitWindow: RATE_WINDOW_1_MIN,

  async onDelete({ client, resourceId }) {
    // Clean up orphaned notifications referencing this peak (no FK constraint on JSONB data)
    await client.query(
      `DELETE FROM notifications WHERE data->>'peakId' = $1`,
      [resourceId],
    );

    // Delete peak (CASCADE will handle likes, comments, reactions, tags, views, reports, hashtags)
    await client.query('DELETE FROM peaks WHERE id = $1', [resourceId]);
  },

  async afterCommit({ resource, resourceId }) {
    await cleanupMedia({
      urls: [resource.video_url as string, resource.thumbnail_url as string],
      callerPrefix: 'peak-delete',
      resourceId,
    });
  },
});

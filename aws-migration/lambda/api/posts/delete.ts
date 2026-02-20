/**
 * Delete Post Lambda Handler
 * Deletes a post, cleans up S3 media, and removes orphaned notifications
 */

import { createDeleteHandler } from '../utils/create-delete-handler';
import { cleanupMedia } from '../utils/media-cleanup';
import { RATE_WINDOW_1_MIN } from '../utils/constants';

export const handler = createDeleteHandler({
  resourceName: 'Post',
  resourceTable: 'posts',
  loggerName: 'posts-delete',
  ownershipField: 'author_id',
  selectColumns: 'id, author_id, media_urls, media_url, media_meta',
  rateLimitPrefix: 'post-delete',
  rateLimitMax: 10,
  rateLimitWindow: RATE_WINDOW_1_MIN,

  async onDelete({ client, resourceId }) {
    // Clean up orphaned notifications referencing this post (no FK constraint on JSONB data)
    await client.query(
      `DELETE FROM notifications WHERE data->>'postId' = $1`,
      [resourceId],
    );

    // Delete the post (CASCADE handles likes, comments, saved_posts, reports, tags, views)
    // DB trigger auto-decrements post_count on profiles
    await client.query('DELETE FROM posts WHERE id = $1', [resourceId]);
  },

  async afterCommit({ resource, resourceId }) {
    const allUrls = [
      ...(Array.isArray(resource.media_urls) ? (resource.media_urls as string[]) : []),
      resource.media_url as string | undefined,
    ];

    await cleanupMedia({
      urls: allUrls,
      callerPrefix: 'post-delete',
      resourceId,
    });
  },
});

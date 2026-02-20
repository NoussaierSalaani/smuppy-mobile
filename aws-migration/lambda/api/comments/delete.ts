/**
 * Delete Comment Lambda Handler
 * Deletes a comment and its replies, atomically updates post comments_count.
 * Authorization: comment owner OR post owner can delete.
 */

import { APIGatewayProxyResult } from 'aws-lambda';
import { Pool } from 'pg';
import { createDeleteHandler, ResourceRow } from '../utils/create-delete-handler';
import { RATE_WINDOW_1_MIN } from '../utils/constants';

export const handler = createDeleteHandler({
  resourceName: 'Comment',
  resourceTable: 'comments',
  loggerName: 'comments-delete',
  ownershipField: 'user_id',
  selectColumns: 'id, user_id, post_id',
  rateLimitPrefix: 'comment-delete',
  rateLimitMax: 20,
  rateLimitWindow: RATE_WINDOW_1_MIN,

  /**
   * Custom ownership: comment owner OR post owner can delete.
   */
  async checkOwnership(
    resource: ResourceRow,
    profileId: string,
    headers: Record<string, string>,
    ctx: { db: Pool },
  ): Promise<APIGatewayProxyResult | null> {
    const isCommentOwner = resource.user_id === profileId;
    if (isCommentOwner) return null;

    // Check if the user owns the post this comment belongs to
    const postResult = await ctx.db.query(
      'SELECT author_id FROM posts WHERE id = $1',
      [resource.post_id as string],
    );
    const isPostOwner = postResult.rows.length > 0 && postResult.rows[0].author_id === profileId;
    if (isPostOwner) return null;

    return {
      statusCode: 403,
      headers,
      body: JSON.stringify({ message: 'Not authorized to delete this comment' }),
    };
  },

  async onDelete({ client, resourceId }) {
    // Clean up notifications referencing this comment or its replies
    const replyIds = await client.query(
      'SELECT id FROM comments WHERE id = $1 OR parent_comment_id = $1',
      [resourceId],
    );
    const commentIds = replyIds.rows.map((r: { id: string }) => r.id);
    if (commentIds.length > 0) {
      await client.query(
        `DELETE FROM notifications WHERE data->>'commentId' = ANY($1::text[])`,
        [commentIds],
      );
    }

    // Atomic delete: remove comment + all replies
    // Counter update handled atomically by trigger_comments_count (migration-015)
    await client.query(
      'DELETE FROM comments WHERE id = $1 OR parent_comment_id = $1',
      [resourceId],
    );
  },
});

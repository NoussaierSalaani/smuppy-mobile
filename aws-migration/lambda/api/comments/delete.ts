/**
 * Delete Comment Lambda Handler
 * Deletes a comment (only author can delete)
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getPool } from '../../shared/db';
import { createHeaders } from '../utils/cors';
import { createLogger, getRequestId } from '../utils/logger';

const log = createLogger('comments-delete');

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const headers = createHeaders(event);

  try {
    const userId = event.requestContext.authorizer?.claims?.sub;
    if (!userId) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ message: 'Unauthorized' }),
      };
    }

    const commentId = event.pathParameters?.id;
    if (!commentId) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ message: 'Comment ID is required' }),
      };
    }

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(commentId)) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ message: 'Invalid comment ID format' }),
      };
    }

    const db = await getPool();

    // Get user's profile ID (check both id and cognito_sub for consistency)
    const userResult = await db.query(
      'SELECT id FROM profiles WHERE cognito_sub = $1',
      [userId]
    );

    if (userResult.rows.length === 0) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ message: 'User profile not found' }),
      };
    }

    const profileId = userResult.rows[0].id;

    // Check if comment exists and get details
    const commentResult = await db.query(
      'SELECT id, user_id, post_id FROM comments WHERE id = $1',
      [commentId]
    );

    if (commentResult.rows.length === 0) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ message: 'Comment not found' }),
      };
    }

    const comment = commentResult.rows[0];

    // Check if user owns the comment or the post
    const postResult = await db.query(
      'SELECT author_id FROM posts WHERE id = $1',
      [comment.post_id]
    );

    const isCommentOwner = comment.user_id === profileId;
    const isPostOwner = postResult.rows.length > 0 && postResult.rows[0].author_id === profileId;

    if (!isCommentOwner && !isPostOwner) {
      return {
        statusCode: 403,
        headers,
        body: JSON.stringify({ message: 'Not authorized to delete this comment' }),
      };
    }

    // Delete comment in transaction
    // CRITICAL: Use dedicated client for transaction isolation with connection pooling
    const client = await db.connect();

    try {
      await client.query('BEGIN');

      // Count child comments that will be deleted (CASCADE)
      const childCount = await client.query(
        'SELECT COUNT(*) as count FROM comments WHERE parent_comment_id = $1',
        [commentId]
      );

      const totalDeleted = 1 + parseInt(childCount.rows[0].count);

      // Delete the comment (CASCADE will handle replies)
      await client.query('DELETE FROM comments WHERE id = $1', [commentId]);

      // Update comments count on post
      await client.query(
        'UPDATE posts SET comments_count = GREATEST(comments_count - $1, 0) WHERE id = $2',
        [totalDeleted, comment.post_id]
      );

      await client.query('COMMIT');

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          message: 'Comment deleted successfully',
        }),
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error: any) {
    log.error('Error deleting comment', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ message: 'Internal server error' }),
    };
  }
}

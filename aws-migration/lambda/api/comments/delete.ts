/**
 * Delete Comment Lambda Handler
 * Deletes a comment and its replies, atomically updates post comments_count
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getPool } from '../../shared/db';
import { createHeaders } from '../utils/cors';
import { createLogger } from '../utils/logger';
import { requireAuth, validateUUIDParam, isErrorResponse } from '../utils/validators';
import { checkRateLimit } from '../utils/rate-limit';

const log = createLogger('comments-delete');

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const headers = createHeaders(event);

  try {
    const userId = requireAuth(event, headers);
    if (isErrorResponse(userId)) return userId;

    const { allowed } = await checkRateLimit({ prefix: 'comment-delete', identifier: userId, windowSeconds: 60, maxRequests: 20 });
    if (!allowed) {
      return { statusCode: 429, headers, body: JSON.stringify({ message: 'Too many requests. Please try again later.' }) };
    }

    const commentId = validateUUIDParam(event, headers, 'id', 'Comment');
    if (isErrorResponse(commentId)) return commentId;

    const db = await getPool();

    // Get user's profile ID
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

      // Atomic delete: remove comment + all replies, get exact count via RETURNING
      const deleteResult = await client.query(
        'DELETE FROM comments WHERE id = $1 OR parent_comment_id = $1 RETURNING id',
        [commentId]
      );

      const totalDeleted = deleteResult.rowCount || 0;

      // Update comments count on post using the exact deleted count
      if (totalDeleted > 0) {
        await client.query(
          'UPDATE posts SET comments_count = GREATEST(comments_count - $1, 0) WHERE id = $2',
          [totalDeleted, comment.post_id]
        );
      }

      await client.query('COMMIT');

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          message: 'Comment deleted successfully',
        }),
      };
    } catch (error: unknown) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error: unknown) {
    log.error('Error deleting comment', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ message: 'Internal server error' }),
    };
  }
}

/**
 * List Comments Lambda Handler
 * Returns comments for a post with pagination
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getPool } from '../../shared/db';
import { createHeaders } from '../utils/cors';

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const headers = createHeaders(event);

  try {
    const postId = event.pathParameters?.id;
    if (!postId) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ message: 'Post ID is required' }),
      };
    }

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(postId)) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ message: 'Invalid post ID format' }),
      };
    }

    // Pagination params
    const limit = Math.min(parseInt(event.queryStringParameters?.limit || '20'), 50);
    const cursor = event.queryStringParameters?.cursor;

    const db = await getPool();

    // Check if post exists
    const postResult = await db.query(
      'SELECT id FROM posts WHERE id = $1',
      [postId]
    );

    if (postResult.rows.length === 0) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ message: 'Post not found' }),
      };
    }

    // Build query
    let query = `
      SELECT
        c.id,
        c.text,
        c.parent_comment_id,
        c.created_at,
        c.updated_at,
        p.id as author_id,
        p.username as author_username,
        p.full_name as author_full_name,
        p.avatar_url as author_avatar_url,
        p.is_verified as author_is_verified
      FROM comments c
      JOIN profiles p ON c.user_id = p.id
      WHERE c.post_id = $1
    `;

    const params: any[] = [postId];
    let paramIndex = 2;

    // Cursor pagination
    if (cursor) {
      query += ` AND c.created_at < $${paramIndex}`;
      params.push(new Date(parseInt(cursor)));
      paramIndex++;
    }

    query += ` ORDER BY c.created_at DESC LIMIT $${paramIndex}`;
    params.push(limit + 1);

    const result = await db.query(query, params);

    // Check if there are more results
    const hasMore = result.rows.length > limit;
    const comments = hasMore ? result.rows.slice(0, -1) : result.rows;

    // Format response
    const formattedComments = comments.map(comment => ({
      id: comment.id,
      text: comment.text,
      parentCommentId: comment.parent_comment_id,
      createdAt: comment.created_at,
      updatedAt: comment.updated_at,
      author: {
        id: comment.author_id,
        username: comment.author_username,
        fullName: comment.author_full_name,
        avatarUrl: comment.author_avatar_url,
        isVerified: comment.author_is_verified || false,
      },
    }));

    // Generate next cursor
    const nextCursor = hasMore && comments.length > 0
      ? new Date(comments[comments.length - 1].created_at).getTime().toString()
      : null;

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        comments: formattedComments,
        cursor: nextCursor,
        hasMore,
      }),
    };
  } catch (error: any) {
    console.error('Error listing comments:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ message: 'Internal server error' }),
    };
  }
}

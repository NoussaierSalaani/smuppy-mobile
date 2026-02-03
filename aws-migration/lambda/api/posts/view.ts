/**
 * Record Post View Lambda Handler
 * Tracks unique views per user per post and increments views_count.
 * Uses a post_views dedup table (created if missing) with ON CONFLICT DO NOTHING.
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getPool } from '../../shared/db';
import { createHeaders } from '../utils/cors';
import { createLogger } from '../utils/logger';
import { requireAuth, validateUUIDParam, isErrorResponse } from '../utils/validators';

const log = createLogger('posts-view');

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const headers = createHeaders(event);

  try {
    // Auth required
    const cognitoSub = requireAuth(event, headers);
    if (isErrorResponse(cognitoSub)) return cognitoSub;

    // Get post ID from path
    const postId = validateUUIDParam(event, headers, 'id', 'Post');
    if (isErrorResponse(postId)) return postId;

    const db = await getPool();

    // Resolve viewer profile ID
    const userResult = await db.query(
      'SELECT id FROM profiles WHERE cognito_sub = $1',
      [cognitoSub]
    );

    if (userResult.rows.length === 0) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ message: 'Profile not found' }),
      };
    }

    const viewerId = userResult.rows[0].id;

    // Ensure post_views table exists (idempotent)
    await db.query(`
      CREATE TABLE IF NOT EXISTS post_views (
        post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
        user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        PRIMARY KEY (post_id, user_id)
      )
    `);

    // Insert unique view (dedup by post_id + user_id)
    const result = await db.query(
      `INSERT INTO post_views (post_id, user_id) VALUES ($1, $2)
       ON CONFLICT (post_id, user_id) DO NOTHING`,
      [postId, viewerId]
    );

    // Only increment views_count if this was a new view
    if (result.rowCount && result.rowCount > 0) {
      await db.query(
        'UPDATE posts SET views_count = views_count + 1 WHERE id = $1',
        [postId]
      );
    }

    // Get updated count
    const countResult = await db.query(
      'SELECT views_count FROM posts WHERE id = $1',
      [postId]
    );

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        viewsCount: countResult.rows[0]?.views_count || 0,
      }),
    };
  } catch (error: unknown) {
    log.error('Error recording post view', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ message: 'Internal server error' }),
    };
  }
}

/**
 * Record Post View Lambda Handler
 * Tracks unique views per user per post and increments views_count.
 * Uses post_views dedup table (migration-037) with ON CONFLICT DO NOTHING.
 * INSERT + UPDATE are wrapped in a transaction for atomicity.
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getPool } from '../../shared/db';
import { requireAuth, validateUUIDParam, isErrorResponse } from '../utils/validators';
import { resolveProfileId } from '../utils/auth';
import { requireRateLimit } from '../utils/rate-limit';
import { withErrorHandler } from '../utils/error-handler';

export const handler = withErrorHandler('posts-view', async (event, { headers, log }) => {
    // Auth required
    const cognitoSub = requireAuth(event, headers);
    if (isErrorResponse(cognitoSub)) return cognitoSub;

    // Rate limit: 60 view recordings per minute
    const rateLimitResponse = await requireRateLimit({ prefix: 'post-view', identifier: cognitoSub as string, maxRequests: 60, windowSeconds: 60 }, headers);
    if (rateLimitResponse) return rateLimitResponse;

    // Get post ID from path
    const postId = validateUUIDParam(event, headers, 'id', 'Post');
    if (isErrorResponse(postId)) return postId;

    const db = await getPool();

    // Resolve viewer profile ID
    const viewerId = await resolveProfileId(db, cognitoSub);

    if (!viewerId) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ message: 'Profile not found' }),
      };
    }

    // Verify post exists before recording view
    const postExists = await db.query(
      'SELECT EXISTS(SELECT 1 FROM posts WHERE id = $1) AS exists',
      [postId]
    );

    if (!postExists.rows[0]?.exists) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ message: 'Post not found' }),
      };
    }

    // Use a transaction to keep INSERT + UPDATE atomic
    const client = await db.connect();
    let viewsCount = 0;

    try {
      await client.query('BEGIN');

      // Insert unique view (dedup by post_id + user_id)
      const result = await client.query(
        `INSERT INTO post_views (post_id, user_id) VALUES ($1, $2)
         ON CONFLICT (post_id, user_id) DO NOTHING`,
        [postId, viewerId]
      );

      // Only increment views_count if this was a new view
      if (result.rowCount && result.rowCount > 0) {
        const updated = await client.query(
          'UPDATE posts SET views_count = views_count + 1 WHERE id = $1 RETURNING views_count',
          [postId]
        );
        viewsCount = updated.rows[0]?.views_count || 0;
      } else {
        // Already viewed — just read current count
        const current = await client.query(
          'SELECT views_count FROM posts WHERE id = $1',
          [postId]
        );
        viewsCount = current.rows[0]?.views_count || 0;
      }

      await client.query('COMMIT');
    } catch (txErr) {
      await client.query('ROLLBACK');
      throw txErr;
    } finally {
      client.release();
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        viewsCount,
      }),
    };
});

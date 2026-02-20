/**
 * Check if Post is Saved Lambda Handler
 * Returns whether the current user has saved/bookmarked a post
 */

import { getPool } from '../../shared/db';
import { withErrorHandler } from '../utils/error-handler';
import { isValidUUID } from '../utils/security';
import { resolveProfileId } from '../utils/auth';

export const handler = withErrorHandler('posts-is-saved', async (event, { headers }) => {
    const userId = event.requestContext.authorizer?.claims?.sub;
    if (!userId) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ message: 'Unauthorized' }),
      };
    }

    const postId = event.pathParameters?.id;
    if (!postId) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ message: 'Post ID is required' }),
      };
    }

    // Validate UUID format
    if (!isValidUUID(postId)) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ message: 'Invalid post ID format' }),
      };
    }

    const db = await getPool();

    // Get user's profile ID
    const profileId = await resolveProfileId(db, userId);

    if (!profileId) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ message: 'User profile not found' }),
      };
    }

    // Check if post is saved
    const savedResult = await db.query(
      'SELECT id, created_at FROM saved_posts WHERE user_id = $1 AND post_id = $2',
      [profileId, postId]
    );

    const isSaved = savedResult.rows.length > 0;

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        saved: isSaved,
        savedAt: isSaved ? savedResult.rows[0].created_at : null,
      }),
    };
});

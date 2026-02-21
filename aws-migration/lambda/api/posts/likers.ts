/**
 * Post Likers Lambda Handler
 * Returns paginated list of users who liked a specific post
 */

import { withAuthHandler } from '../utils/with-auth-handler';
import { validateUUIDParam, isErrorResponse } from '../utils/validators';
import { requireRateLimit } from '../utils/rate-limit';
import { RATE_WINDOW_1_MIN } from '../utils/constants';
import { blockExclusionSQL } from '../utils/block-filter';
import { parseLimit, applyHasMore } from '../utils/pagination';
import { parseCursor, cursorToSql, generateCursor } from '../utils/cursor';

export const handler = withAuthHandler('posts-likers', async (event, { headers, cognitoSub, profileId, db }) => {
    // Rate limit: anti-scraping of social data
    const rateLimitResponse = await requireRateLimit({
      prefix: 'posts-likers',
      identifier: profileId,
      windowSeconds: RATE_WINDOW_1_MIN,
      maxRequests: 30,
      failOpen: true,
    }, headers);
    if (rateLimitResponse) return rateLimitResponse;

    // Validate post ID
    const postId = validateUUIDParam(event, headers, 'id', 'Post');
    if (isErrorResponse(postId)) return postId;

    // Parse pagination params
    const { limit: limitStr, cursor } = event.queryStringParameters || {};
    const limit = parseLimit(limitStr);
    const parsedCursor = parseCursor(cursor, 'timestamp-ms');

    // Verify post exists and check privacy
    const postResult = await db.query(
      `SELECT p.id, p.author_id, pr.is_private, pr.cognito_sub as author_cognito_sub
       FROM posts p
       LEFT JOIN profiles pr ON p.author_id = pr.id
       WHERE p.id = $1`,
      [postId]
    );

    if (postResult.rows.length === 0) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ message: 'Post not found' }),
      };
    }

    const post = postResult.rows[0];

    // Privacy check: if author has a private account, only author or followers can see likers
    if (post.is_private) {
      const isAuthor = cognitoSub === post.author_cognito_sub;

      if (!isAuthor) {
        const followCheck = await db.query(
          `SELECT 1 FROM follows f
           JOIN profiles p ON f.follower_id = p.id
           WHERE p.cognito_sub = $1 AND f.following_id = $2 AND f.status = 'accepted'
           LIMIT 1`,
          [cognitoSub, post.author_id]
        );

        if (followCheck.rows.length === 0) {
          return {
            statusCode: 403,
            headers,
            body: JSON.stringify({ message: 'This post is from a private account' }),
          };
        }
      }
    }

    // Build query for likers with cursor-based pagination
    const params: (string | number | Date)[] = [postId];
    let paramIndex = 2;
    let cursorCondition = '';

    if (parsedCursor) {
      const sql = cursorToSql(parsedCursor, 'l.created_at', paramIndex);
      cursorCondition = sql.condition;
      params.push(...sql.params);
      paramIndex += sql.params.length;
    }

    // Block filtering using profileId from withAuthHandler
    params.push(profileId);
    const blockParamIdx = paramIndex;
    paramIndex++;
    const blockClause = blockExclusionSQL(blockParamIdx, 'p.id');

    params.push(limit + 1);

    const likersResult = await db.query(
      `SELECT
        p.id,
        p.username,
        p.full_name,
        p.avatar_url,
        p.is_verified,
        p.account_type,
        p.business_name,
        l.created_at as liked_at
      FROM likes l
      INNER JOIN profiles p ON p.id = l.user_id
      WHERE l.post_id = $1${cursorCondition} ${blockClause}
      ORDER BY l.created_at DESC
      LIMIT $${paramIndex}`,
      params
    );

    const { data: likers, hasMore } = applyHasMore(likersResult.rows, limit);

    const nextCursor = hasMore
      ? generateCursor('timestamp-ms', likers.at(-1)! as Record<string, unknown>, 'liked_at')
      : null;

    // Map to camelCase response
    const data = likers.map((row: { id: string; username: string; full_name: string; avatar_url: string | null; is_verified: boolean; account_type: string; business_name: string | null; liked_at: string }) => ({
      id: row.id,
      username: row.username,
      fullName: row.full_name,
      avatarUrl: row.avatar_url,
      isVerified: row.is_verified,
      accountType: row.account_type,
      businessName: row.business_name,
    }));

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        data,
        nextCursor,
        hasMore,
      }),
    };
});

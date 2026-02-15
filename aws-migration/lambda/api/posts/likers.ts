/**
 * Post Likers Lambda Handler
 * Returns paginated list of users who liked a specific post
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getReaderPool } from '../../shared/db';
import { createHeaders } from '../utils/cors';
import { createLogger } from '../utils/logger';
import { requireAuth, validateUUIDParam, isErrorResponse } from '../utils/validators';

const log = createLogger('posts-likers');

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const headers = createHeaders(event);

  try {
    // Auth check
    const cognitoSub = requireAuth(event, headers);
    if (isErrorResponse(cognitoSub)) return cognitoSub;

    // Validate post ID
    const postId = validateUUIDParam(event, headers, 'id', 'Post');
    if (isErrorResponse(postId)) return postId;

    // Parse pagination params
    const { limit: limitStr, cursor } = event.queryStringParameters || {};
    const limit = Math.min(Math.max(parseInt(limitStr || '20', 10) || 20, 1), 50);

    // Validate cursor if provided
    if (cursor) {
      const parsed = parseInt(cursor, 10);
      if (isNaN(parsed) || parsed < 0) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ message: 'Invalid cursor parameter' }),
        };
      }
    }

    const db = await getReaderPool();

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
    const params: (string | number | Date)[] = [postId, limit + 1];
    let cursorClause = '';

    if (cursor) {
      cursorClause = 'AND l.created_at < $3';
      params.push(new Date(parseInt(cursor, 10)));
    }

    // SECURITY: Resolve requester profile for block filtering
    let blockClause = '';
    const requesterResult = await db.query(
      'SELECT id FROM profiles WHERE cognito_sub = $1',
      [cognitoSub]
    );
    const requesterProfileId = requesterResult.rows[0]?.id || null;
    if (requesterProfileId) {
      params.push(requesterProfileId);
      const blockParamIdx = params.length;
      blockClause = `AND NOT EXISTS (
        SELECT 1 FROM blocked_users bu
        WHERE (bu.blocker_id = $${blockParamIdx} AND bu.blocked_id = p.id)
           OR (bu.blocker_id = p.id AND bu.blocked_id = $${blockParamIdx})
      )`;
    }

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
      WHERE l.post_id = $1 ${cursorClause} ${blockClause}
      ORDER BY l.created_at DESC
      LIMIT $2`,
      params
    );

    const hasMore = likersResult.rows.length > limit;
    const likers = hasMore ? likersResult.rows.slice(0, limit) : likersResult.rows;

    const nextCursor = hasMore
      ? new Date(likers[likers.length - 1].liked_at).getTime().toString()
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
  } catch (error: unknown) {
    log.error('Error fetching post likers', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ message: 'Internal server error' }),
    };
  }
}

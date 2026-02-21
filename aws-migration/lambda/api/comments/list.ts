/**
 * List Comments Lambda Handler
 * Returns comments for a post with pagination
 */

import { getPool, SqlParam } from '../../shared/db';
import { isValidUUID, extractCognitoSub } from '../utils/security';
import { requireRateLimit } from '../utils/rate-limit';
import { RATE_WINDOW_1_MIN } from '../utils/constants';
import { withErrorHandler } from '../utils/error-handler';
import { parseLimit, applyHasMore } from '../utils/pagination';
import { parseCursor, cursorToSql, generateCursor } from '../utils/cursor';
import { blockExclusionSQL, muteExclusionSQL } from '../utils/block-filter';
import { mapAuthor } from '../utils/mappers';

// ── Query builder ───────────────────────────────────────────────────

const BASE_QUERY = `
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
        p.is_verified as author_is_verified,
        p.account_type as author_account_type,
        p.business_name as author_business_name
      FROM comments c
      JOIN profiles p ON c.user_id = p.id
      WHERE c.post_id = $1
        AND (p.moderation_status NOT IN ('banned', 'shadow_banned') OR c.user_id = $2)`;

function buildBlockMuteFilter(requesterId: string | null): string {
  if (!requesterId) return '';
  return blockExclusionSQL(2, 'c.user_id') + muteExclusionSQL(2, 'c.user_id');
}

// ── Row formatter ───────────────────────────────────────────────────

function formatComment(comment: Record<string, unknown>): Record<string, unknown> {
  return {
    id: comment.id,
    text: comment.text,
    parentCommentId: comment.parent_comment_id,
    createdAt: comment.created_at,
    updatedAt: comment.updated_at,
    author: mapAuthor(comment),
  };
}

// ── Main Handler ────────────────────────────────────────────────────

export const handler = withErrorHandler('comments-list', async (event, { headers }) => {
    const postId = event.pathParameters?.id;
    if (!postId) {
      return { statusCode: 400, headers, body: JSON.stringify({ message: 'Post ID is required' }) };
    }

    if (!isValidUUID(postId)) {
      return { statusCode: 400, headers, body: JSON.stringify({ message: 'Invalid post ID format' }) };
    }

    // Rate limit: anti-scraping
    const rateLimitId = extractCognitoSub(event)
      || event.requestContext.identity?.sourceIp || 'anonymous';
    const rateLimitResponse = await requireRateLimit({
      prefix: 'comments-list',
      identifier: rateLimitId,
      windowSeconds: RATE_WINDOW_1_MIN,
      maxRequests: 30,
      failOpen: true,
    }, headers);
    if (rateLimitResponse) return rateLimitResponse;

    const limit = parseLimit(event.queryStringParameters?.limit);
    const parsed = parseCursor(event.queryStringParameters?.cursor, 'timestamp-ms');

    const db = await getPool();

    // Check if post exists
    const postResult = await db.query('SELECT id FROM posts WHERE id = $1', [postId]);
    if (postResult.rows.length === 0) {
      return { statusCode: 404, headers, body: JSON.stringify({ message: 'Post not found' }) };
    }

    // Resolve requester profile for shadow-ban self-view
    const cognitoSub = extractCognitoSub(event);
    let requesterId: string | null = null;
    if (cognitoSub) {
      const requesterResult = await db.query('SELECT id FROM profiles WHERE cognito_sub = $1', [cognitoSub]);
      requesterId = requesterResult.rows[0]?.id || null;
    }

    // Build query
    let query = BASE_QUERY + buildBlockMuteFilter(requesterId);

    const params: SqlParam[] = [postId, requesterId];
    let paramIndex = 3;

    // Cursor pagination (tolerant: invalid cursor -> first page)
    if (parsed) {
      const cursorSql = cursorToSql(parsed, 'c.created_at', paramIndex);
      query += ` ${cursorSql.condition}`;
      params.push(...cursorSql.params);
      paramIndex += cursorSql.params.length;
    }

    query += ` ORDER BY c.created_at DESC, c.id DESC LIMIT $${paramIndex}`;
    params.push(limit + 1);

    const result = await db.query(query, params);
    const { data: comments, hasMore } = applyHasMore(result.rows, limit);

    const formattedComments = comments.map((c: Record<string, unknown>) => formatComment(c));

    const nextCursor = hasMore && comments.length > 0
      ? generateCursor('timestamp-ms', comments.at(-1)!, 'created_at')
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
});

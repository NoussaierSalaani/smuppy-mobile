/**
 * Posts Search Lambda
 * Full-text search on posts with ILIKE fallback
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getPool } from '../../shared/db';
import { createHeaders } from '../utils/cors';
import { createLogger } from '../utils/logger';
import { checkRateLimit } from '../utils/rate-limit';
import { MAX_SEARCH_QUERY_LENGTH, RATE_WINDOW_1_MIN } from '../utils/constants';

const log = createLogger('posts-search');
const MAX_LIMIT = 50;

function sanitizeQuery(raw: string): string {
  const CONTROL_CHARS = /[\x00-\x1F\x7F]/g;
  const sanitized = raw.replace(/<[^>]*>/g, '').replace(CONTROL_CHARS, '').trim().substring(0, MAX_SEARCH_QUERY_LENGTH);
  // SECURITY: Escape ILIKE special characters to prevent wildcard injection
  return sanitized.replace(/[%_\\]/g, '\\$&');
}

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const headers = createHeaders(event);

  // Rate limiting - use cognito_sub (authenticated user) or IP (anonymous)
  const userId = event.requestContext.authorizer?.claims?.sub;
  const clientIp = event.requestContext.identity?.sourceIp;

  const { allowed } = await checkRateLimit({
    prefix: 'posts-search',
    identifier: userId || clientIp || 'anonymous',
    windowSeconds: RATE_WINDOW_1_MIN,
    maxRequests: 30,
  });
  if (!allowed) {
    return { statusCode: 429, headers, body: JSON.stringify({ success: false, message: 'Too many search requests. Please wait.' }) };
  }

  try {
    const q = event.queryStringParameters?.q || '';
    const limit = event.queryStringParameters?.limit || '20';
    const cursor = event.queryStringParameters?.cursor;

    const sanitized = sanitizeQuery(q);
    if (!sanitized) {
      return { statusCode: 400, headers: { ...headers, 'Cache-Control': 'no-cache' }, body: JSON.stringify({ success: false, error: 'Search query is required' }) };
    }

    const parsedLimit = Math.min(Math.max(parseInt(limit) || 20, 1), MAX_LIMIT);

    const cognitoSub = event.requestContext.authorizer?.claims?.sub;
    const pool = await getPool();

    // Resolve requester profile if authenticated
    let requesterId: string | null = null;
    if (cognitoSub) {
      const userResult = await pool.query(
        'SELECT id FROM profiles WHERE cognito_sub = $1',
        [cognitoSub]
      );
      requesterId = userResult.rows[0]?.id || null;
    }

    // Build cursor condition
    let cursorCondition = '';
    const cursorParams: string[] = [];
    if (cursor) {
      const parsedDate = new Date(cursor);
      if (isNaN(parsedDate.getTime())) {
        return { statusCode: 400, headers, body: JSON.stringify({ success: false, error: 'Invalid cursor format' }) };
      }
      cursorParams.push(parsedDate.toISOString());
    }

    // Try full-text search first, fallback to ILIKE
    let result;
    try {
      // Build params: $1=query, $2=limit+1, ($3=cursor if present), ($N=requesterId if present)
      const params: (string | number)[] = [sanitized];
      let cursorIdx = '';
      if (cursorParams.length > 0) {
        params.push(cursorParams[0]);
        cursorIdx = `AND p.created_at < $${params.length}::timestamptz`;
      }
      params.push(parsedLimit + 1);
      const limitIdx = params.length;
      if (requesterId) params.push(requesterId);

      const ftsQuery = `
        SELECT p.id, p.author_id as "authorId", p.content, p.media_urls as "mediaUrls",
               p.media_type as "mediaType", p.likes_count as "likesCount",
               p.comments_count as "commentsCount", p.created_at as "createdAt",
               pr.username, pr.full_name as "fullName", pr.avatar_url as "avatarUrl",
               pr.is_verified as "isVerified", pr.account_type as "accountType",
               pr.business_name as "businessName"
               ${requesterId ? `, EXISTS(SELECT 1 FROM likes l WHERE l.post_id = p.id AND l.user_id = $${params.length}) as "isLiked"` : ''}
        FROM posts p
        JOIN profiles pr ON p.author_id = pr.id
        WHERE to_tsvector('english', p.content) @@ plainto_tsquery('english', $1)
          AND pr.moderation_status NOT IN ('banned', 'shadow_banned')
          AND p.visibility = 'public'
          ${cursorIdx}
        ORDER BY p.created_at DESC, p.id DESC
        LIMIT $${limitIdx}
      `;

      result = await pool.query(ftsQuery, params);
    } catch {
      // Fallback to ILIKE if tsquery fails
      log.info('FTS failed, falling back to ILIKE', { query: sanitized.substring(0, 2) + '***' });

      const params: (string | number)[] = [`%${sanitized}%`];
      let cursorIdx = '';
      if (cursorParams.length > 0) {
        params.push(cursorParams[0]);
        cursorIdx = `AND p.created_at < $${params.length}::timestamptz`;
      }
      params.push(parsedLimit + 1);
      const limitIdx = params.length;
      if (requesterId) params.push(requesterId);

      const ilikeQuery = `
        SELECT p.id, p.author_id as "authorId", p.content, p.media_urls as "mediaUrls",
               p.media_type as "mediaType", p.likes_count as "likesCount",
               p.comments_count as "commentsCount", p.created_at as "createdAt",
               pr.username, pr.full_name as "fullName", pr.avatar_url as "avatarUrl",
               pr.is_verified as "isVerified", pr.account_type as "accountType",
               pr.business_name as "businessName"
               ${requesterId ? `, EXISTS(SELECT 1 FROM likes l WHERE l.post_id = p.id AND l.user_id = $${params.length}) as "isLiked"` : ''}
        FROM posts p
        JOIN profiles pr ON p.author_id = pr.id
        WHERE p.content ILIKE $1
          AND pr.moderation_status NOT IN ('banned', 'shadow_banned')
          AND p.visibility = 'public'
          ${cursorIdx}
        ORDER BY p.created_at DESC, p.id DESC
        LIMIT $${limitIdx}
      `;

      result = await pool.query(ilikeQuery, params);
    }

    const hasMore = result.rows.length > parsedLimit;
    const rows = result.rows.slice(0, parsedLimit);

    const posts = rows.map((post: Record<string, unknown>) => ({
      id: post.id,
      authorId: post.authorId,
      content: post.content,
      mediaUrls: (post.mediaUrls as string[]) || [],
      mediaType: post.mediaType,
      likesCount: parseInt(String(post.likesCount)) || 0,
      commentsCount: parseInt(String(post.commentsCount)) || 0,
      createdAt: post.createdAt,
      isLiked: (post.isLiked as boolean) || false,
      author: {
        id: post.authorId,
        username: post.username,
        fullName: post.fullName,
        avatarUrl: post.avatarUrl,
        isVerified: post.isVerified,
        accountType: post.accountType,
        businessName: post.businessName,
      },
    }));

    const nextCursor = hasMore && posts.length > 0 ? String(posts[posts.length - 1].createdAt) : null;

    return { statusCode: 200, headers: { ...headers, 'Cache-Control': 'public, max-age=30' }, body: JSON.stringify({ success: true, data: posts, nextCursor, hasMore }) };
  } catch (error: unknown) {
    log.error('Error searching posts', error);
    return { statusCode: 500, headers: { ...headers, 'Cache-Control': 'no-cache' }, body: JSON.stringify({ success: false, error: 'Internal server error' }) };
  }
};

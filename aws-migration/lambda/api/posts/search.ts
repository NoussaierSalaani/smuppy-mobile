/**
 * Posts Search Lambda
 * Full-text search on posts with ILIKE fallback
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getReaderPool } from '../../shared/db';
import { headers as corsHeaders } from '../utils/cors';
import { createLogger } from '../utils/logger';

const log = createLogger('posts-search');

const MAX_QUERY_LENGTH = 100;
const MAX_LIMIT = 50;

function sanitizeQuery(raw: string): string {
  return raw
    .replace(/<[^>]*>/g, '')
    .replace(/[\x00-\x1F\x7F]/g, '')
    .trim()
    .substring(0, MAX_QUERY_LENGTH);
}

function response(statusCode: number, body: Record<string, unknown>): APIGatewayProxyResult {
  return {
    statusCode,
    headers: {
      ...corsHeaders,
      'Cache-Control': statusCode === 200 ? 'public, max-age=30' : 'no-cache',
    },
    body: JSON.stringify(body),
  };
}

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const {
      q = '',
      limit = '20',
      offset = '0',
    } = event.queryStringParameters || {};

    const sanitized = sanitizeQuery(q);
    if (!sanitized) {
      return response(400, { success: false, error: 'Search query is required' });
    }

    const parsedLimit = Math.min(Math.max(parseInt(limit) || 20, 1), MAX_LIMIT);
    const parsedOffset = Math.max(parseInt(offset) || 0, 0);

    const cognitoSub = event.requestContext.authorizer?.claims?.sub;
    const pool = await getReaderPool();

    // Resolve requester profile if authenticated
    let requesterId: string | null = null;
    if (cognitoSub) {
      const userResult = await pool.query(
        'SELECT id FROM profiles WHERE cognito_sub = $1',
        [cognitoSub]
      );
      requesterId = userResult.rows[0]?.id || null;
    }

    const likedSelect = requesterId
      ? `, EXISTS(SELECT 1 FROM likes l WHERE l.post_id = p.id AND l.user_id = $4) as "isLiked"`
      : '';

    // Try full-text search first, fallback to ILIKE
    let result;
    try {
      const ftsQuery = `
        SELECT p.id, p.author_id as "authorId", p.content, p.media_urls as "mediaUrls",
               p.media_type as "mediaType", p.likes_count as "likesCount",
               p.comments_count as "commentsCount", p.created_at as "createdAt",
               pr.username, pr.full_name as "fullName", pr.avatar_url as "avatarUrl",
               pr.is_verified as "isVerified", pr.account_type as "accountType"
               ${likedSelect}
        FROM posts p
        JOIN profiles pr ON p.author_id = pr.id
        WHERE to_tsvector('english', p.content) @@ plainto_tsquery('english', $1)
        ORDER BY p.created_at DESC
        LIMIT $2 OFFSET $3
      `;
      const params = requesterId
        ? [sanitized, parsedLimit, parsedOffset, requesterId]
        : [sanitized, parsedLimit, parsedOffset];

      result = await pool.query(ftsQuery, params);
    } catch {
      // Fallback to ILIKE if tsquery fails
      log.info('FTS failed, falling back to ILIKE', { query: sanitized.substring(0, 2) + '***' });

      const ilikeQuery = `
        SELECT p.id, p.author_id as "authorId", p.content, p.media_urls as "mediaUrls",
               p.media_type as "mediaType", p.likes_count as "likesCount",
               p.comments_count as "commentsCount", p.created_at as "createdAt",
               pr.username, pr.full_name as "fullName", pr.avatar_url as "avatarUrl",
               pr.is_verified as "isVerified", pr.account_type as "accountType"
               ${likedSelect}
        FROM posts p
        JOIN profiles pr ON p.author_id = pr.id
        WHERE p.content ILIKE $1
        ORDER BY p.created_at DESC
        LIMIT $2 OFFSET $3
      `;
      const params = requesterId
        ? [`%${sanitized}%`, parsedLimit, parsedOffset, requesterId]
        : [`%${sanitized}%`, parsedLimit, parsedOffset];

      result = await pool.query(ilikeQuery, params);
    }

    const posts = result.rows.map((post: Record<string, unknown>) => ({
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
      },
    }));

    return response(200, {
      success: true,
      data: posts,
      total: posts.length,
    });
  } catch (error: unknown) {
    log.error('Error searching posts', error);
    return response(500, { success: false, error: 'Internal server error' });
  }
};

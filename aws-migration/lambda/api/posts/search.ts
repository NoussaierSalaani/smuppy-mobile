/**
 * Posts Search Lambda
 * Full-text search on posts with ILIKE fallback
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getReaderPool } from '../../shared/db';
import { createHeaders } from '../utils/cors';
import { createLogger } from '../utils/logger';

const log = createLogger('posts-search');

// Rate limiting configuration
const RATE_LIMIT_WINDOW_MS = 60000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 30; // Max 30 searches per minute
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();

const MAX_QUERY_LENGTH = 100;
const MAX_LIMIT = 50;

// Clean up old rate limit entries periodically (every 5 minutes)
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of rateLimitMap.entries()) {
    if (now > value.resetTime) {
      rateLimitMap.delete(key);
    }
  }
}, 300000);

/**
 * Check rate limit for a given IP or user
 * @returns true if request should be allowed, false if rate limited
 */
function checkRateLimit(identifier: string): { allowed: boolean; remaining: number } {
  const now = Date.now();
  const entry = rateLimitMap.get(identifier);

  if (!entry || now > entry.resetTime) {
    // New window
    rateLimitMap.set(identifier, { count: 1, resetTime: now + RATE_LIMIT_WINDOW_MS });
    return { allowed: true, remaining: RATE_LIMIT_MAX_REQUESTS - 1 };
  }

  if (entry.count >= RATE_LIMIT_MAX_REQUESTS) {
    return { allowed: false, remaining: 0 };
  }

  entry.count++;
  return { allowed: true, remaining: RATE_LIMIT_MAX_REQUESTS - entry.count };
}

function sanitizeQuery(raw: string): string {
  const CONTROL_CHARS = /[\x00-\x1F\x7F]/g;
  return raw.replace(/<[^>]*>/g, '').replace(CONTROL_CHARS, '').trim().substring(0, MAX_QUERY_LENGTH);
}

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const headers = createHeaders(event);

  // Rate limiting - use cognito_sub (authenticated user) or IP (anonymous)
  const cognitoSub = event.requestContext.authorizer?.claims?.sub;
  const sourceIp = event.requestContext.identity?.sourceIp || 'unknown';
  const rateLimitKey = cognitoSub || `ip:${sourceIp}`;

  const { allowed } = checkRateLimit(rateLimitKey);
  if (!allowed) {
    log.warn('Rate limit exceeded', { identifier: rateLimitKey.substring(0, 8) + '***' });
    return {
      statusCode: 429,
      headers: { ...headers, 'Retry-After': '60' },
      body: JSON.stringify({ success: false, error: 'Too many requests. Please try again later.' }),
    };
  }

  try {
    const {
      q = '',
      limit = '20',
      offset = '0',
    } = event.queryStringParameters || {};

    const sanitized = sanitizeQuery(q);
    if (!sanitized) {
      return { statusCode: 400, headers: { ...headers, 'Cache-Control': 'no-cache' }, body: JSON.stringify({ success: false, error: 'Search query is required' }) };
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
               pr.username, CASE WHEN pr.account_type = 'pro_business' AND pr.business_name IS NOT NULL AND pr.business_name != '' THEN pr.business_name ELSE pr.full_name END as "fullName", pr.avatar_url as "avatarUrl",
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
               pr.username, CASE WHEN pr.account_type = 'pro_business' AND pr.business_name IS NOT NULL AND pr.business_name != '' THEN pr.business_name ELSE pr.full_name END as "fullName", pr.avatar_url as "avatarUrl",
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

    return { statusCode: 200, headers: { ...headers, 'Cache-Control': 'public, max-age=30' }, body: JSON.stringify({ success: true, data: posts, total: posts.length }) };
  } catch (error: unknown) {
    log.error('Error searching posts', error);
    return { statusCode: 500, headers: { ...headers, 'Cache-Control': 'no-cache' }, body: JSON.stringify({ success: false, error: 'Internal server error' }) };
  }
};

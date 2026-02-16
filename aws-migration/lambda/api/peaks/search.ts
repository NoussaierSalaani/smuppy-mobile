/**
 * Peaks Search Lambda
 * Full-text search on peaks (short videos) with ILIKE fallback
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getPool } from '../../shared/db';
import { getSecureHeaders } from '../utils/cors';

const corsHeaders = getSecureHeaders();
import { createLogger } from '../utils/logger';
import { checkRateLimit } from '../utils/rate-limit';
import { MAX_SEARCH_QUERY_LENGTH, RATE_WINDOW_1_MIN } from '../utils/constants';

const log = createLogger('peaks-search');
const MAX_LIMIT = 50;

function sanitizeQuery(raw: string): string {
  const CONTROL_CHARS = /[\x00-\x1F\x7F]/g;
  const sanitized = raw.replace(/<[^>]*>/g, '').replace(CONTROL_CHARS, '').trim().substring(0, MAX_SEARCH_QUERY_LENGTH);
  // SECURITY: Escape ILIKE special characters to prevent wildcard injection
  return sanitized.replace(/[%_\\]/g, '\\$&');
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
    const userId = event.requestContext.authorizer?.claims?.sub;
    const { allowed } = await checkRateLimit({
      prefix: 'peaks-search',
      identifier: userId || event.requestContext.identity?.sourceIp || 'anonymous',
      windowSeconds: RATE_WINDOW_1_MIN,
      maxRequests: 30,
    });
    if (!allowed) {
      return response(429, { success: false, message: 'Too many requests' });
    }

    const {
      q = '',
      limit = '20',
      cursor,
    } = event.queryStringParameters || {};

    const sanitized = sanitizeQuery(q);
    if (!sanitized) {
      return response(400, { success: false, error: 'Search query is required' });
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

    // Detect hashtag search: query starts with # or is a bare tag word
    const isHashtagSearch = sanitized.startsWith('#') || /^[a-z0-9_]+$/i.test(sanitized);
    const hashtagTerm = sanitized.replace(/^#/, '').toLowerCase().replace(/[^a-z0-9_]/g, '');

    // Build query with dynamic $N parameter indices
    const searchTerm = isHashtagSearch ? hashtagTerm : sanitized;
    const params: (string | number | Date)[] = [searchTerm];
    let paramIdx = 2;

    // Cursor condition
    let cursorCondition = '';
    if (cursor) {
      cursorCondition = `AND p.created_at < $${paramIdx}`;
      params.push(new Date(cursor));
      paramIdx++;
    }

    // Limit (fetch +1 for hasMore detection)
    params.push(parsedLimit + 1);
    const limitParam = `$${paramIdx}`;

    const selectCols = `
      p.id, p.author_id as "authorId", p.caption, p.video_url as "videoUrl",
      p.thumbnail_url as "thumbnailUrl", p.duration,
      p.likes_count as "likesCount", p.comments_count as "commentsCount",
      p.views_count as "viewsCount", p.created_at as "createdAt",
      p.filter_id as "filterId", p.filter_intensity as "filterIntensity", p.overlays,
      pr.username, pr.full_name as "fullName", pr.avatar_url as "avatarUrl",
      pr.is_verified as "isVerified", pr.account_type as "accountType",
      pr.business_name as "businessName"`;

    let result;

    if (isHashtagSearch && hashtagTerm.length > 0) {
      const hashtagQuery = `
        SELECT DISTINCT ${selectCols}
        FROM peaks p
        JOIN profiles pr ON p.author_id = pr.id
        JOIN peak_hashtags ph ON ph.peak_id = p.id
        WHERE ph.hashtag = $1
          AND pr.moderation_status NOT IN ('banned', 'shadow_banned')
          ${cursorCondition}
        ORDER BY p.created_at DESC
        LIMIT ${limitParam}
      `;
      result = await pool.query(hashtagQuery, params);
    } else {
      // Text search: FTS first, ILIKE fallback
      try {
        const ftsQuery = `
          SELECT ${selectCols}
          FROM peaks p
          JOIN profiles pr ON p.author_id = pr.id
          WHERE to_tsvector('english', p.caption) @@ plainto_tsquery('english', $1)
            AND pr.moderation_status NOT IN ('banned', 'shadow_banned')
            ${cursorCondition}
          ORDER BY p.created_at DESC
          LIMIT ${limitParam}
        `;
        result = await pool.query(ftsQuery, params);
      } catch {
        log.info('FTS failed, falling back to ILIKE', { query: sanitized.substring(0, 2) + '***' });

        // Replace search term param with ILIKE pattern
        params[0] = `%${sanitized}%`;

        const ilikeQuery = `
          SELECT ${selectCols}
          FROM peaks p
          JOIN profiles pr ON p.author_id = pr.id
          WHERE p.caption ILIKE $1
            AND pr.moderation_status NOT IN ('banned', 'shadow_banned')
            ${cursorCondition}
          ORDER BY p.created_at DESC
          LIMIT ${limitParam}
        `;
        result = await pool.query(ilikeQuery, params);
      }
    }

    // Cursor-based pagination: detect hasMore and compute nextCursor
    const hasMore = result.rows.length > parsedLimit;
    const rows = result.rows.slice(0, parsedLimit);

    // Batch fetch isLiked (single query instead of per-row EXISTS subquery)
    const peakIds = rows.map((r: Record<string, unknown>) => r.id);
    let likedSet = new Set<string>();
    if (requesterId && peakIds.length > 0) {
      const likedRes = await pool.query(
        'SELECT peak_id FROM peak_likes WHERE user_id = $1 AND peak_id = ANY($2::uuid[])',
        [requesterId, peakIds]
      );
      likedSet = new Set(likedRes.rows.map((r: { peak_id: string }) => r.peak_id));
    }

    const peaks = rows.map((peak: Record<string, unknown>) => ({
      id: peak.id,
      authorId: peak.authorId,
      caption: peak.caption,
      videoUrl: peak.videoUrl,
      thumbnailUrl: peak.thumbnailUrl,
      duration: peak.duration,
      likesCount: parseInt(String(peak.likesCount)) || 0,
      commentsCount: parseInt(String(peak.commentsCount)) || 0,
      viewsCount: parseInt(String(peak.viewsCount)) || 0,
      createdAt: peak.createdAt,
      filterId: (peak.filterId as string) || null,
      filterIntensity: (peak.filterIntensity as number) ?? null,
      overlays: peak.overlays || null,
      isLiked: likedSet.has(peak.id as string),
      author: {
        id: peak.authorId,
        username: peak.username,
        fullName: peak.fullName,
        avatarUrl: peak.avatarUrl,
        isVerified: peak.isVerified,
        accountType: peak.accountType,
        businessName: peak.businessName,
      },
    }));

    const nextCursor = hasMore && peaks.length > 0
      ? new Date(peaks[peaks.length - 1].createdAt as string).toISOString()
      : null;

    return response(200, {
      success: true,
      data: peaks,
      nextCursor,
      hasMore,
    });
  } catch (error: unknown) {
    log.error('Error searching peaks', error);
    return response(500, { success: false, error: 'Internal server error' });
  }
};

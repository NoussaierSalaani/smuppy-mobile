/**
 * Peaks Search Lambda
 * Full-text search on peaks (short videos) with ILIKE fallback
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getReaderPool } from '../../shared/db';
import { headers as corsHeaders } from '../utils/cors';
import { createLogger } from '../utils/logger';

const log = createLogger('peaks-search');

const MAX_QUERY_LENGTH = 100;
const MAX_LIMIT = 50;

function sanitizeQuery(raw: string): string {
  const CONTROL_CHARS = /[\x00-\x1F\x7F]/g;
  return raw.replace(/<[^>]*>/g, '').replace(CONTROL_CHARS, '').trim().substring(0, MAX_QUERY_LENGTH);
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

    // Detect hashtag search: query starts with # or is a bare tag word
    const isHashtagSearch = sanitized.startsWith('#') || /^[a-z0-9_]+$/i.test(sanitized);
    const hashtagTerm = sanitized.replace(/^#/, '').toLowerCase().replace(/[^a-z0-9_]/g, '');

    const likedSelect = requesterId
      ? `, EXISTS(SELECT 1 FROM peak_likes l WHERE l.peak_id = p.id AND l.user_id = ${isHashtagSearch ? '$3' : '$4'}) as "isLiked"`
      : '';

    let result;

    if (isHashtagSearch && hashtagTerm.length > 0) {
      // Hashtag search: find peaks via peak_hashtags table
      const hashtagQuery = `
        SELECT DISTINCT p.id, p.author_id as "authorId", p.caption, p.video_url as "videoUrl",
               p.thumbnail_url as "thumbnailUrl", p.duration,
               p.likes_count as "likesCount", p.comments_count as "commentsCount",
               p.views_count as "viewsCount", p.created_at as "createdAt",
               p.filter_id as "filterId", p.filter_intensity as "filterIntensity", p.overlays,
               pr.username, pr.full_name as "fullName", pr.avatar_url as "avatarUrl",
               pr.is_verified as "isVerified", pr.account_type as "accountType"
               ${likedSelect}
        FROM peaks p
        JOIN profiles pr ON p.author_id = pr.id
        JOIN peak_hashtags ph ON ph.peak_id = p.id
        WHERE ph.hashtag = $1
        ORDER BY p.created_at DESC
        LIMIT $2 OFFSET ${requesterId ? '$4' : '$3'}
      `;
      const params = requesterId
        ? [hashtagTerm, parsedLimit, requesterId, parsedOffset]
        : [hashtagTerm, parsedLimit, parsedOffset];

      result = await pool.query(hashtagQuery, params);
    } else {
      // Text search: FTS first, ILIKE fallback
      const likedSelectText = requesterId
        ? `, EXISTS(SELECT 1 FROM peak_likes l WHERE l.peak_id = p.id AND l.user_id = $4) as "isLiked"`
        : '';

      try {
        const ftsQuery = `
          SELECT p.id, p.author_id as "authorId", p.caption, p.video_url as "videoUrl",
                 p.thumbnail_url as "thumbnailUrl", p.duration,
                 p.likes_count as "likesCount", p.comments_count as "commentsCount",
                 p.views_count as "viewsCount", p.created_at as "createdAt",
                 p.filter_id as "filterId", p.filter_intensity as "filterIntensity", p.overlays,
                 pr.username, pr.full_name as "fullName", pr.avatar_url as "avatarUrl",
                 pr.is_verified as "isVerified", pr.account_type as "accountType"
                 ${likedSelectText}
          FROM peaks p
          JOIN profiles pr ON p.author_id = pr.id
          WHERE to_tsvector('english', p.caption) @@ plainto_tsquery('english', $1)
          ORDER BY p.created_at DESC
          LIMIT $2 OFFSET $3
        `;
        const params = requesterId
          ? [sanitized, parsedLimit, parsedOffset, requesterId]
          : [sanitized, parsedLimit, parsedOffset];

        result = await pool.query(ftsQuery, params);
      } catch {
        log.info('FTS failed, falling back to ILIKE', { query: sanitized.substring(0, 2) + '***' });

        const ilikeQuery = `
          SELECT p.id, p.author_id as "authorId", p.caption, p.video_url as "videoUrl",
                 p.thumbnail_url as "thumbnailUrl", p.duration,
                 p.likes_count as "likesCount", p.comments_count as "commentsCount",
                 p.views_count as "viewsCount", p.created_at as "createdAt",
                 p.filter_id as "filterId", p.filter_intensity as "filterIntensity", p.overlays,
                 pr.username, pr.full_name as "fullName", pr.avatar_url as "avatarUrl",
                 pr.is_verified as "isVerified", pr.account_type as "accountType"
                 ${likedSelectText}
          FROM peaks p
          JOIN profiles pr ON p.author_id = pr.id
          WHERE p.caption ILIKE $1
          ORDER BY p.created_at DESC
          LIMIT $2 OFFSET $3
        `;
        const params = requesterId
          ? [`%${sanitized}%`, parsedLimit, parsedOffset, requesterId]
          : [`%${sanitized}%`, parsedLimit, parsedOffset];

        result = await pool.query(ilikeQuery, params);
      }
    }

    const peaks = result.rows.map((peak: Record<string, unknown>) => ({
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
      isLiked: (peak.isLiked as boolean) || false,
      author: {
        id: peak.authorId,
        username: peak.username,
        fullName: peak.fullName,
        avatarUrl: peak.avatarUrl,
        isVerified: peak.isVerified,
        accountType: peak.accountType,
      },
    }));

    return response(200, {
      success: true,
      data: peaks,
      total: peaks.length,
    });
  } catch (error: unknown) {
    log.error('Error searching peaks', error);
    return response(500, { success: false, error: 'Internal server error' });
  }
};

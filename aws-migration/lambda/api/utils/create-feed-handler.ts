/**
 * Feed Handler Factory
 *
 * Eliminates boilerplate across feed handlers by encapsulating:
 * auth -> rate limit (fail-open) -> parse pagination -> get DB -> resolve profile ->
 * build compound cursor -> execute query -> batch-fetch is_liked/is_saved ->
 * transform to camelCase -> return paginated response.
 *
 * Each feed provides its unique WHERE clause via `buildQuery`.
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { Pool } from 'pg';
import { getPool } from '../../shared/db';
import { createHeaders, createCacheableHeaders } from './cors';
import { createLogger, Logger } from './logger';
import { requireRateLimit } from './rate-limit';
import { RATE_WINDOW_1_MIN } from './constants';
import { resolveProfileId } from './auth';
import { isValidUUID } from './security';

// ── Types ────────────────────────────────────────────────────────────

interface BuildQueryResult {
  sql: string;
  params: (string | number | Date | string[])[];
}

interface FeedHandlerConfig {
  /** Logger name for CloudWatch (e.g. 'feed-following') */
  loggerName: string;
  /** Rate limit key prefix (e.g. 'feed-following') */
  rateLimitPrefix: string;
  /** Max requests per minute (default: 60) */
  rateLimitMax?: number;
  /**
   * Build the feed SQL query.
   *
   * @param userId       - Resolved profile ID ($1 is always userId)
   * @param params       - Params array (already contains userId at index 0)
   * @param cursorCondition - SQL fragment like "AND (p.created_at, p.id) < ($2::timestamptz, $3::uuid)" or ""
   * @param limitParamIndex - The $N index for LIMIT (already pushed to params as limit+1)
   * @returns { sql, params } — the full SELECT query and complete params array
   */
  buildQuery: (
    userId: string,
    params: (string | number | Date | string[])[],
    cursorCondition: string,
    limitParamIndex: number,
  ) => BuildQueryResult;
  /** Include video fields in the camelCase transform (default: false) */
  includeVideoFields?: boolean;
  /** Cache-Control header value. If set, uses createCacheableHeaders. */
  cacheControl?: string;
}

// ── Row type ─────────────────────────────────────────────────────────

type Row = Record<string, unknown>;

// ── Factory ──────────────────────────────────────────────────────────

export function createFeedHandler(config: FeedHandlerConfig) {
  const {
    loggerName,
    rateLimitPrefix,
    rateLimitMax = 60,
    buildQuery,
    includeVideoFields = false,
    cacheControl,
  } = config;

  const log: Logger = createLogger(loggerName);

  async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
    const headers = createHeaders(event);
    log.initFromEvent(event);

    try {
      // ── Auth ────────────────────────────────────────────────────
      const cognitoSub = event.requestContext.authorizer?.claims?.sub;
      if (!cognitoSub) {
        return {
          statusCode: 401,
          headers,
          body: JSON.stringify({ message: 'Unauthorized' }),
        };
      }

      // ── Rate limit (fail-open: WAF provides baseline protection) ─
      const rateLimitResponse = await requireRateLimit({
        prefix: rateLimitPrefix,
        identifier: cognitoSub,
        windowSeconds: RATE_WINDOW_1_MIN,
        maxRequests: rateLimitMax,
        failOpen: true,
      }, headers);
      if (rateLimitResponse) return rateLimitResponse;

      // ── Parse pagination params ────────────────────────────────
      const limit = Math.min(
        Number.parseInt(event.queryStringParameters?.limit || '20', 10),
        50,
      );
      const cursor = event.queryStringParameters?.cursor;

      // ── DB + profile ───────────────────────────────────────────
      const db: Pool = await getPool();
      const userId = await resolveProfileId(db, cognitoSub);

      if (!userId) {
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({ data: [], nextCursor: null, hasMore: false }),
        };
      }

      // ── Build compound cursor condition ────────────────────────
      let cursorCondition = '';
      const params: (string | number | Date | string[])[] = [userId];

      if (cursor) {
        const pipeIndex = cursor.indexOf('|');
        if (pipeIndex !== -1) {
          // Compound cursor: created_at|id
          const cursorDate = cursor.substring(0, pipeIndex);
          const cursorId = cursor.substring(pipeIndex + 1);

          const parsedDate = new Date(cursorDate);
          if (Number.isNaN(parsedDate.getTime())) {
            return {
              statusCode: 400,
              headers,
              body: JSON.stringify({ message: 'Invalid cursor format' }),
            };
          }

          // SECURITY: Validate cursor UUID to prevent SQL injection via ::uuid cast
          if (!isValidUUID(cursorId)) {
            return {
              statusCode: 400,
              headers,
              body: JSON.stringify({ message: 'Invalid cursor format' }),
            };
          }

          cursorCondition = `AND (p.created_at, p.id) < ($${params.length + 1}::timestamptz, $${params.length + 2}::uuid)`;
          params.push(parsedDate.toISOString());
          params.push(cursorId);
        } else {
          // Legacy cursor: created_at only (backward compatibility)
          const parsedDate = new Date(cursor);
          if (Number.isNaN(parsedDate.getTime())) {
            return {
              statusCode: 400,
              headers,
              body: JSON.stringify({ message: 'Invalid cursor format' }),
            };
          }
          cursorCondition = `AND p.created_at < $${params.length + 1}::timestamptz`;
          params.push(parsedDate.toISOString());
        }
      }

      // Push limit+1 for hasMore detection
      params.push(limit + 1);
      const limitParamIndex = params.length;

      // ── Execute query ──────────────────────────────────────────
      const { sql, params: finalParams } = buildQuery(userId, params, cursorCondition, limitParamIndex);
      const result = await db.query(sql, finalParams);

      const hasMore = result.rows.length > limit;
      const rows: Row[] = result.rows.slice(0, limit);

      // ── Batch-fetch is_liked and is_saved ──────────────────────
      const postIds = rows.map((r: Row) => r.id);
      let likedSet = new Set<string>();
      let savedSet = new Set<string>();

      if (postIds.length > 0) {
        const [likedRes, savedRes] = await Promise.all([
          db.query(
            'SELECT post_id FROM likes WHERE user_id = $1 AND post_id = ANY($2::uuid[])',
            [userId, postIds],
          ),
          db.query(
            'SELECT post_id FROM saved_posts WHERE user_id = $1 AND post_id = ANY($2::uuid[])',
            [userId, postIds],
          ),
        ]);
        likedSet = new Set(likedRes.rows.map((r: Row) => r.post_id as string));
        savedSet = new Set(savedRes.rows.map((r: Row) => r.post_id as string));
      }

      // ── Transform to camelCase ─────────────────────────────────
      const data = rows.map((row: Row) => {
        const post: Record<string, unknown> = {
          id: row.id,
          authorId: row.author_id,
          content: row.content,
          mediaUrls: row.media_urls || [],
          mediaType: row.media_type,
          mediaMeta: row.media_meta || {},
          tags: row.tags || [],
          likesCount: row.likes_count || 0,
          commentsCount: row.comments_count || 0,
          createdAt: row.created_at,
          isLiked: likedSet.has(row.id as string),
          isSaved: savedSet.has(row.id as string),
          author: {
            id: row.profile_id,
            username: row.username,
            fullName: row.full_name,
            displayName: row.display_name,
            avatarUrl: row.avatar_url,
            isVerified: row.is_verified,
            accountType: row.account_type,
            businessName: row.business_name,
          },
        };

        if (includeVideoFields) {
          post.videoStatus = row.video_status || null;
          post.hlsUrl = row.hls_url || null;
          post.thumbnailUrl = row.thumbnail_url || null;
          post.videoVariants = row.video_variants || null;
          post.videoDuration = row.video_duration || null;
        }

        return post;
      });

      // ── Build next cursor ──────────────────────────────────────
      const lastRow = rows.length > 0 ? rows.at(-1)! : null;
      const nextCursor = hasMore && lastRow
        ? `${lastRow.created_at}|${lastRow.id}`
        : null;

      // ── Response ───────────────────────────────────────────────
      const responseHeaders = cacheControl
        ? createCacheableHeaders(event, cacheControl)
        : headers;

      return {
        statusCode: 200,
        headers: responseHeaders,
        body: JSON.stringify({ success: true, data, nextCursor, hasMore }),
      };
    } catch (error: unknown) {
      log.error(`Error getting ${loggerName}`, error);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ message: 'Internal server error' }),
      };
    }
  }

  return { handler };
}

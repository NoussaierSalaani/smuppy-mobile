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
import { parseLimit } from './pagination';

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

// ── Cursor Parsing ───────────────────────────────────────────────────

interface CursorResult {
  condition: string;
  params: (string | number | Date | string[])[];
}

/**
 * Parse a compound cursor (created_at|id) or legacy cursor (created_at only).
 * Returns null if cursor is invalid (400 should be returned by caller).
 * Returns { condition: '', params: [] } if no cursor is present.
 */
function parseCompoundCursor(
  cursor: string | undefined,
  existingParamsLength: number,
): CursorResult | null {
  if (!cursor) {
    return { condition: '', params: [] };
  }

  const pipeIndex = cursor.indexOf('|');

  if (pipeIndex !== -1) {
    return parseCompoundCursorWithId(cursor, pipeIndex, existingParamsLength);
  }

  return parseLegacyCursor(cursor, existingParamsLength);
}

function parseCompoundCursorWithId(
  cursor: string,
  pipeIndex: number,
  existingParamsLength: number,
): CursorResult | null {
  const cursorDate = cursor.substring(0, pipeIndex);
  const cursorId = cursor.substring(pipeIndex + 1);

  const parsedDate = new Date(cursorDate);
  if (Number.isNaN(parsedDate.getTime())) return null;
  if (!isValidUUID(cursorId)) return null;

  return {
    condition: `AND (p.created_at, p.id) < ($${existingParamsLength + 1}::timestamptz, $${existingParamsLength + 2}::uuid)`,
    params: [parsedDate.toISOString(), cursorId],
  };
}

function parseLegacyCursor(
  cursor: string,
  existingParamsLength: number,
): CursorResult | null {
  const parsedDate = new Date(cursor);
  if (Number.isNaN(parsedDate.getTime())) return null;

  return {
    condition: `AND p.created_at < $${existingParamsLength + 1}::timestamptz`,
    params: [parsedDate.toISOString()],
  };
}

// ── Batch Interaction Fetch ──────────────────────────────────────────

async function batchFetchInteractions(
  db: Pool,
  userId: string,
  postIds: unknown[],
): Promise<{ likedSet: Set<string>; savedSet: Set<string> }> {
  if (postIds.length === 0) {
    return { likedSet: new Set(), savedSet: new Set() };
  }

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

  return {
    likedSet: new Set(likedRes.rows.map((r: Row) => r.post_id as string)),
    savedSet: new Set(savedRes.rows.map((r: Row) => r.post_id as string)),
  };
}

// ── Row Transformation ───────────────────────────────────────────────

function transformRow(
  row: Row,
  likedSet: Set<string>,
  savedSet: Set<string>,
  includeVideoFields: boolean,
): Record<string, unknown> {
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
}

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
        return { statusCode: 401, headers, body: JSON.stringify({ message: 'Unauthorized' }) };
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
      const limit = parseLimit(event.queryStringParameters?.limit);
      const cursor = event.queryStringParameters?.cursor;

      // ── DB + profile ───────────────────────────────────────────
      const db: Pool = await getPool();
      const userId = await resolveProfileId(db, cognitoSub);

      if (!userId) {
        return { statusCode: 200, headers, body: JSON.stringify({ data: [], nextCursor: null, hasMore: false }) };
      }

      // ── Build compound cursor condition ────────────────────────
      const params: (string | number | Date | string[])[] = [userId];
      const cursorResult = parseCompoundCursor(cursor, params.length);

      if (cursorResult === null) {
        return { statusCode: 400, headers, body: JSON.stringify({ message: 'Invalid cursor format' }) };
      }

      const { condition: cursorCondition } = cursorResult;
      params.push(...cursorResult.params);

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
      const { likedSet, savedSet } = await batchFetchInteractions(db, userId, postIds);

      // ── Transform to camelCase ─────────────────────────────────
      const data = rows.map((row: Row) => transformRow(row, likedSet, savedSet, includeVideoFields));

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
      return { statusCode: 500, headers, body: JSON.stringify({ message: 'Internal server error' }) };
    }
  }

  return { handler };
}

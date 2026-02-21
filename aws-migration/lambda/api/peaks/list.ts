/**
 * List Peaks Lambda Handler
 * Returns peaks (short videos) with pagination
 */

import { Pool } from 'pg';
import { getPool, SqlParam } from '../../shared/db';
import { withErrorHandler } from '../utils/error-handler';
import { isValidUUID, extractCognitoSub } from '../utils/security';
import { resolveProfileId } from '../utils/auth';
import { parseLimit, applyHasMore } from '../utils/pagination';
import { parseCursor, cursorToSql, generateCursor } from '../utils/cursor';
import { mapAuthor } from '../utils/mappers';

// ── Select columns (shared between authenticated & anonymous) ───────

const BASE_SELECT = `
      SELECT
        pk.id,
        pk.author_id,
        pk.video_url,
        pk.thumbnail_url,
        pk.caption,
        pk.duration,
        pk.reply_to_peak_id,
        pk.likes_count,
        pk.comments_count,
        pk.views_count,
        pk.created_at,
        pk.filter_id,
        pk.filter_intensity,
        pk.overlays,
        pk.expires_at,
        pk.saved_to_profile,
        pk.video_status,
        pk.hls_url,
        pk.video_variants,
        p.username as author_username,
        p.full_name as author_full_name,
        p.avatar_url as author_avatar_url,
        p.is_verified as author_is_verified,
        p.account_type as author_account_type,
        p.business_name as author_business_name,
        pc.id as challenge_id,
        pc.title as challenge_title,
        pc.rules as challenge_rules,
        pc.status as challenge_status,
        pc.response_count as challenge_response_count`;

const AUTHENTICATED_SUBQUERIES = `,
        EXISTS(
          SELECT 1 FROM peak_likes pl
          WHERE pl.peak_id = pk.id AND pl.user_id = $1
        ) as is_liked,
        EXISTS(
          SELECT 1 FROM peak_views pv
          WHERE pv.peak_id = pk.id AND pv.user_id = $1
        ) as is_viewed`;

const FROM_CLAUSE = `
      FROM peaks pk
      JOIN profiles p ON pk.author_id = p.id
      LEFT JOIN peak_challenges pc ON pc.peak_id = pk.id`;

// ── Query builder helpers ───────────────────────────────────────────

function buildModerationFilter(currentProfileId: string | null): string {
  if (currentProfileId) {
    return ` WHERE (p.moderation_status NOT IN ('banned', 'shadow_banned') OR pk.author_id = $1)`;
  }
  return ` WHERE p.moderation_status NOT IN ('banned', 'shadow_banned')`;
}

function buildBlockExclusion(currentProfileId: string | null): string {
  if (!currentProfileId) return '';
  return `
        AND NOT EXISTS (
          SELECT 1 FROM blocked_users bu
          WHERE (bu.blocker_id = $1 AND bu.blocked_id = pk.author_id)
             OR (bu.blocker_id = pk.author_id AND bu.blocked_id = $1)
        )`;
}

function buildFeedModeFilter(isProfileMode: boolean, currentProfileId: string | null): string {
  if (isProfileMode) {
    return ` AND (pk.saved_to_profile IS DISTINCT FROM false)`;
  }

  // Feed mode: only active (non-expired) peaks
  let filter = `
        AND (
          (pk.expires_at IS NOT NULL AND pk.expires_at > NOW())
          OR
          (pk.expires_at IS NULL AND pk.created_at > NOW() - INTERVAL '48 hours')
        )`;

  // Exclude peaks the user has hidden ("not interested")
  if (currentProfileId) {
    filter += ` AND NOT EXISTS (SELECT 1 FROM peak_hidden ph WHERE ph.peak_id = pk.id AND ph.user_id = $1)`;
  }

  return filter;
}

async function resolveAuthorId(
  db: Pool,
  authorIdParam: string | undefined,
  usernameParam: string | undefined,
): Promise<string | null> {
  if (authorIdParam && isValidUUID(authorIdParam)) {
    return authorIdParam;
  }

  if (usernameParam) {
    const userResult = await db.query('SELECT id FROM profiles WHERE username = $1', [usernameParam]);
    return userResult.rows[0]?.id || null;
  }

  return null;
}

// ── Row formatter ───────────────────────────────────────────────────

function formatPeak(peak: Record<string, unknown>, isAuthenticated: boolean): Record<string, unknown> {
  return {
    id: peak.id,
    videoUrl: peak.video_url,
    thumbnailUrl: peak.thumbnail_url,
    caption: peak.caption,
    duration: peak.duration,
    replyToPeakId: peak.reply_to_peak_id || null,
    likesCount: peak.likes_count,
    commentsCount: peak.comments_count,
    viewsCount: peak.views_count,
    createdAt: peak.created_at,
    filterId: peak.filter_id || null,
    filterIntensity: peak.filter_intensity ?? null,
    overlays: peak.overlays || null,
    expiresAt: peak.expires_at || null,
    savedToProfile: peak.saved_to_profile ?? null,
    videoStatus: peak.video_status || null,
    hlsUrl: peak.hls_url || null,
    videoVariants: peak.video_variants || null,
    isLiked: isAuthenticated ? peak.is_liked : false,
    isViewed: isAuthenticated ? peak.is_viewed : false,
    author: mapAuthor(peak),
    challenge: peak.challenge_id ? {
      id: peak.challenge_id,
      title: peak.challenge_title,
      rules: peak.challenge_rules,
      status: peak.challenge_status,
      responseCount: peak.challenge_response_count,
    } : null,
  };
}

// ── Main Handler ────────────────────────────────────────────────────

export const handler = withErrorHandler('peaks-list', async (event, { headers }) => {
    const userId = extractCognitoSub(event);
    const limit = parseLimit(event.queryStringParameters?.limit);
    const parsedCursor = parseCursor(event.queryStringParameters?.cursor, 'timestamp-ms');
    const authorIdParam = event.queryStringParameters?.authorId || event.queryStringParameters?.author_id;
    const usernameParam = event.queryStringParameters?.username;

    const db = await getPool();

    const currentProfileId = userId ? await resolveProfileId(db, userId) : null;
    const isAuthenticated = currentProfileId !== null;
    const isProfileMode = !!(authorIdParam || usernameParam);

    // ── Build query ─────────────────────────────────────────────────
    let query = BASE_SELECT;
    if (isAuthenticated) query += AUTHENTICATED_SUBQUERIES;
    query += FROM_CLAUSE;
    query += buildModerationFilter(currentProfileId);
    query += buildBlockExclusion(currentProfileId);
    query += buildFeedModeFilter(isProfileMode, currentProfileId);

    const params: SqlParam[] = currentProfileId ? [currentProfileId] : [];
    let paramIndex = currentProfileId ? 2 : 1;

    // ── Author filter ───────────────────────────────────────────────
    const resolvedAuthorId = await resolveAuthorId(db, authorIdParam, usernameParam);
    if (resolvedAuthorId) {
      query += ` AND pk.author_id = $${paramIndex}`;
      params.push(resolvedAuthorId);
      paramIndex++;
    }

    // ── Cursor pagination (tolerant: invalid cursor -> first page) ─
    if (parsedCursor) {
      const cursorSqlResult = cursorToSql(parsedCursor, 'pk.created_at', paramIndex);
      query += ` ${cursorSqlResult.condition}`;
      params.push(...cursorSqlResult.params);
      paramIndex += cursorSqlResult.params.length;
    }

    query += ` ORDER BY pk.created_at DESC LIMIT $${paramIndex}`;
    params.push(limit + 1);

    const result = await db.query(query, params);
    const { data: peaks, hasMore } = applyHasMore(result.rows, limit);

    const formattedPeaks = peaks.map((peak: Record<string, unknown>) => formatPeak(peak, isAuthenticated));

    const nextCursor = hasMore && peaks.length > 0
      ? generateCursor('timestamp-ms', peaks.at(-1)!, 'created_at')
      : null;

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        data: formattedPeaks,
        nextCursor,
        hasMore,
        total: formattedPeaks.length,
      }),
    };
});

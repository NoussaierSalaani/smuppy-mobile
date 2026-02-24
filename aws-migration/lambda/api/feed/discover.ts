/**
 * Get Discover Feed Lambda Handler
 * Retrieves posts from non-followed users, ranked by engagement
 * Optionally filtered by interests/hashtags
 */

import { Pool } from 'pg';
import { getPool, SqlParam } from '../../shared/db';
import { requireRateLimit } from '../utils/rate-limit';
import { resolveProfileId } from '../utils/auth';
import { withErrorHandler } from '../utils/error-handler';
import { blockExclusionSQL, muteExclusionSQL } from '../utils/block-filter';
import { parseLimit } from '../utils/pagination';

const MAX_INTERESTS = 10;
const MAX_OFFSET = 500;

// ── Query builder ───────────────────────────────────────────────────

interface BuiltQuery {
  query: string;
  params: SqlParam[];
}

function buildDiscoverQuery(
  userId: string | null,
  interests: string[],
  fetchLimit: number,
  offset: number,
): BuiltQuery {
  const params: SqlParam[] = [];
  let paramIndex = 1;
  const clauses: string[] = [];

  if (userId) {
    params.push(userId);
    clauses.push(
      `p.author_id NOT IN (SELECT following_id FROM follows WHERE follower_id = $${paramIndex} AND status = 'accepted')`
    );
    clauses.push(`p.author_id != $${paramIndex}`);
    clauses.push(
      blockExclusionSQL(paramIndex, 'p.author_id').trimStart().replace(/^AND /, '')
    );
    clauses.push(
      muteExclusionSQL(paramIndex, 'p.author_id').trimStart().replace(/^AND /, '')
    );
    paramIndex++;
  }

  clauses.push(`p.visibility = 'public'`);
  clauses.push(`COALESCE(pr.moderation_status, 'active') NOT IN ('banned', 'shadow_banned')`);

  if (interests.length > 0) {
    params.push(interests);
    clauses.push(`p.tags && $${paramIndex}::text[]`);
    paramIndex++;
  }

  const whereClause = clauses.length > 0 ? 'WHERE ' + clauses.join(' AND ') : '';

  params.push(fetchLimit);
  const limitParam = paramIndex;
  paramIndex++;

  params.push(offset);
  const offsetParam = paramIndex;

  const query = [
    `SELECT p.id, p.author_id, p.content, p.media_urls, p.media_type, p.media_meta, p.tags,`,
    `       p.likes_count, p.comments_count, p.created_at,`,
    `       p.video_status, p.hls_url, p.thumbnail_url, p.video_variants, p.video_duration,`,
    `       pr.id as profile_id, pr.username, pr.full_name, pr.display_name, pr.avatar_url, pr.is_verified, pr.account_type, pr.business_name`,
    `FROM posts p`,
    `JOIN profiles pr ON p.author_id = pr.id`,
    whereClause,
    `ORDER BY (p.likes_count * 2 + p.comments_count) DESC, p.created_at DESC, p.id DESC`,
    `LIMIT $${limitParam} OFFSET $${offsetParam}`,
  ].join('\n');

  return { query, params };
}

// ── Batch interaction lookup ────────────────────────────────────────

async function batchFetchInteractions(
  db: Pool,
  userId: string | null,
  postIds: unknown[],
): Promise<{ likedSet: Set<string>; savedSet: Set<string> }> {
  if (!userId || postIds.length === 0) {
    return { likedSet: new Set(), savedSet: new Set() };
  }

  const [likedRes, savedRes] = await Promise.all([
    db.query('SELECT post_id FROM likes WHERE user_id = $1 AND post_id = ANY($2::uuid[])', [userId, postIds]),
    db.query('SELECT post_id FROM saved_posts WHERE user_id = $1 AND post_id = ANY($2::uuid[])', [userId, postIds]),
  ]);

  return {
    likedSet: new Set(likedRes.rows.map((r: Record<string, unknown>) => r.post_id as string)),
    savedSet: new Set(savedRes.rows.map((r: Record<string, unknown>) => r.post_id as string)),
  };
}

// ── Row formatter ───────────────────────────────────────────────────

function formatDiscoverPost(
  row: Record<string, unknown>,
  likedSet: Set<string>,
  savedSet: Set<string>,
): Record<string, unknown> {
  return {
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
    videoStatus: row.video_status || null,
    hlsUrl: row.hls_url || null,
    thumbnailUrl: row.thumbnail_url || null,
    videoVariants: row.video_variants || null,
    videoDuration: row.video_duration || null,
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
}

// ── Main Handler ────────────────────────────────────────────────────

export const handler = withErrorHandler('feed-discover', async (event, { headers }) => {
    const cognitoSub = event.requestContext.authorizer?.claims?.sub;

    if (cognitoSub) {
      const rateLimitResponse = await requireRateLimit({ prefix: 'feed-discover', identifier: cognitoSub, windowSeconds: 60, maxRequests: 60 }, headers);
      if (rateLimitResponse) return rateLimitResponse;
    }

    const limit = parseLimit(event.queryStringParameters?.limit);
    const cursorParam = event.queryStringParameters?.cursor;
    const offset = cursorParam ? Math.min(Number.parseInt(cursorParam, 10) || 0, MAX_OFFSET) : 0;

    const interestsParam = event.queryStringParameters?.interests;
    const interests = interestsParam
      ? interestsParam.split(',').map(i => i.trim().toLowerCase()).filter(Boolean).slice(0, MAX_INTERESTS)
      : [];

    const db = await getPool();

    const userId = cognitoSub ? await resolveProfileId(db, cognitoSub) : null;

    // Build full parameterized query
    const { query, params } = buildDiscoverQuery(userId, interests, limit + 1, offset);
    const result = await db.query(query, params);

    const hasMore = result.rows.length > limit;
    const rows = result.rows.slice(0, limit);

    const postIds = rows.map((r: Record<string, unknown>) => r.id);
    const { likedSet, savedSet } = await batchFetchInteractions(db, userId, postIds);

    const data = rows.map((row: Record<string, unknown>) => formatDiscoverPost(row, likedSet, savedSet));

    const nextCursor = hasMore ? String(offset + limit) : null;

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ data, nextCursor, hasMore }),
    };
});

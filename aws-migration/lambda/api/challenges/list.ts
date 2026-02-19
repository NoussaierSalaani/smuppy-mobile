/**
 * List Challenges Lambda Handler
 * Get challenges (trending, by user, for user)
 */

import { APIGatewayProxyHandler } from 'aws-lambda';
import { getPool, SqlParam } from '../../shared/db';
import { cors, handleOptions } from '../utils/cors';
import { createLogger } from '../utils/logger';
import { isValidUUID } from '../utils/security';
import { checkRateLimit } from '../utils/rate-limit';
import { RATE_WINDOW_1_MIN } from '../utils/constants';

const log = createLogger('challenges-list');

export const handler: APIGatewayProxyHandler = async (event) => {
  log.initFromEvent(event);
  if (event.httpMethod === 'OPTIONS') return handleOptions();

  // Rate limit: anti-scraping
  const rateLimitId = event.requestContext.authorizer?.claims?.sub
    || event.requestContext.identity?.sourceIp || 'anonymous';
  const rateLimit = await checkRateLimit({
    prefix: 'challenges-list',
    identifier: rateLimitId,
    windowSeconds: RATE_WINDOW_1_MIN,
    maxRequests: 20,
    failOpen: true,
  });
  if (!rateLimit.allowed) {
    return cors({
      statusCode: 429,
      body: JSON.stringify({ success: false, message: 'Too many requests. Please try again later.' }),
    });
  }

  // Auto-expire on writer pool (reader replicas are read-only)
  try {
    const writerPool = await getPool();
    await writerPool.query(
      `UPDATE peak_challenges SET status = 'ended', updated_at = NOW()
       WHERE status = 'active' AND ends_at IS NOT NULL AND ends_at < NOW()`
    );
  } catch (expireErr) {
    log.error('Auto-expire failed (non-fatal)', expireErr);
  }

  const pool = await getPool();
  const client = await pool.connect();

  try {
    const cognitoSub = event.requestContext.authorizer?.claims?.sub;
    const filterParam = event.queryStringParameters?.filter || 'trending';
    const VALID_FILTERS = ['trending', 'new', 'created', 'tagged', 'responded'] as const;
    const filter = VALID_FILTERS.includes(filterParam as typeof VALID_FILTERS[number]) ? filterParam : 'trending';

    // Resolve cognito sub to profile ID (needed for all filters)
    let userId: string | undefined;
    if (cognitoSub) {
      const profileResult = await client.query(
        'SELECT id FROM profiles WHERE cognito_sub = $1',
        [cognitoSub]
      );
      userId = profileResult.rows[0]?.id;
    }
    const creatorId = event.queryStringParameters?.creatorId;
    if (creatorId && !isValidUUID(creatorId)) {
      return cors({
        statusCode: 400,
        body: JSON.stringify({ success: false, message: 'Invalid creator ID format' }),
      });
    }
    const category = event.queryStringParameters?.category;
    const status = event.queryStringParameters?.status || 'active';
    const limit = Math.min(parseInt(event.queryStringParameters?.limit || '20', 10), 50);
    const cursor = event.queryStringParameters?.cursor || undefined;

    // Validate cursor as ISO date for non-trending filters (trending uses numeric offset)
    if (cursor && filter !== 'trending') {
      const testDate = new Date(cursor);
      if (isNaN(testDate.getTime())) {
        return cors({
          statusCode: 400,
          body: JSON.stringify({ success: false, message: 'Invalid cursor format' }),
        });
      }
    }

    let query: string;
    let params: SqlParam[] = [];
    let paramIndex = 1;

    const baseSelect = `
      SELECT
        pc.id,
        pc.peak_id,
        pc.title,
        pc.description,
        pc.duration_seconds,
        pc.ends_at,
        pc.is_public,
        pc.has_prize,
        pc.prize_description,
        pc.tips_enabled,
        pc.total_tips,
        pc.response_count,
        pc.view_count,
        pc.status,
        pc.created_at,
        ct.name as challenge_type_name,
        ct.slug as challenge_type_slug,
        ct.icon as challenge_type_icon,
        ct.category as challenge_type_category,
        p.video_url as peak_video_url,
        p.thumbnail_url as peak_thumbnail_url,
        creator.id as creator_id,
        creator.username as creator_username,
        creator.display_name as creator_display_name,
        creator.avatar_url as creator_avatar,
        creator.is_verified as creator_verified
      FROM peak_challenges pc
      JOIN peaks p ON pc.peak_id = p.id
      JOIN profiles creator ON pc.creator_id = creator.id
      LEFT JOIN challenge_types ct ON pc.challenge_type_id = ct.id
    `;

    // Cap offset to prevent deep scanning on engagement-ranked results
    const MAX_OFFSET = 500;

    if (filter === 'trending') {
      const trendingOffset = cursor ? Math.min(Math.max(0, parseInt(cursor, 10) || 0), MAX_OFFSET) : 0;
      const statusIdx = paramIndex++;
      const categoryIdx = category ? paramIndex++ : -1;
      const limitIdx = paramIndex++;
      const offsetIdx = paramIndex++;
      query = `
        ${baseSelect}
        WHERE pc.is_public = TRUE
        AND pc.status = $${statusIdx}
        ${category ? `AND ct.category = $${categoryIdx}` : ''}
        ORDER BY
          (pc.response_count * 2 + pc.view_count + COALESCE(pc.total_tips, 0) * 10) DESC,
          pc.created_at DESC
        LIMIT $${limitIdx} OFFSET $${offsetIdx}
      `;
      params = category
        ? [status, category, limit + 1, trendingOffset]
        : [status, limit + 1, trendingOffset];
    } else if (filter === 'new') {
      const statusIdx = paramIndex++;
      const categoryIdx = category ? paramIndex++ : -1;
      const cursorIdx = cursor ? paramIndex++ : -1;
      const limitIdx = paramIndex++;
      query = `
        ${baseSelect}
        WHERE pc.is_public = TRUE
        AND pc.status = $${statusIdx}
        ${category ? `AND ct.category = $${categoryIdx}` : ''}
        ${cursor ? `AND pc.created_at < $${cursorIdx}::timestamptz` : ''}
        ORDER BY pc.created_at DESC
        LIMIT $${limitIdx}
      `;
      params = [status];
      if (category) params.push(category);
      if (cursor) params.push(new Date(cursor).toISOString());
      params.push(limit + 1);
    } else if (filter === 'created' && userId) {
      const creatorIdx = paramIndex++;
      const statusFilterIdx = status !== 'all' ? paramIndex++ : -1;
      const cursorIdx = cursor ? paramIndex++ : -1;
      const limitIdx = paramIndex++;
      query = `
        ${baseSelect}
        WHERE pc.creator_id = $${creatorIdx}
        ${status !== 'all' ? `AND pc.status = $${statusFilterIdx}` : ''}
        ${cursor ? `AND pc.created_at < $${cursorIdx}::timestamptz` : ''}
        ORDER BY pc.created_at DESC
        LIMIT $${limitIdx}
      `;
      params = [userId];
      if (status !== 'all') params.push(status);
      if (cursor) params.push(new Date(cursor).toISOString());
      params.push(limit + 1);
    } else if (filter === 'tagged' && userId) {
      const taggedUserIdx = paramIndex++;
      const statusIdx = paramIndex++;
      const cursorIdx = cursor ? paramIndex++ : -1;
      const limitIdx = paramIndex++;
      query = `
        ${baseSelect.replace('FROM peak_challenges pc', ', ct_tag.created_at as tag_created_at\n      FROM peak_challenges pc')}
        JOIN challenge_tags ct_tag ON pc.id = ct_tag.challenge_id
        WHERE ct_tag.tagged_user_id = $${taggedUserIdx}
        AND pc.status = $${statusIdx}
        ${cursor ? `AND ct_tag.created_at < $${cursorIdx}::timestamptz` : ''}
        ORDER BY ct_tag.created_at DESC
        LIMIT $${limitIdx}
      `;
      params = [userId, status];
      if (cursor) params.push(new Date(cursor).toISOString());
      params.push(limit + 1);
    } else if (filter === 'responded' && userId) {
      const userIdx = paramIndex++;
      const cursorIdx = cursor ? paramIndex++ : -1;
      const limitIdx = paramIndex++;
      query = `
        ${baseSelect.replace('FROM peak_challenges pc', ', cr.created_at as response_created_at\n      FROM peak_challenges pc')}
        JOIN challenge_responses cr ON pc.id = cr.challenge_id
        WHERE cr.user_id = $${userIdx}
        ${cursor ? `AND cr.created_at < $${cursorIdx}::timestamptz` : ''}
        ORDER BY cr.created_at DESC
        LIMIT $${limitIdx}
      `;
      params = [userId];
      if (cursor) params.push(new Date(cursor).toISOString());
      params.push(limit + 1);
    } else if (creatorId) {
      const creatorIdx = paramIndex++;
      const statusIdx = paramIndex++;
      const cursorIdx = cursor ? paramIndex++ : -1;
      const limitIdx = paramIndex++;
      query = `
        ${baseSelect}
        WHERE pc.creator_id = $${creatorIdx}
        AND pc.is_public = TRUE
        AND pc.status = $${statusIdx}
        ${cursor ? `AND pc.created_at < $${cursorIdx}::timestamptz` : ''}
        ORDER BY pc.created_at DESC
        LIMIT $${limitIdx}
      `;
      params = [creatorId, status];
      if (cursor) params.push(new Date(cursor).toISOString());
      params.push(limit + 1);
    } else {
      const statusIdx = paramIndex++;
      const cursorIdx = cursor ? paramIndex++ : -1;
      const limitIdx = paramIndex++;
      query = `
        ${baseSelect}
        WHERE pc.is_public = TRUE
        AND pc.status = $${statusIdx}
        ${cursor ? `AND pc.created_at < $${cursorIdx}::timestamptz` : ''}
        ORDER BY pc.created_at DESC
        LIMIT $${limitIdx}
      `;
      params = [status];
      if (cursor) params.push(new Date(cursor).toISOString());
      params.push(limit + 1);
    }

    const result = await client.query(query, params);

    // Detect hasMore and slice to requested limit
    const hasMore = result.rows.length > limit;
    const rows = result.rows.slice(0, limit);

    // Compute nextCursor
    let nextCursor: string | null = null;
    if (hasMore && rows.length > 0) {
      if (filter === 'trending') {
        const trendingOffset = cursor ? Math.max(0, parseInt(cursor, 10) || 0) : 0;
        const nextOffset = trendingOffset + limit;
        nextCursor = nextOffset <= MAX_OFFSET ? String(nextOffset) : null;
      } else if (filter === 'tagged') {
        const lastRow = rows[rows.length - 1] as Record<string, unknown>;
        nextCursor = new Date((lastRow.tag_created_at ?? lastRow.created_at) as string).toISOString();
      } else if (filter === 'responded') {
        const lastRow = rows[rows.length - 1] as Record<string, unknown>;
        nextCursor = new Date((lastRow.response_created_at ?? lastRow.created_at) as string).toISOString();
      } else {
        const lastRow = rows[rows.length - 1] as Record<string, unknown>;
        nextCursor = new Date(lastRow.created_at as string).toISOString();
      }
    }

    // Check if current user has responded (if logged in)
    const profileIdForResponseCheck = userId;
    let userResponses: Record<string, boolean> = {};
    if (profileIdForResponseCheck && rows.length > 0) {
      const challengeIds = rows.map((r: Record<string, unknown>) => r.id);
      const responseCheck = await client.query(
        `SELECT challenge_id FROM challenge_responses
         WHERE challenge_id = ANY($1) AND user_id = $2`,
        [challengeIds, profileIdForResponseCheck]
      );
      userResponses = responseCheck.rows.reduce((acc: Record<string, boolean>, r: Record<string, unknown>) => {
        acc[r.challenge_id as string] = true;
        return acc;
      }, {} as Record<string, boolean>);
    }

    const challenges = rows.map((row: Record<string, unknown>) => ({
      id: row.id,
      peakId: row.peak_id,
      title: row.title,
      description: row.description,
      durationSeconds: row.duration_seconds,
      endsAt: row.ends_at,
      isPublic: row.is_public,
      hasPrize: row.has_prize,
      prizeDescription: row.prize_description,
      tipsEnabled: row.tips_enabled,
      totalTips: row.total_tips ? parseFloat(row.total_tips as string) : 0,
      responseCount: row.response_count,
      viewCount: row.view_count,
      status: row.status,
      createdAt: row.created_at,
      challengeType: row.challenge_type_slug
        ? {
            name: row.challenge_type_name,
            slug: row.challenge_type_slug,
            icon: row.challenge_type_icon,
            category: row.challenge_type_category,
          }
        : null,
      peak: {
        videoUrl: row.peak_video_url,
        thumbnailUrl: row.peak_thumbnail_url,
      },
      creator: {
        id: row.creator_id,
        username: row.creator_username,
        displayName: row.creator_display_name,
        avatarUrl: row.creator_avatar,
        isVerified: row.creator_verified,
      },
      hasResponded: userResponses[row.id as string] || false,
    }));

    return cors({
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        filter,
        challenges,
        pagination: {
          limit,
          hasMore,
          nextCursor,
        },
      }),
    });
  } catch (error: unknown) {
    log.error('List challenges error', error);
    return cors({
      statusCode: 500,
      body: JSON.stringify({
        success: false,
        message: 'Failed to fetch challenges',
      }),
    });
  } finally {
    client.release();
  }
};

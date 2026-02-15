/**
 * List Challenges Lambda Handler
 * Get challenges (trending, by user, for user)
 */

import { APIGatewayProxyHandler } from 'aws-lambda';
import { getPool, getReaderPool, SqlParam } from '../../shared/db';
import { cors, handleOptions } from '../utils/cors';
import { createLogger } from '../utils/logger';
import { isValidUUID } from '../utils/security';

const log = createLogger('challenges-list');

export const handler: APIGatewayProxyHandler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return handleOptions();

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

  const pool = await getReaderPool();
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
    const offset = parseInt(event.queryStringParameters?.offset || '0', 10);

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

    if (filter === 'trending') {
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
        ? [status, category, limit, offset]
        : [status, limit, offset];
    } else if (filter === 'new') {
      const statusIdx = paramIndex++;
      const categoryIdx = category ? paramIndex++ : -1;
      const limitIdx = paramIndex++;
      const offsetIdx = paramIndex++;
      query = `
        ${baseSelect}
        WHERE pc.is_public = TRUE
        AND pc.status = $${statusIdx}
        ${category ? `AND ct.category = $${categoryIdx}` : ''}
        ORDER BY pc.created_at DESC
        LIMIT $${limitIdx} OFFSET $${offsetIdx}
      `;
      params = category
        ? [status, category, limit, offset]
        : [status, limit, offset];
    } else if (filter === 'created' && userId) {
      const creatorIdx = paramIndex++;
      const statusFilterIdx = status !== 'all' ? paramIndex++ : -1;
      const limitIdx = paramIndex++;
      const offsetIdx = paramIndex++;
      query = `
        ${baseSelect}
        WHERE pc.creator_id = $${creatorIdx}
        ${status !== 'all' ? `AND pc.status = $${statusFilterIdx}` : ''}
        ORDER BY pc.created_at DESC
        LIMIT $${limitIdx} OFFSET $${offsetIdx}
      `;
      params = status !== 'all' ? [userId, status, limit, offset] : [userId, limit, offset];
    } else if (filter === 'tagged' && userId) {
      const taggedUserIdx = paramIndex++;
      const statusIdx = paramIndex++;
      const limitIdx = paramIndex++;
      const offsetIdx = paramIndex++;
      query = `
        ${baseSelect}
        JOIN challenge_tags ct_tag ON pc.id = ct_tag.challenge_id
        WHERE ct_tag.tagged_user_id = $${taggedUserIdx}
        AND pc.status = $${statusIdx}
        ORDER BY ct_tag.created_at DESC
        LIMIT $${limitIdx} OFFSET $${offsetIdx}
      `;
      params = [userId, status, limit, offset];
    } else if (filter === 'responded' && userId) {
      const userIdx = paramIndex++;
      const limitIdx = paramIndex++;
      const offsetIdx = paramIndex++;
      query = `
        ${baseSelect}
        JOIN challenge_responses cr ON pc.id = cr.challenge_id
        WHERE cr.user_id = $${userIdx}
        ORDER BY cr.created_at DESC
        LIMIT $${limitIdx} OFFSET $${offsetIdx}
      `;
      params = [userId, limit, offset];
    } else if (creatorId) {
      const creatorIdx = paramIndex++;
      const statusIdx = paramIndex++;
      const limitIdx = paramIndex++;
      const offsetIdx = paramIndex++;
      query = `
        ${baseSelect}
        WHERE pc.creator_id = $${creatorIdx}
        AND pc.is_public = TRUE
        AND pc.status = $${statusIdx}
        ORDER BY pc.created_at DESC
        LIMIT $${limitIdx} OFFSET $${offsetIdx}
      `;
      params = [creatorId, status, limit, offset];
    } else {
      const statusIdx = paramIndex++;
      const limitIdx = paramIndex++;
      const offsetIdx = paramIndex++;
      query = `
        ${baseSelect}
        WHERE pc.is_public = TRUE
        AND pc.status = $${statusIdx}
        ORDER BY pc.created_at DESC
        LIMIT $${limitIdx} OFFSET $${offsetIdx}
      `;
      params = [status, limit, offset];
    }

    const result = await client.query(query, params);

    // Check if current user has responded (if logged in)
    const profileIdForResponseCheck = userId;
    let userResponses: Record<string, boolean> = {};
    if (profileIdForResponseCheck && result.rows.length > 0) {
      const challengeIds = result.rows.map((r: Record<string, unknown>) => r.id);
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

    const challenges = result.rows.map((row: Record<string, unknown>) => ({
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
          offset,
          hasMore: result.rows.length === limit,
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

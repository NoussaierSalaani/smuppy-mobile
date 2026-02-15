/**
 * List Challenge Responses Lambda Handler
 * GET /challenges/{challengeId}/responses?limit=20&offset=0
 */

import { APIGatewayProxyHandler } from 'aws-lambda';
import { getPool } from '../../shared/db';
import { cors, handleOptions } from '../utils/cors';
import { createLogger } from '../utils/logger';
import { isValidUUID } from '../utils/security';

const log = createLogger('challenges-responses');

function mapResponse(r: Record<string, unknown>) {
  return {
    id: r.id,
    challengeId: r.challenge_id,
    peakId: r.peak_id,
    userId: r.user_id,
    score: r.score,
    timeSeconds: r.time_seconds,
    rank: r.rank,
    voteCount: r.vote_count,
    status: r.status,
    createdAt: r.created_at,
    user: {
      id: r.user_id,
      username: r.username,
      displayName: r.display_name,
      avatarUrl: r.avatar_url,
      isVerified: r.is_verified,
    },
    peak: {
      id: r.peak_id,
      thumbnailUrl: r.thumbnail_url,
      videoUrl: r.video_url,
      duration: r.duration,
      viewsCount: r.views_count,
    },
  };
}

export const handler: APIGatewayProxyHandler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return handleOptions();

  const pool = await getPool();
  const client = await pool.connect();

  try {
    const challengeId = event.pathParameters?.challengeId;
    if (!challengeId || !isValidUUID(challengeId)) {
      return cors({
        statusCode: 400,
        body: JSON.stringify({ success: false, message: 'Invalid challenge ID' }),
      });
    }

    const limit = Math.min(parseInt(event.queryStringParameters?.limit || '20', 10), 50);
    const cursor = event.queryStringParameters?.cursor;
    const sortByParam = event.queryStringParameters?.sortBy || 'recent';
    const sortBy = sortByParam === 'popular' ? 'popular' : 'recent'; // whitelist valid values

    // Verify challenge exists
    const challengeCheck = await client.query(
      'SELECT id FROM peak_challenges WHERE id = $1',
      [challengeId]
    );
    if (challengeCheck.rows.length === 0) {
      return cors({
        statusCode: 404,
        body: JSON.stringify({ success: false, message: 'Challenge not found' }),
      });
    }

    // Build cursor condition
    const params: (string | number)[] = [challengeId];
    let cursorCondition = '';

    if (sortBy === 'popular') {
      // Popular sort uses offset-encoded cursor (scores change between requests)
      const offset = cursor ? parseInt(cursor, 10) || 0 : 0;
      params.push(limit + 1);
      params.push(offset);

      const result = await client.query(
        `SELECT
          cr.id, cr.challenge_id, cr.peak_id, cr.user_id,
          cr.score, cr.time_seconds, cr.rank, cr.vote_count, cr.status, cr.created_at,
          p.username, p.display_name, p.avatar_url, p.is_verified,
          pk.thumbnail_url, pk.video_url, pk.duration, pk.views_count
        FROM challenge_responses cr
        JOIN profiles p ON cr.user_id = p.id
        LEFT JOIN peaks pk ON cr.peak_id = pk.id
        WHERE cr.challenge_id = $1
        ORDER BY cr.vote_count DESC, cr.created_at DESC
        LIMIT $2 OFFSET $3`,
        params
      );

      const hasMore = result.rows.length > limit;
      const rows = result.rows.slice(0, limit);
      const nextCursor = hasMore ? String(offset + limit) : null;

      return cors({
        statusCode: 200,
        body: JSON.stringify({
          success: true,
          responses: rows.map((r: Record<string, unknown>) => mapResponse(r)),
          nextCursor,
          hasMore,
        }),
      });
    }

    // Recent sort uses keyset cursor on created_at
    if (cursor) {
      const parsedDate = new Date(cursor);
      if (!isNaN(parsedDate.getTime())) {
        params.push(parsedDate.toISOString());
        cursorCondition = `AND cr.created_at < $${params.length}::timestamptz`;
      }
    }

    params.push(limit + 1);
    const limitIdx = params.length;

    const result = await client.query(
      `SELECT
        cr.id, cr.challenge_id, cr.peak_id, cr.user_id,
        cr.score, cr.time_seconds, cr.rank, cr.vote_count, cr.status, cr.created_at,
        p.username, p.display_name, p.avatar_url, p.is_verified,
        pk.thumbnail_url, pk.video_url, pk.duration, pk.views_count
      FROM challenge_responses cr
      JOIN profiles p ON cr.user_id = p.id
      LEFT JOIN peaks pk ON cr.peak_id = pk.id
      WHERE cr.challenge_id = $1 ${cursorCondition}
      ORDER BY cr.created_at DESC
      LIMIT $${limitIdx}`,
      params
    );

    const hasMore = result.rows.length > limit;
    const rows = result.rows.slice(0, limit);
    const nextCursor = hasMore && rows.length > 0
      ? new Date(rows[rows.length - 1].created_at as string).toISOString()
      : null;

    const responses = rows.map((r: Record<string, unknown>) => mapResponse(r));

    return cors({
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        responses,
        nextCursor,
        hasMore,
      }),
    });
  } catch (error) {
    log.error('Failed to list challenge responses', error);
    return cors({
      statusCode: 500,
      body: JSON.stringify({ success: false, message: 'Failed to fetch responses' }),
    });
  } finally {
    client.release();
  }
};

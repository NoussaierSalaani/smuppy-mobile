/**
 * List Peaks Lambda Handler
 * Returns peaks (short videos) with pagination
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getPool, SqlParam } from '../../shared/db';
import { createHeaders } from '../utils/cors';
import { createLogger } from '../utils/logger';
import { isValidUUID, extractCognitoSub } from '../utils/security';
import { resolveProfileId } from '../utils/auth';

const log = createLogger('peaks-list');

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const headers = createHeaders(event);
  log.initFromEvent(event);

  try {
    // Get current user if authenticated (for isLiked status)
    const userId = extractCognitoSub(event);

    // Pagination params
    const limit = Math.min(Number.parseInt(event.queryStringParameters?.limit || '20'), 50);
    const cursor = event.queryStringParameters?.cursor;
    const authorIdParam = event.queryStringParameters?.authorId || event.queryStringParameters?.author_id;
    const usernameParam = event.queryStringParameters?.username;

    const db = await getPool();

    // Get current user's profile ID if authenticated
    let currentProfileId: string | null = null;
    if (userId) {
      currentProfileId = await resolveProfileId(db, userId);
    }

    // Build query
    let query = `
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
        pc.response_count as challenge_response_count
    `;

    // Add isLiked + isViewed subqueries if user is authenticated
    if (currentProfileId) {
      query += `,
        EXISTS(
          SELECT 1 FROM peak_likes pl
          WHERE pl.peak_id = pk.id AND pl.user_id = $1
        ) as is_liked,
        EXISTS(
          SELECT 1 FROM peak_views pv
          WHERE pv.peak_id = pk.id AND pv.user_id = $1
        ) as is_viewed
      `;
    }

    query += `
      FROM peaks pk
      JOIN profiles p ON pk.author_id = p.id
      LEFT JOIN peak_challenges pc ON pc.peak_id = pk.id
    `;

    const params: SqlParam[] = currentProfileId ? [currentProfileId] : [];
    let paramIndex = currentProfileId ? 2 : 1;

    // Filter banned/shadow_banned authors — always show own peaks if authenticated
    if (currentProfileId) {
      query += ` WHERE (p.moderation_status NOT IN ('banned', 'shadow_banned') OR pk.author_id = $1)`;
    } else {
      query += ` WHERE p.moderation_status NOT IN ('banned', 'shadow_banned')`;
    }

    // SECURITY: Exclude peaks from blocked/blocking users
    if (currentProfileId) {
      query += `
        AND NOT EXISTS (
          SELECT 1 FROM blocked_users bu
          WHERE (bu.blocker_id = $1 AND bu.blocked_id = pk.author_id)
             OR (bu.blocker_id = pk.author_id AND bu.blocked_id = $1)
        )
      `;
    }

    // Feed mode: only show active (non-expired) peaks
    // Profile mode: show all peaks except explicitly dismissed (saved_to_profile = false)
    // This ensures expired peaks with no decision (saved_to_profile IS NULL) remain
    // visible on the profile so the author can still delete them.
    if (!authorIdParam && !usernameParam) {
      query += `
        AND (
          (pk.expires_at IS NOT NULL AND pk.expires_at > NOW())
          OR
          (pk.expires_at IS NULL AND pk.created_at > NOW() - INTERVAL '48 hours')
        )
      `;
      // Exclude peaks the user has hidden ("not interested")
      if (currentProfileId) {
        query += ` AND NOT EXISTS (SELECT 1 FROM peak_hidden ph WHERE ph.peak_id = pk.id AND ph.user_id = $1)`;
      }
    } else {
      query += ` AND (pk.saved_to_profile IS DISTINCT FROM false)`;
    }

    // Filter by author if provided
    if (authorIdParam) {
      if (isValidUUID(authorIdParam)) {
        query += ` AND pk.author_id = $${paramIndex}`;
        params.push(authorIdParam);
        paramIndex++;
      }
    } else if (usernameParam) {
      // Lookup author_id by username to support author filter by username
      const userResult = await db.query(
        'SELECT id FROM profiles WHERE username = $1',
        [usernameParam]
      );
      const authorIdFromUsername = userResult.rows[0]?.id;
      if (authorIdFromUsername) {
        query += ` AND pk.author_id = $${paramIndex}`;
        params.push(authorIdFromUsername);
        paramIndex++;
      }
    }

    // Cursor pagination
    if (cursor) {
      query += ` AND pk.created_at < $${paramIndex}`;
      params.push(new Date(Number.parseInt(cursor)));
      paramIndex++;
    }

    query += ` ORDER BY pk.created_at DESC LIMIT $${paramIndex}`;
    params.push(limit + 1);

    const result = await db.query(query, params);

    // Check if there are more results
    const hasMore = result.rows.length > limit;
    const peaks = hasMore ? result.rows.slice(0, -1) : result.rows;

    // Format response
    const formattedPeaks = peaks.map((peak: Record<string, unknown>) => ({
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
      isLiked: currentProfileId ? peak.is_liked : false,
      isViewed: currentProfileId ? peak.is_viewed : false,
      author: {
        id: peak.author_id,
        username: peak.author_username,
        fullName: peak.author_full_name,
        avatarUrl: peak.author_avatar_url,
        isVerified: peak.author_is_verified || false,
        accountType: peak.author_account_type,
        businessName: peak.author_business_name,
      },
      challenge: peak.challenge_id ? {
        id: peak.challenge_id,
        title: peak.challenge_title,
        rules: peak.challenge_rules,
        status: peak.challenge_status,
        responseCount: peak.challenge_response_count,
      } : null,
    }));

    // Generate next cursor
    const nextCursor = hasMore && peaks.length > 0
      ? new Date(peaks[peaks.length - 1].created_at).getTime().toString()
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
  } catch (error: unknown) {
    log.error('Error listing peaks', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ message: 'Internal server error' }),
    };
  }
}

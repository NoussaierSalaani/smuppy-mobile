/**
 * Get Peak Lambda Handler
 * Returns a single peak by ID
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getPool, SqlParam } from '../../shared/db';
import { createHeaders } from '../utils/cors';
import { createLogger } from '../utils/logger';
import { isValidUUID, extractCognitoSub } from '../utils/security';

const log = createLogger('peaks-get');

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const headers = createHeaders(event);

  try {
    const peakId = event.pathParameters?.id;
    if (!peakId) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ message: 'Peak ID is required' }),
      };
    }

    // Validate UUID format
    if (!isValidUUID(peakId)) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ message: 'Invalid peak ID format' }),
      };
    }

    // Get current user if authenticated
    const userId = extractCognitoSub(event);

    const db = await getPool();

    // Get current user's profile ID if authenticated (check both id and cognito_sub for consistency)
    let currentProfileId: string | null = null;
    if (userId) {
      const userResult = await db.query(
        'SELECT id FROM profiles WHERE cognito_sub = $1',
        [userId]
      );
      if (userResult.rows.length > 0) {
        currentProfileId = userResult.rows[0].id;
      }
    }

    // Get peak with author info
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

    const params: SqlParam[] = [];
    let paramIndex = 1;

    if (currentProfileId) {
      query += `,
        EXISTS(
          SELECT 1 FROM peak_likes pl
          WHERE pl.peak_id = pk.id AND pl.user_id = $${paramIndex}
        ) as is_liked
      `;
      params.push(currentProfileId);
      paramIndex++;
    }

    query += `
      FROM peaks pk
      JOIN profiles p ON pk.author_id = p.id
      LEFT JOIN peak_challenges pc ON pc.peak_id = pk.id
      WHERE pk.id = $${paramIndex}
    `;
    params.push(peakId);

    const result = await db.query(query, params);

    if (result.rows.length === 0) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ message: 'Peak not found' }),
      };
    }

    const peak = result.rows[0];

    // Increment view count with user dedup (fire and forget)
    // Use profile ID (not Cognito sub) for peak_views foreign key
    if (currentProfileId) {
      db.query(
        `INSERT INTO peak_views (peak_id, user_id) VALUES ($1, $2)
         ON CONFLICT (peak_id, user_id) DO NOTHING`,
        [peakId, currentProfileId]
      ).then((result: { rowCount: number | null }) => {
        // Only increment if this is a new view (row was inserted)
        if (result.rowCount && result.rowCount > 0) {
          return db.query('UPDATE peaks SET views_count = views_count + 1 WHERE id = $1', [peakId]);
        }
      }).catch((err: unknown) => log.error('Error incrementing view count', err));
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        peak: {
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
          isLiked: currentProfileId ? peak.is_liked : false,
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
        },
      }),
    };
  } catch (error: unknown) {
    log.error('Error getting peak', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ message: 'Internal server error' }),
    };
  }
}

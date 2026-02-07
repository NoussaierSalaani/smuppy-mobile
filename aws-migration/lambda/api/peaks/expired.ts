/**
 * Get Expired Peaks Lambda Handler
 * GET /peaks/expired - Returns peaks that have expired and need a user decision
 * Only returns peaks owned by the authenticated user where saved_to_profile IS NULL
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getPool } from '../../shared/db';
import { createHeaders } from '../utils/cors';
import { createLogger } from '../utils/logger';
import { requireAuth, isErrorResponse } from '../utils/validators';

const log = createLogger('peaks-expired');

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const headers = createHeaders(event);

  try {
    const userId = requireAuth(event, headers);
    if (isErrorResponse(userId)) return userId;

    const db = await getPool();

    // Resolve cognito_sub to profile ID
    const userResult = await db.query(
      'SELECT id FROM profiles WHERE cognito_sub = $1',
      [userId]
    );

    if (userResult.rows.length === 0) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ message: 'User profile not found' }),
      };
    }

    const profileId = userResult.rows[0].id;

    // Get expired peaks with no decision yet
    const result = await db.query(
      `SELECT pk.id, pk.video_url, pk.thumbnail_url, pk.caption, pk.duration,
              pk.likes_count, pk.comments_count, pk.views_count,
              pk.created_at, pk.expires_at, pk.filter_id, pk.filter_intensity, pk.overlays
       FROM peaks pk
       WHERE pk.author_id = $1
         AND pk.saved_to_profile IS NULL
         AND (
           (pk.expires_at IS NOT NULL AND pk.expires_at <= NOW())
           OR
           (pk.expires_at IS NULL AND pk.created_at <= NOW() - INTERVAL '48 hours')
         )
       ORDER BY pk.expires_at DESC NULLS LAST
       LIMIT 20`,
      [profileId]
    );

    const formattedPeaks = result.rows.map((peak: Record<string, unknown>) => ({
      id: peak.id,
      videoUrl: peak.video_url,
      thumbnailUrl: peak.thumbnail_url,
      caption: peak.caption,
      duration: peak.duration,
      likesCount: peak.likes_count,
      commentsCount: peak.comments_count,
      viewsCount: peak.views_count,
      createdAt: peak.created_at,
      expiresAt: peak.expires_at || null,
      filterId: peak.filter_id || null,
      filterIntensity: peak.filter_intensity ?? null,
      overlays: peak.overlays || null,
    }));

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        data: formattedPeaks,
        total: formattedPeaks.length,
      }),
    };
  } catch (error: unknown) {
    log.error('Error fetching expired peaks', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ message: 'Internal server error' }),
    };
  }
}

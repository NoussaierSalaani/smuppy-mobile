/**
 * Video Status Lambda Handler
 * Returns video processing status for a post or peak.
 * Used by frontend to poll for HLS readiness after upload.
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getPool } from '../../shared/db';
import { isValidUUID } from '../utils/security';
import { requireRateLimit } from '../utils/rate-limit';
import { withErrorHandler } from '../utils/error-handler';
import { RATE_WINDOW_1_MIN } from '../utils/constants';

export const handler = withErrorHandler('media-video-status', async (event, { headers }) => {
    const userId = event.requestContext.authorizer?.claims?.sub;
    if (!userId) {
      return { statusCode: 401, headers, body: JSON.stringify({ success: false, message: 'Unauthorized' }) };
    }

    // Rate limit: 60 per minute (polling is expected)
    const rateLimitResponse = await requireRateLimit({
      prefix: 'video-status',
      identifier: userId,
      windowSeconds: RATE_WINDOW_1_MIN,
      maxRequests: 60,
    }, headers);
    if (rateLimitResponse) return rateLimitResponse;

    const entityType = event.queryStringParameters?.type;
    const entityId = event.queryStringParameters?.id;

    if (!entityType || !['post', 'peak'].includes(entityType)) {
      return { statusCode: 400, headers, body: JSON.stringify({ success: false, message: 'type must be post or peak' }) };
    }
    if (!entityId || !isValidUUID(entityId)) {
      return { statusCode: 400, headers, body: JSON.stringify({ success: false, message: 'Invalid id' }) };
    }

    const db = await getPool();

    // Resolve cognito_sub to profile ID for ownership check
    const profileResult = await db.query(
      'SELECT id FROM profiles WHERE cognito_sub = $1',
      [userId]
    );
    if (profileResult.rows.length === 0) {
      return { statusCode: 404, headers, body: JSON.stringify({ success: false, message: 'Profile not found' }) };
    }
    const profileId = profileResult.rows[0].id;

    let result;
    if (entityType === 'post') {
      result = await db.query(
        `SELECT video_status, hls_url, thumbnail_url, video_variants, video_duration
         FROM posts WHERE id = $1 AND author_id = $2`,
        [entityId, profileId]
      );
    } else {
      result = await db.query(
        `SELECT video_status, hls_url, thumbnail_url, video_variants, duration AS video_duration
         FROM peaks WHERE id = $1 AND author_id = $2`,
        [entityId, profileId]
      );
    }

    if (result.rows.length === 0) {
      return { statusCode: 404, headers, body: JSON.stringify({ success: false, message: 'Not found' }) };
    }

    const row = result.rows[0];

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        videoStatus: row.video_status,
        hlsUrl: row.hls_url || null,
        thumbnailUrl: row.thumbnail_url || null,
        videoVariants: row.video_variants || null,
        videoDuration: row.video_duration || null,
      }),
    };
});

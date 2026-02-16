/**
 * Video Status Lambda Handler
 * Returns video processing status for a post or peak.
 * Used by frontend to poll for HLS readiness after upload.
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getPool } from '../../shared/db';
import { createHeaders } from '../utils/cors';
import { createLogger } from '../utils/logger';
import { isValidUUID } from '../utils/security';
import { checkRateLimit } from '../utils/rate-limit';
import { RATE_WINDOW_1_MIN } from '../utils/constants';

const log = createLogger('media-video-status');

export async function handler(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  const headers = createHeaders(event);

  try {
    const userId = event.requestContext.authorizer?.claims?.sub;
    if (!userId) {
      return { statusCode: 401, headers, body: JSON.stringify({ success: false, message: 'Unauthorized' }) };
    }

    // Rate limit: 60 per minute (polling is expected)
    const { allowed } = await checkRateLimit({
      prefix: 'video-status',
      identifier: userId,
      windowSeconds: RATE_WINDOW_1_MIN,
      maxRequests: 60,
    });
    if (!allowed) {
      return { statusCode: 429, headers, body: JSON.stringify({ success: false, message: 'Too many requests' }) };
    }

    const entityType = event.queryStringParameters?.type;
    const entityId = event.queryStringParameters?.id;

    if (!entityType || !['post', 'peak'].includes(entityType)) {
      return { statusCode: 400, headers, body: JSON.stringify({ success: false, message: 'type must be post or peak' }) };
    }
    if (!entityId || !isValidUUID(entityId)) {
      return { statusCode: 400, headers, body: JSON.stringify({ success: false, message: 'Invalid id' }) };
    }

    const db = await getPool();

    let result;
    if (entityType === 'post') {
      result = await db.query(
        `SELECT video_status, hls_url, thumbnail_url, video_variants, video_duration
         FROM posts WHERE id = $1`,
        [entityId]
      );
    } else {
      result = await db.query(
        `SELECT video_status, hls_url, thumbnail_url, video_variants, duration AS video_duration
         FROM peaks WHERE id = $1`,
        [entityId]
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
  } catch (error: unknown) {
    log.error('Error checking video status', error);
    return { statusCode: 500, headers, body: JSON.stringify({ success: false, message: 'Internal server error' }) };
  }
}

/**
 * Create Peak Lambda Handler
 * Creates a new peak (short video)
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getPool } from '../../shared/db';
import { createHeaders } from '../utils/cors';
import { createLogger } from '../utils/logger';
import { checkRateLimit } from '../utils/rate-limit';

const log = createLogger('peaks-create');

// Simple input sanitization
function sanitizeText(text: string, maxLength: number = 500): string {
  return text
    .replace(/<[^>]*>/g, '')
    .trim()
    .slice(0, maxLength)
    .replace(/\0/g, '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
}

// Validate URL format
function isValidUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return ['http:', 'https:'].includes(parsed.protocol);
  } catch {
    return false;
  }
}

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const headers = createHeaders(event);

  try {
    const userId = event.requestContext.authorizer?.claims?.sub;
    if (!userId) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ message: 'Unauthorized' }),
      };
    }

    const rateLimit = await checkRateLimit({
      prefix: 'peak-create',
      identifier: userId,
      windowSeconds: 60,
      maxRequests: 5,
    });
    if (!rateLimit.allowed) {
      return {
        statusCode: 429,
        headers,
        body: JSON.stringify({ message: 'Too many requests. Please try again later.' }),
      };
    }

    // Parse body
    const body = event.body ? JSON.parse(event.body) : {};
    const { videoUrl, thumbnailUrl, caption, duration } = body;

    // Validate required fields
    if (!videoUrl || typeof videoUrl !== 'string') {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ message: 'Video URL is required' }),
      };
    }

    if (!isValidUrl(videoUrl)) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ message: 'Invalid video URL format' }),
      };
    }

    if (thumbnailUrl && !isValidUrl(thumbnailUrl)) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ message: 'Invalid thumbnail URL format' }),
      };
    }

    // Validate duration (max 60 seconds for peaks)
    const videoDuration = typeof duration === 'number' ? Math.min(duration, 60) : null;

    const db = await getPool();

    // Get user's profile
    const userResult = await db.query(
      'SELECT id, username, full_name, avatar_url, is_verified, account_type FROM profiles WHERE cognito_sub = $1',
      [userId]
    );

    if (userResult.rows.length === 0) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ message: 'User profile not found' }),
      };
    }

    const profile = userResult.rows[0];

    // Sanitize caption
    const sanitizedCaption = caption ? sanitizeText(caption, 500) : null;

    // Create peak
    const result = await db.query(
      `INSERT INTO peaks (author_id, video_url, thumbnail_url, caption, duration)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, video_url, thumbnail_url, caption, duration, likes_count, comments_count, views_count, created_at`,
      [profile.id, videoUrl, thumbnailUrl || null, sanitizedCaption, videoDuration]
    );

    const peak = result.rows[0];

    return {
      statusCode: 201,
      headers,
      body: JSON.stringify({
        success: true,
        peak: {
          id: peak.id,
          videoUrl: peak.video_url,
          thumbnailUrl: peak.thumbnail_url,
          caption: peak.caption,
          duration: peak.duration,
          likesCount: peak.likes_count,
          commentsCount: peak.comments_count,
          viewsCount: peak.views_count,
          createdAt: peak.created_at,
          isLiked: false,
          author: {
            id: profile.id,
            username: profile.username,
            fullName: profile.full_name,
            avatarUrl: profile.avatar_url,
            isVerified: profile.is_verified || false,
            accountType: profile.account_type,
          },
        },
      }),
    };
  } catch (error: unknown) {
    log.error('Error creating peak', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ message: 'Internal server error' }),
    };
  }
}

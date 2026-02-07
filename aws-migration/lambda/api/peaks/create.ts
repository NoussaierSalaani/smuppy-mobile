/**
 * Create Peak Lambda Handler
 * Creates a new peak (short video)
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getPool } from '../../shared/db';
import { createHeaders } from '../utils/cors';
import { createLogger } from '../utils/logger';
import { checkRateLimit } from '../utils/rate-limit';
import { sanitizeText, isValidUUID } from '../utils/security';

const log = createLogger('peaks-create');

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
    const { videoUrl, thumbnailUrl, caption, duration, replyToPeakId, hashtags, filterId, filterIntensity, overlays } = body;

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

    // Validate replyToPeakId if provided
    if (replyToPeakId && (typeof replyToPeakId !== 'string' || !isValidUUID(replyToPeakId))) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ message: 'Invalid reply peak ID format' }),
      };
    }

    // Validate duration (max 60 seconds for peaks)
    const videoDuration = typeof duration === 'number' ? Math.min(duration, 60) : null;

    // Validate filter metadata
    const validFilterId = typeof filterId === 'string' && filterId.length <= 50 ? filterId : null;
    const validFilterIntensity = typeof filterIntensity === 'number' && filterIntensity >= 0 && filterIntensity <= 1 ? filterIntensity : null;
    const validOverlays = Array.isArray(overlays) ? JSON.stringify(overlays) : null;

    // Validate hashtags if provided (max 30 hashtags, each max 100 chars)
    const validHashtags: string[] = [];
    if (Array.isArray(hashtags)) {
      for (const tag of hashtags.slice(0, 30)) {
        if (typeof tag === 'string' && tag.length > 0 && tag.length <= 100) {
          const sanitized = tag.toLowerCase().replace(/[^a-z0-9_]/g, '');
          if (sanitized.length > 0 && sanitized.length <= 100) {
            validHashtags.push(sanitized);
          }
        }
      }
    }

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

    // Validate reply parent exists if provided
    if (replyToPeakId) {
      const parentResult = await db.query(
        'SELECT id FROM peaks WHERE id = $1',
        [replyToPeakId]
      );
      if (parentResult.rows.length === 0) {
        return {
          statusCode: 404,
          headers,
          body: JSON.stringify({ message: 'Reply target peak not found' }),
        };
      }
    }

    // Create peak
    const result = await db.query(
      `INSERT INTO peaks (author_id, video_url, thumbnail_url, caption, duration, reply_to_peak_id, filter_id, filter_intensity, overlays)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id, video_url, thumbnail_url, caption, duration, reply_to_peak_id, filter_id, filter_intensity, overlays, likes_count, comments_count, views_count, created_at`,
      [profile.id, videoUrl, thumbnailUrl || null, sanitizedCaption, videoDuration, replyToPeakId || null, validFilterId, validFilterIntensity, validOverlays]
    );

    const peak = result.rows[0];

    // Send notification to parent peak author if this is a reply
    if (replyToPeakId) {
      try {
        const parentPeak = await db.query(
          'SELECT author_id FROM peaks WHERE id = $1',
          [replyToPeakId]
        );
        if (parentPeak.rows.length > 0 && parentPeak.rows[0].author_id !== profile.id) {
          await db.query(
            `INSERT INTO notifications (user_id, type, title, body, data)
             VALUES ($1, 'peak_reply', 'New Peak Reply', $2, $3)`,
            [
              parentPeak.rows[0].author_id,
              `${profile.full_name || profile.username} replied to your Peak`,
              JSON.stringify({ peakId: peak.id, replyToPeakId, authorId: profile.id }),
            ]
          );
        }
      } catch (notifErr) {
        log.error('Failed to send reply notification', notifErr);
      }
    }

    // Insert hashtags (fire and forget)
    if (validHashtags.length > 0) {
      try {
        const hashtagValues = validHashtags.map((_, i) => `($1, $${i + 2})`).join(', ');
        await db.query(
          `INSERT INTO peak_hashtags (peak_id, hashtag) VALUES ${hashtagValues} ON CONFLICT DO NOTHING`,
          [peak.id, ...validHashtags]
        );
      } catch (hashtagErr) {
        log.error('Failed to insert peak hashtags', hashtagErr);
      }
    }

    // Send notification to followers (fire and forget, capped at 500)
    try {
      await db.query(
        `INSERT INTO notifications (user_id, type, title, body, data)
         SELECT f.follower_id, 'new_peak', 'New Peak', $1, $2
         FROM follows f
         WHERE f.following_id = $3 AND f.status = 'accepted'
         LIMIT 500`,
        [
          `${profile.full_name || profile.username} posted a new Peak`,
          JSON.stringify({ peakId: peak.id, authorId: profile.id }),
          profile.id,
        ]
      );
    } catch (notifErr) {
      log.error('Failed to send follower notifications', notifErr);
    }

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
          replyToPeakId: peak.reply_to_peak_id || null,
          likesCount: peak.likes_count,
          commentsCount: peak.comments_count,
          viewsCount: peak.views_count,
          filterId: peak.filter_id || null,
          filterIntensity: peak.filter_intensity ?? null,
          overlays: peak.overlays || null,
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

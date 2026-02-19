/**
 * Peak Replies Handler
 * POST /peaks/{id}/replies - Create a peak as reply to another peak
 * GET /peaks/{id}/replies - Get all peak replies to a peak
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getPool } from '../../shared/db';
import { createCorsResponse, getSecureHeaders } from '../utils/cors';
import { createLogger } from '../utils/logger';
import { isValidUUID } from '../utils/security';
import { resolveProfileId } from '../utils/auth';
import { requireRateLimit } from '../utils/rate-limit';

const log = createLogger('peaks-replies');
const corsHeaders = getSecureHeaders();

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  log.initFromEvent(event);
  const userId = event.requestContext.authorizer?.claims?.sub;
  const peakId = event.pathParameters?.id;
  const httpMethod = event.httpMethod;

  if (!userId) {
    return createCorsResponse(401, { success: false, message: 'Unauthorized' });
  }

  // Only rate limit POST (creating replies), not GET (listing)
  if (event.httpMethod === 'POST') {
    const rateLimitResponse = await requireRateLimit({
      prefix: 'peak-replies',
      identifier: userId,
      windowSeconds: 60,
      maxRequests: 10,
    }, corsHeaders);
    if (rateLimitResponse) return rateLimitResponse;
  }

  if (!peakId) {
    return createCorsResponse(400, { success: false, message: 'Peak ID is required' });
  }

  // Validate UUID format
  if (!isValidUUID(peakId)) {
    return createCorsResponse(400, { success: false, message: 'Invalid peak ID format' });
  }

  try {
    const db = await getPool();

    // Resolve cognito_sub to profile ID
    const profileId = await resolveProfileId(db, userId);
    if (!profileId) {
      return createCorsResponse(404, { success: false, message: 'Profile not found' });
    }

    // Verify parent peak exists and check if responses are allowed
    const peakResult = await db.query(
      `SELECT id, author_id, allow_peak_responses, visibility
       FROM peaks
       WHERE id = $1`,
      [peakId]
    );

    if (peakResult.rows.length === 0) {
      return createCorsResponse(404, { success: false, message: 'Peak not found' });
    }

    const parentPeak = peakResult.rows[0];

    if (httpMethod === 'GET') {
      // Get all peak replies
      // Cap limit to 50 to prevent excessive queries
      const limit = Math.min(Number.parseInt(event.queryStringParameters?.limit || '20') || 20, 50);
      const cursor = event.queryStringParameters?.cursor;

      let query = `
        SELECT p.id, p.author_id, p.video_url, p.thumbnail_url, p.caption,
               p.likes_count, p.comments_count, p.views_count, p.peak_replies_count,
               p.duration, p.created_at,
               p.filter_id, p.filter_intensity, p.overlays,
               pr.id as profile_id, pr.username, pr.display_name, pr.full_name, pr.avatar_url, pr.is_verified,
               pr.account_type, pr.business_name,
               EXISTS(SELECT 1 FROM peak_likes l WHERE l.peak_id = p.id AND l.user_id = $2) as is_liked
        FROM peaks p
        JOIN profiles pr ON p.author_id = pr.id
        WHERE p.reply_to_peak_id = $1
      `;

      const queryParams: (string | number)[] = [peakId, profileId];

      if (cursor) {
        query += ` AND p.created_at < $3::timestamptz`;
        queryParams.push(cursor);
      }

      query += ` ORDER BY p.created_at DESC LIMIT $${queryParams.length + 1}`;
      queryParams.push(limit + 1);

      const repliesResult = await db.query(query, queryParams);

      const hasMore = repliesResult.rows.length > limit;
      const replies = repliesResult.rows.slice(0, limit).map((row: Record<string, unknown>) => ({
        id: row.id,
        authorId: row.author_id,
        videoUrl: row.video_url,
        thumbnailUrl: row.thumbnail_url,
        caption: row.caption,
        duration: row.duration,
        likesCount: row.likes_count,
        commentsCount: row.comments_count,
        viewsCount: row.views_count,
        repliesCount: row.peak_replies_count,
        filterId: row.filter_id || null,
        filterIntensity: row.filter_intensity ?? null,
        overlays: row.overlays || null,
        isLiked: row.is_liked,
        createdAt: row.created_at,
        author: {
          id: row.profile_id,
          username: row.username,
          displayName: row.display_name || row.full_name,
          avatarUrl: row.avatar_url,
          isVerified: row.is_verified,
          accountType: row.account_type || 'personal',
          businessName: row.business_name || null,
        },
      }));

      return createCorsResponse(200, {
        replies,
        nextCursor: hasMore ? replies[replies.length - 1].createdAt : null,
        hasMore,
        total: replies.length,
      });

    } else if (httpMethod === 'POST') {
      // Create a peak reply

      // Check if responses are allowed
      if (!parentPeak.allow_peak_responses) {
        return createCorsResponse(403, { success: false, message: 'Peak responses are disabled for this peak' });
      }

      // Check visibility - if private, only author can respond
      if (parentPeak.visibility === 'private' && parentPeak.author_id !== profileId) {
        return createCorsResponse(403, { success: false, message: 'This peak is private' });
      }

      // Parse request body
      const body = event.body ? JSON.parse(event.body) : {};
      const { videoUrl, thumbnailUrl, caption, duration } = body;

      if (!videoUrl) {
        return createCorsResponse(400, { success: false, message: 'Video URL is required' });
      }

      // SECURITY: Validate video URL is HTTPS and from allowed CDN domains
      try {
        const parsedUrl = new URL(videoUrl);
        if (parsedUrl.protocol !== 'https:') {
          return createCorsResponse(400, { success: false, message: 'Video URL must use HTTPS' });
        }
        const allowedDomains = ['.s3.amazonaws.com', '.s3.us-east-1.amazonaws.com', '.cloudfront.net'];
        if (!allowedDomains.some(d => parsedUrl.hostname.endsWith(d))) {
          return createCorsResponse(400, { success: false, message: 'Video URL must be from an allowed CDN domain' });
        }
      } catch {
        return createCorsResponse(400, { success: false, message: 'Invalid video URL format' });
      }

      // SECURITY: Validate thumbnailUrl if provided
      if (thumbnailUrl) {
        try {
          const parsedThumb = new URL(thumbnailUrl);
          if (parsedThumb.protocol !== 'https:') {
            return createCorsResponse(400, { success: false, message: 'Thumbnail URL must use HTTPS' });
          }
          const allowedDomains = ['.s3.amazonaws.com', '.s3.us-east-1.amazonaws.com', '.cloudfront.net'];
          if (!allowedDomains.some(d => parsedThumb.hostname.endsWith(d))) {
            return createCorsResponse(400, { success: false, message: 'Thumbnail URL must be from an allowed CDN domain' });
          }
        } catch {
          return createCorsResponse(400, { success: false, message: 'Invalid thumbnail URL format' });
        }
      }

      // SECURITY: Sanitize caption (strip HTML + control chars)
      const sanitizedCaption = caption
        ? caption.replace(/<[^>]*>/g, '').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '').substring(0, 500) // NOSONAR — intentional control char sanitization
        : null;

      if (!duration || typeof duration !== 'number' || duration <= 0) {
        return createCorsResponse(400, { success: false, message: 'Valid duration is required' });
      }

      // Inherit parent peak's visibility for replies
      const replyVisibility = parentPeak.visibility || 'public';

      // Create reply peak + increment count in a transaction
      const client = await db.connect();
      let newReply: Record<string, unknown>;

      try {
        await client.query('BEGIN');

        // Create the reply peak
        const result = await client.query(
          `INSERT INTO peaks (
            author_id, video_url, thumbnail_url, caption,
            duration, reply_to_peak_id, visibility, created_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
          RETURNING id, created_at`,
          [profileId, videoUrl, thumbnailUrl || null, sanitizedCaption, duration, peakId, replyVisibility]
        );

        newReply = result.rows[0];

        // Increment reply count on parent peak
        await client.query(
          'UPDATE peaks SET peak_replies_count = peak_replies_count + 1, updated_at = NOW() WHERE id = $1',
          [peakId]
        );

        // Get author info for notification body
        const authorResult = await client.query(
          'SELECT id, username, display_name, full_name, avatar_url, is_verified, account_type, business_name FROM profiles WHERE id = $1',
          [profileId]
        );
        const author = authorResult.rows[0];

        // Create notification for parent peak owner (if not self-reply) — inside transaction to prevent race condition
        if (parentPeak.author_id !== profileId) {
          await client.query(
            `INSERT INTO notifications (user_id, type, title, body, data)
             VALUES ($1, 'peak_reply', 'New Peak Reply', $2, $3)`,
            [
              parentPeak.author_id,
              `${author.display_name || author.full_name || 'Someone'} replied to your Peak`,
              JSON.stringify({ peakId: newReply.id, replyToPeakId: peakId, authorId: profileId, thumbnailUrl: thumbnailUrl || null })
            ]
          );
        }

        await client.query('COMMIT');
      } catch (txError: unknown) {
        await client.query('ROLLBACK');
        throw txError;
      } finally {
        client.release();
      }

      // Re-fetch author info for response (use pool, not released client)
      const authorResult = await db.query(
        'SELECT id, username, display_name, full_name, avatar_url, is_verified, account_type, business_name FROM profiles WHERE id = $1',
        [profileId]
      );
      const author = authorResult.rows[0];

      log.info('Peak reply created', { parentPeakId: peakId.substring(0, 8) + '***', replyId: (newReply.id as string).substring(0, 8) + '***', userId: userId.substring(0, 8) + '***' });

      return createCorsResponse(201, {
        success: true,
        reply: {
          id: newReply.id,
          authorId: profileId,
          videoUrl,
          thumbnailUrl,
          caption,
          duration,
          likesCount: 0,
          commentsCount: 0,
          viewsCount: 0,
          repliesCount: 0,
          isLiked: false,
          replyToPeakId: peakId,
          createdAt: newReply.created_at,
          author: {
            id: author.id,
            username: author.username,
            displayName: author.display_name || author.full_name,
            avatarUrl: author.avatar_url,
            isVerified: author.is_verified,
            accountType: author.account_type || 'personal',
            businessName: author.business_name || null,
          },
        },
      });
    }

    return createCorsResponse(405, { success: false, message: 'Method not allowed' });

  } catch (error: unknown) {
    log.error('Error in peak replies handler', error);
    return createCorsResponse(500, { success: false, message: 'Internal server error' });
  }
}

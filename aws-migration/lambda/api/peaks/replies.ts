/**
 * Peak Replies Handler
 * POST /peaks/{id}/replies - Create a peak as reply to another peak
 * GET /peaks/{id}/replies - Get all peak replies to a peak
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getPool } from '../../shared/db';
import { createCorsResponse } from '../utils/cors';
import { createLogger } from '../utils/logger';

const log = createLogger('peaks-replies');

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const userId = event.requestContext.authorizer?.claims?.sub;
  const peakId = event.pathParameters?.id;
  const httpMethod = event.httpMethod;

  if (!userId) {
    return createCorsResponse(401, { error: 'Unauthorized' });
  }

  if (!peakId) {
    return createCorsResponse(400, { error: 'Peak ID is required' });
  }

  // Validate UUID format
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(peakId)) {
    return createCorsResponse(400, { error: 'Invalid peak ID format' });
  }

  try {
    const db = await getPool();

    // Resolve cognito_sub to profile ID
    const profileResult = await db.query(
      'SELECT id FROM profiles WHERE cognito_sub = $1',
      [userId]
    );
    if (profileResult.rows.length === 0) {
      return createCorsResponse(404, { error: 'Profile not found' });
    }
    const profileId = profileResult.rows[0].id;

    // Verify parent peak exists and check if responses are allowed
    const peakResult = await db.query(
      `SELECT id, author_id, allow_peak_responses, visibility
       FROM posts
       WHERE id = $1 AND is_peak = true`,
      [peakId]
    );

    if (peakResult.rows.length === 0) {
      return createCorsResponse(404, { error: 'Peak not found' });
    }

    const parentPeak = peakResult.rows[0];

    if (httpMethod === 'GET') {
      // Get all peak replies
      const limit = parseInt(event.queryStringParameters?.limit || '20');
      const cursor = event.queryStringParameters?.cursor;

      let query = `
        SELECT p.id, p.author_id, p.media_url, p.media_urls, p.caption,
               p.likes_count, p.comments_count, p.views_count, p.peak_replies_count,
               p.peak_duration, p.created_at,
               pr.id as profile_id, pr.username, pr.display_name, pr.full_name, pr.avatar_url, pr.is_verified,
               EXISTS(SELECT 1 FROM likes l WHERE l.post_id = p.id AND l.user_id = $2) as is_liked
        FROM posts p
        JOIN profiles pr ON p.author_id = pr.id
        WHERE p.reply_to_peak_id = $1 AND p.is_peak = true
      `;

      const queryParams: (string | number)[] = [peakId, profileId];

      if (cursor) {
        query += ` AND p.created_at < (SELECT created_at FROM posts WHERE id = $3)`;
        queryParams.push(cursor);
      }

      query += ` ORDER BY p.created_at DESC LIMIT $${queryParams.length + 1}`;
      queryParams.push(limit + 1);

      const repliesResult = await db.query(query, queryParams);

      const hasMore = repliesResult.rows.length > limit;
      const replies = repliesResult.rows.slice(0, limit).map((row: Record<string, unknown>) => ({
        id: row.id,
        authorId: row.author_id,
        videoUrl: row.media_url || row.media_urls?.[0],
        thumbnailUrl: row.media_urls?.[1] || row.media_url,
        caption: row.caption,
        duration: row.peak_duration,
        likesCount: row.likes_count,
        commentsCount: row.comments_count,
        viewsCount: row.views_count,
        repliesCount: row.peak_replies_count,
        isLiked: row.is_liked,
        createdAt: row.created_at,
        author: {
          id: row.profile_id,
          username: row.username,
          displayName: row.display_name || row.full_name,
          avatarUrl: row.avatar_url,
          isVerified: row.is_verified,
        },
      }));

      return createCorsResponse(200, {
        replies,
        nextCursor: hasMore ? replies[replies.length - 1].id : null,
        hasMore,
        total: replies.length,
      });

    } else if (httpMethod === 'POST') {
      // Create a peak reply

      // Check if responses are allowed
      if (!parentPeak.allow_peak_responses) {
        return createCorsResponse(403, { error: 'Peak responses are disabled for this peak' });
      }

      // Check visibility - if private, only author can respond
      if (parentPeak.visibility === 'private' && parentPeak.author_id !== profileId) {
        return createCorsResponse(403, { error: 'This peak is private' });
      }

      // Parse request body
      const body = event.body ? JSON.parse(event.body) : {};
      const { videoUrl, thumbnailUrl, caption, duration } = body;

      if (!videoUrl) {
        return createCorsResponse(400, { error: 'Video URL is required' });
      }

      if (!duration || typeof duration !== 'number' || duration <= 0) {
        return createCorsResponse(400, { error: 'Valid duration is required' });
      }

      // Create the reply peak
      const result = await db.query(
        `INSERT INTO posts (
          author_id, media_url, media_urls, caption, media_type,
          is_peak, peak_duration, reply_to_peak_id, visibility, created_at
        )
        VALUES ($1, $2, $3, $4, 'video', TRUE, $5, $6, 'public', NOW())
        RETURNING id, created_at`,
        [
          profileId,
          videoUrl,
          thumbnailUrl ? [videoUrl, thumbnailUrl] : [videoUrl],
          caption || null,
          duration,
          peakId,
        ]
      );

      const newReply = result.rows[0];

      // Get author info
      const authorResult = await db.query(
        'SELECT id, username, display_name, full_name, avatar_url, is_verified FROM profiles WHERE id = $1',
        [profileId]
      );

      const author = authorResult.rows[0];

      // Create notification for parent peak owner (if not self-reply)
      if (parentPeak.author_id !== profileId) {
        await db.query(
          `INSERT INTO notifications (user_id, type, actor_id, post_id, message, created_at)
           VALUES ($1, 'peak_reply', $2, $3, $4, NOW())`,
          [parentPeak.author_id, profileId, peakId, 'replied to your Peak with a Peak']
        );
      }

      log.info('Peak reply created', { parentPeakId: peakId.substring(0, 8) + '***', replyId: newReply.id.substring(0, 8) + '***', userId: userId.substring(0, 8) + '***' });

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
          },
        },
      });
    }

    return createCorsResponse(405, { error: 'Method not allowed' });

  } catch (error: unknown) {
    log.error('Error in peak replies handler', error);
    return createCorsResponse(500, { error: 'Internal server error' });
  }
}

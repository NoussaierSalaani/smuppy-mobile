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
import { requireActiveAccount, isAccountError } from '../utils/account-status';
import { filterText } from '../../shared/moderation/textFilter';
import { analyzeTextToxicity } from '../../shared/moderation/textModeration';
import { SYSTEM_MODERATOR_ID } from '../../shared/moderation/constants';

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
    const { videoUrl, thumbnailUrl, caption, duration, replyToPeakId, hashtags, filterId, filterIntensity, overlays, feedDuration, saveToProfile } = body;

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
    const validFeedDuration = (feedDuration === 24 || feedDuration === 48) ? feedDuration : 48;
    const validSaveToProfile = typeof saveToProfile === 'boolean' ? saveToProfile : null;

    // Validate hashtags if provided (max 30 hashtags, each max 100 chars)
    const validHashtags: string[] = [];
    if (Array.isArray(hashtags)) {
      for (const tag of hashtags.slice(0, 30)) {
        if (typeof tag === 'string' && tag.length > 0 && tag.length <= 100) {
          const sanitized = tag.toLowerCase().replace(/[^\p{L}\p{N}_]/gu, '');
          if (sanitized.length > 0 && sanitized.length <= 100) {
            validHashtags.push(sanitized);
          }
        }
      }
    }

    // Check account moderation status
    const accountCheck = await requireActiveAccount(userId, headers);
    if (isAccountError(accountCheck)) return accountCheck;
    const profile = {
      id: accountCheck.profileId,
      username: accountCheck.username,
      full_name: accountCheck.fullName,
      avatar_url: accountCheck.avatarUrl,
      is_verified: accountCheck.isVerified,
      account_type: accountCheck.accountType,
    };

    const db = await getPool();

    // Sanitize caption
    const sanitizedCaption = caption ? sanitizeText(caption, 500) : null;

    // Comprehend flag tracking
    let contentFlagged = false;
    let flagCategory: string | null = null;
    let flagScore: number | null = null;

    // Backend content moderation check on caption
    if (sanitizedCaption) {
      const filterResult = await filterText(sanitizedCaption);
      if (!filterResult.clean && (filterResult.severity === 'critical' || filterResult.severity === 'high')) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ message: 'Content policy violation' }),
        };
      }

      // AI toxicity detection (AWS Comprehend)
      const toxicity = await analyzeTextToxicity(sanitizedCaption);
      if (toxicity.action === 'block') {
        log.info('Peak blocked by Comprehend', { topCategory: toxicity.topCategory, score: toxicity.maxScore });
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ message: 'Content policy violation' }),
        };
      }
      if (toxicity.action === 'flag') {
        contentFlagged = true;
        flagCategory = toxicity.topCategory;
        flagScore = toxicity.maxScore;
      }
    }

    // Validate reply parent exists if provided, save author_id for notification
    let replyParentAuthorId: string | null = null;
    if (replyToPeakId) {
      const parentResult = await db.query(
        'SELECT id, author_id FROM peaks WHERE id = $1',
        [replyToPeakId]
      );
      if (parentResult.rows.length === 0) {
        return {
          statusCode: 404,
          headers,
          body: JSON.stringify({ message: 'Reply target peak not found' }),
        };
      }
      replyParentAuthorId = parentResult.rows[0].author_id;
    }

    // Create peak
    const result = await db.query(
      `INSERT INTO peaks (author_id, video_url, thumbnail_url, caption, duration, reply_to_peak_id, filter_id, filter_intensity, overlays, expires_at, saved_to_profile, content_status, toxicity_score, toxicity_category)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW() + $10 * INTERVAL '1 hour', $11, $12, $13, $14)
       RETURNING id, video_url, thumbnail_url, caption, duration, reply_to_peak_id, filter_id, filter_intensity, overlays, likes_count, comments_count, views_count, created_at, expires_at, saved_to_profile`,
      [profile.id, videoUrl, thumbnailUrl || null, sanitizedCaption, videoDuration, replyToPeakId || null, validFilterId, validFilterIntensity, validOverlays, validFeedDuration, validSaveToProfile, contentFlagged ? 'flagged' : 'clean', flagScore, flagCategory]
    );

    const peak = result.rows[0];

    // Log flagged peak for moderator review (non-blocking)
    if (contentFlagged) {
      try {
        await db.query(
          `INSERT INTO moderation_log (moderator_id, action_type, target_user_id, reason)
           VALUES ($1, 'flag_content', $2, $3)`,
          [SYSTEM_MODERATOR_ID, profile.id, `Comprehend toxicity on peak ${peak.id}: ${flagCategory} score=${flagScore}`],
        );
      } catch (flagErr) {
        log.error('Failed to log flagged peak (non-blocking)', flagErr);
      }
    }

    // Send notification to parent peak author if this is a reply (uses pre-validated author_id)
    if (replyToPeakId && replyParentAuthorId && replyParentAuthorId !== profile.id) {
      try {
        await db.query(
          `INSERT INTO notifications (user_id, type, title, body, data)
           VALUES ($1, 'peak_reply', 'New Peak Reply', $2, $3)`,
          [
            replyParentAuthorId,
            `${profile.full_name || 'Someone'} replied to your Peak`,
            JSON.stringify({ peakId: peak.id, replyToPeakId, authorId: profile.id, thumbnailUrl: thumbnailUrl || null }),
          ]
        );
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
    // Uses a transaction to ensure atomicity: snapshot of followers + insert are consistent
    // INSERT...SELECT is atomic within a single statement, wrapped in explicit transaction for safety
    const notifClient = await db.connect();
    try {
      await notifClient.query('BEGIN');
      await notifClient.query(
        `INSERT INTO notifications (user_id, type, title, body, data)
         SELECT f.follower_id, 'new_peak', 'New Peak', $1, $2
         FROM follows f
         JOIN profiles p ON p.id = f.follower_id
         WHERE f.following_id = $3 AND f.status = 'accepted'
         LIMIT 500`,
        [
          `${profile.full_name || 'Someone'} posted a new Peak`,
          JSON.stringify({ peakId: peak.id, authorId: profile.id }),
          profile.id,
        ]
      );
      await notifClient.query('COMMIT');
    } catch (notifErr) {
      await notifClient.query('ROLLBACK').catch(() => {});
      log.error('Failed to send follower notifications', notifErr);
    } finally {
      notifClient.release();
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
          expiresAt: peak.expires_at || null,
          savedToProfile: peak.saved_to_profile ?? null,
          hashtags: validHashtags,
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

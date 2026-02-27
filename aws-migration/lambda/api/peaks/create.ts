/**
 * Create Peak Lambda Handler
 * Creates a new peak (short video)
 */

import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';
import { HeadObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { withAuthHandler } from '../utils/with-auth-handler';
import { requireRateLimit } from '../utils/rate-limit';
import { RATE_WINDOW_1_MIN, MAX_PEAK_DURATION_SECONDS } from '../utils/constants';
import { sanitizeText, isValidUUID } from '../utils/security';
import { requireActiveAccount, isAccountError } from '../utils/account-status';
import { checkQuota, deductQuota, getQuotaLimits, isPremiumAccount } from '../utils/upload-quota';
import { moderateText } from '../utils/text-moderation';
import { SYSTEM_MODERATOR_ID } from '../../shared/moderation/constants';
import { sendPushToUser } from '../services/push-notification';

const lambdaClient = new LambdaClient({});
const START_VIDEO_PROCESSING_FN = process.env.START_VIDEO_PROCESSING_FN;
const MEDIA_BUCKET = process.env.MEDIA_BUCKET?.trim() || '';
const s3Client = MEDIA_BUCKET ? new S3Client({
  requestChecksumCalculation: 'WHEN_REQUIRED',
  responseChecksumValidation: 'WHEN_REQUIRED',
}) : null;
const MIN_MEDIA_FILE_BYTES = 512;

// SECURITY: Validate URL format and restrict to trusted CDN/S3 domains
const ALLOWED_MEDIA_HOSTS = ['.s3.amazonaws.com', '.s3.us-east-1.amazonaws.com', '.cloudfront.net'];

function isValidUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') return false;
    const hostname = parsed.hostname.toLowerCase();
    return ALLOWED_MEDIA_HOSTS.some(suffix => hostname.endsWith(suffix));
  } catch {
    return false;
  }
}

function extractObjectKeyFromUrl(mediaUrl: string): string | null {
  try {
    const parsed = new URL(mediaUrl);
    const objectKey = decodeURIComponent(parsed.pathname).replace(/^\/+/, '');
    return objectKey || null;
  } catch {
    return null;
  }
}

function isStorageNotFoundError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const err = error as { name?: string; Code?: string; $metadata?: { httpStatusCode?: number } };
  return (
    err.name === 'NotFound' ||
    err.name === 'NoSuchKey' ||
    err.Code === 'NotFound' ||
    err.Code === 'NoSuchKey' ||
    err.$metadata?.httpStatusCode === 404
  );
}

async function ensureMediaObjectReady(mediaUrl: string | undefined, headers: Record<string, string>) {
  if (process.env.NODE_ENV === 'test') return null;
  if (!mediaUrl || !MEDIA_BUCKET || !s3Client) return null;

  const objectKey = extractObjectKeyFromUrl(mediaUrl);
  if (!objectKey) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ message: 'Invalid media URL format' }),
    };
  }
  if (objectKey.startsWith('pending-scan/')) {
    return {
      statusCode: 409,
      headers,
      body: JSON.stringify({ success: false, code: 'MEDIA_NOT_READY', message: 'Media is still processing. Please retry in a few seconds.' }),
    };
  }

  try {
    const metadata = await s3Client.send(new HeadObjectCommand({
      Bucket: MEDIA_BUCKET,
      Key: objectKey,
    }));
    if (typeof metadata.ContentLength === 'number' && metadata.ContentLength > 0 && metadata.ContentLength < MIN_MEDIA_FILE_BYTES) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ success: false, code: 'MEDIA_INVALID', message: 'Uploaded media is invalid or corrupted. Please upload a different file.' }),
      };
    }
    return null;
  } catch (error_) {
    if (isStorageNotFoundError(error_)) {
      return {
        statusCode: 409,
        headers,
        body: JSON.stringify({ success: false, code: 'MEDIA_NOT_READY', message: 'Media is still processing. Please retry in a few seconds.' }),
      };
    }
    // Any other S3 error → treat as transient so client retries instead of hard 500
    const errName = (error_ as { name?: string })?.name || 'Unknown';
    console.error(`[ensureMediaObjectReady] S3 HeadObject failed: ${errName}`, error_);
    return {
      statusCode: 409,
      headers,
      body: JSON.stringify({ success: false, code: 'MEDIA_NOT_READY', message: 'Media is still processing. Please retry in a few seconds.' }),
    };
  }
}

export const handler = withAuthHandler('peaks-create', async (event, { headers, log, cognitoSub, db }) => {
    const rateLimitResponse = await requireRateLimit({
      prefix: 'peak-create',
      identifier: cognitoSub,
      windowSeconds: RATE_WINDOW_1_MIN,
      maxRequests: 5,
    }, headers);
    if (rateLimitResponse) return rateLimitResponse;

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

    const videoReadyError = await ensureMediaObjectReady(videoUrl, headers);
    if (videoReadyError) return videoReadyError;

    const thumbnailReadyError = await ensureMediaObjectReady(thumbnailUrl, headers);
    if (thumbnailReadyError) return thumbnailReadyError;

    // Validate replyToPeakId if provided
    if (replyToPeakId && (typeof replyToPeakId !== 'string' || !isValidUUID(replyToPeakId))) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ message: 'Invalid reply peak ID format' }),
      };
    }

    // Validate duration (max 60 seconds for peaks)
    const videoDuration = typeof duration === 'number' ? Math.min(duration, MAX_PEAK_DURATION_SECONDS) : null;

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
          const sanitized = tag.toLowerCase().replaceAll(/[^\p{L}\p{N}_]/gu, '');
          if (sanitized.length > 0 && sanitized.length <= 100) {
            validHashtags.push(sanitized);
          }
        }
      }
    }

    // Check account moderation status
    const accountCheck = await requireActiveAccount(cognitoSub, headers);
    if (isAccountError(accountCheck)) return accountCheck;
    const profile = {
      id: accountCheck.profileId,
      username: accountCheck.username,
      full_name: accountCheck.fullName,
      avatar_url: accountCheck.avatarUrl,
      is_verified: accountCheck.isVerified,
      account_type: accountCheck.accountType,
    };

    // Business accounts cannot create peaks
    if (profile.account_type === 'pro_business') {
      return {
        statusCode: 403,
        headers,
        body: JSON.stringify({ message: 'Business accounts cannot create peaks' }),
      };
    }

    // Quota enforcement for non-premium accounts
    const quotaLimits = getQuotaLimits(profile.account_type);
    if (!isPremiumAccount(profile.account_type)) {
      if (quotaLimits.dailyPeakCount !== null) {
        const peakQuota = await checkQuota(profile.id, profile.account_type, 'peak', 1);
        if (!peakQuota.allowed) {
          return {
            statusCode: 429,
            headers,
            body: JSON.stringify({
              success: false,
              message: 'Daily peak limit reached. Upgrade to Pro for unlimited peaks.',
              quotaType: 'peak_count',
              remaining: peakQuota.remaining,
              limit: peakQuota.limit,
            }),
          };
        }
      }
      if (quotaLimits.dailyVideoSeconds !== null && videoDuration && videoDuration > 0) {
        const videoQuota = await checkQuota(profile.id, profile.account_type, 'video', Math.ceil(videoDuration));
        if (!videoQuota.allowed) {
          return {
            statusCode: 429,
            headers,
            body: JSON.stringify({
              success: false,
              message: 'Daily video upload limit reached. Upgrade to Pro for unlimited uploads.',
              quotaType: 'video_seconds',
              remaining: videoQuota.remaining,
              limit: videoQuota.limit,
            }),
          };
        }
      }
    }

    // Sanitize caption
    const sanitizedCaption = caption ? sanitizeText(caption, 500) : null;

    // Backend content moderation check on caption (keyword filter + Comprehend toxicity)
    let contentFlagged = false;
    let flagCategory: string | null = null;
    let flagScore: number | null = null;

    if (sanitizedCaption) {
      const modResult = await moderateText(sanitizedCaption, headers, log, 'peak caption');
      if (modResult.blocked) return modResult.blockResponse!;
      contentFlagged = modResult.contentFlagged;
      flagCategory = modResult.flagCategory;
      flagScore = modResult.flagScore;
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

    // Create peak + hashtags in a single transaction for atomicity
    const peakClient = await db.connect();
    let peak: Record<string, unknown>;
    try {
      await peakClient.query('BEGIN');

      const result = await peakClient.query(
        `INSERT INTO peaks (author_id, video_url, thumbnail_url, caption, duration, reply_to_peak_id, filter_id, filter_intensity, overlays, expires_at, saved_to_profile, content_status, toxicity_score, toxicity_category, video_status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW() + $10 * INTERVAL '1 hour', $11, $12, $13, $14, 'uploaded')
         RETURNING id, video_url, thumbnail_url, caption, duration, reply_to_peak_id, filter_id, filter_intensity, overlays, likes_count, comments_count, views_count, created_at, expires_at, saved_to_profile, video_status`,
        [profile.id, videoUrl, thumbnailUrl || null, sanitizedCaption, videoDuration, replyToPeakId || null, validFilterId, validFilterIntensity, validOverlays, validFeedDuration, validSaveToProfile, contentFlagged ? 'flagged' : 'clean', flagScore, flagCategory]
      );

      peak = result.rows[0];

      // Insert hashtags atomically with the peak
      if (validHashtags.length > 0) {
        const hashtagValues = validHashtags.map((_, i) => `($1, $${i + 2})`).join(', ');
        await peakClient.query(
          `INSERT INTO peak_hashtags (peak_id, hashtag) VALUES ${hashtagValues} ON CONFLICT DO NOTHING`,
          [peak.id, ...validHashtags]
        );
      }

      // Log flagged peak for moderator review (inside transaction)
      if (contentFlagged) {
        await peakClient.query(
          `INSERT INTO moderation_log (moderator_id, action_type, target_user_id, reason)
           VALUES ($1, 'flag_content', $2, $3)`,
          [SYSTEM_MODERATOR_ID, profile.id, `Comprehend toxicity on peak ${peak.id}: ${flagCategory} score=${flagScore}`],
        );
      }

      await peakClient.query('COMMIT');
    } catch (error_) {
      await peakClient.query('ROLLBACK').catch(() => {});
      throw error_;
    } finally {
      peakClient.release();
    }

    // Deduct quotas after successful insert (non-blocking, personal accounts only)
    if (!isPremiumAccount(profile.account_type)) {
      try {
        await deductQuota(profile.id, 'peak', 1);
        if (videoDuration && videoDuration > 0) {
          await deductQuota(profile.id, 'video', Math.ceil(videoDuration));
        }
      } catch (error_) {
        log.error('Failed to deduct quota (non-blocking)', error_);
      }
    }

    // Send notification to parent peak author if this is a reply (non-blocking, best-effort)
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
        sendPushToUser(db, replyParentAuthorId, {
          title: 'New Peak Reply',
          body: `${profile.full_name || 'Someone'} replied to your Peak`,
          data: { type: 'peak_reply', peakId: peak.id as string },
        }, profile.id).catch(error_ => log.error('Push peak_reply failed', error_));
      } catch (error_) {
        log.error('Failed to send reply notification', error_);
      }
    }

    // Send notification to followers (fire and forget, capped at 500)
    // Idempotent: ON CONFLICT prevents duplicates per follower per peak from Lambda retries
    const notifClient = await db.connect();
    try {
      await notifClient.query('BEGIN');
      await notifClient.query(
        `INSERT INTO notifications (user_id, type, title, body, data, idempotency_key)
         SELECT f.follower_id, 'new_peak', 'New Peak', $1, $2,
                'new_peak:' || $3::text || ':' || $4::text || ':' || f.follower_id::text
         FROM follows f
         JOIN profiles p ON p.id = f.follower_id
         WHERE f.following_id = $3 AND f.status = 'accepted'
         LIMIT 500
         ON CONFLICT (idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING`,
        [
          `${profile.full_name || 'Someone'} posted a new Peak`,
          JSON.stringify({ peakId: peak.id, authorId: profile.id }),
          profile.id,
          peak.id,
        ]
      );
      await notifClient.query('COMMIT');
    } catch (error_) {
      await notifClient.query('ROLLBACK').catch(() => {});
      log.error('Failed to send follower notifications', error_);
    } finally {
      notifClient.release();
    }

    // Trigger async video processing for HLS transcoding
    if (START_VIDEO_PROCESSING_FN && videoUrl) {
      try {
        const parsed = new URL(videoUrl);
        const sourceKey = parsed.pathname.replace(/^\//, '');
        await lambdaClient.send(new InvokeCommand({
          FunctionName: START_VIDEO_PROCESSING_FN,
          InvocationType: 'Event',
          Payload: Buffer.from(JSON.stringify({
            body: JSON.stringify({ entityType: 'peak', entityId: peak.id, sourceKey }),
          })),
        }));
        log.info('Video processing triggered for peak', { peakId: (peak.id as string).substring(0, 8) + '...' });
      } catch (error_) {
        log.error('Failed to trigger video processing (non-blocking)', error_);
      }
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
          videoStatus: peak.video_status || null,
          hashtags: validHashtags,
          isLiked: false,
          author: {
            id: profile.id,
            username: profile.username,
            fullName: profile.full_name,
            avatarUrl: profile.avatar_url,
            isVerified: !!profile.is_verified,
            accountType: profile.account_type,
          },
        },
      }),
    };
});

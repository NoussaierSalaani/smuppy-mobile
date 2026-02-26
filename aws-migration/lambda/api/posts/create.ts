/**
 * Create Post Lambda Handler
 * Creates a new post with media support
 */

import { APIGatewayProxyResult } from 'aws-lambda';
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';
import { HeadObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { v4 as uuidv4 } from 'uuid';
import type { Pool, PoolClient } from 'pg';
import { withAuthHandler } from '../utils/with-auth-handler';
import { requireRateLimit } from '../utils/rate-limit';
import { isValidUUID } from '../utils/security';
import { RATE_WINDOW_1_MIN, MAX_POST_CONTENT_LENGTH, MAX_MEDIA_URL_LENGTH } from '../utils/constants';
import { requireActiveAccount, isAccountError } from '../utils/account-status';
import { checkQuota, deductQuota, getQuotaLimits, isPremiumAccount } from '../utils/upload-quota';
import { moderateText } from '../utils/text-moderation';
import { SYSTEM_MODERATOR_ID } from '../../shared/moderation/constants';
import type { Logger } from '../utils/logger';

const lambdaClient = new LambdaClient({});
const START_VIDEO_PROCESSING_FN = process.env.START_VIDEO_PROCESSING_FN;
const MEDIA_BUCKET = process.env.MEDIA_BUCKET?.trim() || '';
const s3Client = MEDIA_BUCKET ? new S3Client({}) : null;

const MAX_MEDIA_URLS = 10;
const MAX_TAGGED_USERS = 20;
const MIN_MEDIA_FILE_BYTES = 512;
const ALLOWED_VISIBILITIES = new Set(['public', 'fans', 'private', 'subscribers']);
const ALLOWED_MEDIA_TYPES = new Set(['image', 'video', 'multiple']);
const CONTROL_CHARS = /[\u0000-\u001F\u007F]/g; // NOSONAR — intentional control char sanitization

// SECURITY: Only allow media from our own S3/CDN domains
const ALLOWED_MEDIA_DOMAINS = [
  '.s3.amazonaws.com',
  '.s3.us-east-1.amazonaws.com',
  '.cloudfront.net',
];

interface CreatePostInput {
  content?: string;
  mediaUrls?: string[];
  mediaType?: 'image' | 'video' | 'multiple';
  visibility?: 'public' | 'fans' | 'private' | 'subscribers';
  location?: string;
  taggedUsers?: string[];
  videoDuration?: number;
}

interface ModerationFlags {
  contentFlagged: boolean;
  flagCategory: string | null;
  flagScore: number | null;
}

type Headers = Record<string, string>;

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

async function ensureMediaObjectsReady(
  mediaUrls: string[] | undefined,
  headers: Headers,
): Promise<APIGatewayProxyResult | null> {
  if (process.env.NODE_ENV === 'test') return null;
  if (!MEDIA_BUCKET || !s3Client || !Array.isArray(mediaUrls) || mediaUrls.length === 0) return null;

  for (const mediaUrl of mediaUrls) {
    const objectKey = extractObjectKeyFromUrl(mediaUrl);
    if (!objectKey) return errorResponse(400, headers, 'Invalid media URL');
    if (objectKey.startsWith('pending-scan/')) {
      return errorResponse(409, headers, 'Media is still processing. Please retry in a few seconds.', { code: 'MEDIA_NOT_READY' });
    }

    try {
      const metadata = await s3Client.send(new HeadObjectCommand({
        Bucket: MEDIA_BUCKET,
        Key: objectKey,
      }));
      if (typeof metadata.ContentLength === 'number' && metadata.ContentLength > 0 && metadata.ContentLength < MIN_MEDIA_FILE_BYTES) {
        return errorResponse(400, headers, 'Uploaded media is invalid or corrupted. Please upload a different file.', { code: 'MEDIA_INVALID' });
      }
    } catch (error_) {
      if (isStorageNotFoundError(error_)) {
        return errorResponse(409, headers, 'Media is still processing. Please retry in a few seconds.', { code: 'MEDIA_NOT_READY' });
      }
      throw error_;
    }
  }

  return null;
}

// ── Helper: error response builder ───────────────────────────────────

function errorResponse(statusCode: number, headers: Headers, message: string, extra?: Record<string, unknown>): APIGatewayProxyResult {
  return {
    statusCode,
    headers,
    body: JSON.stringify({ success: false, message, ...extra }),
  };
}

// ── Step 1: Parse + validate input fields ────────────────────────────

function validatePostInput(body: CreatePostInput, hasMedia: boolean, headers: Headers): APIGatewayProxyResult | null {
  if (body.visibility && !ALLOWED_VISIBILITIES.has(body.visibility)) {
    return errorResponse(400, headers, 'Invalid visibility value');
  }

  if (body.mediaType && !ALLOWED_MEDIA_TYPES.has(body.mediaType)) {
    return errorResponse(400, headers, 'Invalid media type');
  }

  if (!hasMedia) return null;

  return validateMediaUrls(body.mediaUrls!, headers);
}

// ── Step 2: Validate media URL array ─────────────────────────────────

function validateMediaUrls(mediaUrls: string[], headers: Headers): APIGatewayProxyResult | null {
  if (mediaUrls.length > MAX_MEDIA_URLS) {
    return errorResponse(400, headers, `Maximum ${MAX_MEDIA_URLS} media files allowed`);
  }

  const hasInvalidUrl = mediaUrls.some(
    (url) => typeof url !== 'string' || url.length === 0 || url.length > MAX_MEDIA_URL_LENGTH
  );
  if (hasInvalidUrl) {
    return errorResponse(400, headers, 'Invalid media URL');
  }

  const hasUntrustedUrl = mediaUrls.some((url) => {
    try {
      const parsed = new URL(url);
      return !ALLOWED_MEDIA_DOMAINS.some(domain => parsed.hostname.endsWith(domain));
    } catch {
      return true;
    }
  });
  if (hasUntrustedUrl) {
    return errorResponse(400, headers, 'Media URLs must point to our CDN');
  }

  return null;
}

// ── Step 3: Sanitize text fields ─────────────────────────────────────

function sanitizeContent(raw: string | undefined): string {
  return (raw || '')
    .replaceAll(/<[^>]*>/g, '') // NOSONAR
    .replaceAll(CONTROL_CHARS, '')
    .trim()
    .slice(0, MAX_POST_CONTENT_LENGTH);
}

function sanitizeLocation(raw: string | undefined): string | null {
  if (!raw) return null;
  return raw.replaceAll(/<[^>]*>/g, '').replaceAll(CONTROL_CHARS, '').trim().slice(0, 200); // NOSONAR
}

// ── Step 4: Quota enforcement (non-premium accounts only) ────────────

async function enforceQuota(
  body: CreatePostInput,
  userId: string,
  accountType: string,
  headers: Headers,
): Promise<APIGatewayProxyResult | null> {
  if (isPremiumAccount(accountType)) return null;

  const limits = getQuotaLimits(accountType);
  const isVideoPost = body.mediaType === 'video';
  const mediaCount = Array.isArray(body.mediaUrls) ? body.mediaUrls.length : 0;

  if (isVideoPost) {
    return enforceVideoQuota(body, userId, accountType, limits.maxVideoSeconds, headers);
  }

  if (mediaCount > 0 && (body.mediaType === 'image' || body.mediaType === 'multiple')) {
    return enforcePhotoQuota(userId, accountType, mediaCount, headers);
  }

  return null;
}

async function enforceVideoQuota(
  body: CreatePostInput,
  userId: string,
  accountType: string,
  maxVideoSeconds: number,
  headers: Headers,
): Promise<APIGatewayProxyResult | null> {
  const videoDuration = typeof body.videoDuration === 'number' ? Math.ceil(body.videoDuration) : 0;

  if (videoDuration > maxVideoSeconds) {
    return errorResponse(400, headers, `Video must be ${maxVideoSeconds} seconds or less`);
  }

  if (videoDuration <= 0) return null;

  const videoQuota = await checkQuota(userId, accountType, 'video', videoDuration);
  if (!videoQuota.allowed) {
    return errorResponse(429, headers, 'Daily video upload limit reached. Upgrade to Pro for unlimited uploads.', {
      quotaType: 'video_seconds',
      remaining: videoQuota.remaining,
      limit: videoQuota.limit,
    });
  }

  return null;
}

async function enforcePhotoQuota(
  userId: string,
  accountType: string,
  mediaCount: number,
  headers: Headers,
): Promise<APIGatewayProxyResult | null> {
  const photoQuota = await checkQuota(userId, accountType, 'photo', mediaCount);
  if (!photoQuota.allowed) {
    return errorResponse(429, headers, 'Daily photo upload limit reached. Upgrade to Pro for unlimited uploads.', {
      quotaType: 'photo_count',
      remaining: photoQuota.remaining,
      limit: photoQuota.limit,
    });
  }
  return null;
}

// ── Step 5: Visibility permission checks ─────────────────────────────

function checkVisibilityPermissions(
  visibility: string | undefined,
  accountType: string,
  headers: Headers,
): APIGatewayProxyResult | null {
  if (visibility === 'subscribers' && accountType !== 'pro_creator') {
    return errorResponse(403, headers, 'Subscribers visibility requires a creator account');
  }
  if (accountType === 'pro_business' && visibility && visibility !== 'public') {
    return errorResponse(403, headers, 'Business accounts can only create public posts');
  }
  return null;
}

// ── Step 6: Process tagged users inside transaction ──────────────────

async function processTaggedUsers(
  client: PoolClient,
  validTaggedIds: string[],
  postId: string,
  userId: string,
): Promise<Set<string>> {
  if (validTaggedIds.length === 0) return new Set<string>();

  const existsResult = await client.query(
    `SELECT id FROM profiles WHERE id = ANY($1::uuid[])`,
    [validTaggedIds]
  );
  const existingTaggedIds = new Set(existsResult.rows.map((r: { id: string }) => r.id));
  const tagsToInsert = validTaggedIds.filter((tid) => existingTaggedIds.has(tid));

  if (tagsToInsert.length === 0) return existingTaggedIds;

  // Batch insert post_tags using UNNEST
  await client.query(
    `INSERT INTO post_tags (post_id, tagged_user_id, tagged_by_user_id, created_at)
     SELECT $1, unnest($3::uuid[]), $2, NOW()
     ON CONFLICT (post_id, tagged_user_id) DO NOTHING`,
    [postId, userId, tagsToInsert]
  );

  // Batch insert notifications using UNNEST
  const notifData = JSON.stringify({ senderId: userId, postId });
  await client.query(
    `INSERT INTO notifications (user_id, type, title, body, data, created_at)
     SELECT unnest($3::uuid[]), 'post_tag', 'You were tagged', $1, $2, NOW()`,
    ['tagged you in a post', notifData, tagsToInsert]
  );

  return existingTaggedIds;
}

// ── Step 7: Post-transaction side effects (all non-blocking) ─────────

async function deductQuotaAfterInsert(
  body: CreatePostInput,
  userId: string,
  accountType: string,
  hasMedia: boolean,
  log: Logger,
): Promise<void> {
  if (isPremiumAccount(accountType)) return;

  try {
    if (body.mediaType === 'video' && typeof body.videoDuration === 'number' && body.videoDuration > 0) {
      await deductQuota(userId, 'video', Math.ceil(body.videoDuration));
    } else if (hasMedia && (body.mediaType === 'image' || body.mediaType === 'multiple')) {
      await deductQuota(userId, 'photo', body.mediaUrls!.length);
    }
  } catch (error_) {
    log.error('Failed to deduct quota (non-blocking)', error_);
  }
}

async function logFlaggedContent(
  db: Pool,
  userId: string,
  postId: string,
  flags: ModerationFlags,
  log: Logger,
): Promise<void> {
  if (!flags.contentFlagged) return;

  try {
    await db.query(
      `INSERT INTO moderation_log (moderator_id, action_type, target_user_id, target_post_id, reason)
       VALUES ($1, 'flag_content', $2, $3, $4)`,
      [SYSTEM_MODERATOR_ID, userId, postId, `Comprehend toxicity: ${flags.flagCategory} score=${flags.flagScore} (under_review)`],
    );
  } catch (error_) {
    log.error('Failed to log flagged content (non-blocking)', error_);
  }
}

async function triggerVideoProcessing(
  postId: string,
  mediaUrls: string[],
  log: Logger,
): Promise<void> {
  if (!START_VIDEO_PROCESSING_FN || mediaUrls.length === 0) return;

  try {
    const parsed = new URL(mediaUrls[0]);
    const sourceKey = parsed.pathname.replace(/^\//, '');
    await lambdaClient.send(new InvokeCommand({
      FunctionName: START_VIDEO_PROCESSING_FN,
      InvocationType: 'Event', // async — fire and forget
      Payload: Buffer.from(JSON.stringify({
        body: JSON.stringify({ entityType: 'post', entityId: postId, sourceKey }),
      })),
    }));
    log.info('Video processing triggered', { postId: postId.substring(0, 8) + '...' });
  } catch (error_) {
    log.error('Failed to trigger video processing (non-blocking)', error_);
  }
}

// ── Step 8: Build response ───────────────────────────────────────────

async function fetchAuthor(db: Pool, userId: string): Promise<Record<string, unknown> | null> {
  const authorResult = await db.query(
    `SELECT id, username, full_name, avatar_url, is_verified, account_type, business_name
     FROM profiles WHERE id = $1`,
    [userId]
  );

  const row = authorResult.rows[0];
  if (!row) return null;

  return {
    id: row.id,
    username: row.username,
    fullName: row.full_name,
    avatarUrl: row.avatar_url,
    isVerified: row.is_verified,
    accountType: row.account_type,
    businessName: row.business_name,
  };
}

// ── Main handler ─────────────────────────────────────────────────────

export const handler = withAuthHandler('posts-create', async (event, { headers, log, cognitoSub, db }) => {
    const rateLimitResponse = await requireRateLimit({
      prefix: 'post-create',
      identifier: cognitoSub,
      windowSeconds: RATE_WINDOW_1_MIN,
      maxRequests: 10,
    }, headers);
    if (rateLimitResponse) return rateLimitResponse;

    let body: CreatePostInput;
    try {
      body = JSON.parse(event.body || '{}');
    } catch {
      return errorResponse(400, headers, 'Invalid request body');
    }

    const hasContent = typeof body.content === 'string' && body.content.trim().length > 0;
    const hasMedia = Array.isArray(body.mediaUrls) && body.mediaUrls.length > 0;
    if (!hasContent && !hasMedia) {
      return errorResponse(400, headers, 'Content or media is required');
    }

    const inputError = validatePostInput(body, hasMedia, headers);
    if (inputError) return inputError;

    const sanitizedContent = sanitizeContent(body.content);
    const sanitizedLocation = sanitizeLocation(body.location);

    // Backend content moderation check (keyword filter + Comprehend toxicity)
    const flags: ModerationFlags = { contentFlagged: false, flagCategory: null, flagScore: null };

    if (sanitizedContent) {
      const modResult = await moderateText(sanitizedContent, headers, log, 'post');
      if (modResult.blocked) return modResult.blockResponse!;
      flags.contentFlagged = modResult.contentFlagged;
      flags.flagCategory = modResult.flagCategory;
      flags.flagScore = modResult.flagScore;
    }

    // Check account moderation status
    const accountCheck = await requireActiveAccount(cognitoSub, headers);
    if (isAccountError(accountCheck)) return accountCheck;
    const userId = accountCheck.profileId;

    // Duplicate content detection: same author, same content hash, within 1 hour
    if (sanitizedContent) {
      const dupCheck = await db.query(
        `SELECT id FROM posts
         WHERE author_id = $1 AND md5(content) = md5($2)
           AND created_at > NOW() - INTERVAL '1 hour'
         LIMIT 1`,
        [userId, sanitizedContent]
      );
      if (dupCheck.rows.length > 0) {
        return errorResponse(409, headers, 'Duplicate content detected. This post was already published.');
      }
    }

    // Get account_type for visibility + quota checks
    const userResult = await db.query(
      'SELECT account_type FROM profiles WHERE id = $1',
      [userId]
    );
    const accountType = userResult.rows[0]?.account_type || 'personal';

    const quotaError = await enforceQuota(body, userId, accountType, headers);
    if (quotaError) return quotaError;

    const visibilityError = checkVisibilityPermissions(body.visibility, accountType, headers);
    if (visibilityError) return visibilityError;

    const mediaReadyError = await ensureMediaObjectsReady(body.mediaUrls, headers);
    if (mediaReadyError) return mediaReadyError;

    const postId = uuidv4();
    const isVideoPost = body.mediaType === 'video';

    const validTaggedIds = (Array.isArray(body.taggedUsers) ? body.taggedUsers : [])
      .filter((tid): tid is string => typeof tid === 'string' && isValidUUID(tid) && tid !== userId)
      .slice(0, MAX_TAGGED_USERS);

    // ── Transaction: insert post + tags + notifications ──────────────
    const client = await db.connect();
    let post: Record<string, unknown>;
    let existingTaggedIds: Set<string>;

    try {
      await client.query('BEGIN');

      const result = await client.query(
        `INSERT INTO posts (id, author_id, content, media_urls, media_type, visibility, location, content_status, toxicity_score, toxicity_category, video_status, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
         RETURNING id, author_id, content, media_urls, media_type, visibility, location, likes_count, comments_count, video_status, created_at`,
        [
          postId,
          userId,
          sanitizedContent,
          body.mediaUrls || [],
          body.mediaType || null,
          body.visibility || 'public',
          sanitizedLocation,
          flags.contentFlagged ? 'flagged' : 'clean',
          flags.flagScore,
          flags.flagCategory,
          isVideoPost ? 'uploaded' : null,
        ]
      );

      post = result.rows[0];
      existingTaggedIds = await processTaggedUsers(client, validTaggedIds, postId, userId);

      await client.query('COMMIT');
    } catch (error_) {
      await client.query('ROLLBACK');
      throw error_;
    } finally {
      client.release();
    }

    // ── Non-blocking side effects ────────────────────────────────────
    await deductQuotaAfterInsert(body, userId, accountType, hasMedia, log);
    await logFlaggedContent(db, userId, postId, flags, log);

    if (isVideoPost && hasMedia) {
      await triggerVideoProcessing(postId, body.mediaUrls!, log);
    }

    // ── Build response ───────────────────────────────────────────────
    const author = await fetchAuthor(db, userId);
    const taggedUserIds = validTaggedIds.filter((tid) => existingTaggedIds.has(tid));

    return {
      statusCode: 201,
      headers,
      body: JSON.stringify({
        success: true,
        id: post.id,
        authorId: post.author_id,
        content: post.content,
        mediaUrls: post.media_urls || [],
        mediaType: post.media_type,
        mediaMeta: null,
        visibility: post.visibility,
        location: post.location || null,
        taggedUsers: taggedUserIds,
        likesCount: 0,
        commentsCount: 0,
        isSaved: false,
        videoStatus: post.video_status || null,
        createdAt: post.created_at,
        author,
      }),
    };
});

/**
 * Media Upload URL Lambda Handler
 * Generates presigned S3 URLs for secure client-side uploads
 *
 * SECURITY:
 * - Validates file type against whitelist
 * - Limits file size
 * - Scopes upload to user's folder
 * - Short-lived presigned URLs (5 minutes)
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomBytes } from 'crypto';
import { createHeaders } from '../utils/cors';
import { createLogger } from '../utils/logger';
import { checkRateLimit } from '../utils/rate-limit';
import { RATE_WINDOW_1_MIN, PRESIGNED_URL_EXPIRY_SECONDS } from '../utils/constants';
import { getPool } from '../../shared/db';
import { checkQuota, getQuotaLimits } from '../utils/upload-quota';

const log = createLogger('media-upload-url');

const s3Client = new S3Client({
  requestChecksumCalculation: 'WHEN_REQUIRED',
  responseChecksumValidation: 'WHEN_REQUIRED',
});

// Validate required environment variables
if (!process.env.MEDIA_BUCKET) {
  throw new Error('MEDIA_BUCKET environment variable is required');
}

const MEDIA_BUCKET = process.env.MEDIA_BUCKET;

// SECURITY: Whitelist of allowed content types
const ALLOWED_CONTENT_TYPES: Record<string, string[]> = {
  image: ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/heic', 'image/heif'],
  video: ['video/mp4', 'video/quicktime', 'video/webm', 'video/x-m4v'],
  audio: ['audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/aac'],
};

// SECURITY: Maximum file sizes in bytes
const MAX_FILE_SIZES: Record<string, number> = {
  image: 10 * 1024 * 1024,      // 10 MB
  video: 100 * 1024 * 1024,     // 100 MB
  audio: 20 * 1024 * 1024,      // 20 MB
};

// File extensions mapping
const CONTENT_TYPE_TO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'image/heif': 'heif',
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/webm': 'webm',
  'video/x-m4v': 'm4v',
  'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a',
  'audio/wav': 'wav',
  'audio/aac': 'aac',
};

interface UploadRequest {
  contentType: string;
  fileSize: number;
  uploadType?: 'avatar' | 'cover' | 'post' | 'peak' | 'message';
  filename?: string;
  duration?: number;
}

function getMediaType(contentType: string): string | null {
  for (const [type, types] of Object.entries(ALLOWED_CONTENT_TYPES)) {
    if (types.includes(contentType)) {
      return type;
    }
  }
  return null;
}

function generateSecureFilename(contentType: string): string {
  const ext = CONTENT_TYPE_TO_EXT[contentType] || 'bin';
  const randomId = randomBytes(16).toString('hex');
  const timestamp = Date.now();
  return `${timestamp}-${randomId}.${ext}`;
}

function getUploadPath(userId: string, uploadType: string, filename: string): string {
  switch (uploadType) {
    case 'avatar':
      return `users/${userId}/avatar/${filename}`;
    case 'cover':
      return `users/${userId}/cover/${filename}`;
    case 'post':
      return `posts/${userId}/${filename}`;
    case 'peak':
      return `peaks/${userId}/${filename}`;
    case 'message':
      return `private/${userId}/messages/${filename}`;
    default:
      return `users/${userId}/uploads/${filename}`;
  }
}

export async function handler(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  const headers = createHeaders(event);
  log.initFromEvent(event);

  try {
    // Get user ID from Cognito authorizer
    const userId = event.requestContext.authorizer?.claims?.sub;
    if (!userId) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ success: false, message: 'Unauthorized' }),
      };
    }

    // Rate limit: 30 uploads per minute
    const { allowed } = await checkRateLimit({ prefix: 'media-upload', identifier: userId, windowSeconds: RATE_WINDOW_1_MIN, maxRequests: 30 });
    if (!allowed) {
      return {
        statusCode: 429,
        headers,
        body: JSON.stringify({ success: false, message: 'Too many requests. Please try again later.' }),
      };
    }

    if (!event.body) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ success: false, message: 'Request body is required' }),
      };
    }

    const request: UploadRequest = JSON.parse(event.body);
    const { contentType, fileSize, filename } = request;

    // SECURITY: fileSize is required — never trust client-only size validation
    if (!fileSize || typeof fileSize !== 'number' || fileSize <= 0) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ success: false, message: 'fileSize is required and must be a positive number' }),
      };
    }
    // Default uploadType to 'post', also infer from filename prefix
    let uploadType = request.uploadType || 'post';
    if (!request.uploadType && filename) {
      if (filename.startsWith('avatars/')) uploadType = 'avatar';
      else if (filename.startsWith('peaks/')) uploadType = 'peak';
      else if (filename.startsWith('messages/')) uploadType = 'message';
      else if (filename.startsWith('covers/')) uploadType = 'cover';
    }

    // Validate content type
    const mediaType = getMediaType(contentType);
    if (!mediaType) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          error: 'Invalid content type',
          message: `Allowed types: ${Object.values(ALLOWED_CONTENT_TYPES).flat().join(', ')}`,
        }),
      };
    }

    // Validate upload type
    const validUploadTypes = ['avatar', 'cover', 'post', 'peak', 'message'];
    if (!validUploadTypes.includes(uploadType)) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          error: 'Invalid upload type',
          message: `Valid types: ${validUploadTypes.join(', ')}`,
        }),
      };
    }

    // Resolve account type for quota-aware limits
    const isQuotaUpload = uploadType === 'post' || uploadType === 'peak';
    let accountType = 'personal';
    let profileId: string | null = null;
    if (isQuotaUpload) {
      const db = await getPool();
      const profileResult = await db.query(
        'SELECT id, account_type FROM profiles WHERE cognito_sub = $1',
        [userId]
      );
      accountType = profileResult.rows[0]?.account_type || 'personal';
      profileId = profileResult.rows[0]?.id || null;
    }
    const limits = getQuotaLimits(accountType);

    // Validate file size — account-aware for video, fixed for image/audio
    const isVideo = mediaType === 'video';
    const maxSize = isVideo && isQuotaUpload ? limits.maxVideoSizeBytes : MAX_FILE_SIZES[mediaType];
    if (fileSize > maxSize) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          error: 'File too large',
          message: `Maximum size for ${mediaType}: ${maxSize / (1024 * 1024)} MB`,
          maxSize,
        }),
      };
    }

    // Per-video duration check
    const { duration } = request;
    if (isVideo && isQuotaUpload && typeof duration === 'number' && duration > limits.maxVideoSeconds) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          success: false,
          message: `Video must be ${limits.maxVideoSeconds} seconds or less`,
          maxVideoSeconds: limits.maxVideoSeconds,
        }),
      };
    }

    // Advisory quota check for post/peak uploads (authoritative check is in create handlers)
    let quotaInfo: Record<string, unknown> | undefined;
    if (isQuotaUpload && profileId) {
      if (isVideo && typeof duration === 'number') {
        const videoQuota = await checkQuota(profileId, accountType, 'video', Math.ceil(duration));
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
        quotaInfo = { videoSecondsRemaining: videoQuota.remaining, maxVideoDuration: limits.maxVideoSeconds };
      } else if (!isVideo && mediaType === 'image') {
        const photoQuota = await checkQuota(profileId, accountType, 'photo', 1);
        if (!photoQuota.allowed) {
          return {
            statusCode: 429,
            headers,
            body: JSON.stringify({
              success: false,
              message: 'Daily photo upload limit reached. Upgrade to Pro for unlimited uploads.',
              quotaType: 'photo_count',
              remaining: photoQuota.remaining,
              limit: photoQuota.limit,
            }),
          };
        }
        quotaInfo = { photoCountRemaining: photoQuota.remaining };
      }
    }

    // Generate secure filename and path
    const secureFilename = generateSecureFilename(contentType);
    const key = getUploadPath(userId, uploadType, secureFilename);

    // QUARANTINE-FIRST: images upload to pending-scan/<path> and are promoted
    // to <path> only after both virus scan and moderation pass.
    // Videos/audio skip quarantine-first because async Rekognition needs the
    // file to persist at a stable path for the duration of analysis.
    const isImage = mediaType === 'image';
    const uploadKey = isImage ? `pending-scan/${key}` : key;

    // Create presigned URL with ContentLength to enforce server-side size limits
    const command = new PutObjectCommand({
      Bucket: MEDIA_BUCKET,
      Key: uploadKey,
      ContentType: contentType,
      ContentLength: fileSize,
      Metadata: {
        'uploaded-by': userId,
        'upload-type': uploadType,
        'original-filename': (request.filename || 'unknown').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 255),
      },
    });

    // SECURITY: Short-lived presigned URL (5 minutes)
    // unhoistableHeaders: prevent SDK from embedding checksum headers in the signed URL
    // (mobile clients don't compute CRC32, so S3 would reject the upload)
    const uploadUrl = await getSignedUrl(s3Client, command, {
      expiresIn: PRESIGNED_URL_EXPIRY_SECONDS,
      unhoistableHeaders: new Set(['x-amz-checksum-crc32', 'x-amz-sdk-checksum-algorithm']),
    });

    // Generate the public URL for the uploaded file
    const publicUrl = `https://${MEDIA_BUCKET}.s3.amazonaws.com/${key}`;

    // Log upload request (masked user ID for security)
    log.info('Upload URL generated', { userId: userId.substring(0, 2) + '***', uploadType, mediaType });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        uploadUrl,
        publicUrl,
        fileUrl: key,
        key,
        expiresIn: PRESIGNED_URL_EXPIRY_SECONDS,
        maxSize,
        ...(quotaInfo && { quotaInfo }),
      }),
    };
  } catch (error: unknown) {
    log.error('Error generating upload URL', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ success: false, message: 'Failed to generate upload URL' }),
    };
  }
}

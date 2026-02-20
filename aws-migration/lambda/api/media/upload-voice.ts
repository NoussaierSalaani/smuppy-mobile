/**
 * Voice Message Upload URL Lambda Handler
 * Generates presigned S3 URLs for voice message uploads
 *
 * SECURITY:
 * - Auth required (Cognito sub)
 * - Rate limited: 30/min
 * - Validates conversationId as UUID
 * - Scopes upload to user's voice-messages folder
 * - Max file size: 5 MB
 * - Short-lived presigned URL (5 minutes)
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { getPool } from '../../shared/db';
import { createLogger } from '../utils/logger';
import { requireRateLimit } from '../utils/rate-limit';
import { withErrorHandler } from '../utils/error-handler';
import { isValidUUID } from '../utils/security';
import { randomUUID } from 'crypto';
import { RATE_WINDOW_1_MIN, PRESIGNED_URL_EXPIRY_SECONDS, MAX_VOICE_MESSAGE_SECONDS, MAX_VOICE_SIZE_BYTES } from '../utils/constants';

const log = createLogger('media-upload-voice');

const s3Client = new S3Client({
  requestChecksumCalculation: 'WHEN_REQUIRED',
  responseChecksumValidation: 'WHEN_REQUIRED',
});

if (!process.env.MEDIA_BUCKET) {
  throw new Error('MEDIA_BUCKET environment variable is required');
}

const MEDIA_BUCKET = process.env.MEDIA_BUCKET;
// SECURITY: Validate and whitelist CDN domain to prevent open redirect / host injection
function getValidatedCdnDomain(): string | null {
  const raw = process.env.CDN_DOMAIN || process.env.MEDIA_CDN_DOMAIN || process.env.CLOUDFRONT_URL || null;
  if (!raw) return null;
  try {
    const parsed = new URL(raw.startsWith('http') ? raw : `https://${raw}`);
    const hostname = parsed.hostname.toLowerCase();
    if (hostname.endsWith('.cloudfront.net') || hostname.endsWith('.amazonaws.com')) {
      return `${parsed.protocol}//${parsed.hostname}`;
    }
    log.warn('CDN domain rejected — not in whitelist', { hostname });
    return null;
  } catch {
    log.warn('CDN domain rejected — invalid URL', { raw: raw.substring(0, 50) });
    return null;
  }
}

const CDN_DOMAIN = getValidatedCdnDomain();

interface VoiceUploadRequest {
  conversationId: string;
  duration?: number;
  fileSize?: number;
}

export const handler = withErrorHandler('media-upload-voice', async (event, { headers }) => {
    // Auth check
    const cognitoSub = event.requestContext.authorizer?.claims?.sub;
    if (!cognitoSub) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ success: false, message: 'Unauthorized' }),
      };
    }

    // Rate limit
    const rateLimitResponse = await requireRateLimit({ prefix: 'voice-upload', identifier: cognitoSub, windowSeconds: RATE_WINDOW_1_MIN, maxRequests: 30 }, headers);
    if (rateLimitResponse) return rateLimitResponse;

    // Parse and validate body
    if (!event.body) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ success: false, message: 'Request body is required' }),
      };
    }

    let request: VoiceUploadRequest;
    try {
      request = JSON.parse(event.body);
    } catch {
      return { statusCode: 400, headers, body: JSON.stringify({ success: false, message: 'Invalid JSON body' }) };
    }
    const { conversationId, duration, fileSize } = request;

    // SECURITY: Validate fileSize to enforce ContentLength in presigned URL
    if (fileSize !== undefined) {
      if (typeof fileSize !== 'number' || fileSize <= 0) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ success: false, message: 'fileSize must be a positive number' }),
        };
      }
      if (fileSize > MAX_VOICE_SIZE_BYTES) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ success: false, message: `Voice message too large (max ${MAX_VOICE_SIZE_BYTES / (1024 * 1024)} MB)` }),
        };
      }
    }

    if (!conversationId || typeof conversationId !== 'string') {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ success: false, message: 'conversationId is required' }),
      };
    }

    if (!isValidUUID(conversationId)) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ success: false, message: 'Invalid conversationId format' }),
      };
    }

    // BUG-2026-02-14: Align max duration with frontend (300s) and send-message.ts validation
    if (duration !== undefined && (typeof duration !== 'number' || duration < 0 || duration > MAX_VOICE_MESSAGE_SECONDS)) {
      return {
        statusCode: 400,
        headers,
        // BUG-2026-02-14: Align with frontend MAX_DURATION_SECONDS=300 and send-message.ts validation
        body: JSON.stringify({ success: false, message: `Invalid duration: must be between 0 and ${MAX_VOICE_MESSAGE_SECONDS} seconds` }),
      };
    }

    // Look up profileId from cognito_sub
    const db = await getPool();
    const profileResult = await db.query(
      'SELECT id FROM profiles WHERE cognito_sub = $1 LIMIT 1',
      [cognitoSub]
    );

    if (profileResult.rows.length === 0) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ success: false, message: 'Profile not found' }),
      };
    }

    const profileId: string = profileResult.rows[0].id;

    // Verify user is participant in this conversation
    const convCheck = await db.query(
      `SELECT id FROM conversations
       WHERE id = $1 AND (participant_1_id = $2 OR participant_2_id = $2)`,
      [conversationId, profileId]
    );
    if (convCheck.rows.length === 0) {
      return {
        statusCode: 403,
        headers,
        body: JSON.stringify({ success: false, message: 'Not a participant of this conversation' }),
      };
    }

    // Generate S3 key
    const fileId = randomUUID();
    const key = `voice-messages/${profileId}/${conversationId}/${fileId}.m4a`;

    // Create presigned URL
    // ContentLength is enforced when provided — S3 rejects uploads with mismatched Content-Length
    const command = new PutObjectCommand({
      Bucket: MEDIA_BUCKET,
      Key: key,
      ContentType: 'audio/mp4',
      ...(fileSize ? { ContentLength: fileSize } : {}),
      ContentDisposition: 'inline',
      CacheControl: 'public, max-age=31536000',
      Metadata: {
        'uploaded-by': cognitoSub,
        'conversation-id': conversationId,
        ...(duration !== undefined ? { 'duration-seconds': String(duration) } : {}),
      },
    });

    const url = await getSignedUrl(s3Client, command, {
      expiresIn: PRESIGNED_URL_EXPIRY_SECONDS,
      unhoistableHeaders: new Set(['x-amz-checksum-crc32', 'x-amz-sdk-checksum-algorithm']),
    });

    // Build playback URLs (CloudFront preferred, fallback S3 direct)
    const cdnUrl = CDN_DOMAIN ? `${CDN_DOMAIN}/${key}` : null;
    const fileUrl = `https://${MEDIA_BUCKET}.s3.amazonaws.com/${key}`;

    log.info('Voice upload URL generated', {
      userId: cognitoSub.substring(0, 2) + '***',
      conversationId: conversationId.substring(0, 2) + '***',
    });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ success: true, url, key, cdnUrl, fileUrl }),
    };
});

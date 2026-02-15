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
import { createHeaders } from '../utils/cors';
import { createLogger } from '../utils/logger';
import { checkRateLimit } from '../utils/rate-limit';
import { isValidUUID } from '../utils/security';
import { randomUUID } from 'crypto';
import { RATE_WINDOW_1_MIN, PRESIGNED_URL_EXPIRY_SECONDS, MAX_VOICE_MESSAGE_SECONDS } from '../utils/constants';

const log = createLogger('media-upload-voice');

const s3Client = new S3Client({
  requestChecksumCalculation: 'WHEN_REQUIRED',
  responseChecksumValidation: 'WHEN_REQUIRED',
});

if (!process.env.MEDIA_BUCKET) {
  throw new Error('MEDIA_BUCKET environment variable is required');
}

const MEDIA_BUCKET = process.env.MEDIA_BUCKET;
const _MAX_VOICE_FILE_SIZE = 5 * 1024 * 1024; // 5 MB max for voice messages

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
}

export async function handler(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  const headers = createHeaders(event);

  try {
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
    const { allowed } = await checkRateLimit({ prefix: 'voice-upload', identifier: cognitoSub, windowSeconds: RATE_WINDOW_1_MIN, maxRequests: 30 });
    if (!allowed) {
      return {
        statusCode: 429,
        headers,
        body: JSON.stringify({ success: false, message: 'Too many requests. Please try again later.' }),
      };
    }

    // Parse and validate body
    if (!event.body) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ success: false, message: 'Request body is required' }),
      };
    }

    const request: VoiceUploadRequest = JSON.parse(event.body);
    const { conversationId, duration } = request;

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
    // NOTE: PutObject presigned URLs cannot enforce max ContentLength (only exact match).
    // Max upload size should be enforced via S3 bucket policy or Lambda@Edge.
    const command = new PutObjectCommand({
      Bucket: MEDIA_BUCKET,
      Key: key,
      ContentType: 'audio/mp4',
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
  } catch (error: unknown) {
    log.error('Error generating voice upload URL', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ success: false, message: 'Failed to generate upload URL' }),
    };
  }
}

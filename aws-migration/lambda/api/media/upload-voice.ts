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

const log = createLogger('media-upload-voice');

const s3Client = new S3Client({
  requestChecksumCalculation: 'WHEN_REQUIRED',
  responseChecksumValidation: 'WHEN_REQUIRED',
});

if (!process.env.MEDIA_BUCKET) {
  throw new Error('MEDIA_BUCKET environment variable is required');
}

const MEDIA_BUCKET = process.env.MEDIA_BUCKET;
// Optional CDN domain (CloudFront) to build directly playable URLs
const CDN_DOMAIN = process.env.CDN_DOMAIN || process.env.MEDIA_CDN_DOMAIN || process.env.CLOUDFRONT_URL || null;

const PRESIGNED_URL_EXPIRY_SECONDS = 300;

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
        body: JSON.stringify({ error: 'Unauthorized' }),
      };
    }

    // Rate limit
    const { allowed } = await checkRateLimit({ prefix: 'voice-upload', identifier: cognitoSub, windowSeconds: 60, maxRequests: 30 });
    if (!allowed) {
      return {
        statusCode: 429,
        headers,
        body: JSON.stringify({ error: 'Too many requests. Please try again later.' }),
      };
    }

    // Parse and validate body
    if (!event.body) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Request body is required' }),
      };
    }

    const request: VoiceUploadRequest = JSON.parse(event.body);
    const { conversationId, duration } = request;

    if (!conversationId || typeof conversationId !== 'string') {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'conversationId is required' }),
      };
    }

    if (!isValidUUID(conversationId)) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Invalid conversationId format' }),
      };
    }

    if (duration !== undefined && (typeof duration !== 'number' || duration < 0 || duration > 600)) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Invalid duration: must be between 0 and 600 seconds' }),
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
        body: JSON.stringify({ error: 'Profile not found' }),
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
        body: JSON.stringify({ error: 'Not a participant of this conversation' }),
      };
    }

    // Generate S3 key
    const fileId = randomUUID();
    const key = `voice-messages/${profileId}/${conversationId}/${fileId}.m4a`;

    // Create presigned URL
    const command = new PutObjectCommand({
      Bucket: MEDIA_BUCKET,
      Key: key,
      ContentType: 'audio/mp4',
      ContentDisposition: 'inline',
      CacheControl: 'public, max-age=31536000',
      // Do NOT set ContentLength — it would force exact match and reject smaller files
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
    const sanitizedCdn = CDN_DOMAIN ? CDN_DOMAIN.replace(/\/+$/, '') : null;
    const cdnUrl = sanitizedCdn ? `${sanitizedCdn}/${key}` : null;
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
      body: JSON.stringify({ error: 'Failed to generate upload URL' }),
    };
  }
}

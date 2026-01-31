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
import { randomUUID } from 'crypto';

const log = createLogger('media-upload-voice');

const s3Client = new S3Client({});

if (!process.env.MEDIA_BUCKET) {
  throw new Error('MEDIA_BUCKET environment variable is required');
}

const MEDIA_BUCKET = process.env.MEDIA_BUCKET;

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const MAX_VOICE_SIZE = 5 * 1024 * 1024; // 5 MB

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

    if (!UUID_REGEX.test(conversationId)) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Invalid conversationId format' }),
      };
    }

    if (duration !== undefined && (typeof duration !== 'number' || duration < 0)) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Invalid duration' }),
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

    // Generate S3 key
    const fileId = randomUUID();
    const key = `voice-messages/${profileId}/${conversationId}/${fileId}.m4a`;

    // Create presigned URL
    const command = new PutObjectCommand({
      Bucket: MEDIA_BUCKET,
      Key: key,
      ContentType: 'audio/mp4',
      ContentLength: MAX_VOICE_SIZE,
      Metadata: {
        'uploaded-by': cognitoSub,
        'conversation-id': conversationId,
        ...(duration !== undefined ? { 'duration-seconds': String(duration) } : {}),
      },
    });

    const url = await getSignedUrl(s3Client, command, {
      expiresIn: 300, // 5 minutes
    });

    log.info('Voice upload URL generated', {
      userId: cognitoSub.substring(0, 8) + '***',
      conversationId: conversationId.substring(0, 8) + '***',
    });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ url, key }),
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

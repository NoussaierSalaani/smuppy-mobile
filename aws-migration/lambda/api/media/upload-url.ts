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

const log = createLogger('media-upload-url');

const s3Client = new S3Client({});

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
  uploadType: 'avatar' | 'post' | 'peak' | 'message';
  filename?: string;
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

  try {
    // Get user ID from Cognito authorizer
    const userId = event.requestContext.authorizer?.claims?.sub;
    if (!userId) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ error: 'Unauthorized' }),
      };
    }

    if (!event.body) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Request body is required' }),
      };
    }

    const request: UploadRequest = JSON.parse(event.body);
    const { contentType, fileSize, uploadType } = request;

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

    // Validate file size
    const maxSize = MAX_FILE_SIZES[mediaType];
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

    // Validate upload type
    const validUploadTypes = ['avatar', 'post', 'peak', 'message'];
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

    // Generate secure filename and path
    const filename = generateSecureFilename(contentType);
    const key = getUploadPath(userId, uploadType, filename);

    // Create presigned URL
    const command = new PutObjectCommand({
      Bucket: MEDIA_BUCKET,
      Key: key,
      ContentType: contentType,
      ContentLength: fileSize,
      // SECURITY: Add metadata for tracking
      Metadata: {
        'uploaded-by': userId,
        'upload-type': uploadType,
        'original-filename': (request.filename || 'unknown').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 255),
      },
    });

    // SECURITY: Short-lived presigned URL (5 minutes)
    const uploadUrl = await getSignedUrl(s3Client, command, {
      expiresIn: 300, // 5 minutes
    });

    // Generate the public URL for the uploaded file
    const publicUrl = `https://${MEDIA_BUCKET}.s3.amazonaws.com/${key}`;

    // Log upload request (masked user ID for security)
    log.info('Upload URL generated', { userId: userId.substring(0, 8) + '***', uploadType, mediaType });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        uploadUrl,
        publicUrl,
        key,
        expiresIn: 300,
        maxSize,
      }),
    };
  } catch (error: unknown) {
    log.error('Error generating upload URL', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Failed to generate upload URL' }),
    };
  }
}

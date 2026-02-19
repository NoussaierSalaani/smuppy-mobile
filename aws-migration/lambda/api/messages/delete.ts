/**
 * Delete Message Lambda Handler
 * Deletes a message (only by sender)
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { S3Client, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getPool } from '../../shared/db';
import { createHeaders } from '../utils/cors';
import { createLogger } from '../utils/logger';
import { isValidUUID } from '../utils/security';
import { requireRateLimit } from '../utils/rate-limit';

const s3Client = new S3Client({
  requestChecksumCalculation: 'WHEN_REQUIRED',
  responseChecksumValidation: 'WHEN_REQUIRED',
});
const MEDIA_BUCKET = process.env.MEDIA_BUCKET || '';

const log = createLogger('messages-delete');

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const headers = createHeaders(event);
  log.initFromEvent(event);

  try {
    const userId = event.requestContext.authorizer?.claims?.sub;
    if (!userId) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ message: 'Unauthorized' }),
      };
    }

    // Rate limit: 30 deletes per minute
    const rateLimitResponse = await requireRateLimit({ prefix: 'message-delete', identifier: userId, windowSeconds: 60, maxRequests: 30 }, headers);
    if (rateLimitResponse) return rateLimitResponse;

    const messageId = event.pathParameters?.id;
    if (!messageId) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ message: 'Message ID is required' }),
      };
    }

    // Validate UUID format
    if (!isValidUUID(messageId)) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ message: 'Invalid message ID format' }),
      };
    }

    const db = await getPool();

    // Get user's profile ID (check both id and cognito_sub for consistency)
    const userResult = await db.query(
      'SELECT id FROM profiles WHERE cognito_sub = $1',
      [userId]
    );

    if (userResult.rows.length === 0) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ message: 'User profile not found' }),
      };
    }

    const profileId = userResult.rows[0].id;

    // Soft-delete message only if user is the sender and within 15-minute window
    // Use CTE to capture media info BEFORE the UPDATE nullifies it
    const result = await db.query(
      `WITH target AS (
         SELECT id, media_url, media_type FROM messages
         WHERE id = $1 AND sender_id = $2 AND is_deleted = false
           AND created_at > NOW() - INTERVAL '15 minutes'
       )
       UPDATE messages m
       SET is_deleted = true, content = '', media_url = NULL, media_type = NULL
       FROM target
       WHERE m.id = target.id
       RETURNING target.media_url, target.media_type, m.id`,
      [messageId, profileId]
    );

    // Clean up S3 voice/audio files (fire-and-forget)
    if (result.rows.length > 0 && MEDIA_BUCKET) {
      const deleted = result.rows[0];
      if (deleted.media_url && (deleted.media_type === 'voice' || deleted.media_type === 'audio')) {
        try {
          // Extract S3 key from URL: voice-messages/{userId}/{conversationId}/{fileId}.m4a
          const urlPath = new URL(deleted.media_url).pathname;
          const s3Key = urlPath.startsWith('/') ? urlPath.slice(1) : urlPath;
          if (s3Key.startsWith('voice-messages/')) {
            s3Client.send(new DeleteObjectCommand({ Bucket: MEDIA_BUCKET, Key: s3Key }))
              .catch(err => log.error('Failed to delete S3 voice file', err, { key: s3Key }));
          }
        } catch {
          // URL parsing failed — not critical, just log
          log.warn('Could not parse media_url for S3 cleanup', { messageId });
        }
      }
    }

    if (result.rows.length === 0) {
      // Check if message exists but is outside the time window
      const existsCheck = await db.query(
        `SELECT id, created_at FROM messages WHERE id = $1 AND sender_id = $2 AND is_deleted = false`,
        [messageId, profileId]
      );
      if (existsCheck.rows.length > 0) {
        return {
          statusCode: 403,
          headers,
          body: JSON.stringify({ message: 'Messages can only be deleted within 15 minutes of sending' }),
        };
      }
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ message: 'Message not found or not authorized to delete' }),
      };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        message: 'Message deleted successfully',
      }),
    };
  } catch (error: unknown) {
    log.error('Error deleting message', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ message: 'Internal server error' }),
    };
  }
}

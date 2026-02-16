/**
 * Delete Peak Lambda Handler
 * Deletes a peak, cleans up S3 media, and removes orphaned notifications
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { S3Client, DeleteObjectsCommand } from '@aws-sdk/client-s3';
import { CloudFrontClient, CreateInvalidationCommand } from '@aws-sdk/client-cloudfront';
import { getPool } from '../../shared/db';
import { createHeaders } from '../utils/cors';
import { createLogger } from '../utils/logger';
import { requireAuth, validateUUIDParam, isErrorResponse } from '../utils/validators';
import { checkRateLimit } from '../utils/rate-limit';

const log = createLogger('peaks-delete');

const s3Client = new S3Client({
  requestChecksumCalculation: 'WHEN_REQUIRED',
  responseChecksumValidation: 'WHEN_REQUIRED',
});

const cfClient = new CloudFrontClient({});

const MEDIA_BUCKET = process.env.MEDIA_BUCKET || '';
const CLOUDFRONT_DISTRIBUTION_ID = process.env.CLOUDFRONT_DISTRIBUTION_ID || '';

const VARIANT_NAMES = ['large', 'medium', 'thumb'];

/**
 * Extract S3 key from a full S3/CloudFront URL.
 * Handles: https://bucket.s3.amazonaws.com/key, https://cdn.example.com/key
 */
function extractS3Key(url: string): string | null {
  try {
    const parsed = new URL(url);
    // Remove leading slash from pathname
    const key = parsed.pathname.startsWith('/') ? parsed.pathname.slice(1) : parsed.pathname;
    return key || null;
  } catch {
    return null;
  }
}

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const headers = createHeaders(event);

  try {
    const userId = requireAuth(event, headers);
    if (isErrorResponse(userId)) return userId;

    const { allowed } = await checkRateLimit({ prefix: 'peak-delete', identifier: userId, windowSeconds: 60, maxRequests: 10 });
    if (!allowed) {
      return { statusCode: 429, headers, body: JSON.stringify({ message: 'Too many requests. Please try again later.' }) };
    }

    const peakId = validateUUIDParam(event, headers, 'id', 'Peak');
    if (isErrorResponse(peakId)) return peakId;

    const db = await getPool();

    // Get user's profile ID
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

    // Get peak with media URLs and check ownership
    const peakResult = await db.query(
      'SELECT id, author_id, video_url, thumbnail_url FROM peaks WHERE id = $1',
      [peakId]
    );

    if (peakResult.rows.length === 0) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ message: 'Peak not found' }),
      };
    }

    const peak = peakResult.rows[0];

    if (peak.author_id !== profileId) {
      return {
        statusCode: 403,
        headers,
        body: JSON.stringify({ message: 'Not authorized to delete this peak' }),
      };
    }

    // Delete peak and notifications in a transaction
    const client = await db.connect();

    try {
      await client.query('BEGIN');

      // Clean up orphaned notifications referencing this peak (no FK constraint on JSONB data)
      await client.query(
        `DELETE FROM notifications WHERE data->>'peakId' = $1`,
        [peakId]
      );

      // Delete peak (CASCADE will handle likes, comments, reactions, tags, views, reports, hashtags)
      await client.query('DELETE FROM peaks WHERE id = $1', [peakId]);

      await client.query('COMMIT');
    } catch (error: unknown) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

    // S3 cleanup (best-effort, after successful DB delete — non-blocking)
    if (MEDIA_BUCKET) {
      const s3Keys: { Key: string }[] = [];
      const urls = [peak.video_url, peak.thumbnail_url].filter(Boolean);

      for (const url of urls) {
        const key = extractS3Key(url);
        if (key) {
          s3Keys.push({ Key: key });
          // Also delete optimized variants (large/, medium/, thumb/)
          for (const variant of VARIANT_NAMES) {
            const parts = key.split('/');
            const filename = parts[parts.length - 1];
            const baseName = filename.substring(0, filename.lastIndexOf('.'));
            const prefix = parts.slice(0, parts.length - 1).join('/');
            s3Keys.push({ Key: `${prefix}/${variant}/${baseName}.jpg` });
            s3Keys.push({ Key: `${prefix}/${variant}/${baseName}.webp` });
          }
        }
      }

      if (s3Keys.length > 0) {
        try {
          await s3Client.send(new DeleteObjectsCommand({
            Bucket: MEDIA_BUCKET,
            Delete: { Objects: s3Keys, Quiet: true },
          }));
        } catch (s3Error: unknown) {
          // Log but don't fail — DB deletion already committed
          log.error('Failed to clean up S3 media for peak', s3Error);
        }

        // CloudFront invalidation (best-effort)
        if (CLOUDFRONT_DISTRIBUTION_ID) {
          try {
            const paths = s3Keys.map(k => `/${k.Key}`);
            await cfClient.send(new CreateInvalidationCommand({
              DistributionId: CLOUDFRONT_DISTRIBUTION_ID,
              InvalidationBatch: {
                CallerReference: `peak-delete-${peakId}-${Date.now()}`,
                Paths: { Quantity: paths.length, Items: paths },
              },
            }));
          } catch (cfError: unknown) {
            log.error('Failed to invalidate CloudFront cache for peak', cfError);
          }
        }
      }
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        message: 'Peak deleted successfully',
      }),
    };
  } catch (error: unknown) {
    log.error('Error deleting peak', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ message: 'Internal server error' }),
    };
  }
}

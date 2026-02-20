/**
 * Delete Peak Lambda Handler
 * Deletes a peak, cleans up S3 media, and removes orphaned notifications
 */

import { S3Client, DeleteObjectsCommand } from '@aws-sdk/client-s3';
import { CloudFrontClient, CreateInvalidationCommand } from '@aws-sdk/client-cloudfront';
import { createLogger } from '../utils/logger';
import { createDeleteHandler } from '../utils/create-delete-handler';
import { RATE_WINDOW_1_MIN } from '../utils/constants';

const log = createLogger('peaks-delete-s3');

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
    const key = parsed.pathname.startsWith('/') ? parsed.pathname.slice(1) : parsed.pathname;
    return key || null;
  } catch {
    return null;
  }
}

export const handler = createDeleteHandler({
  resourceName: 'Peak',
  resourceTable: 'peaks',
  loggerName: 'peaks-delete',
  ownershipField: 'author_id',
  selectColumns: 'id, author_id, video_url, thumbnail_url',
  rateLimitPrefix: 'peak-delete',
  rateLimitMax: 10,
  rateLimitWindow: RATE_WINDOW_1_MIN,

  async onDelete({ client, resourceId }) {
    // Clean up orphaned notifications referencing this peak (no FK constraint on JSONB data)
    await client.query(
      `DELETE FROM notifications WHERE data->>'peakId' = $1`,
      [resourceId],
    );

    // Delete peak (CASCADE will handle likes, comments, reactions, tags, views, reports, hashtags)
    await client.query('DELETE FROM peaks WHERE id = $1', [resourceId]);
  },

  async afterCommit({ resource, resourceId }) {
    if (!MEDIA_BUCKET) return;

    const s3Keys: { Key: string }[] = [];
    const urls = [resource.video_url as string, resource.thumbnail_url as string].filter(Boolean);

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

    if (s3Keys.length === 0) return;

    try {
      await s3Client.send(new DeleteObjectsCommand({
        Bucket: MEDIA_BUCKET,
        Delete: { Objects: s3Keys, Quiet: true },
      }));
    } catch (s3Error: unknown) {
      log.error('Failed to clean up S3 media for peak', s3Error);
    }

    // CloudFront invalidation (best-effort)
    if (CLOUDFRONT_DISTRIBUTION_ID) {
      try {
        const paths = s3Keys.map(k => `/${k.Key}`);
        await cfClient.send(new CreateInvalidationCommand({
          DistributionId: CLOUDFRONT_DISTRIBUTION_ID,
          InvalidationBatch: {
            CallerReference: `peak-delete-${resourceId}-${Date.now()}`,
            Paths: { Quantity: paths.length, Items: paths },
          },
        }));
      } catch (cfError: unknown) {
        log.error('Failed to invalidate CloudFront cache for peak', cfError);
      }
    }
  },
});

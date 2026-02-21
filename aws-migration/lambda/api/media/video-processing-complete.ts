/**
 * Video Processing Complete Lambda Handler
 * Triggered by EventBridge when MediaConvert job completes or fails.
 * Updates the DB with HLS URLs and video processing status.
 */

import { getPool } from '../../shared/db';
import { createLogger } from '../utils/logger';

const log = createLogger('media-video-processing-complete');

const MEDIA_BUCKET = process.env.MEDIA_BUCKET;
const CDN_DOMAIN = process.env.CDN_DOMAIN || '';

if (!MEDIA_BUCKET) throw new Error('MEDIA_BUCKET is required');

/**
 * MediaConvert CloudWatch Event structure
 */
interface MediaConvertEvent {
  source: string;
  'detail-type': string;
  detail: {
    jobId: string;
    status: 'COMPLETE' | 'ERROR' | 'CANCELED';
    userMetadata?: {
      entityType?: string;
      entityId?: string;
      sourceKey?: string;
    };
    outputGroupDetails?: Array<{
      outputDetails?: Array<{
        outputFilePaths?: string[];
        durationInMs?: number;
        videoDetails?: {
          widthInPx?: number;
          heightInPx?: number;
        };
      }>;
    }>;
    errorMessage?: string;
    errorCode?: number;
  };
}

/**
 * Parse HLS manifest URL from MediaConvert output paths.
 */
function extractHlsUrl(outputGroupDetails: MediaConvertEvent['detail']['outputGroupDetails']): string | null {
  if (!outputGroupDetails) return null;

  for (const group of outputGroupDetails) {
    if (!group.outputDetails) continue;
    for (const output of group.outputDetails) {
      if (!output.outputFilePaths) continue;
      for (const filePath of output.outputFilePaths) {
        if (filePath.endsWith('.m3u8')) {
          // Convert S3 URI to CDN URL or S3 HTTPS URL
          const s3Key = filePath.replace(`s3://${MEDIA_BUCKET}/`, '');
          if (CDN_DOMAIN) {
            return `https://${CDN_DOMAIN}/${s3Key}`;
          }
          return `https://${MEDIA_BUCKET}.s3.amazonaws.com/${s3Key}`;
        }
      }
    }
  }
  return null;
}

/**
 * Extract thumbnail URL from frame capture output.
 */
function extractThumbnailUrl(outputGroupDetails: MediaConvertEvent['detail']['outputGroupDetails']): string | null {
  if (!outputGroupDetails) return null;

  for (const group of outputGroupDetails) {
    if (!group.outputDetails) continue;
    for (const output of group.outputDetails) {
      if (!output.outputFilePaths) continue;
      for (const filePath of output.outputFilePaths) {
        if (filePath.match(/\.(jpg|jpeg|png)$/i)) {
          const s3Key = filePath.replace(`s3://${MEDIA_BUCKET}/`, '');
          if (CDN_DOMAIN) {
            return `https://${CDN_DOMAIN}/${s3Key}`;
          }
          return `https://${MEDIA_BUCKET}.s3.amazonaws.com/${s3Key}`;
        }
      }
    }
  }
  return null;
}

/**
 * Build video variants metadata from output group details.
 */
function buildVideoVariants(outputGroupDetails: MediaConvertEvent['detail']['outputGroupDetails']): Record<string, unknown>[] {
  const variants: Record<string, unknown>[] = [];
  if (!outputGroupDetails) return variants;

  for (const group of outputGroupDetails) {
    if (!group.outputDetails) continue;
    for (const output of group.outputDetails) {
      if (!output.outputFilePaths) continue;
      for (const filePath of output.outputFilePaths) {
        if (filePath.endsWith('.m3u8') && !filePath.includes('master')) {
          const s3Key = filePath.replace(`s3://${MEDIA_BUCKET}/`, '');
          variants.push({
            url: CDN_DOMAIN ? `https://${CDN_DOMAIN}/${s3Key}` : `https://${MEDIA_BUCKET}.s3.amazonaws.com/${s3Key}`,
            width: output.videoDetails?.widthInPx || null,
            height: output.videoDetails?.heightInPx || null,
            durationMs: output.durationInMs || null,
          });
        }
      }
    }
  }
  return variants;
}

/**
 * EventBridge handler (not API Gateway — raw event)
 */
export async function handler(event: MediaConvertEvent): Promise<void> {
  try {
    const { jobId, status, userMetadata, outputGroupDetails, errorMessage } = event.detail;

    if (!jobId) {
      log.error('Missing jobId in event');
      return;
    }

    log.info('MediaConvert job event', { jobId, status });

    const db = await getPool();

    // Look up the job in our tracking table
    const jobResult = await db.query(
      'SELECT id, entity_type, entity_id FROM video_processing_jobs WHERE media_convert_job_id = $1',
      [jobId]
    );

    // Fallback to userMetadata if not in DB (edge case)
    const entityType = jobResult.rows[0]?.entity_type || userMetadata?.entityType;
    const entityId = jobResult.rows[0]?.entity_id || userMetadata?.entityId;

    if (!entityType || !entityId) {
      log.error('Cannot resolve entity for job', { jobId });
      return;
    }

    if (status === 'COMPLETE') {
      const hlsUrl = extractHlsUrl(outputGroupDetails);
      const thumbnailUrl = extractThumbnailUrl(outputGroupDetails);
      const variants = buildVideoVariants(outputGroupDetails);

      log.info('Video processing complete', {
        jobId,
        entityType,
        entityId: entityId.substring(0, 8) + '...',
        hlsUrl: hlsUrl ? 'set' : 'missing',
        thumbnailUrl: thumbnailUrl ? 'set' : 'missing',
        variantsCount: variants.length,
      });

      // Update the entity with HLS URLs
      if (entityType === 'post') {
        await db.query(
          `UPDATE posts
           SET video_status = 'ready',
               hls_url = $2,
               thumbnail_url = COALESCE($3, thumbnail_url),
               video_variants = $4,
               updated_at = NOW()
           WHERE id = $1`,
          [entityId, hlsUrl, thumbnailUrl, JSON.stringify(variants)]
        );
      } else if (entityType === 'peak') {
        await db.query(
          `UPDATE peaks
           SET video_status = 'ready',
               hls_url = $2,
               thumbnail_url = COALESCE($3, thumbnail_url),
               video_variants = $4,
               updated_at = NOW()
           WHERE id = $1`,
          [entityId, hlsUrl, thumbnailUrl, JSON.stringify(variants)]
        );
      }

      // Update job tracking
      await db.query(
        `UPDATE video_processing_jobs
         SET status = 'complete', output_variants = $2, completed_at = NOW()
         WHERE media_convert_job_id = $1`,
        [jobId, JSON.stringify(variants)]
      );

    } else if (status === 'ERROR' || status === 'CANCELED') {
      log.error('Video processing failed', { jobId, status, errorMessage });

      // Update entity to failed
      if (entityType === 'post') {
        await db.query(
          `UPDATE posts SET video_status = 'failed', updated_at = NOW() WHERE id = $1`,
          [entityId]
        );
      } else if (entityType === 'peak') {
        await db.query(
          `UPDATE peaks SET video_status = 'failed', updated_at = NOW() WHERE id = $1`,
          [entityId]
        );
      }

      // Update job tracking
      await db.query(
        `UPDATE video_processing_jobs
         SET status = $2, error_message = $3, completed_at = NOW()
         WHERE media_convert_job_id = $1`,
        [jobId, status === 'ERROR' ? 'error' : 'canceled', errorMessage || null]
      );
    }
  } catch (error_: unknown) {
    log.error('Error handling video processing event', error_);
    // Don't throw — EventBridge will retry, but we've logged the error
  }
}

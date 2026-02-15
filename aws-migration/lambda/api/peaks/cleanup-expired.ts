/**
 * Cleanup Expired Peaks Lambda Handler (Scheduled)
 *
 * Runs daily via EventBridge to:
 * 1. Find peaks expired > 30 days with no save decision (saved_to_profile IS NULL)
 * 2. Delete their S3 media (video + thumbnail)
 * 3. Hard-delete the DB records (CASCADE handles likes, comments, views)
 *
 * Also cleans up hard-deleted accounts' peaks (profiles.is_deleted = TRUE, deleted_at > 30 days)
 */

import { S3Client, DeleteObjectsCommand } from '@aws-sdk/client-s3';
import { getPool } from '../../shared/db';
import { createLogger } from '../utils/logger';

const log = createLogger('peaks-cleanup-expired');

const s3Client = new S3Client({
  requestChecksumCalculation: 'WHEN_REQUIRED',
  responseChecksumValidation: 'WHEN_REQUIRED',
});

const MEDIA_BUCKET = process.env.MEDIA_BUCKET || '';
const BATCH_SIZE = 50;

function extractS3Key(url: string): string | null {
  try {
    const parsed = new URL(url);
    const key = parsed.pathname.startsWith('/') ? parsed.pathname.slice(1) : parsed.pathname;
    return key || null;
  } catch {
    return null;
  }
}

export async function handler(): Promise<{ cleaned: number; errors: number }> {
  let totalCleaned = 0;
  let totalErrors = 0;

  try {
    const db = await getPool();

    // Find expired peaks older than 30 days with no save decision
    const result = await db.query(
      `SELECT id, video_url, thumbnail_url
       FROM peaks
       WHERE saved_to_profile IS NULL
         AND (
           (expires_at IS NOT NULL AND expires_at <= NOW() - INTERVAL '30 days')
           OR
           (expires_at IS NULL AND created_at <= NOW() - INTERVAL '30 days')
         )
       LIMIT $1`,
      [BATCH_SIZE]
    );

    if (result.rows.length === 0) {
      log.warn('No expired peaks to clean up');
      return { cleaned: 0, errors: 0 };
    }

    log.warn(`Found ${result.rows.length} expired peaks to clean up`);

    for (const peak of result.rows) {
      try {
        // Collect S3 keys
        const s3Keys: { Key: string }[] = [];
        if (peak.video_url) {
          const key = extractS3Key(peak.video_url);
          if (key) s3Keys.push({ Key: key });
        }
        if (peak.thumbnail_url) {
          const key = extractS3Key(peak.thumbnail_url);
          if (key) s3Keys.push({ Key: key });
        }

        // Delete S3 media (best-effort)
        if (MEDIA_BUCKET && s3Keys.length > 0) {
          try {
            await s3Client.send(new DeleteObjectsCommand({
              Bucket: MEDIA_BUCKET,
              Delete: { Objects: s3Keys, Quiet: true },
            }));
          } catch (s3Err: unknown) {
            log.error('S3 cleanup failed for peak', s3Err, { peakId: peak.id.substring(0, 8) + '***' });
          }
        }

        // Hard-delete peak record (CASCADE handles likes, comments, views)
        await db.query('DELETE FROM peaks WHERE id = $1', [peak.id]);
        totalCleaned++;
      } catch (peakErr: unknown) {
        totalErrors++;
        log.error('Failed to clean up peak', peakErr, { peakId: peak.id.substring(0, 8) + '***' });
      }
    }

    log.warn('Peaks cleanup complete', { cleaned: totalCleaned, errors: totalErrors });
    return { cleaned: totalCleaned, errors: totalErrors };
  } catch (error: unknown) {
    log.error('Peaks cleanup failed', error);
    return { cleaned: totalCleaned, errors: totalErrors + 1 };
  }
}

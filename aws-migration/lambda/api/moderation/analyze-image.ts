/**
 * Analyze Image Lambda Handler
 * Triggered by EventBridge on S3 PutObject for media uploads.
 * Uses AWS Rekognition DetectModerationLabels to check for NSFW content.
 *
 * Thresholds:
 * - > 90% confidence → quarantine + delete from public
 * - 70-90% → tag as under_review for manual check
 * - < 70% → pass
 */

import { S3Client, CopyObjectCommand, DeleteObjectCommand, PutObjectTaggingCommand, GetObjectTaggingCommand } from '@aws-sdk/client-s3';
import { RekognitionClient, DetectModerationLabelsCommand, type ModerationLabel } from '@aws-sdk/client-rekognition';
import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';
import { createLogger } from '../utils/logger';

const log = createLogger('moderation-analyze-image');

const s3Client = new S3Client({ region: process.env.AWS_REGION });
const rekognitionClient = new RekognitionClient({ region: process.env.AWS_REGION });
const snsClient = new SNSClient({ region: process.env.AWS_REGION });

const QUARANTINE_BUCKET = process.env.QUARANTINE_BUCKET || '';
const SECURITY_ALERTS_TOPIC_ARN = process.env.SECURITY_ALERTS_TOPIC_ARN || '';

// Image extensions we should analyze
const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.heic']);

interface EventBridgeS3Event {
  detail: {
    bucket: { name: string };
    object: { key: string; size: number };
  };
}

export async function handler(event: EventBridgeS3Event): Promise<void> {
  const bucketName = event.detail.bucket.name;
  const objectKey = event.detail.object.key;
  const fileSize = event.detail.object.size;

  // Only analyze image files
  const extension = objectKey.substring(objectKey.lastIndexOf('.')).toLowerCase();
  if (!IMAGE_EXTENSIONS.has(extension)) {
    log.info('Skipping non-image file', { objectKey, extension });
    return;
  }

  // Skip files that are too large for Rekognition (max 15 MB via S3)
  if (fileSize > 15 * 1024 * 1024) {
    log.info('Skipping oversized image', { objectKey, fileSize });
    return;
  }

  // Skip quarantine bucket objects
  if (objectKey.startsWith('quarantine/')) {
    return;
  }

  log.info('Analyzing image for moderation', { bucketName, objectKey });

  try {
    // Check if already scanned (avoid re-processing)
    const existingTags = await s3Client.send(
      new GetObjectTaggingCommand({ Bucket: bucketName, Key: objectKey }),
    );
    const moderationTag = existingTags.TagSet?.find(t => t.Key === 'moderation-status');
    if (moderationTag) {
      log.info('Image already scanned, skipping', { objectKey, status: moderationTag.Value });
      return;
    }

    // Run Rekognition moderation
    const rekResponse = await rekognitionClient.send(
      new DetectModerationLabelsCommand({
        Image: {
          S3Object: {
            Bucket: bucketName,
            Name: objectKey,
          },
        },
        MinConfidence: 50,
      }),
    );

    const labels: ModerationLabel[] = rekResponse.ModerationLabels || [];

    if (labels.length === 0) {
      // Clean image — tag as passed
      await tagObject(bucketName, objectKey, 'passed');
      log.info('Image passed moderation', { objectKey });
      return;
    }

    // Find highest confidence label
    const maxConfidence = Math.max(...labels.map(l => l.Confidence || 0));
    const topLabel = labels.find(l => l.Confidence === maxConfidence);

    log.info('Moderation labels detected', {
      objectKey,
      maxConfidence,
      topLabel: topLabel?.Name,
      labelCount: labels.length,
    });

    if (maxConfidence > 90) {
      // HIGH CONFIDENCE — quarantine immediately
      await quarantineObject(bucketName, objectKey);
      await sendAlert('BLOCK', objectKey, labels, maxConfidence);
      log.info('Image quarantined (>90% confidence)', { objectKey, topLabel: topLabel?.Name });
    } else if (maxConfidence > 70) {
      // MEDIUM CONFIDENCE — flag for review
      await tagObject(bucketName, objectKey, 'under_review');
      await sendAlert('FLAG', objectKey, labels, maxConfidence);
      log.info('Image flagged for review (70-90% confidence)', { objectKey, topLabel: topLabel?.Name });
    } else {
      // LOW CONFIDENCE — pass with tag
      await tagObject(bucketName, objectKey, 'passed_low_signal');
      log.info('Image passed with low signal (<70%)', { objectKey, topLabel: topLabel?.Name });
    }
  } catch (error) {
    log.error('Error analyzing image', { objectKey, error });
    // Don't throw — we don't want to retry on transient errors and re-analyze
    // Tag as pending for manual review
    await tagObject(bucketName, objectKey, 'scan_error').catch(() => {});
  }
}

async function tagObject(bucket: string, key: string, status: string): Promise<void> {
  await s3Client.send(
    new PutObjectTaggingCommand({
      Bucket: bucket,
      Key: key,
      Tagging: {
        TagSet: [
          { Key: 'moderation-status', Value: status },
          { Key: 'moderation-scanned-at', Value: new Date().toISOString() },
        ],
      },
    }),
  );
}

async function quarantineObject(sourceBucket: string, sourceKey: string): Promise<void> {
  if (!QUARANTINE_BUCKET) {
    log.error('QUARANTINE_BUCKET not configured, cannot quarantine');
    return;
  }

  // Copy to quarantine bucket
  await s3Client.send(
    new CopyObjectCommand({
      Bucket: QUARANTINE_BUCKET,
      Key: `moderation/${sourceKey}`,
      CopySource: `${sourceBucket}/${sourceKey}`,
    }),
  );

  // Delete from source
  await s3Client.send(
    new DeleteObjectCommand({
      Bucket: sourceBucket,
      Key: sourceKey,
    }),
  );

  // Note: DB references to the quarantined image will return 404/403.
  // Clients handle missing images gracefully with fallback placeholders.
  // A future admin cleanup job can sweep DB records referencing deleted S3 keys.
}

async function sendAlert(
  action: 'BLOCK' | 'FLAG',
  objectKey: string,
  labels: Array<{ Name?: string; Confidence?: number; ParentName?: string }>,
  maxConfidence: number,
): Promise<void> {
  if (!SECURITY_ALERTS_TOPIC_ARN) return;

  try {
    await snsClient.send(
      new PublishCommand({
        TopicArn: SECURITY_ALERTS_TOPIC_ARN,
        Subject: `MODERATION ${action}: ${objectKey.split('/').pop()}`,
        Message: JSON.stringify({
          type: 'image_moderation',
          action,
          objectKey,
          maxConfidence: Math.round(maxConfidence),
          labels: labels.map(l => ({
            name: l.Name,
            confidence: Math.round(l.Confidence || 0),
            parent: l.ParentName,
          })),
          timestamp: new Date().toISOString(),
        }),
      }),
    );
  } catch (err) {
    log.error('Failed to send moderation alert', err);
  }
}

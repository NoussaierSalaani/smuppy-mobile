/**
 * Analyze Image Lambda Handler
 * Triggered by EventBridge on S3 PutObject for media uploads.
 * Uses AWS Rekognition DetectModerationLabels to check for NSFW content.
 *
 * Two modes:
 * - pending-scan/ images: DynamoDB coordination with virus scanner,
 *   promoted to final path only after both scans pass.
 * - Direct-path videos: async StartContentModeration, results via SNS.
 *
 * Thresholds:
 * - > 90% confidence → quarantine
 * - 70-90% → under_review (promoted with tag)
 * - < 70% → pass
 */

import { S3Client, PutObjectTaggingCommand, GetObjectTaggingCommand, CopyObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { RekognitionClient, DetectModerationLabelsCommand, StartContentModerationCommand, type ModerationLabel } from '@aws-sdk/client-rekognition';
import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';
import { createLogger } from '../utils/logger';
import {
  isPendingScan,
  recordScanResult,
  promoteObject,
  quarantineFromPending,
  type ScanVerdict,
} from './scan-coordinator';

const log = createLogger('moderation-analyze-image');

const s3Client = new S3Client({ region: process.env.AWS_REGION });
const rekognitionClient = new RekognitionClient({ region: process.env.AWS_REGION });
const snsClient = new SNSClient({ region: process.env.AWS_REGION });

const QUARANTINE_BUCKET = process.env.QUARANTINE_BUCKET || '';
const SECURITY_ALERTS_TOPIC_ARN = process.env.SECURITY_ALERTS_TOPIC_ARN || '';
const VIDEO_MODERATION_TOPIC_ARN = process.env.VIDEO_MODERATION_TOPIC_ARN || '';
const REKOGNITION_ROLE_ARN = process.env.REKOGNITION_ROLE_ARN || '';

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.heic']);
const VIDEO_EXTENSIONS = new Set(['.mp4', '.mov', '.webm', '.m4v']);

const REKOGNITION_MAX_BYTES = 15 * 1024 * 1024; // 15 MB

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

  const extension = objectKey.substring(objectKey.lastIndexOf('.')).toLowerCase();
  const isImage = IMAGE_EXTENSIONS.has(extension);
  const isVideo = VIDEO_EXTENSIONS.has(extension);
  const pending = isPendingScan(objectKey);

  // Skip non-media files (virus scanner handles these)
  if (!isImage && !isVideo) {
    log.info('Skipping non-media file', { objectKey, extension });
    return;
  }

  // Skip quarantine bucket objects
  if (objectKey.startsWith('quarantine/')) {
    return;
  }

  // ── Videos: async Rekognition (direct-path only, no quarantine-first) ──
  if (isVideo) {
    await handleVideo(bucketName, objectKey, fileSize);
    return;
  }

  // ── Images ──
  if (pending) {
    await handlePendingScanImage(bucketName, objectKey, fileSize);
  } else {
    await handleDirectImage(bucketName, objectKey, fileSize);
  }
}

/**
 * Handle videos — start async Rekognition job (no quarantine-first).
 * Videos are uploaded to their final path. Moderation quarantines later if needed.
 */
async function handleVideo(bucketName: string, objectKey: string, fileSize: number): Promise<void> {
  if (!VIDEO_MODERATION_TOPIC_ARN || !REKOGNITION_ROLE_ARN) {
    log.warn('Video moderation not configured, tagging for manual review', { objectKey });
    await tagObject(bucketName, objectKey, 'video_pending_moderation');
    return;
  }

  log.info('Starting async video moderation', { objectKey, fileSize });
  await tagObject(bucketName, objectKey, 'video_moderation_in_progress');

  try {
    const response = await rekognitionClient.send(
      new StartContentModerationCommand({
        Video: {
          S3Object: { Bucket: bucketName, Name: objectKey },
        },
        MinConfidence: 50,
        NotificationChannel: {
          SNSTopicArn: VIDEO_MODERATION_TOPIC_ARN,
          RoleArn: REKOGNITION_ROLE_ARN,
        },
      }),
    );
    log.info('Video moderation job started', { objectKey, jobId: response.JobId });
  } catch (error_) {
    log.error('Failed to start video moderation', { objectKey, error: error_ });
    await tagObject(bucketName, objectKey, 'video_scan_error');
  }
}

/**
 * Handle pending-scan images — quarantine-first flow.
 * Run Rekognition, record result in DynamoDB, promote/quarantine when
 * both scanners have completed (atomic counter coordination).
 */
async function handlePendingScanImage(bucketName: string, objectKey: string, fileSize: number): Promise<void> {
  // expectedScanCount=2: virus scanner + this moderation scanner
  const expectedScans = 2;

  // Oversized images can't be analyzed by Rekognition — flag for review
  if (fileSize > REKOGNITION_MAX_BYTES) {
    log.info('Oversized pending-scan image, recording review verdict', { objectKey, fileSize });
    await coordinateAndFinalize(bucketName, objectKey, 'review', expectedScans);
    return;
  }

  log.info('Analyzing pending-scan image', { bucketName, objectKey });

  try {
    const rekResponse = await rekognitionClient.send(
      new DetectModerationLabelsCommand({
        Image: { S3Object: { Bucket: bucketName, Name: objectKey } },
        MinConfidence: 50,
      }),
    );

    const labels: ModerationLabel[] = rekResponse.ModerationLabels || [];

    if (labels.length === 0) {
      await coordinateAndFinalize(bucketName, objectKey, 'passed', expectedScans);
      log.info('Pending-scan image passed moderation', { objectKey });
      return;
    }

    const maxConfidence = Math.max(...labels.map(l => l.Confidence || 0));
    const topLabel = labels.find(l => l.Confidence === maxConfidence);

    log.info('Moderation labels detected', { objectKey, maxConfidence, topLabel: topLabel?.Name, labelCount: labels.length });

    let verdict: ScanVerdict;
    if (maxConfidence > 90) {
      verdict = 'quarantine';
      await sendAlert('BLOCK', objectKey, labels, maxConfidence);
    } else if (maxConfidence > 70) {
      verdict = 'review';
      await sendAlert('FLAG', objectKey, labels, maxConfidence);
    } else {
      verdict = 'passed_low_signal';
    }

    await coordinateAndFinalize(bucketName, objectKey, verdict, expectedScans);
  } catch (error_) {
    log.error('Error analyzing pending-scan image', { objectKey, error: error_ });
    // Record error verdict — don't block uploads on transient failures
    await coordinateAndFinalize(bucketName, objectKey, 'error', expectedScans);
  }
}

/**
 * Record moderation result in DynamoDB and promote/quarantine if this
 * scanner is the last one to finish.
 */
async function coordinateAndFinalize(
  bucketName: string,
  objectKey: string,
  verdict: ScanVerdict,
  expectedScans: number,
): Promise<void> {
  const result = await recordScanResult(objectKey, bucketName, 'moderation', verdict, expectedScans);

  if (!result.isLastScanner) {
    log.info('Not last scanner, waiting for virus scan', { objectKey, verdict });
    return;
  }

  // Last scanner — decide final action
  if (result.shouldQuarantine) {
    log.info('Quarantining from pending-scan', { objectKey, virusResult: result.virusScanResult, modResult: result.moderationResult });
    await quarantineFromPending(bucketName, objectKey, `virus=${result.virusScanResult}, mod=${result.moderationResult}`);
  } else {
    const moderationTag = verdict === 'review' ? 'under_review' : verdict;
    log.info('Promoting to final path', { objectKey, moderationTag });
    await promoteObject(bucketName, objectKey, moderationTag);
  }
}

/**
 * Handle direct-path images (non-pending-scan) — legacy flow.
 * Used for images that bypass quarantine-first (e.g., admin uploads).
 */
async function handleDirectImage(bucketName: string, objectKey: string, fileSize: number): Promise<void> {
  if (fileSize > REKOGNITION_MAX_BYTES) {
    log.info('Oversized image, tagging for manual review', { objectKey, fileSize });
    await tagObject(bucketName, objectKey, 'oversized_pending_review');
    return;
  }

  log.info('Analyzing direct-path image', { bucketName, objectKey });

  try {
    const existingTags = await s3Client.send(
      new GetObjectTaggingCommand({ Bucket: bucketName, Key: objectKey }),
    );
    const moderationTag = existingTags.TagSet?.find(t => t.Key === 'moderation-status');
    if (moderationTag) {
      log.info('Image already scanned, skipping', { objectKey, status: moderationTag.Value });
      return;
    }

    const rekResponse = await rekognitionClient.send(
      new DetectModerationLabelsCommand({
        Image: { S3Object: { Bucket: bucketName, Name: objectKey } },
        MinConfidence: 50,
      }),
    );

    const labels: ModerationLabel[] = rekResponse.ModerationLabels || [];

    if (labels.length === 0) {
      await tagObject(bucketName, objectKey, 'passed');
      log.info('Image passed moderation', { objectKey });
      return;
    }

    const maxConfidence = Math.max(...labels.map(l => l.Confidence || 0));
    const topLabel = labels.find(l => l.Confidence === maxConfidence);

    log.info('Moderation labels detected', { objectKey, maxConfidence, topLabel: topLabel?.Name, labelCount: labels.length });

    if (maxConfidence > 90) {
      await quarantineObject(bucketName, objectKey);
      await sendAlert('BLOCK', objectKey, labels, maxConfidence);
      log.info('Image quarantined (>90%)', { objectKey, topLabel: topLabel?.Name });
    } else if (maxConfidence > 70) {
      await tagObject(bucketName, objectKey, 'under_review');
      await sendAlert('FLAG', objectKey, labels, maxConfidence);
      log.info('Image flagged for review (70-90%)', { objectKey, topLabel: topLabel?.Name });
    } else {
      await tagObject(bucketName, objectKey, 'passed_low_signal');
      log.info('Image passed with low signal (<70%)', { objectKey, topLabel: topLabel?.Name });
    }
  } catch (error_) {
    log.error('Error analyzing image', { objectKey, error: error_ });
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

  await s3Client.send(
    new CopyObjectCommand({
      Bucket: QUARANTINE_BUCKET,
      Key: `moderation/${sourceKey}`,
      CopySource: `${sourceBucket}/${sourceKey}`,
    }),
  );

  await s3Client.send(
    new DeleteObjectCommand({
      Bucket: sourceBucket,
      Key: sourceKey,
    }),
  );
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
  } catch (error_) {
    log.error('Failed to send moderation alert', error_);
  }
}

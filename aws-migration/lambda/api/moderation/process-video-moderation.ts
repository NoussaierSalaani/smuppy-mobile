/**
 * Process Video Moderation Results Lambda Handler
 * Triggered by SNS when Rekognition completes async video content moderation.
 * Calls GetContentModeration to retrieve labels, then applies same thresholds as images:
 *   > 90% confidence → quarantine + delete from public
 *   70-90% → tag as under_review
 *   < 70% → pass
 */

import { S3Client, CopyObjectCommand, DeleteObjectCommand, PutObjectTaggingCommand } from '@aws-sdk/client-s3';
import { RekognitionClient, GetContentModerationCommand, type ContentModerationDetection } from '@aws-sdk/client-rekognition';
import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';
import { createLogger } from '../utils/logger';

const log = createLogger('moderation-video-results');

const s3Client = new S3Client({
  region: process.env.AWS_REGION,
  requestChecksumCalculation: 'WHEN_REQUIRED',
  responseChecksumValidation: 'WHEN_REQUIRED',
});
const rekognitionClient = new RekognitionClient({ region: process.env.AWS_REGION });
const snsClient = new SNSClient({ region: process.env.AWS_REGION });

const QUARANTINE_BUCKET = process.env.QUARANTINE_BUCKET || '';
const SECURITY_ALERTS_TOPIC_ARN = process.env.SECURITY_ALERTS_TOPIC_ARN || '';

interface SNSEvent {
  Records: Array<{
    Sns: {
      Message: string;
    };
  }>;
}

interface RekognitionVideoCallback {
  JobId: string;
  Status: 'SUCCEEDED' | 'FAILED';
  API: string;
  Video: {
    S3ObjectName: string;
    S3Bucket: string;
  };
}

export async function handler(event: SNSEvent): Promise<void> {
  for (const record of event.Records) {
    let callback: RekognitionVideoCallback;
    try {
      callback = JSON.parse(record.Sns.Message);
    } catch {
      log.error('Failed to parse SNS message', { message: record.Sns.Message.substring(0, 200) });
      continue;
    }

    // Only process StartContentModeration callbacks
    if (callback.API !== 'StartContentModeration') {
      log.info('Ignoring non-moderation callback', { api: callback.API });
      continue;
    }

    const { JobId, Status, Video } = callback;
    const objectKey = Video.S3ObjectName;
    const bucketName = Video.S3Bucket;

    log.info('Video moderation callback received', { JobId, Status, objectKey });

    if (Status !== 'SUCCEEDED') {
      log.error('Video moderation job failed', { JobId, Status, objectKey });
      await tagObject(bucketName, objectKey, 'video_scan_error');
      return;
    }

    try {
      // Paginate through all moderation results
      let allLabels: ContentModerationDetection[] = [];
      let nextToken: string | undefined;

      do {
        const response = await rekognitionClient.send(
          new GetContentModerationCommand({
            JobId,
            SortBy: 'TIMESTAMP',
            ...(nextToken ? { NextToken: nextToken } : {}),
          }),
        );

        if (response.ModerationLabels) {
          allLabels = allLabels.concat(response.ModerationLabels);
        }
        nextToken = response.NextToken;
      } while (nextToken);

      if (allLabels.length === 0) {
        await tagObject(bucketName, objectKey, 'passed');
        log.info('Video passed moderation', { objectKey });
        return;
      }

      // Find highest confidence across all timestamps
      const maxConfidence = Math.max(
        ...allLabels.map(l => l.ModerationLabel?.Confidence || 0),
      );

      log.info('Video moderation labels detected', {
        objectKey,
        maxConfidence,
        totalDetections: allLabels.length,
      });

      // Deduplicate labels by name, keep highest confidence per label
      const labelMap = new Map<string, { Name?: string; Confidence?: number; ParentName?: string }>();
      for (const detection of allLabels) {
        const label = detection.ModerationLabel;
        if (!label?.Name) continue;
        const existing = labelMap.get(label.Name);
        if (!existing || (label.Confidence || 0) > (existing.Confidence || 0)) {
          labelMap.set(label.Name, {
            Name: label.Name,
            Confidence: label.Confidence,
            ParentName: label.ParentName,
          });
        }
      }
      const uniqueLabels = Array.from(labelMap.values());

      if (maxConfidence > 90) {
        await quarantineObject(bucketName, objectKey);
        await sendAlert('BLOCK', objectKey, uniqueLabels, maxConfidence);
        log.info('Video quarantined (>90% confidence)', { objectKey });
      } else if (maxConfidence > 70) {
        await tagObject(bucketName, objectKey, 'under_review');
        await sendAlert('FLAG', objectKey, uniqueLabels, maxConfidence);
        log.info('Video flagged for review (70-90%)', { objectKey });
      } else {
        await tagObject(bucketName, objectKey, 'passed_low_signal');
        log.info('Video passed with low signal (<70%)', { objectKey });
      }
    } catch (error_) {
      log.error('Error processing video moderation results', { objectKey, error: error_ });
      await tagObject(bucketName, objectKey, 'video_scan_error').catch(() => {});
    }
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
        Subject: `VIDEO MODERATION ${action}: ${objectKey.split('/').pop()}`,
        Message: JSON.stringify({
          type: 'video_moderation',
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
    log.error('Failed to send video moderation alert', error_);
  }
}

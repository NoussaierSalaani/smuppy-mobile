/**
 * Scan Coordinator — DynamoDB-based coordination for quarantine-first uploads.
 *
 * Images upload to `pending-scan/<path>`. Two scanners (virus + moderation)
 * run in parallel via EventBridge. Each writes its result and atomically
 * increments a counter. The last scanner to finish promotes (CopyObject to
 * final path) or quarantines based on combined results.
 *
 * Videos and audio bypass quarantine-first (uploaded to final path directly)
 * because async Rekognition jobs need the file to persist for minutes.
 */

import { DynamoDBClient, UpdateItemCommand, DeleteItemCommand } from '@aws-sdk/client-dynamodb';
import { S3Client, CopyObjectCommand, DeleteObjectCommand, PutObjectTaggingCommand } from '@aws-sdk/client-s3';
import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';
import { createLogger } from '../utils/logger';

const log = createLogger('scan-coordinator');

const dynamoClient = new DynamoDBClient({ region: process.env.AWS_REGION });
const s3Client = new S3Client({ region: process.env.AWS_REGION });
const snsClient = new SNSClient({ region: process.env.AWS_REGION });

const SCAN_TABLE = process.env.SCAN_COORDINATION_TABLE || '';
const QUARANTINE_BUCKET = process.env.QUARANTINE_BUCKET || '';
const SECURITY_ALERTS_TOPIC_ARN = process.env.SECURITY_ALERTS_TOPIC_ARN || '';

export const PENDING_SCAN_PREFIX = 'pending-scan/';

/** Check whether a key is in the quarantine-first flow */
export function isPendingScan(objectKey: string): boolean {
  return objectKey.startsWith(PENDING_SCAN_PREFIX);
}

/** Strip the pending-scan/ prefix to get the final S3 key */
export function getFinalKey(pendingKey: string): string {
  return pendingKey.replace(PENDING_SCAN_PREFIX, '');
}

/** Scan verdict written by each scanner */
export type ScanVerdict = 'passed' | 'passed_low_signal' | 'review' | 'quarantine' | 'error';

export interface CoordinationResult {
  isLastScanner: boolean;
  allResultsSafe: boolean;
  shouldQuarantine: boolean;
  virusScanResult?: string;
  moderationResult?: string;
}

/**
 * Record a scan result and atomically increment the scan counter.
 * Returns whether this scanner is the last one and the combined verdict.
 *
 * Uses DynamoDB atomic ADD to guarantee exactly one scanner "wins" the
 * last position, even under concurrent writes.
 */
export async function recordScanResult(
  objectKey: string,
  bucketName: string,
  scanType: 'virus' | 'moderation',
  verdict: ScanVerdict,
  expectedScanCount: number,
): Promise<CoordinationResult> {
  if (!SCAN_TABLE) {
    log.warn('SCAN_COORDINATION_TABLE not configured, falling back to direct action');
    return {
      isLastScanner: true,
      allResultsSafe: verdict !== 'quarantine',
      shouldQuarantine: verdict === 'quarantine',
    };
  }

  const now = new Date();
  const ttlSeconds = Math.floor(now.getTime() / 1000) + 3600; // 1-hour TTL
  const resultField = scanType === 'virus' ? 'virusScanResult' : 'moderationResult';
  const timeField = scanType === 'virus' ? 'virusScanAt' : 'moderationAt';

  const response = await dynamoClient.send(new UpdateItemCommand({
    TableName: SCAN_TABLE,
    Key: { objectKey: { S: objectKey } },
    UpdateExpression: [
      `SET ${resultField} = :result`,
      `${timeField} = :ts`,
      'bucketName = :bucket',
      'expiresAt = :ttl',
      'uploadedAt = if_not_exists(uploadedAt, :ts)',
      'expectedScanCount = if_not_exists(expectedScanCount, :expected)',
      'ADD scanCount :one',
    ].join(', ').replace(', ADD', ' ADD'),
    ExpressionAttributeValues: {
      ':result': { S: verdict },
      ':ts': { S: now.toISOString() },
      ':bucket': { S: bucketName },
      ':ttl': { N: String(ttlSeconds) },
      ':expected': { N: String(expectedScanCount) },
      ':one': { N: '1' },
    },
    ReturnValues: 'ALL_NEW',
  }));

  const attrs = response.Attributes || {};
  const scanCount = Number.parseInt(attrs.scanCount?.N || '0', 10);
  const expected = Number.parseInt(attrs.expectedScanCount?.N || '1', 10);
  const virusResult = attrs.virusScanResult?.S;
  const modResult = attrs.moderationResult?.S;

  const isLastScanner = scanCount >= expected;
  const shouldQuarantine = virusResult === 'quarantine' || modResult === 'quarantine';
  const allResultsSafe = !shouldQuarantine;

  log.info('Scan result recorded', {
    objectKey,
    scanType,
    verdict,
    scanCount,
    expected,
    isLastScanner,
    shouldQuarantine,
  });

  return { isLastScanner, allResultsSafe, shouldQuarantine, virusScanResult: virusResult, moderationResult: modResult };
}

/**
 * Promote a file from pending-scan/ to its final S3 path.
 * Called by the last scanner when all results are safe.
 */
export async function promoteObject(
  bucketName: string,
  pendingKey: string,
  moderationTag?: string,
): Promise<void> {
  const finalKey = getFinalKey(pendingKey);
  log.info('Promoting file', { pendingKey, finalKey });

  // Copy to final path
  await s3Client.send(new CopyObjectCommand({
    Bucket: bucketName,
    Key: finalKey,
    CopySource: `${bucketName}/${pendingKey}`,
  }));

  // Tag promoted file with scan results
  const tagValue = moderationTag || 'passed';
  await s3Client.send(new PutObjectTaggingCommand({
    Bucket: bucketName,
    Key: finalKey,
    Tagging: {
      TagSet: [
        { Key: 'scan-status', Value: 'clean' },
        { Key: 'moderation-status', Value: tagValue },
        { Key: 'promoted-at', Value: new Date().toISOString() },
      ],
    },
  }));

  // Delete from pending-scan
  await s3Client.send(new DeleteObjectCommand({
    Bucket: bucketName,
    Key: pendingKey,
  }));

  // Clean up DynamoDB
  await cleanupEntry(pendingKey);
}

/**
 * Quarantine a file from pending-scan/ to the quarantine bucket.
 * Called by the last scanner when any result indicates a threat.
 */
export async function quarantineFromPending(
  bucketName: string,
  pendingKey: string,
  reason: string,
): Promise<void> {
  if (!QUARANTINE_BUCKET) {
    log.error('QUARANTINE_BUCKET not configured');
    return;
  }

  const quarantineKey = `quarantine/${getFinalKey(pendingKey)}`;
  log.info('Quarantining from pending scan', { pendingKey, quarantineKey, reason });

  // Copy to quarantine bucket
  await s3Client.send(new CopyObjectCommand({
    Bucket: QUARANTINE_BUCKET,
    Key: quarantineKey,
    CopySource: `${bucketName}/${pendingKey}`,
  }));

  // Delete from pending-scan
  await s3Client.send(new DeleteObjectCommand({
    Bucket: bucketName,
    Key: pendingKey,
  }));

  // Alert security team
  if (SECURITY_ALERTS_TOPIC_ARN) {
    try {
      await snsClient.send(new PublishCommand({
        TopicArn: SECURITY_ALERTS_TOPIC_ARN,
        Subject: `[QUARANTINE] ${pendingKey.split('/').pop()}`,
        Message: JSON.stringify({
          type: 'QUARANTINE_FROM_PENDING',
          bucket: bucketName,
          key: pendingKey,
          quarantineLocation: `s3://${QUARANTINE_BUCKET}/${quarantineKey}`,
          reason,
          timestamp: new Date().toISOString(),
        }),
      }));
    } catch (err) {
      log.error('Failed to send quarantine alert', err);
    }
  }

  // Clean up DynamoDB
  await cleanupEntry(pendingKey);
}

async function cleanupEntry(objectKey: string): Promise<void> {
  if (!SCAN_TABLE) return;
  try {
    await dynamoClient.send(new DeleteItemCommand({
      TableName: SCAN_TABLE,
      Key: { objectKey: { S: objectKey } },
    }));
  } catch (err) {
    log.warn('Failed to cleanup DynamoDB entry', { objectKey, err });
  }
}

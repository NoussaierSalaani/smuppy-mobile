/**
 * Upload Quota Utility
 * Enforces daily upload limits for personal (free) accounts.
 * Uses the existing DynamoDB rate-limit table with daily-window keys.
 *
 * Pro accounts (pro_creator, pro_business) are unlimited.
 */

import { DynamoDBClient, GetItemCommand, UpdateItemCommand } from '@aws-sdk/client-dynamodb';
import { createLogger } from './logger';
import {
  PERSONAL_DAILY_VIDEO_SECONDS,
  PERSONAL_MAX_VIDEO_SECONDS,
  PERSONAL_MAX_VIDEO_SIZE_BYTES,
  PERSONAL_DAILY_PHOTO_COUNT,
  PERSONAL_DAILY_PEAK_COUNT,
  PERSONAL_VIDEO_RENDITIONS,
  PRO_MAX_VIDEO_SECONDS,
  PRO_MAX_VIDEO_SIZE_BYTES,
  PRO_VIDEO_RENDITIONS,
} from './constants';

const log = createLogger('upload-quota');
const dynamoClient = new DynamoDBClient({});
const TABLE = process.env.RATE_LIMIT_TABLE || 'smuppy-rate-limit-staging';

export interface QuotaLimits {
  dailyVideoSeconds: number | null;   // null = unlimited
  maxVideoSeconds: number;            // per-video cap
  maxVideoSizeBytes: number;
  dailyPhotoCount: number | null;     // null = unlimited
  dailyPeakCount: number | null;      // null = unlimited
  videoRenditions: number;
}

export interface QuotaCheckResult {
  allowed: boolean;
  remaining: number | null;  // null = unlimited
  limit: number | null;      // null = unlimited
}

export interface QuotaUsage {
  videoSecondsUsed: number;
  photoCountUsed: number;
  peakCountUsed: number;
}

/** Returns true for account types with no daily quotas */
export function isPremiumAccount(accountType: string): boolean {
  return accountType === 'pro_creator' || accountType === 'pro_business';
}

/** Get quota limits based on account type */
export function getQuotaLimits(accountType: string): QuotaLimits {
  if (isPremiumAccount(accountType)) {
    return {
      dailyVideoSeconds: null,
      maxVideoSeconds: PRO_MAX_VIDEO_SECONDS,
      maxVideoSizeBytes: PRO_MAX_VIDEO_SIZE_BYTES,
      dailyPhotoCount: null,
      dailyPeakCount: null,
      videoRenditions: PRO_VIDEO_RENDITIONS,
    };
  }
  return {
    dailyVideoSeconds: PERSONAL_DAILY_VIDEO_SECONDS,
    maxVideoSeconds: PERSONAL_MAX_VIDEO_SECONDS,
    maxVideoSizeBytes: PERSONAL_MAX_VIDEO_SIZE_BYTES,
    dailyPhotoCount: PERSONAL_DAILY_PHOTO_COUNT,
    dailyPeakCount: PERSONAL_DAILY_PEAK_COUNT,
    videoRenditions: PERSONAL_VIDEO_RENDITIONS,
  };
}

/** Day number for DynamoDB key partitioning (resets daily) */
function getDayNumber(): number {
  return Math.floor(Date.now() / 1000 / 86400);
}

/** TTL = end of current day + 60s buffer */
function getDayTTL(): number {
  const dayNumber = getDayNumber();
  return (dayNumber + 1) * 86400 + 60;
}

function quotaKey(resource: string, userId: string): string {
  return `quota-${resource}#${userId}#${getDayNumber()}`;
}

/** Read current counter value from DynamoDB */
async function getCounter(key: string): Promise<number> {
  try {
    const result = await dynamoClient.send(new GetItemCommand({
      TableName: TABLE,
      Key: { pk: { S: key } },
      ProjectionExpression: '#count',
      ExpressionAttributeNames: { '#count': 'count' },
    }));
    return parseInt(result.Item?.count?.N || '0', 10);
  } catch (error) {
    log.error('Failed to read quota counter', error);
    return 0;
  }
}

/** Get current daily usage for a user */
export async function getQuotaUsage(userId: string): Promise<QuotaUsage> {
  const [videoSecondsUsed, photoCountUsed, peakCountUsed] = await Promise.all([
    getCounter(quotaKey('video-seconds', userId)),
    getCounter(quotaKey('photo-count', userId)),
    getCounter(quotaKey('peak-count', userId)),
  ]);
  return { videoSecondsUsed, photoCountUsed, peakCountUsed };
}

/** Check if a quota action is allowed (does NOT increment) */
export async function checkQuota(
  userId: string,
  accountType: string,
  resource: 'video' | 'photo' | 'peak',
  amount: number = 1,
): Promise<QuotaCheckResult> {
  const limits = getQuotaLimits(accountType);

  let limit: number | null;
  let counterKey: string;

  switch (resource) {
    case 'video':
      limit = limits.dailyVideoSeconds;
      counterKey = quotaKey('video-seconds', userId);
      break;
    case 'photo':
      limit = limits.dailyPhotoCount;
      counterKey = quotaKey('photo-count', userId);
      break;
    case 'peak':
      limit = limits.dailyPeakCount;
      counterKey = quotaKey('peak-count', userId);
      break;
  }

  // Unlimited
  if (limit === null) {
    return { allowed: true, remaining: null, limit: null };
  }

  const used = await getCounter(counterKey);
  const remaining = Math.max(0, limit - used);
  const allowed = used + amount <= limit;

  return { allowed, remaining, limit };
}

/** Increment quota counter after successful action */
export async function deductQuota(
  userId: string,
  resource: 'video' | 'photo' | 'peak',
  amount: number,
): Promise<void> {
  let counterKey: string;
  switch (resource) {
    case 'video':
      counterKey = quotaKey('video-seconds', userId);
      break;
    case 'photo':
      counterKey = quotaKey('photo-count', userId);
      break;
    case 'peak':
      counterKey = quotaKey('peak-count', userId);
      break;
  }

  try {
    await dynamoClient.send(new UpdateItemCommand({
      TableName: TABLE,
      Key: { pk: { S: counterKey } },
      UpdateExpression: 'SET #count = if_not_exists(#count, :zero) + :amount, #ttl = :ttl',
      ExpressionAttributeNames: { '#count': 'count', '#ttl': 'ttl' },
      ExpressionAttributeValues: {
        ':zero': { N: '0' },
        ':amount': { N: String(amount) },
        ':ttl': { N: String(getDayTTL()) },
      },
    }));
  } catch (error) {
    log.error('Failed to deduct quota', { resource, userId: userId.substring(0, 2) + '***', error });
  }
}

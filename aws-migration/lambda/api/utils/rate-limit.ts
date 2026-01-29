/**
 * Shared Rate Limiting Utility
 * Uses DynamoDB atomic counters with TTL for distributed rate limiting.
 * Fail-closed: blocks requests if DynamoDB is unavailable.
 */

import { DynamoDBClient, UpdateItemCommand } from '@aws-sdk/client-dynamodb';
import { createLogger } from './logger';

const log = createLogger('rate-limit');
const dynamoClient = new DynamoDBClient({});

const RATE_LIMIT_TABLE = process.env.RATE_LIMIT_TABLE || 'smuppy-rate-limit-staging';

interface RateLimitResult {
  allowed: boolean;
  retryAfter?: number;
}

interface RateLimitOptions {
  /** Prefix for the rate limit key (e.g. 'post-create', 'follow') */
  prefix: string;
  /** Identifier to rate limit on (IP or userId) */
  identifier: string;
  /** Window size in seconds (default: 60) */
  windowSeconds?: number;
  /** Max requests per window (default: 10) */
  maxRequests?: number;
}

export const checkRateLimit = async (options: RateLimitOptions): Promise<RateLimitResult> => {
  const { prefix, identifier, windowSeconds = 60, maxRequests = 10 } = options;
  const now = Math.floor(Date.now() / 1000);
  const windowKey = `${prefix}#${identifier}#${Math.floor(now / windowSeconds)}`;
  const windowEnd = (Math.floor(now / windowSeconds) + 1) * windowSeconds;

  try {
    const result = await dynamoClient.send(new UpdateItemCommand({
      TableName: RATE_LIMIT_TABLE,
      Key: { pk: { S: windowKey } },
      UpdateExpression: 'SET #count = if_not_exists(#count, :zero) + :one, #ttl = :ttl',
      ExpressionAttributeNames: { '#count': 'count', '#ttl': 'ttl' },
      ExpressionAttributeValues: {
        ':zero': { N: '0' },
        ':one': { N: '1' },
        ':ttl': { N: String(windowEnd + 60) },
      },
      ReturnValues: 'ALL_NEW',
    }));

    const count = parseInt(result.Attributes?.count?.N || '1', 10);

    if (count > maxRequests) {
      const retryAfter = windowEnd - now;
      return { allowed: false, retryAfter };
    }

    return { allowed: true };
  } catch (error) {
    log.error('Rate limit check failed, blocking request', error);
    return { allowed: false, retryAfter: 60 };
  }
};

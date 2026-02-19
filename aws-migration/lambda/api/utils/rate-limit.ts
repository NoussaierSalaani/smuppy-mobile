/**
 * Shared Rate Limiting Utility
 * Uses DynamoDB atomic counters with TTL for distributed rate limiting.
 *
 * Default: fail-closed — if DynamoDB is unavailable, block the request.
 * Set failOpen: true for non-critical endpoints where WAF provides baseline protection.
 */

import { DynamoDBClient, UpdateItemCommand } from '@aws-sdk/client-dynamodb';
import { APIGatewayProxyResult } from 'aws-lambda';
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
  /** If true, allow requests when DynamoDB is unavailable. Default: false (fail-closed). Set true only for non-critical endpoints. */
  failOpen?: boolean;
}

export const checkRateLimit = async (options: RateLimitOptions): Promise<RateLimitResult> => {
  const { prefix, identifier, windowSeconds = 60, maxRequests = 10, failOpen = false } = options;
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

    const count = Number.parseInt(result.Attributes?.count?.N || '1', 10);

    if (count > maxRequests) {
      const retryAfter = windowEnd - now;
      return { allowed: false, retryAfter };
    }

    return { allowed: true };
  } catch (error) {
    if (failOpen) {
      // Fail-open: allow the request but log the error. WAF provides baseline protection.
      log.error('Rate limit check failed, allowing request (fail-open)', error);
      return { allowed: true };
    }
    // Fail-closed: block the request (used for payment/financial endpoints)
    log.error('Rate limit check failed, blocking request (fail-closed)', error);
    return { allowed: false, retryAfter: 60 };
  }
};

/**
 * Check rate limit and return 429 response if exceeded.
 * Returns null if allowed, or an early-exit response if rate limited.
 */
export async function requireRateLimit(
  options: RateLimitOptions,
  headers: Record<string, string>
): Promise<APIGatewayProxyResult | null> {
  const { allowed } = await checkRateLimit(options);
  if (!allowed) {
    return {
      statusCode: 429,
      headers,
      body: JSON.stringify({ success: false, message: 'Too many requests. Please try again later.' }),
    };
  }
  return null;
}

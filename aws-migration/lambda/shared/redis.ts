/**
 * Shared Redis Connection Module
 * Provides secure Redis connection for all Lambda handlers
 *
 * SECURITY:
 * - Uses TLS for transit encryption
 * - Uses auth token from Secrets Manager
 * - Caches connection across Lambda invocations
 */

import Redis from 'ioredis';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { createLogger } from '../api/utils/logger';

const log = createLogger('redis');

// Cached Redis instance (reused across Lambda invocations)
let redis: Redis | null = null;
let cachedAuthToken: { token: string; expiresAt: number } | null = null;

// Auth token cache TTL: 30 minutes (allows for credential rotation)
const AUTH_TOKEN_CACHE_TTL_MS = 30 * 60 * 1000;

const secretsClient = new SecretsManagerClient({});

/**
 * Get Redis auth token from Secrets Manager with caching
 */
async function getRedisAuthToken(): Promise<string | null> {
  const secretArn = process.env.REDIS_AUTH_SECRET_ARN;
  if (!secretArn) {
    log.warn('REDIS_AUTH_SECRET_ARN not configured, connecting without auth');
    return null;
  }

  const now = Date.now();

  // Return cached token if still valid
  if (cachedAuthToken && cachedAuthToken.expiresAt > now) {
    return cachedAuthToken.token;
  }

  try {
    const command = new GetSecretValueCommand({
      SecretId: secretArn,
    });

    const response = await secretsClient.send(command);

    if (!response.SecretString) {
      log.error('Failed to retrieve auth token from Secrets Manager');
      return null;
    }

    // The secret is stored as plain text (not JSON)
    const token = response.SecretString;

    // Cache with expiration
    cachedAuthToken = {
      token,
      expiresAt: now + AUTH_TOKEN_CACHE_TTL_MS,
    };

    return token;
  } catch (error) {
    log.error('Error fetching auth token', error);
    return null;
  }
}

/**
 * Get or create Redis connection
 * Returns null if Redis is not configured (graceful degradation)
 */
export async function getRedis(): Promise<Redis | null> {
  const redisEndpoint = process.env.REDIS_ENDPOINT;

  if (!redisEndpoint) {
    return null;
  }

  if (redis && redis.status === 'ready') {
    return redis;
  }

  // Close existing connection if not ready
  if (redis) {
    try {
      await redis.quit();
    } catch {
      // Ignore close errors
    }
    redis = null;
  }

  // Get auth token
  const authToken = await getRedisAuthToken();

  // Create new connection with security settings
  redis = new Redis({
    host: redisEndpoint,
    port: parseInt(process.env.REDIS_PORT || '6379'),
    // SECURITY: TLS required - ElastiCache has transit encryption enabled
    tls: {},
    // SECURITY: Auth token for authentication
    password: authToken || undefined,
    // Connection settings optimized for Lambda
    maxRetriesPerRequest: 3,
    connectTimeout: 5000,
    commandTimeout: 3000,
    // Reconnect settings
    retryStrategy: (times: number) => {
      if (times > 3) {
        return null; // Stop retrying after 3 attempts
      }
      return Math.min(times * 100, 1000); // Exponential backoff
    },
    // Enable offline queue to handle reconnections
    enableOfflineQueue: true,
    lazyConnect: true,
  });

  // Handle connection errors
  redis.on('error', (err: Error) => {
    log.error('Connection error', err);
  });

  redis.on('close', () => {
    log.info('Connection closed');
  });

  // Connect
  try {
    await redis.connect();
  } catch (error) {
    log.error('Failed to connect', error);
    redis = null;
    return null;
  }

  return redis;
}


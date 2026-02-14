/**
 * Shared Redis Connection Module
 * Provides secure Redis connection for all Lambda handlers
 *
 * Supports both standalone and cluster mode:
 * - Standalone: staging (numNodeGroups: 1, replicasPerNodeGroup: 0)
 * - Cluster: production (numNodeGroups: 2, replicasPerNodeGroup: 2)
 *
 * SECURITY:
 * - Uses TLS for transit encryption
 * - Uses auth token from Secrets Manager
 * - Caches connection across Lambda invocations
 */

import Redis, { Cluster } from 'ioredis';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { createLogger } from '../api/utils/logger';

const log = createLogger('redis');

// Cached Redis instance (reused across Lambda invocations)
let redis: Redis | Cluster | null = null;
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
 *
 * Automatically uses Redis.Cluster when REDIS_CLUSTER_MODE=true (production),
 * and standalone Redis otherwise (staging).
 */
export async function getRedis(): Promise<Redis | Cluster | null> {
  const redisEndpoint = process.env.REDIS_ENDPOINT;

  if (!redisEndpoint) {
    return null;
  }

  if (redis && redis.status === 'ready') {
    // Verify connection is alive with a ping before reusing
    try {
      await redis.ping();
      return redis;
    } catch {
      log.warn('Redis ping failed on cached connection, reconnecting');
      try {
        await redis.quit();
      } catch {
        // Ignore close errors
      }
      redis = null;
    }
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
  const port = parseInt(process.env.REDIS_PORT || '6379');
  const isClusterMode = process.env.REDIS_CLUSTER_MODE === 'true';

  try {
    if (isClusterMode) {
      // Cluster mode: production with multiple shards
      // Redis.Cluster auto-discovers all shards from the configuration endpoint
      redis = new Cluster(
        [{ host: redisEndpoint, port }],
        {
          redisOptions: {
            tls: {},
            password: authToken || undefined,
            connectTimeout: 5000,
            commandTimeout: 3000,
          },
          clusterRetryStrategy: (times: number) => {
            if (times > 3) {
              return null;
            }
            return Math.min(times * 100, 1000);
          },
          enableOfflineQueue: true,
          lazyConnect: true,
          dnsLookup: (address, callback) => callback(null, address),
          slotsRefreshTimeout: 10000,
          slotsRefreshInterval: 5000,
        }
      );
    } else {
      // Standalone mode: staging with single node
      redis = new Redis({
        host: redisEndpoint,
        port,
        tls: {},
        password: authToken || undefined,
        maxRetriesPerRequest: 3,
        connectTimeout: 5000,
        commandTimeout: 3000,
        retryStrategy: (times: number) => {
          if (times > 3) {
            return null;
          }
          return Math.min(times * 100, 1000);
        },
        enableOfflineQueue: true,
        lazyConnect: true,
      });
    }

    // Handle connection errors
    redis.on('error', (err: Error) => {
      log.error('Connection error', err);
    });

    redis.on('close', () => {
      log.info('Connection closed');
    });

    // Connect
    await redis.connect();
  } catch (error) {
    log.error('Failed to connect', error);
    redis = null;
    return null;
  }

  return redis;
}

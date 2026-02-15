/**
 * Shared Database Connection Module
 * Provides secure PostgreSQL connection for all Lambda handlers
 *
 * OPTIMIZED FOR AURORA:
 * - Uses RDS Proxy for connection pooling (prevents Lambda connection explosion)
 * - Supports reader endpoint for read-heavy operations
 * - Uses proper SSL configuration for AWS Aurora PostgreSQL
 * - Caches connections across Lambda invocations
 */

import { Pool, PoolConfig } from 'pg';

/** Type-safe SQL query parameter value */
export type SqlParam = string | number | boolean | null | Date | string[] | number[];
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { Signer } from '@aws-sdk/rds-signer';
import { createLogger } from '../api/utils/logger';
import { RDS_CA_BUNDLE } from './rds-ca-bundle';

const log = createLogger('db');

// Check if IAM auth is required (for RDS Proxy)
const USE_IAM_AUTH = process.env.DB_USE_IAM_AUTH === 'true';

interface DbCredentials {
  host: string;
  port: number;
  database?: string;
  dbname?: string;
  username: string;
  password: string;
}

interface CachedCredentials {
  credentials: DbCredentials;
  expiresAt: number;
}

// Connection pools (reused across Lambda invocations)
let writerPool: Pool | null = null;
let readerPool: Pool | null = null;
let cachedCredentials: CachedCredentials | null = null;

// Credential cache TTL: 30 minutes (allows for credential rotation)
const CREDENTIALS_CACHE_TTL_MS = 30 * 60 * 1000;

const secretsClient = new SecretsManagerClient({});

/**
 * Fetches database credentials from AWS Secrets Manager
 * Caches credentials with TTL to support credential rotation
 *
 * SECURITY: Credentials are cached for 30 minutes to balance
 * performance (reducing Secrets Manager API calls) and security
 * (picking up rotated credentials reasonably quickly)
 */
async function getDbCredentials(): Promise<DbCredentials> {
  const now = Date.now();

  // Return cached credentials if still valid
  if (cachedCredentials && cachedCredentials.expiresAt > now) {
    return cachedCredentials.credentials;
  }

  if (!process.env.DB_SECRET_ARN) {
    throw new Error('DB_SECRET_ARN environment variable is required');
  }

  const command = new GetSecretValueCommand({
    SecretId: process.env.DB_SECRET_ARN,
  });

  const response = await secretsClient.send(command);

  if (!response.SecretString) {
    throw new Error('Failed to retrieve database credentials from Secrets Manager');
  }

  const credentials = JSON.parse(response.SecretString);

  // Cache with expiration
  cachedCredentials = {
    credentials,
    expiresAt: now + CREDENTIALS_CACHE_TTL_MS,
  };

  // If pools exist and credentials changed, recreate them
  // This handles credential rotation gracefully
  if (writerPool || readerPool) {
    log.info('Credentials refreshed, pools will use new credentials on next connection');
  }

  return credentials;
}

/**
 * Generates an IAM auth token for RDS Proxy connection
 */
async function generateIAMToken(host: string, port: number, username: string): Promise<string> {
  const signer = new Signer({
    hostname: host,
    port,
    username,
    region: process.env.AWS_REGION || 'us-east-1',
  });
  return signer.getAuthToken();
}

/**
 * Creates a database pool with optimized settings for Lambda
 */
async function createPool(host: string, options?: { maxConnections?: number }): Promise<Pool> {
  const credentials = await getDbCredentials();
  const port = parseInt(process.env.DB_PORT || '5432');
  const database = credentials.dbname || credentials.database || process.env.DB_NAME || 'smuppy';

  // Use IAM auth token for RDS Proxy, or password for direct connection
  let password: string;
  if (USE_IAM_AUTH) {
    log.info('Using IAM authentication for RDS Proxy');
    password = await generateIAMToken(host, port, credentials.username);
  } else {
    password = credentials.password;
  }

  const poolConfig: PoolConfig = {
    host,
    port,
    database,
    user: credentials.username,
    password,
    // SSL configuration for AWS Aurora PostgreSQL
    // BUG-2026-02-15: Added CA bundle — Lambda runtime doesn't include AWS RDS CAs
    ssl: {
      ca: RDS_CA_BUNDLE,
      rejectUnauthorized: process.env.NODE_ENV !== 'development',
    },
    // Connection pool settings optimized for Lambda with RDS Proxy
    // RDS Proxy handles connection pooling, so Lambda can use fewer connections
    max: options?.maxConnections || 5, // Reduced from 10 since RDS Proxy pools connections
    min: 0, // Allow pool to shrink to 0 when idle
    idleTimeoutMillis: 10000, // 10 seconds - release idle connections faster
    connectionTimeoutMillis: 10000, // 10 seconds - reduced for Lambda cold starts
    // Note: statement_timeout is not supported by RDS Proxy
    // Query timeout is enforced by Lambda function timeout instead
  };

  const pool = new Pool(poolConfig);

  // SECURITY: Set statement timeout to prevent slow query DoS
  // Reader pool gets shorter timeout (reads should be fast)
  // Writer pool gets longer timeout (transactions may take longer)
  // Note: RDS Proxy may not fully support SET commands, but this is a defense-in-depth measure
  const timeoutMs = options?.maxConnections === 10 ? 15000 : 30000;
  pool.on('connect', (client: any) => {
    client.query('SET statement_timeout = $1', [timeoutMs]).catch(() => {
      // Silently ignore if RDS Proxy rejects SET — Lambda timeout is the primary guard
    });
  });

  // Handle pool errors gracefully — nullify pool reference so next query creates a fresh pool
  pool.on('error', (err: Error) => {
    log.error('Unexpected database pool error', err);
    if (writerPool === pool) writerPool = null;
    if (readerPool === pool) readerPool = null;
  });

  return pool;
}

/**
 * Gets or creates the writer database connection pool
 * Uses RDS Proxy endpoint for connection pooling
 */
export async function getPool(): Promise<Pool> {
  if (!writerPool) {
    // Use RDS Proxy endpoint (DB_HOST) by default for connection pooling
    // Falls back to writer endpoint if DB_HOST is not set
    const host = process.env.DB_HOST || process.env.DB_WRITER_HOST;
    if (!host) {
      throw new Error('DB_HOST or DB_WRITER_HOST environment variable is required');
    }
    writerPool = await createPool(host);
  }

  return writerPool;
}

/**
 * Gets or creates the reader database connection pool
 * Uses the Aurora reader endpoint for read-heavy operations
 * This helps distribute read load across read replicas
 *
 * Use this for:
 * - Feed queries
 * - Search operations
 * - List operations
 * - Profile lookups
 *
 * Do NOT use for:
 * - Any write operations (INSERT, UPDATE, DELETE)
 * - Operations that require read-after-write consistency
 */
export async function getReaderPool(): Promise<Pool> {
  if (!readerPool) {
    // Use reader endpoint for read operations
    const readerHost = process.env.DB_READER_HOST;
    if (!readerHost) {
      // Fall back to writer pool if no reader endpoint is configured
      log.warn('DB_READER_HOST not configured, falling back to writer pool');
      return getPool();
    }
    readerPool = await createPool(readerHost, { maxConnections: 10 }); // More connections for reads
  }

  return readerPool;
}

/**
 * Re-export CORS utilities for backwards compatibility
 * @deprecated Import from '../api/utils/cors' instead
 */
/**
 * Invalidate cached credentials and pools when an auth failure (28P01) is detected.
 * Call this from error handlers that catch authentication errors, so the next
 * query attempt fetches fresh credentials from Secrets Manager.
 */
export function invalidateCredentials(): void {
  cachedCredentials = null;
  if (writerPool) {
    writerPool.end().catch(() => {});
    writerPool = null;
  }
  if (readerPool) {
    readerPool.end().catch(() => {});
    readerPool = null;
  }
  log.info('Database credentials and pools invalidated for refresh');
}

/**
 * Check if an error is a PostgreSQL authentication failure (28P01)
 * and invalidate credentials if so.
 */
export function handleDbError(error: unknown): void {
  if (
    error &&
    typeof error === 'object' &&
    'code' in error &&
    (error as { code: string }).code === '28P01'
  ) {
    log.warn('Database authentication failure (28P01) detected, invalidating credentials');
    invalidateCredentials();
  }
}

export { headers as corsHeaders, createCorsResponse, getCorsHeaders, getSecureHeaders } from '../api/utils/cors';

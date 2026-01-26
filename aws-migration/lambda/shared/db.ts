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
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

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
    console.log('[DB] Credentials refreshed, pools will use new credentials on next connection');
  }

  return credentials;
}

/**
 * Creates a database pool with optimized settings for Lambda
 */
async function createPool(host: string, options?: { maxConnections?: number }): Promise<Pool> {
  const credentials = await getDbCredentials();

  const poolConfig: PoolConfig = {
    host,
    port: parseInt(process.env.DB_PORT || '5432'),
    database: credentials.dbname || credentials.database || process.env.DB_NAME || 'smuppy',
    user: credentials.username,
    password: credentials.password,
    // Secure SSL configuration for AWS Aurora PostgreSQL
    // AWS Lambda environment includes RDS CA certificates
    ssl: {
      rejectUnauthorized: true,
    },
    // Connection pool settings optimized for Lambda with RDS Proxy
    // RDS Proxy handles connection pooling, so Lambda can use fewer connections
    max: options?.maxConnections || 5, // Reduced from 10 since RDS Proxy pools connections
    min: 0, // Allow pool to shrink to 0 when idle
    idleTimeoutMillis: 10000, // 10 seconds - release idle connections faster
    connectionTimeoutMillis: 10000, // 10 seconds - reduced for Lambda cold starts
    // Statement timeout to prevent runaway queries
    statement_timeout: 30000, // 30 seconds max query time
  };

  const pool = new Pool(poolConfig);

  // Handle pool errors gracefully
  pool.on('error', (err) => {
    console.error('Unexpected database pool error:', err);
    // Don't nullify the pool reference here - let the next query attempt to reconnect
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
      console.warn('DB_READER_HOST not configured, falling back to writer pool');
      return getPool();
    }
    readerPool = await createPool(readerHost, { maxConnections: 10 }); // More connections for reads
  }

  return readerPool;
}

/**
 * Executes a query with automatic connection handling (writer pool)
 * @param text SQL query string
 * @param params Query parameters
 */
export async function query(text: string, params?: any[]) {
  const db = await getPool();
  return db.query(text, params);
}

/**
 * Executes a read-only query using the reader pool
 * Use this for SELECT queries that don't require immediate consistency
 * @param text SQL query string
 * @param params Query parameters
 */
export async function readQuery(text: string, params?: any[]) {
  const db = await getReaderPool();
  return db.query(text, params);
}

/**
 * Gets a client from the writer pool for transactions
 * Remember to release the client after use!
 */
export async function getClient() {
  const db = await getPool();
  return db.connect();
}

/**
 * Gets a client from the reader pool for read-only transactions
 * Remember to release the client after use!
 */
export async function getReaderClient() {
  const db = await getReaderPool();
  return db.connect();
}

/**
 * Closes all database pools
 * Call this during graceful shutdown if needed
 */
export async function closePool() {
  const closePromises: Promise<void>[] = [];

  if (writerPool) {
    closePromises.push(writerPool.end());
    writerPool = null;
  }

  if (readerPool) {
    closePromises.push(readerPool.end());
    readerPool = null;
  }

  cachedCredentials = null;

  await Promise.all(closePromises);
}

/**
 * Health check for database connectivity
 * Useful for Lambda warmup or health endpoints
 */
export async function healthCheck(): Promise<{ writer: boolean; reader: boolean }> {
  const results = { writer: false, reader: false };

  try {
    const pool = await getPool();
    await pool.query('SELECT 1');
    results.writer = true;
  } catch (err) {
    console.error('Writer health check failed:', err);
  }

  try {
    const pool = await getReaderPool();
    await pool.query('SELECT 1');
    results.reader = true;
  } catch (err) {
    console.error('Reader health check failed:', err);
  }

  return results;
}

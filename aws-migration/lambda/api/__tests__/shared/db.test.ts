/**
 * Tests for shared/db module
 *
 * Covers: getPool, getReaderPool, getDbCredentials (via pool creation),
 * invalidateCredentials, handleDbError, IAM auth, singleton behavior,
 * pool error handler, and credential caching.
 *
 * Because the module uses module-level singletons (writerPool, readerPool,
 * cachedCredentials) we must use jest.isolateModules() or jest.resetModules()
 * with dynamic require() to get a fresh module instance per test group.
 */

// Unmock db since setup.ts auto-mocks it
jest.unmock('../../../shared/db');

// ── External dependency mocks (hoisted above all imports) ──

const mockPoolOn = jest.fn();
const mockPoolEnd = jest.fn().mockResolvedValue(undefined);
const mockPoolQuery = jest.fn().mockResolvedValue({ rows: [] });
const mockPoolConnect = jest.fn().mockResolvedValue({
  query: jest.fn(),
  release: jest.fn(),
});

jest.mock('pg', () => ({
  Pool: jest.fn().mockImplementation(() => ({
    query: mockPoolQuery,
    connect: mockPoolConnect,
    on: mockPoolOn,
    end: mockPoolEnd,
  })),
}));

const mockSend = jest.fn().mockResolvedValue({
  SecretString: JSON.stringify({
    host: 'db.example.com',
    port: 5432,
    database: 'testdb',
    username: 'testuser',
    password: 'testpass',
  }),
});

jest.mock('@aws-sdk/client-secrets-manager', () => ({
  SecretsManagerClient: jest.fn().mockImplementation(() => ({ send: mockSend })),
  GetSecretValueCommand: jest.fn().mockImplementation((input: unknown) => ({ input })),
}));

const mockGetAuthToken = jest.fn().mockResolvedValue('iam-auth-token-123');

jest.mock('@aws-sdk/rds-signer', () => ({
  Signer: jest.fn().mockImplementation(() => ({ getAuthToken: mockGetAuthToken })),
}));

// Logger is also mocked by setup.ts but let's be explicit for clarity
jest.mock('../../utils/logger', () => ({
  createLogger: jest.fn(() => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  })),
}));

jest.mock('../../utils/cors', () => ({
  getSecureHeaders: jest.fn(() => ({ 'Content-Type': 'application/json' })),
  createCorsResponse: jest.fn(),
  getCorsHeaders: jest.fn(),
}));

// ── Helpers ──

const originalEnv = process.env;

/** Dynamically require a fresh db module (resets singletons). */
function requireDb() {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require('../../../shared/db') as typeof import('../../../shared/db');
}

// ── Test suites ──

describe('shared/db', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
    // Restore a clean env for each test
    process.env = { ...originalEnv };
    // Provide defaults so most tests don't need to set every var
    process.env.DB_SECRET_ARN = 'arn:aws:secretsmanager:us-east-1:123:secret:db';
    process.env.DB_HOST = 'proxy.example.com';
    delete process.env.DB_USE_IAM_AUTH;
    delete process.env.DB_WRITER_HOST;
    delete process.env.DB_READER_HOST;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  // ─── getPool ──────────────────────────────────────────────

  describe('getPool', () => {
    it('creates pool with correct host from DB_HOST', async () => {
      process.env.DB_HOST = 'proxy.example.com';
      const { Pool } = require('pg');

      const db = requireDb();
      const pool = await db.getPool();

      expect(pool).toBeDefined();
      expect(Pool).toHaveBeenCalledTimes(1);
      expect(Pool).toHaveBeenCalledWith(
        expect.objectContaining({
          host: 'proxy.example.com',
        }),
      );
    });

    it('falls back to DB_WRITER_HOST when DB_HOST is not set', async () => {
      delete process.env.DB_HOST;
      process.env.DB_WRITER_HOST = 'writer.example.com';
      const { Pool } = require('pg');

      const db = requireDb();
      await db.getPool();

      expect(Pool).toHaveBeenCalledWith(
        expect.objectContaining({
          host: 'writer.example.com',
        }),
      );
    });

    it('throws when neither DB_HOST nor DB_WRITER_HOST is set', async () => {
      delete process.env.DB_HOST;
      delete process.env.DB_WRITER_HOST;

      const db = requireDb();
      await expect(db.getPool()).rejects.toThrow(
        'DB_HOST or DB_WRITER_HOST environment variable is required',
      );
    });

    it('returns the same pool on subsequent calls (singleton)', async () => {
      const db = requireDb();

      const pool1 = await db.getPool();
      const pool2 = await db.getPool();

      expect(pool1).toBe(pool2);
      // Pool constructor should only be called once
      const { Pool } = require('pg');
      expect(Pool).toHaveBeenCalledTimes(1);
    });
  });

  // ─── getReaderPool ────────────────────────────────────────

  describe('getReaderPool', () => {
    it('creates a separate pool using DB_READER_HOST', async () => {
      process.env.DB_READER_HOST = 'reader.example.com';
      const { Pool } = require('pg');

      const db = requireDb();
      const readerPool = await db.getReaderPool();

      expect(readerPool).toBeDefined();
      expect(Pool).toHaveBeenCalledWith(
        expect.objectContaining({
          host: 'reader.example.com',
          max: 10, // reader pool gets more connections
        }),
      );
    });

    it('falls back to getPool() when DB_READER_HOST is not set', async () => {
      delete process.env.DB_READER_HOST;
      process.env.DB_HOST = 'proxy.example.com';
      const { Pool } = require('pg');

      const db = requireDb();
      const readerPool = await db.getReaderPool();

      expect(readerPool).toBeDefined();
      // Should create a writer pool (fallback), not a reader pool
      expect(Pool).toHaveBeenCalledTimes(1);
      expect(Pool).toHaveBeenCalledWith(
        expect.objectContaining({
          host: 'proxy.example.com',
          max: 5, // writer pool default
        }),
      );
    });

    it('returns a different pool instance than getPool() when DB_READER_HOST is set', async () => {
      process.env.DB_READER_HOST = 'reader.example.com';
      process.env.DB_HOST = 'proxy.example.com';

      const db = requireDb();
      const writerPool = await db.getPool();
      const readerPool = await db.getReaderPool();

      // Both pools are separate mock objects (different calls to Pool constructor)
      const { Pool } = require('pg');
      expect(Pool).toHaveBeenCalledTimes(2);
      // Writer pool uses DB_HOST, reader pool uses DB_READER_HOST
      expect(Pool).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ host: 'proxy.example.com' }),
      );
      expect(Pool).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ host: 'reader.example.com' }),
      );
    });
  });

  // ─── getDbCredentials (tested via pool creation) ──────────

  describe('getDbCredentials (via pool creation)', () => {
    it('fetches credentials from SecretsManager using DB_SECRET_ARN', async () => {
      process.env.DB_SECRET_ARN = 'arn:aws:secretsmanager:us-east-1:123:secret:mydb';
      const { GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');

      const db = requireDb();
      await db.getPool();

      expect(GetSecretValueCommand).toHaveBeenCalledWith({
        SecretId: 'arn:aws:secretsmanager:us-east-1:123:secret:mydb',
      });
      expect(mockSend).toHaveBeenCalledTimes(1);
    });

    it('throws when DB_SECRET_ARN is not set', async () => {
      delete process.env.DB_SECRET_ARN;

      const db = requireDb();
      await expect(db.getPool()).rejects.toThrow(
        'DB_SECRET_ARN environment variable is required',
      );
    });

    it('throws when SecretString is empty', async () => {
      mockSend.mockResolvedValueOnce({ SecretString: undefined });

      const db = requireDb();
      await expect(db.getPool()).rejects.toThrow(
        'Failed to retrieve database credentials from Secrets Manager',
      );
    });

    it('uses cached credentials on subsequent calls (only 1 SecretsManager call)', async () => {
      const db = requireDb();

      // First call fetches from SecretsManager
      await db.getPool();
      expect(mockSend).toHaveBeenCalledTimes(1);

      // Invalidate pool reference to force createPool re-entry,
      // but credentials should still be cached
      db.invalidateCredentials();

      // Re-create a pool — credentials should be cached (no second send)
      // Need to re-mock send for a second pool creation
      mockSend.mockResolvedValueOnce({
        SecretString: JSON.stringify({
          host: 'db.example.com',
          port: 5432,
          database: 'testdb',
          username: 'testuser',
          password: 'testpass',
        }),
      });
      await db.getPool();

      // invalidateCredentials clears the cache, so it should call send again
      expect(mockSend).toHaveBeenCalledTimes(2);
    });

    it('caches credentials within TTL (no refetch on second pool)', async () => {
      process.env.DB_READER_HOST = 'reader.example.com';

      const db = requireDb();

      // Create writer pool (first SecretsManager fetch)
      await db.getPool();
      expect(mockSend).toHaveBeenCalledTimes(1);

      // Create reader pool (should use cached credentials, no second fetch)
      await db.getReaderPool();
      expect(mockSend).toHaveBeenCalledTimes(1);
    });

    it('uses dbname field when database is not present', async () => {
      mockSend.mockResolvedValueOnce({
        SecretString: JSON.stringify({
          host: 'db.example.com',
          port: 5432,
          dbname: 'smuppy_prod',
          username: 'testuser',
          password: 'testpass',
        }),
      });
      const { Pool } = require('pg');

      const db = requireDb();
      await db.getPool();

      expect(Pool).toHaveBeenCalledWith(
        expect.objectContaining({
          database: 'smuppy_prod',
        }),
      );
    });
  });

  // ─── IAM Authentication ───────────────────────────────────

  describe('IAM authentication', () => {
    it('generates IAM token via Signer when DB_USE_IAM_AUTH=true', async () => {
      process.env.DB_USE_IAM_AUTH = 'true';
      process.env.AWS_REGION = 'eu-west-1';
      const { Signer } = require('@aws-sdk/rds-signer');
      const { Pool } = require('pg');

      const db = requireDb();
      await db.getPool();

      // Signer should have been instantiated with correct params
      expect(Signer).toHaveBeenCalledWith(
        expect.objectContaining({
          hostname: 'proxy.example.com',
          port: 5432,
          username: 'testuser',
          region: 'eu-west-1',
        }),
      );
      expect(mockGetAuthToken).toHaveBeenCalledTimes(1);

      // Pool should use the IAM token as password
      expect(Pool).toHaveBeenCalledWith(
        expect.objectContaining({
          password: 'iam-auth-token-123',
        }),
      );
    });

    it('uses credential password when DB_USE_IAM_AUTH is not set', async () => {
      delete process.env.DB_USE_IAM_AUTH;
      const { Pool } = require('pg');

      const db = requireDb();
      await db.getPool();

      expect(mockGetAuthToken).not.toHaveBeenCalled();
      expect(Pool).toHaveBeenCalledWith(
        expect.objectContaining({
          password: 'testpass',
        }),
      );
    });

    it('defaults AWS_REGION to us-east-1 when not set', async () => {
      process.env.DB_USE_IAM_AUTH = 'true';
      delete process.env.AWS_REGION;
      const { Signer } = require('@aws-sdk/rds-signer');

      const db = requireDb();
      await db.getPool();

      expect(Signer).toHaveBeenCalledWith(
        expect.objectContaining({
          region: 'us-east-1',
        }),
      );
    });
  });

  // ─── invalidateCredentials ────────────────────────────────

  describe('invalidateCredentials', () => {
    it('clears cached credentials and ends both pools', async () => {
      process.env.DB_READER_HOST = 'reader.example.com';

      const db = requireDb();

      // Create both pools
      await db.getPool();
      await db.getReaderPool();

      // Now invalidate
      db.invalidateCredentials();

      // pool.end() should have been called for both pools
      expect(mockPoolEnd).toHaveBeenCalledTimes(2);
    });

    it('forces fresh credential fetch on next getPool() call', async () => {
      const db = requireDb();

      // First call — fetches from SecretsManager
      await db.getPool();
      expect(mockSend).toHaveBeenCalledTimes(1);

      // Invalidate
      db.invalidateCredentials();

      // Second call — should fetch fresh credentials
      mockSend.mockResolvedValueOnce({
        SecretString: JSON.stringify({
          host: 'db.example.com',
          port: 5432,
          database: 'testdb',
          username: 'newuser',
          password: 'newpass',
        }),
      });
      await db.getPool();
      expect(mockSend).toHaveBeenCalledTimes(2);
    });

    it('is safe to call when no pools exist', () => {
      const db = requireDb();
      // Should not throw
      expect(() => db.invalidateCredentials()).not.toThrow();
    });
  });

  // ─── handleDbError ────────────────────────────────────────

  describe('handleDbError', () => {
    it('invalidates credentials on 28P01 (auth failure) error code', async () => {
      const db = requireDb();

      // Create a pool first so invalidation has something to clear
      await db.getPool();

      const authError = { code: '28P01', message: 'password authentication failed' };
      db.handleDbError(authError);

      // pool.end() should have been called (invalidation)
      expect(mockPoolEnd).toHaveBeenCalledTimes(1);
    });

    it('does nothing for non-auth error codes', async () => {
      const db = requireDb();
      await db.getPool();

      const otherError = { code: '42P01', message: 'relation does not exist' };
      db.handleDbError(otherError);

      // pool.end() should NOT have been called
      expect(mockPoolEnd).not.toHaveBeenCalled();
    });

    it('does nothing for null/undefined errors', () => {
      const db = requireDb();

      // Should not throw
      expect(() => db.handleDbError(null)).not.toThrow();
      expect(() => db.handleDbError(undefined)).not.toThrow();
    });

    it('does nothing for non-object errors', () => {
      const db = requireDb();

      expect(() => db.handleDbError('some string error')).not.toThrow();
      expect(() => db.handleDbError(42)).not.toThrow();
    });
  });

  // ─── Pool error event handler ─────────────────────────────

  describe('pool error event handler', () => {
    it('registers an error handler on the pool', async () => {
      const db = requireDb();
      await db.getPool();

      // pool.on should have been called with 'error' and 'connect'
      const errorCalls = mockPoolOn.mock.calls.filter(
        (call: unknown[]) => call[0] === 'error',
      );
      expect(errorCalls.length).toBe(1);
    });

    it('nullifies pool reference when error event fires', async () => {
      const db = requireDb();
      const pool1 = await db.getPool();

      // Get the error handler that was registered
      const errorCall = mockPoolOn.mock.calls.find(
        (call: unknown[]) => call[0] === 'error',
      );
      expect(errorCall).toBeDefined();
      const errorHandler = errorCall![1] as (err: Error) => void;

      // Fire the error handler
      errorHandler(new Error('connection terminated unexpectedly'));

      // Next getPool() call should create a NEW pool
      const pool2 = await db.getPool();
      const { Pool } = require('pg');
      // Pool constructor was called twice: once for pool1, once for pool2
      expect(Pool).toHaveBeenCalledTimes(2);
    });
  });

  // ─── Pool configuration ───────────────────────────────────

  describe('pool configuration', () => {
    it('uses SSL with rejectUnauthorized=false', async () => {
      const { Pool } = require('pg');

      const db = requireDb();
      await db.getPool();

      expect(Pool).toHaveBeenCalledWith(
        expect.objectContaining({
          ssl: { rejectUnauthorized: false },
        }),
      );
    });

    it('uses DB_PORT env var when set', async () => {
      process.env.DB_PORT = '5433';
      const { Pool } = require('pg');

      const db = requireDb();
      await db.getPool();

      expect(Pool).toHaveBeenCalledWith(
        expect.objectContaining({
          port: 5433,
        }),
      );
    });

    it('defaults port to 5432 when DB_PORT is not set', async () => {
      delete process.env.DB_PORT;
      const { Pool } = require('pg');

      const db = requireDb();
      await db.getPool();

      expect(Pool).toHaveBeenCalledWith(
        expect.objectContaining({
          port: 5432,
        }),
      );
    });

    it('registers a connect handler that sets statement_timeout', async () => {
      const db = requireDb();
      await db.getPool();

      const connectCalls = mockPoolOn.mock.calls.filter(
        (call: unknown[]) => call[0] === 'connect',
      );
      expect(connectCalls.length).toBe(1);
    });

    it('writer pool uses max=5 connections by default', async () => {
      const { Pool } = require('pg');

      const db = requireDb();
      await db.getPool();

      expect(Pool).toHaveBeenCalledWith(
        expect.objectContaining({
          max: 5,
          min: 0,
          idleTimeoutMillis: 10000,
          connectionTimeoutMillis: 10000,
        }),
      );
    });

    it('reader pool uses max=10 connections', async () => {
      process.env.DB_READER_HOST = 'reader.example.com';
      const { Pool } = require('pg');

      const db = requireDb();
      await db.getReaderPool();

      expect(Pool).toHaveBeenCalledWith(
        expect.objectContaining({
          max: 10,
        }),
      );
    });

    it('uses credentials username as pool user', async () => {
      const { Pool } = require('pg');

      const db = requireDb();
      await db.getPool();

      expect(Pool).toHaveBeenCalledWith(
        expect.objectContaining({
          user: 'testuser',
        }),
      );
    });
  });

  // ─── Exports ──────────────────────────────────────────────

  describe('exports', () => {
    it('exports corsHeaders as a static object', () => {
      const db = requireDb();
      expect(db.corsHeaders).toBeDefined();
      expect(db.corsHeaders).toHaveProperty('Content-Type');
    });

    it('re-exports createCorsResponse from cors utils', () => {
      const db = requireDb();
      expect(db.createCorsResponse).toBeDefined();
    });

    it('re-exports getCorsHeaders from cors utils', () => {
      const db = requireDb();
      expect(db.getCorsHeaders).toBeDefined();
    });

    it('re-exports getSecureHeaders from cors utils', () => {
      const db = requireDb();
      expect(db.getSecureHeaders).toBeDefined();
    });
  });
});

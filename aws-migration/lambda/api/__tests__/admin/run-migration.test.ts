/**
 * Tests for admin/run-migration Lambda handler
 * Validates admin auth, action routing (migrate, seed, check, run-ddl, run-sql,
 * fix-constraint, list-migrations, execute-migration)
 */

import { makeEvent, createMockDb, createMockDbWithTransaction } from '../helpers';
import type { MockDb } from '../helpers';

// Mock SecretsManager (run-migration has its own inline getAdminKey)
jest.mock('@aws-sdk/client-secrets-manager', () => ({
  SecretsManagerClient: jest.fn().mockImplementation(() => ({
    send: jest.fn().mockResolvedValue({ SecretString: 'test-admin-key' }),
  })),
  GetSecretValueCommand: jest.fn(),
}));

// Mock logger's getRequestId (run-migration imports it separately)
jest.mock('../../utils/logger', () => ({
  createLogger: jest.fn(() => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    initFromEvent: jest.fn(),
    setRequestId: jest.fn(),
    setUserId: jest.fn(),
    logRequest: jest.fn(),
    logResponse: jest.fn(),
    logQuery: jest.fn(),
    logSecurity: jest.fn(),
    child: jest.fn().mockReturnThis(),
  })),
  getRequestId: jest.fn().mockReturnValue('test-request-id'),
}));

// Set required env var
process.env.ADMIN_KEY_SECRET_ARN = 'arn:aws:secretsmanager:us-east-1:123:secret:admin-key';

import { handler } from '../../admin/run-migration';

function makeAdminEvent(overrides: Record<string, unknown> = {}) {
  return makeEvent({
    headers: { 'x-admin-key': 'test-admin-key' },
    ...overrides,
  });
}

describe('admin/run-migration handler', () => {
  let mockDb: MockDb;

  beforeEach(() => {
    jest.clearAllMocks();
    mockDb = createMockDb();
    delete process.env.ENVIRONMENT;
  });

  // ── Auth Tests ──

  it('should return 401 when x-admin-key header is missing', async () => {
    const event = makeEvent({ headers: {} });
    const result = await handler(event);
    expect(result.statusCode).toBe(401);
    expect(JSON.parse(result.body).message).toBe('Unauthorized');
  });

  it('should return 401 when admin key is wrong', async () => {
    const event = makeEvent({
      headers: { 'x-admin-key': 'wrong-key-value' },
    });
    const result = await handler(event);
    expect(result.statusCode).toBe(401);
  });

  it('should accept X-Admin-Key header (case variant)', async () => {
    mockDb.query.mockResolvedValue({ rows: [] });

    const event = makeEvent({
      headers: { 'X-Admin-Key': 'test-admin-key' },
      body: JSON.stringify({ action: 'check' }),
    });
    const result = await handler(event);
    // Should not be 401 — the action proceeds
    expect(result.statusCode).not.toBe(401);
  });

  // ── Default migrate action ──

  it('should run schema migration by default when no action specified', async () => {
    mockDb.query.mockResolvedValue({ rows: [] });

    const event = makeAdminEvent({ body: JSON.stringify({}) });
    const result = await handler(event);
    expect(result.statusCode).toBe(200);

    const body = JSON.parse(result.body);
    expect(body.message).toBe('Migration completed');
    expect(body.tables).toBeDefined();
  });

  it('should return 403 for reset mode in production', async () => {
    process.env.ENVIRONMENT = 'production';

    const event = makeAdminEvent({
      body: JSON.stringify({ reset: true }),
    });
    const result = await handler(event);
    expect(result.statusCode).toBe(403);
    expect(JSON.parse(result.body).message).toContain('disabled in production');
  });

  it('should allow reset mode in non-production', async () => {
    process.env.ENVIRONMENT = 'staging';
    mockDb.query.mockResolvedValue({ rows: [] });

    const event = makeAdminEvent({
      body: JSON.stringify({ reset: true }),
    });
    const result = await handler(event);
    expect(result.statusCode).toBe(200);
  });

  // ── check action ──

  it('should return stats and profiles for check action', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ total: '50', demo: '20' }] })  // stats
      .mockResolvedValueOnce({                                          // samples
        rows: [{ id: 'p1', username: 'test', account_type: 'personal', is_bot: false }],
      });

    const event = makeAdminEvent({
      body: JSON.stringify({ action: 'check' }),
    });
    const result = await handler(event);
    expect(result.statusCode).toBe(200);

    const body = JSON.parse(result.body);
    expect(body.stats).toBeDefined();
    expect(body.profiles).toBeDefined();
  });

  // ── seed action ──

  it('should seed demo data for seed action', async () => {
    // seedDemoData calls multiple queries — mock all as success
    mockDb.query.mockResolvedValue({ rows: [{ count: '0', id: 'some-id' }], rowCount: 0 });

    const event = makeAdminEvent({
      body: JSON.stringify({ action: 'seed' }),
    });
    const result = await handler(event);
    expect(result.statusCode).toBe(200);

    const body = JSON.parse(result.body);
    expect(body.message).toBe('Demo data seeded successfully');
  });

  // ── run-ddl action ──

  it('should execute DDL SQL for run-ddl action', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] });

    const event = makeAdminEvent({
      body: JSON.stringify({
        action: 'run-ddl',
        sql: 'ALTER TABLE profiles ADD COLUMN IF NOT EXISTS test_col TEXT',
      }),
    });
    const result = await handler(event);
    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body).message).toBe('DDL migration executed successfully');
  });

  it('should return 400 when run-ddl has no sql', async () => {
    const event = makeAdminEvent({
      body: JSON.stringify({ action: 'run-ddl' }),
    });
    const result = await handler(event);
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toBe('SQL query required');
  });

  it('should block DROP TABLE in run-ddl action', async () => {
    const event = makeAdminEvent({
      body: JSON.stringify({
        action: 'run-ddl',
        sql: 'DROP TABLE profiles',
      }),
    });
    const result = await handler(event);
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toContain('Blocked');
  });

  it('should block TRUNCATE in run-ddl action', async () => {
    const event = makeAdminEvent({
      body: JSON.stringify({
        action: 'run-ddl',
        sql: 'TRUNCATE TABLE profiles',
      }),
    });
    const result = await handler(event);
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toContain('Blocked');
  });

  it('should return 500 when DDL execution fails', async () => {
    mockDb.query.mockRejectedValueOnce(new Error('Syntax error'));

    const event = makeAdminEvent({
      body: JSON.stringify({
        action: 'run-ddl',
        sql: 'ALTER TABLE profiles ADD COLUMN IF NOT EXISTS ok TEXT',
      }),
    });
    const result = await handler(event);
    expect(result.statusCode).toBe(500);
    expect(JSON.parse(result.body).message).toBe('DDL migration failed');
  });

  // ── run-sql action ──

  it('should execute SELECT query for run-sql action', async () => {
    // run-sql uses a transaction via connect()
    const mockClient = {
      query: jest.fn()
        .mockResolvedValueOnce({ rows: [] })                              // BEGIN
        .mockResolvedValueOnce({ rows: [] })                              // SET TRANSACTION READ ONLY
        .mockResolvedValueOnce({ rows: [{ count: 42 }], rowCount: 1 })  // actual SELECT
        .mockResolvedValueOnce({ rows: [] }),                             // COMMIT
      release: jest.fn(),
    };
    mockDb.query = jest.fn(); // reset
    (mockDb as unknown as { connect: jest.Mock }).connect = jest.fn().mockResolvedValue(mockClient);

    const { getPool } = require('../../../shared/db');
    (getPool as jest.Mock).mockResolvedValue({ ...mockDb, connect: jest.fn().mockResolvedValue(mockClient) });

    const event = makeAdminEvent({
      body: JSON.stringify({
        action: 'run-sql',
        sql: 'SELECT COUNT(*) FROM profiles',
      }),
    });
    const result = await handler(event);
    expect(result.statusCode).toBe(200);

    const body = JSON.parse(result.body);
    expect(body.message).toBe('SQL executed');
    expect(mockClient.release).toHaveBeenCalled();
  });

  it('should return 400 when run-sql has no sql', async () => {
    const event = makeAdminEvent({
      body: JSON.stringify({ action: 'run-sql' }),
    });
    const result = await handler(event);
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toBe('SQL query required');
  });

  it('should return 400 when run-sql has non-SELECT query', async () => {
    const event = makeAdminEvent({
      body: JSON.stringify({
        action: 'run-sql',
        sql: "UPDATE profiles SET bio = 'hacked'",
      }),
    });
    const result = await handler(event);
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toContain('Only SELECT queries');
  });

  it('should block dangerous keywords in run-sql SELECT', async () => {
    const event = makeAdminEvent({
      body: JSON.stringify({
        action: 'run-sql',
        sql: 'SELECT * FROM pg_catalog.pg_shadow',
      }),
    });
    const result = await handler(event);
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toContain('blocked keywords');
  });

  // ── fix-constraint action ──

  it('should update account_type constraint for fix-constraint action', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [] })                   // DROP CONSTRAINT
      .mockResolvedValueOnce({ rows: [], rowCount: 3 })      // UPDATE pro_local -> pro_business
      .mockResolvedValueOnce({ rows: [] });                  // ADD CONSTRAINT

    const event = makeAdminEvent({
      body: JSON.stringify({ action: 'fix-constraint' }),
    });
    const result = await handler(event);
    expect(result.statusCode).toBe(200);

    const body = JSON.parse(result.body);
    expect(body.message).toContain('Account type constraint updated');
    expect(body.updatedProfiles).toBe(3);
  });

  // ── list-migrations action ──

  it('should list applied migrations for list-migrations action', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [] })  // CREATE TABLE schema_migrations
      .mockResolvedValueOnce({
        rows: [{ version: 1, filename: '001.sql', applied_at: '2025-01-01', checksum: 'abc' }],
        rowCount: 1,
      });

    const event = makeAdminEvent({
      body: JSON.stringify({ action: 'list-migrations' }),
    });
    const result = await handler(event);
    expect(result.statusCode).toBe(200);

    const body = JSON.parse(result.body);
    expect(body.migrations).toHaveLength(1);
    expect(body.count).toBe(1);
  });

  // ── execute-migration action ──

  it('should return 403 for execute-migration in production', async () => {
    process.env.ENVIRONMENT = 'production';

    const event = makeAdminEvent({
      body: JSON.stringify({
        action: 'execute-migration',
        sql: 'ALTER TABLE profiles ADD COLUMN IF NOT EXISTS test_col TEXT',
      }),
    });
    const result = await handler(event);
    expect(result.statusCode).toBe(403);
    expect(JSON.parse(result.body).message).toContain('disabled in production');
  });

  it('should execute migration SQL for execute-migration action', async () => {
    process.env.ENVIRONMENT = 'staging';
    mockDb.query.mockResolvedValue({ rows: [] });

    const event = makeAdminEvent({
      body: JSON.stringify({
        action: 'execute-migration',
        sql: 'ALTER TABLE profiles ADD COLUMN IF NOT EXISTS new_col TEXT',
      }),
    });
    const result = await handler(event);
    expect(result.statusCode).toBe(200);

    const body = JSON.parse(result.body);
    expect(body.message).toBe('Migration executed');
    expect(body.ok).toBeGreaterThanOrEqual(1);
  });

  it('should return 400 for execute-migration with no sql', async () => {
    process.env.ENVIRONMENT = 'staging';

    const event = makeAdminEvent({
      body: JSON.stringify({ action: 'execute-migration' }),
    });
    const result = await handler(event);
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toBe('SQL query required');
  });

  it('should block DROP DATABASE in execute-migration', async () => {
    process.env.ENVIRONMENT = 'staging';

    const event = makeAdminEvent({
      body: JSON.stringify({
        action: 'execute-migration',
        sql: 'DROP DATABASE mydb',
      }),
    });
    const result = await handler(event);
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toContain('Blocked');
  });

  it('should block GRANT in execute-migration', async () => {
    process.env.ENVIRONMENT = 'staging';

    const event = makeAdminEvent({
      body: JSON.stringify({
        action: 'execute-migration',
        sql: 'GRANT ALL PRIVILEGES ON TABLE profiles TO public',
      }),
    });
    const result = await handler(event);
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toContain('Blocked');
  });

  it('should skip already-applied migration with same checksum', async () => {
    process.env.ENVIRONMENT = 'staging';

    // We need to compute the same checksum the handler does
    const sql = 'ALTER TABLE profiles ADD COLUMN IF NOT EXISTS test TEXT';
    const crypto = require('node:crypto');
    const sqlHash = crypto.createHash('sha256').update(sql).digest('hex');

    mockDb.query
      .mockResolvedValueOnce({ rows: [] })  // CREATE TABLE schema_migrations
      .mockResolvedValueOnce({              // SELECT existing migration
        rows: [{ version: 1, checksum: sqlHash, filename: 'test.sql' }],
        rowCount: 1,
      });

    const event = makeAdminEvent({
      body: JSON.stringify({
        action: 'execute-migration',
        sql,
        migration_version: 1,
        migration_filename: 'test.sql',
      }),
    });
    const result = await handler(event);
    expect(result.statusCode).toBe(200);

    const body = JSON.parse(result.body);
    expect(body.skipped).toBe(true);
  });

  it('should return 409 when migration checksum differs', async () => {
    process.env.ENVIRONMENT = 'staging';

    mockDb.query
      .mockResolvedValueOnce({ rows: [] })  // CREATE TABLE schema_migrations
      .mockResolvedValueOnce({              // SELECT existing migration
        rows: [{ version: 1, checksum: 'different-checksum-value', filename: 'old.sql' }],
        rowCount: 1,
      });

    const event = makeAdminEvent({
      body: JSON.stringify({
        action: 'execute-migration',
        sql: 'ALTER TABLE profiles ADD COLUMN IF NOT EXISTS changed TEXT',
        migration_version: 1,
        migration_filename: 'new.sql',
      }),
    });
    const result = await handler(event);
    expect(result.statusCode).toBe(409);

    const body = JSON.parse(result.body);
    expect(body.message).toContain('already applied with different SQL');
  });

  it('should record migration version after successful execution', async () => {
    process.env.ENVIRONMENT = 'staging';

    mockDb.query
      .mockResolvedValueOnce({ rows: [] })  // CREATE TABLE schema_migrations
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })  // SELECT existing (none)
      .mockResolvedValueOnce({ rows: [] })  // execute statement
      .mockResolvedValueOnce({ rows: [] }); // INSERT into schema_migrations

    const event = makeAdminEvent({
      body: JSON.stringify({
        action: 'execute-migration',
        sql: 'ALTER TABLE profiles ADD COLUMN IF NOT EXISTS v2_col TEXT',
        migration_version: 2,
        migration_filename: '002_add_col.sql',
      }),
    });
    const result = await handler(event);
    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body).ok).toBeGreaterThanOrEqual(1);
  });

  // ── General error handling ──

  it('should return 500 on unexpected top-level error', async () => {
    const { getPool } = require('../../../shared/db');
    (getPool as jest.Mock).mockRejectedValueOnce(new Error('Connection pool failed'));

    const event = makeAdminEvent({
      body: JSON.stringify({ action: 'check' }),
    });
    const result = await handler(event);
    expect(result.statusCode).toBe(500);
    expect(JSON.parse(result.body).message).toBe('Migration failed');
  });
});

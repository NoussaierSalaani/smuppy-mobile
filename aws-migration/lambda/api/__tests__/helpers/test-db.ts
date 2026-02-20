/**
 * Shared Mock DB Helpers
 *
 * Replaces the inline mockDb / mockClient setup duplicated across test files.
 */

import { getPool } from '../../../shared/db';

// ── Simple mock DB (no transaction) ──

export interface MockDb {
  query: jest.Mock;
}

/**
 * Create a mock DB instance and wire it to `getPool`.
 * Returns the mockDb so tests can configure `.query.mockImplementation(...)`.
 */
export function createMockDb(): MockDb {
  const mockDb: MockDb = {
    query: jest.fn().mockResolvedValue({ rows: [] }),
  };

  (getPool as jest.Mock).mockResolvedValue(mockDb);

  return mockDb;
}

// ── Transaction mock DB (with connect/release) ──

export interface MockClient {
  query: jest.Mock;
  release: jest.Mock;
}

export interface MockDbWithTransaction {
  query: jest.Mock;
  connect: jest.Mock;
}

/**
 * Create a mock DB with transaction support (connect → client).
 * Returns both `mockDb` and `mockClient` for fine-grained control.
 */
export function createMockDbWithTransaction(): {
  mockDb: MockDbWithTransaction;
  mockClient: MockClient;
} {
  const mockClient: MockClient = {
    query: jest.fn().mockResolvedValue({ rows: [] }),
    release: jest.fn(),
  };

  const mockDb: MockDbWithTransaction = {
    query: jest.fn().mockResolvedValue({ rows: [] }),
    connect: jest.fn().mockResolvedValue(mockClient),
  };

  (getPool as jest.Mock).mockResolvedValue(mockDb);

  return { mockDb, mockClient };
}

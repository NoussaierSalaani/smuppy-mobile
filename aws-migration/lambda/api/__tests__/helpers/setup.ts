/**
 * Global Test Setup — auto-mocks for the 4 most-duplicated modules.
 *
 * Loaded via `setupFilesAfterEnv` in jest config (package.json).
 * Tests that need the REAL module (e.g. cors.test.ts, logger.test.ts)
 * add `jest.unmock(...)` at the top — Jest last-write-wins.
 *
 * Path resolution: this file is at __tests__/helpers/setup.ts.
 * - ../../utils/X  → api/utils/X  (same depth as __tests__/category/)
 * - ../../../shared/db → lambda/shared/db
 */

// ── shared/db ──
jest.mock('../../../shared/db', () => ({
  getPool: jest.fn(),
  getReaderPool: jest.fn(),
}));

// ── utils/rate-limit ──
jest.mock('../../utils/rate-limit', () => ({
  checkRateLimit: jest.fn().mockResolvedValue({ allowed: true }),
  requireRateLimit: jest.fn().mockResolvedValue(null),
}));

// ── utils/logger ──
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
}));

// ── utils/cors ──
jest.mock('../../utils/cors', () => ({
  createHeaders: jest.fn(() => ({
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Credentials': 'true',
  })),
  createCacheableHeaders: jest.fn(() => ({
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  })),
  getSecureHeaders: jest.fn(() => ({ 'Content-Type': 'application/json' })),
}));

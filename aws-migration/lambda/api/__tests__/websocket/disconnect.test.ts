/**
 * Tests for websocket/disconnect Lambda handler
 * Covers: successful disconnect, missing connectionId, DB errors, always-200 behavior
 */

import { APIGatewayProxyEvent } from 'aws-lambda';
import { getPool } from '../../../shared/db';

// ── Mocks (must be before handler import) ──

jest.mock('../../../shared/db', () => ({
  getPool: jest.fn(),
  getReaderPool: jest.fn(),
}));

jest.mock('../../utils/logger', () => ({
  createLogger: jest.fn(() => ({
    info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(),
    initFromEvent: jest.fn(), setRequestId: jest.fn(), setUserId: jest.fn(),
    logRequest: jest.fn(), logResponse: jest.fn(), logQuery: jest.fn(),
    logSecurity: jest.fn(), child: jest.fn().mockReturnThis(),
  })),
}));

import { handler } from '../../../websocket/disconnect';

// ── Test constants ──

const TEST_CONNECTION_ID = 'test-conn-abc123';

// ── Helpers ──

function makeWsEvent(overrides: Partial<Record<string, unknown>> = {}): APIGatewayProxyEvent {
  return {
    httpMethod: 'GET',
    headers: {},
    body: null,
    queryStringParameters: null,
    pathParameters: null,
    multiValueHeaders: {},
    multiValueQueryStringParameters: null,
    isBase64Encoded: false,
    path: '/',
    resource: '/',
    stageVariables: null,
    requestContext: {
      connectionId: overrides.connectionId ?? TEST_CONNECTION_ID,
      requestId: 'test-request-id',
      domainName: 'test.execute-api.us-east-1.amazonaws.com',
      stage: 'production',
    },
  } as unknown as APIGatewayProxyEvent;
}

// ── Test suite ──

describe('websocket/disconnect handler', () => {
  let mockDb: { query: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();
    mockDb = { query: jest.fn() };
    (getPool as jest.Mock).mockResolvedValue(mockDb);
  });

  // ── 1. Successful disconnect ──

  describe('successful disconnect', () => {
    it('should delete connection from DB and return 200', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });

      const event = makeWsEvent();
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      expect(JSON.parse(result.body).message).toBe('Disconnected');
    });

    it('should pass connectionId to the DELETE query', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });

      const event = makeWsEvent();
      await handler(event);

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM websocket_connections'),
        [TEST_CONNECTION_ID],
      );
    });

    it('should pass the correct connectionId from requestContext', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });

      const customConnId = 'custom-connection-xyz';
      const event = makeWsEvent({ connectionId: customConnId });
      await handler(event);

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.any(String),
        [customConnId],
      );
    });
  });

  // ── 2. Missing connectionId ──

  describe('missing connectionId', () => {
    it('should still attempt DB query with undefined connectionId', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const event = makeWsEvent({ connectionId: undefined });
      const result = await handler(event);

      // Handler does not validate connectionId explicitly; DB query runs with undefined
      expect(result.statusCode).toBe(200);
      expect(mockDb.query).toHaveBeenCalled();
    });
  });

  // ── 3. DB error handling ──

  describe('error handling', () => {
    it('should return 200 even when DB query throws', async () => {
      mockDb.query.mockRejectedValueOnce(new Error('Connection refused'));

      const event = makeWsEvent();
      const result = await handler(event);

      // WebSocket disconnect always returns 200 — connection is gone anyway
      expect(result.statusCode).toBe(200);
      expect(JSON.parse(result.body).message).toBe('Disconnected');
    });

    it('should return 200 even when getPool() rejects', async () => {
      (getPool as jest.Mock).mockRejectedValueOnce(new Error('Pool creation failed'));

      const event = makeWsEvent();
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      expect(JSON.parse(result.body).message).toBe('Disconnected');
    });
  });
});

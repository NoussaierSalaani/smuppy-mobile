/**
 * Tests for websocket/default Lambda handler
 * Covers: unknown actions, ping/pong, missing body, stale connection cleanup
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

import { handler } from '../../../websocket/default';

// ── Test constants ──

const TEST_CONNECTION_ID = 'test-conn-default-123';

// ── Helpers ──

function makeWsEvent(overrides: Partial<Record<string, unknown>> = {}): APIGatewayProxyEvent {
  return {
    httpMethod: 'GET',
    headers: {},
    body: overrides.body as string ?? null,
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

describe('websocket/default handler', () => {
  let mockDb: { query: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();
    mockDb = { query: jest.fn() };
    (getPool as jest.Mock).mockResolvedValue(mockDb);
  });

  // ── 1. Unknown action ──

  describe('unknown action', () => {
    it('should return 400 for an unknown action', async () => {
      const event = makeWsEvent({ body: JSON.stringify({ action: 'unknownAction' }) });
      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.message).toContain('Unknown action');
      expect(body.message).toContain('Supported actions');
    });

    it('should return 400 when action is an empty string', async () => {
      const event = makeWsEvent({ body: JSON.stringify({ action: '' }) });
      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toContain('Unknown action');
    });
  });

  // ── 2. Missing body / action ──

  describe('missing body or action', () => {
    it('should return 400 when body is null', async () => {
      const event = makeWsEvent({ body: null });
      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toContain('Unknown action');
    });

    it('should return 400 when body is empty JSON object', async () => {
      const event = makeWsEvent({ body: JSON.stringify({}) });
      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toContain('Unknown action');
    });

    it('should handle malformed JSON body gracefully', async () => {
      const event = makeWsEvent({ body: 'not valid json{{{' });
      const result = await handler(event);

      // Body parsing fails silently, action becomes undefined -> unknown action path
      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toContain('Unknown action');
    });
  });

  // ── 3. Ping / pong ──

  describe('ping action', () => {
    it('should return 200 with pong action for ping', async () => {
      // Ensure cleanup triggers by resetting internal timer
      // (cleanup runs at most once per 10 min per Lambda instance)
      mockDb.query.mockResolvedValue({ rows: [], rowCount: 0 });

      const event = makeWsEvent({ body: JSON.stringify({ action: 'ping' }) });
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.action).toBe('pong');
      expect(body.timestamp).toBeDefined();
      expect(typeof body.timestamp).toBe('number');
    });
  });

  // ── 4. Stale connection cleanup ──

  describe('stale connection cleanup', () => {
    it('should not fail if stale cleanup DB query errors', async () => {
      // Cleanup runs opportunistically and catches its own errors
      mockDb.query.mockRejectedValue(new Error('DB timeout'));

      const event = makeWsEvent({ body: JSON.stringify({ action: 'ping' }) });
      const result = await handler(event);

      // Ping should still succeed even if cleanup fails
      expect(result.statusCode).toBe(200);
      expect(JSON.parse(result.body).action).toBe('pong');
    });
  });
});

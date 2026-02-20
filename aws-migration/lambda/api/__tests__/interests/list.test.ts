/**
 * Tests for interests/list Lambda handler
 * Uses createListHandler utility — validates DB query, caching, and error handling
 */

import { APIGatewayProxyEvent } from 'aws-lambda';
import { getPool } from '../../../shared/db';

// ── Mocks (must be before handler import — Jest hoists jest.mock calls) ──

jest.mock('../../../shared/db', () => ({
  getPool: jest.fn(),
  getReaderPool: jest.fn(),
}));

jest.mock('../../utils/rate-limit', () => ({
  checkRateLimit: jest.fn().mockResolvedValue({ allowed: true }),
  requireRateLimit: jest.fn().mockResolvedValue(null),
}));

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

jest.mock('../../utils/cors', () => ({
  createHeaders: jest.fn(() => ({
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Credentials': 'true',
  })),
  createCacheableHeaders: jest.fn(() => ({
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'public, max-age=86400',
  })),
  getSecureHeaders: jest.fn(() => ({ 'Content-Type': 'application/json' })),
}));

// ── Import handler AFTER all mocks are declared ──

import { handler } from '../../interests/list';

// ── Helpers ──

function makeEvent(overrides: Record<string, unknown> = {}): APIGatewayProxyEvent {
  return {
    httpMethod: 'GET',
    headers: {},
    body: null,
    pathParameters: null,
    queryStringParameters: null,
    requestContext: {
      requestId: 'test-request-id',
      identity: { sourceIp: '127.0.0.1' },
    },
    ...overrides,
  } as unknown as APIGatewayProxyEvent;
}

// ── Test suite ──

describe('interests/list handler', () => {
  let mockDb: { query: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();

    mockDb = {
      query: jest.fn().mockResolvedValue({ rows: [] }),
    };

    (getPool as jest.Mock).mockResolvedValue(mockDb);
  });

  it('should return 200 with interests data', async () => {
    mockDb.query.mockResolvedValue({
      rows: [
        { id: '1', name: 'Music', icon: 'music-icon', category: 'entertainment' },
        { id: '2', name: 'Sports', icon: 'sports-icon', category: 'fitness' },
      ],
    });

    const event = makeEvent();
    const result = await handler(event);

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(2);
    expect(body.data[0].name).toBe('Music');
  });

  it('should return empty array when no interests found', async () => {
    mockDb.query.mockResolvedValue({ rows: [] });

    const event = makeEvent();
    const result = await handler(event);

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.data).toHaveLength(0);
  });

  it('should include cache headers', async () => {
    mockDb.query.mockResolvedValue({ rows: [] });

    const event = makeEvent();
    const result = await handler(event);

    expect(result.headers).toBeDefined();
    expect(result.headers!['Cache-Control']).toBe('public, max-age=86400');
  });

  it('should query the interests table', async () => {
    mockDb.query.mockResolvedValue({ rows: [] });

    const event = makeEvent();
    await handler(event);

    expect(mockDb.query).toHaveBeenCalledTimes(1);
    const queryStr = mockDb.query.mock.calls[0][0];
    expect(queryStr).toContain('interests');
  });

  it('should map fields correctly', async () => {
    mockDb.query.mockResolvedValue({
      rows: [{ id: 'i1', name: 'Gaming', icon: 'game', category: 'tech' }],
    });

    const event = makeEvent();
    const result = await handler(event);
    const body = JSON.parse(result.body);

    expect(body.data[0]).toEqual({
      id: 'i1',
      name: 'Gaming',
      icon: 'game',
      category: 'tech',
    });
  });

  it('should return 500 when database query fails', async () => {
    mockDb.query.mockRejectedValue(new Error('Connection refused'));

    const event = makeEvent();
    const result = await handler(event);

    expect(result.statusCode).toBe(500);
    expect(JSON.parse(result.body).message).toBe('Internal server error');
  });

  it('should return 500 when getPool fails', async () => {
    (getPool as jest.Mock).mockRejectedValue(new Error('Pool error'));

    const event = makeEvent();
    const result = await handler(event);

    expect(result.statusCode).toBe(500);
  });
});

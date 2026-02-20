/**
 * Tests for business/discover Lambda handler
 * Public endpoint for searching businesses
 */

import { APIGatewayProxyEvent } from 'aws-lambda';
import { handler } from '../../business/discover';

// ── Mocks ────────────────────────────────────────────────────────────

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
    info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(),
    initFromEvent: jest.fn(), setRequestId: jest.fn(), setUserId: jest.fn(),
    logRequest: jest.fn(), logResponse: jest.fn(), logQuery: jest.fn(),
    logSecurity: jest.fn(), child: jest.fn().mockReturnThis(),
  })),
}));

jest.mock('../../utils/cors', () => ({
  createHeaders: jest.fn(() => ({
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Credentials': 'true',
  })),
  getSecureHeaders: jest.fn(() => ({ 'Content-Type': 'application/json' })),
}));

jest.mock('../../utils/auth', () => ({
  resolveProfileId: jest.fn().mockResolvedValue(null),
}));

jest.mock('../../utils/constants', () => ({
  RATE_WINDOW_1_MIN: 60,
  RATE_WINDOW_5_MIN: 300,
}));

// ── Helpers ──────────────────────────────────────────────────────────

function makeEvent(overrides: Partial<Record<string, unknown>> = {}): APIGatewayProxyEvent {
  return {
    httpMethod: overrides.httpMethod as string ?? 'GET',
    headers: {},
    body: null,
    queryStringParameters: overrides.queryStringParameters as Record<string, string> ?? null,
    pathParameters: null,
    multiValueHeaders: {},
    multiValueQueryStringParameters: null,
    isBase64Encoded: false,
    path: '/businesses/discover',
    resource: '/',
    stageVariables: null,
    requestContext: {
      requestId: 'test-request-id',
      authorizer: overrides.sub ? { claims: { sub: overrides.sub } } : undefined,
      identity: { sourceIp: '127.0.0.1' },
    },
  } as unknown as APIGatewayProxyEvent;
}

// ── Tests ────────────────────────────────────────────────────────────

describe('business/discover handler', () => {
  let mockPool: { query: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();
    mockPool = { query: jest.fn() };
    const { getPool } = require('../../../shared/db');
    (getPool as jest.Mock).mockResolvedValue(mockPool);
  });

  it('returns 204 for OPTIONS preflight', async () => {
    const event = makeEvent({ httpMethod: 'OPTIONS' });
    const result = await handler(event);
    expect(result.statusCode).toBe(204);
  });

  it('returns 429 when rate limited', async () => {
    const { requireRateLimit } = require('../../utils/rate-limit');
    (requireRateLimit as jest.Mock).mockResolvedValueOnce({
      statusCode: 429, headers: {}, body: JSON.stringify({ message: 'Rate limited' }),
    });
    const event = makeEvent();
    const result = await handler(event);
    expect(result.statusCode).toBe(429);
  });

  it('returns 200 with empty businesses list', async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [] });
    const event = makeEvent();
    const result = await handler(event);
    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.success).toBe(true);
    expect(body.businesses).toEqual([]);
    expect(body.hasMore).toBe(false);
  });

  it('returns businesses filtered by category', async () => {
    mockPool.query.mockResolvedValueOnce({
      rows: [{
        id: 'b1', full_name: 'Gym A', username: 'gyma', avatar_url: null,
        bio: 'A gym', business_category: 'fitness', business_address: '123 St',
        is_verified: true, latitude: 48.8, longitude: 2.3, created_at: '2025-01-01',
      }],
    });
    const event = makeEvent({
      queryStringParameters: { category: 'fitness' },
    });
    const result = await handler(event);
    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.businesses).toHaveLength(1);
    expect(body.businesses[0].category).toBe('fitness');
  });

  it('returns businesses with geo filter', async () => {
    mockPool.query.mockResolvedValueOnce({
      rows: [{
        id: 'b1', full_name: 'Nearby Gym', username: 'nearby', avatar_url: null,
        bio: null, business_category: 'fitness', business_address: null,
        is_verified: false, latitude: 48.85, longitude: 2.35, created_at: '2025-01-01',
        distance_km: 1.5,
      }],
    });
    const event = makeEvent({
      queryStringParameters: { lat: '48.85', lng: '2.35', radius: '5' },
    });
    const result = await handler(event);
    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.businesses[0].distanceKm).toBe(1.5);
  });

  it('returns 400 for invalid cursor format (keyset)', async () => {
    const event = makeEvent({
      queryStringParameters: { cursor: 'bad-cursor' },
    });
    const result = await handler(event);
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toBe('Invalid cursor format');
  });

  it('returns 500 on unexpected error', async () => {
    mockPool.query.mockRejectedValueOnce(new Error('DB error'));
    const event = makeEvent();
    const result = await handler(event);
    expect(result.statusCode).toBe(500);
  });
});

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
  DEFAULT_PAGE_SIZE: 20,
  MAX_PAGE_SIZE: 50,
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

  // ── Additional Coverage (Batch 7B-7D) ──

  it('returns hasMore true and nextCursor when more results than limit', async () => {
    // Provide limit+1 rows so hasMore = true
    const rows = Array.from({ length: 21 }, (_, i) => ({
      id: `id-${i}`, full_name: `Biz ${i}`, username: `biz${i}`, avatar_url: null,
      bio: null, business_category: 'fitness', business_address: null,
      is_verified: false, latitude: null, longitude: null, created_at: `2025-01-${String(20 - i).padStart(2, '0')}`,
    }));
    mockPool.query.mockResolvedValueOnce({ rows });
    const event = makeEvent({ queryStringParameters: { limit: '20' } });
    const result = await handler(event);
    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.hasMore).toBe(true);
    expect(body.nextCursor).toBeTruthy();
    expect(body.businesses).toHaveLength(20);
  });

  it('returns businesses with search filter', async () => {
    mockPool.query.mockResolvedValueOnce({
      rows: [{
        id: 'b-search', full_name: 'Yoga Studio', username: 'yogastudio', avatar_url: null,
        bio: 'Best yoga in town', business_category: 'wellness', business_address: '456 Ave',
        is_verified: true, latitude: null, longitude: null, created_at: '2025-02-01',
      }],
    });
    const event = makeEvent({ queryStringParameters: { search: 'yoga' } });
    const result = await handler(event);
    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.businesses).toHaveLength(1);
    expect(body.businesses[0].name).toBe('Yoga Studio');
  });

  it('returns nextCursor as numeric offset for geo-sorted results', async () => {
    const rows = Array.from({ length: 21 }, (_, i) => ({
      id: `id-${i}`, full_name: `Nearby ${i}`, username: `nearby${i}`, avatar_url: null,
      bio: null, business_category: 'fitness', business_address: null,
      is_verified: false, latitude: 48.85, longitude: 2.35, created_at: '2025-01-01',
      distance_km: i * 0.5,
    }));
    mockPool.query.mockResolvedValueOnce({ rows });
    const event = makeEvent({
      queryStringParameters: { lat: '48.85', lng: '2.35', radius: '50', limit: '20' },
    });
    const result = await handler(event);
    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.hasMore).toBe(true);
    // Geo sort cursor is offset-based: "0 + 20 = 20"
    expect(body.nextCursor).toBe('20');
  });

  it('accepts valid keyset cursor for non-geo pagination', async () => {
    const cursorDate = '2025-01-15T12:00:00.000Z';
    const cursorId = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
    mockPool.query.mockResolvedValueOnce({
      rows: [{
        id: 'b-after', full_name: 'After Cursor', username: 'aftercursor', avatar_url: null,
        bio: null, business_category: 'fitness', business_address: null,
        is_verified: false, latitude: null, longitude: null, created_at: '2025-01-10',
      }],
    });
    const event = makeEvent({
      queryStringParameters: { cursor: `${cursorDate}|${cursorId}` },
    });
    const result = await handler(event);
    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.businesses).toHaveLength(1);
  });

  it('caps radius to 100 km max', async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [] });
    const event = makeEvent({
      queryStringParameters: { lat: '48.85', lng: '2.35', radius: '999' },
    });
    const result = await handler(event);
    expect(result.statusCode).toBe(200);
    // Verify the radius param passed is 100 (capped), not 999
    const queryCall = mockPool.query.mock.calls[0];
    expect(queryCall[1]).toContain(100);
  });

  it('maps row fields to camelCase response shape', async () => {
    mockPool.query.mockResolvedValueOnce({
      rows: [{
        id: 'b-map', full_name: 'Mapped Biz', username: 'mapped', avatar_url: 'https://img.example.com/a.png',
        bio: 'Some bio', business_category: 'beauty', business_address: '789 Blvd',
        is_verified: true, latitude: 48.8, longitude: 2.3, created_at: '2025-01-01',
      }],
    });
    const event = makeEvent();
    const result = await handler(event);
    const body = JSON.parse(result.body);
    const biz = body.businesses[0];
    expect(biz.name).toBe('Mapped Biz');
    expect(biz.username).toBe('mapped');
    expect(biz.avatarUrl).toBe('https://img.example.com/a.png');
    expect(biz.category).toBe('beauty');
    expect(biz.address).toBe('789 Blvd');
    expect(biz.isVerified).toBe(true);
    expect(biz.latitude).toBe(48.8);
    expect(biz.longitude).toBe(2.3);
    // distanceKm should be undefined when no geo query
    expect(biz.distanceKm).toBeUndefined();
  });
});

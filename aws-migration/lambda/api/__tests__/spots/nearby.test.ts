/**
 * Tests for spots/nearby Lambda handler
 * Covers: validation, coordinates, rate limit, happy path, DB errors
 */

import { APIGatewayProxyEvent } from 'aws-lambda';
import { getPool } from '../../../shared/db';

jest.mock('../../../shared/db', () => ({ getPool: jest.fn(), getReaderPool: jest.fn() }));
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
  createHeaders: jest.fn(() => ({ 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' })),
  getSecureHeaders: jest.fn(() => ({ 'Content-Type': 'application/json' })),
}));
jest.mock('../../utils/constants', () => ({
  EARTH_RADIUS_METERS: 6_371_000,
  MAX_SEARCH_RADIUS_METERS: 50_000,
  DEFAULT_SEARCH_RADIUS_METERS: 5000,
  RATE_WINDOW_1_MIN: 60,
  DEFAULT_PAGE_SIZE: 20,
  MAX_PAGE_SIZE: 50,
}));

import { handler } from '../../spots/nearby';
import { requireRateLimit } from '../../utils/rate-limit';

function makeEvent(overrides: Partial<Record<string, unknown>> = {}): APIGatewayProxyEvent {
  return {
    httpMethod: 'GET',
    headers: {},
    body: null,
    queryStringParameters: overrides.queryStringParameters as Record<string, string> ?? { lat: '48.8566', lng: '2.3522' },
    pathParameters: null,
    multiValueHeaders: {},
    multiValueQueryStringParameters: null,
    isBase64Encoded: false,
    path: '/',
    resource: '/',
    stageVariables: null,
    requestContext: {
      requestId: 'test-request-id',
      authorizer: { claims: { sub: 'test-sub' } },
      identity: { sourceIp: '127.0.0.1' },
    },
  } as unknown as APIGatewayProxyEvent;
}

const mockQuery = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  (getPool as jest.Mock).mockResolvedValue({ query: mockQuery });
  (requireRateLimit as jest.Mock).mockResolvedValue(null);
});

describe('spots/nearby handler', () => {
  it('should return 400 when lat/lng missing', async () => {
    const event = makeEvent({ queryStringParameters: {} });
    const res = await handler(event);
    const result = res as { statusCode: number; body: string };
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toContain('lat and lng');
  });

  it('should return 400 for invalid latitude', async () => {
    const event = makeEvent({ queryStringParameters: { lat: '100', lng: '2' } });
    const res = await handler(event);
    const result = res as { statusCode: number };
    expect(result.statusCode).toBe(400);
  });

  it('should return 400 for invalid longitude', async () => {
    const event = makeEvent({ queryStringParameters: { lat: '48', lng: '200' } });
    const res = await handler(event);
    const result = res as { statusCode: number };
    expect(result.statusCode).toBe(400);
  });

  it('should return 429 when rate limited', async () => {
    (requireRateLimit as jest.Mock).mockResolvedValue({ statusCode: 429, headers: {}, body: '{}' });
    const event = makeEvent();
    const res = await handler(event);
    const result = res as { statusCode: number };
    expect(result.statusCode).toBe(429);
  });

  it('should return 200 with nearby spots', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{
        id: 'spot-1', name: 'Near Spot', description: null, category: null,
        sport_type: null, address: null, city: 'Paris', country: 'France',
        latitude: 48.8567, longitude: 2.3523, images: null, amenities: null,
        rating: 4, review_count: 5, is_verified: false, tags: null,
        qualities: null, subcategory: null, created_at: new Date().toISOString(),
        creator_id: 'c-1', creator_username: 'user1', creator_full_name: 'User',
        creator_avatar_url: null, distance: 150,
      }],
    });

    const event = makeEvent();
    const res = await handler(event);
    const result = res as { statusCode: number; body: string };
    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.success).toBe(true);
    expect(body.data.length).toBe(1);
    expect(body.data[0].distance).toBeDefined();
  });

  it('should return 500 on database error', async () => {
    mockQuery.mockRejectedValueOnce(new Error('DB error'));
    const event = makeEvent();
    const res = await handler(event);
    const result = res as { statusCode: number };
    expect(result.statusCode).toBe(500);
  });
});

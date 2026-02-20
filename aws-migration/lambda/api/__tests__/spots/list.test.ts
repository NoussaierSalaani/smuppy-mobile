/**
 * Tests for spots/list Lambda handler
 * Covers: pagination, filters, happy path, DB errors
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
jest.mock('../../utils/security', () => ({
  isValidUUID: jest.fn().mockReturnValue(true),
}));

import { handler } from '../../spots/list';

function makeEvent(overrides: Partial<Record<string, unknown>> = {}): APIGatewayProxyEvent {
  return {
    httpMethod: 'GET',
    headers: {},
    body: null,
    queryStringParameters: overrides.queryStringParameters as Record<string, string> ?? null,
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
});

describe('spots/list handler', () => {
  it('should return 200 with empty list', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const event = makeEvent();
    const res = await handler(event);
    const result = res as { statusCode: number; body: string };
    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.success).toBe(true);
    expect(body.data).toEqual([]);
    expect(body.hasMore).toBe(false);
  });

  it('should return paginated results with nextCursor', async () => {
    const rows = Array.from({ length: 21 }, (_, i) => ({
      id: `spot-${i}`,
      name: `Spot ${i}`,
      description: null,
      category: null,
      sport_type: null,
      address: null,
      city: null,
      country: null,
      latitude: 48 + i * 0.01,
      longitude: 2 + i * 0.01,
      images: null,
      amenities: null,
      rating: 0,
      review_count: 0,
      is_verified: false,
      tags: null,
      qualities: null,
      subcategory: null,
      created_at: new Date(2026, 0, 1, 0, 0, i).toISOString(),
      creator_id: 'creator-1',
      creator_username: 'creator1',
      creator_full_name: 'Creator One',
      creator_avatar_url: null,
    }));
    mockQuery.mockResolvedValueOnce({ rows });

    const event = makeEvent({ queryStringParameters: { limit: '20' } });
    const res = await handler(event);
    const result = res as { statusCode: number; body: string };
    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.hasMore).toBe(true);
    expect(body.data.length).toBe(20);
    expect(body.nextCursor).toBeDefined();
  });

  it('should filter by category', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const event = makeEvent({ queryStringParameters: { category: 'skatepark' } });
    await handler(event);
    expect(mockQuery).toHaveBeenCalled();
    const queryStr = mockQuery.mock.calls[0][0];
    expect(queryStr).toContain('category');
  });

  it('should return 500 on database error', async () => {
    mockQuery.mockRejectedValueOnce(new Error('DB error'));
    const event = makeEvent();
    const res = await handler(event);
    const result = res as { statusCode: number };
    expect(result.statusCode).toBe(500);
  });
});

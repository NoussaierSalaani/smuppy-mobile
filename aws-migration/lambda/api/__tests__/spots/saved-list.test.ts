/**
 * Tests for spots/saved-list Lambda handler
 * Covers: auth, profile resolution, pagination, happy path, DB errors
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
jest.mock('../../utils/auth', () => ({ resolveProfileId: jest.fn() }));

import { handler } from '../../spots/saved-list';
import { resolveProfileId } from '../../utils/auth';

const TEST_SUB = 'cognito-sub-test123';
const TEST_PROFILE_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

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
      authorizer: overrides.sub !== null
        ? { claims: { sub: overrides.sub ?? TEST_SUB } }
        : undefined,
      identity: { sourceIp: '127.0.0.1' },
    },
  } as unknown as APIGatewayProxyEvent;
}

const mockQuery = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  (getPool as jest.Mock).mockResolvedValue({ query: mockQuery });
  (resolveProfileId as jest.Mock).mockResolvedValue(TEST_PROFILE_ID);
});

describe('spots/saved-list handler', () => {
  it('should return 401 when unauthenticated', async () => {
    const event = makeEvent({ sub: null });
    const res = await handler(event);
    const result = res as { statusCode: number };
    expect(result.statusCode).toBe(401);
  });

  it('should return 404 when user profile not found', async () => {
    (resolveProfileId as jest.Mock).mockResolvedValue(null);
    const event = makeEvent();
    const res = await handler(event);
    const result = res as { statusCode: number; body: string };
    expect(result.statusCode).toBe(404);
    expect(JSON.parse(result.body).message).toBe('User profile not found');
  });

  it('should return 200 with empty saved list', async () => {
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

  it('should return 500 on database error', async () => {
    mockQuery.mockRejectedValueOnce(new Error('DB error'));
    const event = makeEvent();
    const res = await handler(event);
    const result = res as { statusCode: number };
    expect(result.statusCode).toBe(500);
  });

  // ── Additional coverage: pagination and data mapping ──

  describe('additional coverage - pagination', () => {
    it('should return hasMore=true and nextCursor when more results exist', async () => {
      // Return 21 rows to trigger hasMore (limit defaults to 20)
      const rows = Array.from({ length: 21 }, (_, i) => ({
        id: `spot-${i}`,
        creator_id: 'creator-1',
        name: `Spot ${i}`,
        description: null,
        category: 'park',
        sport_type: null,
        address: '123 Main St',
        city: 'Paris',
        country: 'France',
        latitude: 48.8566,
        longitude: 2.3522,
        images: null,
        amenities: null,
        rating: 4.5,
        review_count: 10,
        is_verified: false,
        tags: null,
        qualities: null,
        subcategory: null,
        created_at: '2026-02-01T10:00:00Z',
        saved_at: new Date(Date.now() - i * 60000).toISOString(),
        creator_username: 'testuser',
        creator_full_name: 'Test User',
        creator_avatar_url: null,
      }));
      mockQuery.mockResolvedValueOnce({ rows });

      const event = makeEvent();
      const res = await handler(event);
      const result = res as { statusCode: number; body: string };
      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.hasMore).toBe(true);
      expect(body.data).toHaveLength(20);
      expect(body.nextCursor).toBeTruthy();
    });

    it('should accept cursor parameter for pagination', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      const event = makeEvent({
        queryStringParameters: { cursor: String(Date.now()) },
      });
      const res = await handler(event);
      const result = res as { statusCode: number; body: string };
      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.data).toEqual([]);
    });

    it('should respect custom limit parameter', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      const event = makeEvent({
        queryStringParameters: { limit: '5' },
      });
      const res = await handler(event);
      const result = res as { statusCode: number; body: string };
      expect(result.statusCode).toBe(200);
    });
  });

  describe('additional coverage - data mapping', () => {
    it('should map spot fields with null arrays to empty arrays', async () => {
      const spotRow = {
        id: 'spot-1',
        creator_id: 'creator-1',
        name: 'Test Spot',
        description: 'A test spot',
        category: 'park',
        sport_type: 'running',
        address: '123 Main St',
        city: 'Paris',
        country: 'France',
        latitude: 48.8566,
        longitude: 2.3522,
        images: null,
        amenities: null,
        rating: 4.5,
        review_count: 10,
        is_verified: null,
        tags: null,
        qualities: null,
        subcategory: 'trail',
        created_at: '2026-02-01T10:00:00Z',
        saved_at: '2026-02-10T10:00:00Z',
        creator_username: 'creator1',
        creator_full_name: 'Creator One',
        creator_avatar_url: 'https://example.com/avatar.jpg',
      };
      mockQuery.mockResolvedValueOnce({ rows: [spotRow] });

      const event = makeEvent();
      const res = await handler(event);
      const result = res as { statusCode: number; body: string };
      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.data).toHaveLength(1);
      expect(body.data[0].images).toEqual([]);
      expect(body.data[0].amenities).toEqual([]);
      expect(body.data[0].tags).toEqual([]);
      expect(body.data[0].qualities).toEqual([]);
      expect(body.data[0].isVerified).toBe(false);
    });

    it('should map spot fields with populated arrays correctly', async () => {
      const spotRow = {
        id: 'spot-2',
        creator_id: 'creator-2',
        name: 'Full Spot',
        description: 'Full desc',
        category: 'gym',
        sport_type: 'fitness',
        address: '456 Oak Ave',
        city: 'Lyon',
        country: 'France',
        latitude: 45.7640,
        longitude: 4.8357,
        images: ['img1.jpg', 'img2.jpg'],
        amenities: ['parking', 'wifi'],
        rating: 5.0,
        review_count: 25,
        is_verified: true,
        tags: ['outdoor', 'free'],
        qualities: ['scenic', 'quiet'],
        subcategory: 'crossfit',
        created_at: '2026-01-15T10:00:00Z',
        saved_at: '2026-02-20T10:00:00Z',
        creator_username: 'creator2',
        creator_full_name: 'Creator Two',
        creator_avatar_url: null,
      };
      mockQuery.mockResolvedValueOnce({ rows: [spotRow] });

      const event = makeEvent();
      const res = await handler(event);
      const result = res as { statusCode: number; body: string };
      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.data[0].images).toEqual(['img1.jpg', 'img2.jpg']);
      expect(body.data[0].amenities).toEqual(['parking', 'wifi']);
      expect(body.data[0].isVerified).toBe(true);
      expect(body.data[0].creator.id).toBe('creator-2');
      expect(body.data[0].creator.username).toBe('creator2');
      expect(body.data[0].savedAt).toBe('2026-02-20T10:00:00Z');
    });
  });
});

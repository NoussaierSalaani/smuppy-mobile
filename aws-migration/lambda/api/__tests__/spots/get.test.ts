/**
 * Tests for spots/get Lambda handler
 * Covers: validation, not found, happy path, DB errors
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

import { handler } from '../../spots/get';
import { isValidUUID } from '../../utils/security';

const TEST_SUB = 'cognito-sub-test123';
const SPOT_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

function makeEvent(overrides: Partial<Record<string, unknown>> = {}): APIGatewayProxyEvent {
  return {
    httpMethod: 'GET',
    headers: {},
    body: null,
    queryStringParameters: null,
    pathParameters: overrides.pathParameters as Record<string, string> ?? { id: SPOT_ID },
    multiValueHeaders: {},
    multiValueQueryStringParameters: null,
    isBase64Encoded: false,
    path: '/',
    resource: '/',
    stageVariables: null,
    requestContext: {
      requestId: 'test-request-id',
      authorizer: { claims: { sub: TEST_SUB } },
      identity: { sourceIp: '127.0.0.1' },
    },
  } as unknown as APIGatewayProxyEvent;
}

const mockQuery = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  (getPool as jest.Mock).mockResolvedValue({ query: mockQuery });
  (isValidUUID as jest.Mock).mockReturnValue(true);
});

describe('spots/get handler', () => {
  it('should return 400 for invalid spot ID', async () => {
    (isValidUUID as jest.Mock).mockReturnValue(false);
    const event = makeEvent({ pathParameters: { id: 'bad-id' } });
    const res = await handler(event);
    const result = res as { statusCode: number; body: string };
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toBe('Invalid spot ID format');
  });

  it('should return 400 when spot ID is missing', async () => {
    (isValidUUID as jest.Mock).mockReturnValue(false);
    const event = makeEvent({ pathParameters: {} });
    const res = await handler(event);
    const result = res as { statusCode: number };
    expect(result.statusCode).toBe(400);
  });

  it('should return 404 when spot not found', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const event = makeEvent();
    const res = await handler(event);
    const result = res as { statusCode: number; body: string };
    expect(result.statusCode).toBe(404);
    expect(JSON.parse(result.body).message).toBe('Spot not found');
  });

  it('should return 200 with spot data', async () => {
    const spotRow = {
      id: SPOT_ID,
      creator_id: 'creator-1',
      name: 'Test Spot',
      description: 'A test spot',
      category: 'skatepark',
      sport_type: 'skateboarding',
      address: '123 Main St',
      city: 'Paris',
      country: 'France',
      latitude: 48.8566,
      longitude: 2.3522,
      images: ['img1.jpg'],
      amenities: ['parking'],
      rating: 4.5,
      review_count: 10,
      is_verified: true,
      opening_hours: null,
      contact_info: null,
      tags: ['fun'],
      qualities: ['smooth'],
      subcategory: 'indoor',
      initial_rating: 4,
      initial_review: 'Great!',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      creator_username: 'creator1',
      creator_full_name: 'Creator One',
      creator_avatar_url: 'avatar.jpg',
      creator_is_verified: true,
      creator_account_type: 'pro_creator',
      creator_business_name: null,
    };
    mockQuery.mockResolvedValueOnce({ rows: [spotRow] });

    const event = makeEvent();
    const res = await handler(event);
    const result = res as { statusCode: number; body: string };
    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.success).toBe(true);
    expect(body.spot.name).toBe('Test Spot');
    expect(body.spot.creator.username).toBe('creator1');
  });

  it('should return 500 on database error', async () => {
    mockQuery.mockRejectedValueOnce(new Error('DB error'));
    const event = makeEvent();
    const res = await handler(event);
    const result = res as { statusCode: number };
    expect(result.statusCode).toBe(500);
  });
});

/**
 * Tests for spots/update Lambda handler
 * Covers: auth, validation, ownership, moderation, happy path, DB errors
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
jest.mock('../../utils/security', () => ({
  isValidUUID: jest.fn().mockReturnValue(true),
  sanitizeText: jest.fn((t: string) => t),
}));
jest.mock('../../utils/account-status', () => ({
  requireActiveAccount: jest.fn().mockResolvedValue({ profileId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', moderationStatus: 'active' }),
  isAccountError: jest.fn().mockReturnValue(false),
}));
jest.mock('../../utils/constants', () => ({ RATE_WINDOW_1_MIN: 60, RATE_WINDOW_5_MIN: 300 }));
jest.mock('../../../shared/moderation/textFilter', () => ({
  filterText: jest.fn().mockResolvedValue({ clean: true }),
}));
jest.mock('../../../shared/moderation/textModeration', () => ({
  analyzeTextToxicity: jest.fn().mockResolvedValue({ action: 'pass' }),
}));

import { handler } from '../../spots/update';
import { resolveProfileId } from '../../utils/auth';
import { isValidUUID } from '../../utils/security';
import { requireRateLimit } from '../../utils/rate-limit';

const TEST_SUB = 'cognito-sub-test123';
const TEST_PROFILE_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const SPOT_ID = 'b1b2c3d4-e5f6-7890-abcd-ef1234567890';

function makeEvent(overrides: Partial<Record<string, unknown>> = {}): APIGatewayProxyEvent {
  return {
    httpMethod: 'PUT',
    headers: {},
    body: overrides.body as string ?? JSON.stringify({ name: 'Updated' }),
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
  (isValidUUID as jest.Mock).mockReturnValue(true);
  (requireRateLimit as jest.Mock).mockResolvedValue(null);
});

describe('spots/update handler', () => {
  it('should return 401 when unauthenticated', async () => {
    const event = makeEvent({ sub: null });
    const res = await handler(event);
    const result = res as { statusCode: number };
    expect(result.statusCode).toBe(401);
  });

  it('should return 400 for invalid spot ID', async () => {
    (isValidUUID as jest.Mock).mockReturnValue(false);
    const event = makeEvent({ pathParameters: { id: 'bad' } });
    const res = await handler(event);
    const result = res as { statusCode: number };
    expect(result.statusCode).toBe(400);
  });

  it('should return 400 when no valid fields to update', async () => {
    const event = makeEvent({ body: JSON.stringify({ unknownField: 'value' }) });
    const res = await handler(event);
    const result = res as { statusCode: number; body: string };
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toBe('No valid fields to update');
  });

  it('should return 404 when profile not found', async () => {
    (resolveProfileId as jest.Mock).mockResolvedValue(null);
    const event = makeEvent({ body: JSON.stringify({ name: 'Updated' }) });
    const res = await handler(event);
    const result = res as { statusCode: number };
    expect(result.statusCode).toBe(404);
  });

  it('should return 404 when spot not found', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] }) // UPDATE returns 0 rows
      .mockResolvedValueOnce({ rows: [] }); // EXISTS check
    const event = makeEvent({ body: JSON.stringify({ name: 'Updated' }) });
    const res = await handler(event);
    const result = res as { statusCode: number; body: string };
    expect(result.statusCode).toBe(404);
    expect(JSON.parse(result.body).message).toBe('Spot not found');
  });

  it('should return 403 when not spot owner', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] }) // UPDATE returns 0 rows
      .mockResolvedValueOnce({ rows: [{ id: SPOT_ID }] }); // EXISTS check finds spot
    const event = makeEvent({ body: JSON.stringify({ name: 'Updated' }) });
    const res = await handler(event);
    const result = res as { statusCode: number; body: string };
    expect(result.statusCode).toBe(403);
    expect(JSON.parse(result.body).message).toBe('Not authorized to update this spot');
  });

  it('should return 429 when rate limited', async () => {
    (requireRateLimit as jest.Mock).mockResolvedValue({ statusCode: 429, headers: {}, body: '{}' });
    const event = makeEvent();
    const res = await handler(event);
    const result = res as { statusCode: number };
    expect(result.statusCode).toBe(429);
  });

  it('should return 200 on successful update', async () => {
    const spotRow = {
      id: SPOT_ID,
      creator_id: TEST_PROFILE_ID,
      name: 'Updated',
      description: null,
      category: null,
      sport_type: null,
      address: null,
      city: null,
      country: null,
      latitude: 48.8566,
      longitude: 2.3522,
      images: null,
      amenities: null,
      rating: 0,
      review_count: 0,
      is_verified: false,
      opening_hours: null,
      contact_info: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    mockQuery.mockResolvedValueOnce({ rows: [spotRow] });
    const event = makeEvent({ body: JSON.stringify({ name: 'Updated' }) });
    const res = await handler(event);
    const result = res as { statusCode: number; body: string };
    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body).success).toBe(true);
  });

  it('should return 500 on database error', async () => {
    mockQuery.mockRejectedValueOnce(new Error('DB error'));
    const event = makeEvent({ body: JSON.stringify({ name: 'Updated' }) });
    const res = await handler(event);
    const result = res as { statusCode: number };
    expect(result.statusCode).toBe(500);
  });
});

/**
 * Tests for spots/reviews-create Lambda handler
 * Covers: auth, validation, self-review, moderation, happy path, DB errors
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
jest.mock('../../utils/constants', () => ({ RATE_WINDOW_1_MIN: 60,
  DEFAULT_PAGE_SIZE: 20,
  MAX_PAGE_SIZE: 50,
}));
jest.mock('../../../shared/moderation/textFilter', () => ({
  filterText: jest.fn().mockResolvedValue({ clean: true }),
}));
jest.mock('../../../shared/moderation/textModeration', () => ({
  analyzeTextToxicity: jest.fn().mockResolvedValue({ action: 'pass' }),
}));

import { handler } from '../../spots/reviews-create';
import { resolveProfileId } from '../../utils/auth';
import { isValidUUID } from '../../utils/security';

const TEST_SUB = 'cognito-sub-test123';
const TEST_PROFILE_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const SPOT_ID = 'b1b2c3d4-e5f6-7890-abcd-ef1234567890';
const OTHER_CREATOR_ID = 'c1c2c3c4-e5f6-7890-abcd-ef1234567890';

function makeEvent(overrides: Partial<Record<string, unknown>> = {}): APIGatewayProxyEvent {
  return {
    httpMethod: 'POST',
    headers: {},
    body: overrides.body as string ?? JSON.stringify({ rating: 4, comment: 'Great spot' }),
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
const mockRelease = jest.fn();
const mockConnect = jest.fn().mockResolvedValue({ query: mockQuery, release: mockRelease });

beforeEach(() => {
  jest.clearAllMocks();
  (getPool as jest.Mock).mockResolvedValue({ query: mockQuery, connect: mockConnect });
  (resolveProfileId as jest.Mock).mockResolvedValue(TEST_PROFILE_ID);
  (isValidUUID as jest.Mock).mockReturnValue(true);
});

describe('spots/reviews-create handler', () => {
  it('should return 401 when unauthenticated', async () => {
    const event = makeEvent({ sub: null });
    const res = await handler(event);
    const result = res as { statusCode: number };
    expect(result.statusCode).toBe(401);
  });

  it('should return 400 for missing rating', async () => {
    const event = makeEvent({ body: JSON.stringify({}) });
    const res = await handler(event);
    const result = res as { statusCode: number; body: string };
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toContain('Rating is required');
  });

  it('should return 400 for invalid rating value', async () => {
    const event = makeEvent({ body: JSON.stringify({ rating: 6 }) });
    const res = await handler(event);
    const result = res as { statusCode: number };
    expect(result.statusCode).toBe(400);
  });

  it('should return 400 for invalid spot ID', async () => {
    (isValidUUID as jest.Mock).mockReturnValue(false);
    const event = makeEvent({ pathParameters: { id: 'bad' } });
    const res = await handler(event);
    const result = res as { statusCode: number };
    expect(result.statusCode).toBe(400);
  });

  it('should return 404 when profile not found', async () => {
    (resolveProfileId as jest.Mock).mockResolvedValue(null);
    const event = makeEvent();
    const res = await handler(event);
    const result = res as { statusCode: number };
    expect(result.statusCode).toBe(404);
  });

  it('should return 404 when spot not found', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] }); // spot exists check
    const event = makeEvent();
    const res = await handler(event);
    const result = res as { statusCode: number; body: string };
    expect(result.statusCode).toBe(404);
    expect(JSON.parse(result.body).message).toBe('Spot not found');
  });

  it('should return 403 when reviewing own spot', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: SPOT_ID, creator_id: TEST_PROFILE_ID }] });
    const event = makeEvent();
    const res = await handler(event);
    const result = res as { statusCode: number; body: string };
    expect(result.statusCode).toBe(403);
    expect(JSON.parse(result.body).message).toBe('You cannot review your own spot');
  });

  it('should return 201 on successful review creation', async () => {
    // Spot exists, different creator
    mockQuery.mockResolvedValueOnce({ rows: [{ id: SPOT_ID, creator_id: OTHER_CREATOR_ID }] });
    // Transaction BEGIN
    mockQuery.mockResolvedValueOnce({});
    // UPSERT review
    mockQuery.mockResolvedValueOnce({
      rows: [{
        id: 'review-1', spot_id: SPOT_ID, user_id: TEST_PROFILE_ID,
        rating: 4, comment: 'Great spot', images: null,
        created_at: new Date().toISOString(), updated_at: null,
      }],
    });
    // Recalculate rating
    mockQuery.mockResolvedValueOnce({});
    // COMMIT
    mockQuery.mockResolvedValueOnce({});

    const event = makeEvent();
    const res = await handler(event);
    const result = res as { statusCode: number; body: string };
    expect(result.statusCode).toBe(201);
    expect(JSON.parse(result.body).success).toBe(true);
  });

  it('should return 500 on database error', async () => {
    mockQuery.mockRejectedValueOnce(new Error('DB error'));
    const event = makeEvent();
    const res = await handler(event);
    const result = res as { statusCode: number };
    expect(result.statusCode).toBe(500);
  });
});

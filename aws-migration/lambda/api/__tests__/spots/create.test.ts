/**
 * Tests for spots/create Lambda handler
 * Covers: auth, validation, rate limit, moderation, happy path, DB errors
 */

import { APIGatewayProxyEvent } from 'aws-lambda';
import { getPool } from '../../../shared/db';

// ── Mocks ──

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
  createCacheableHeaders: jest.fn(() => ({
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  })),
  getSecureHeaders: jest.fn(() => ({ 'Content-Type': 'application/json' })),
}));

jest.mock('../../utils/auth', () => ({
  resolveProfileId: jest.fn(),
}));

jest.mock('../../utils/security', () => ({
  isValidUUID: jest.fn().mockReturnValue(true),
  sanitizeText: jest.fn((text: string) => text),
}));

jest.mock('../../utils/account-status', () => ({
  requireActiveAccount: jest.fn().mockResolvedValue({
    profileId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    username: 'testuser',
    moderationStatus: 'active',
  }),
  isAccountError: jest.fn().mockReturnValue(false),
}));

jest.mock('../../utils/constants', () => ({
  RATE_WINDOW_1_MIN: 60,
  RATE_WINDOW_5_MIN: 300,
  DEFAULT_PAGE_SIZE: 20,
  MAX_PAGE_SIZE: 50,
}));

jest.mock('../../../shared/moderation/textFilter', () => ({
  filterText: jest.fn().mockResolvedValue({ clean: true, filtered: '', violations: [] }),
}));

jest.mock('../../../shared/moderation/textModeration', () => ({
  analyzeTextToxicity: jest.fn().mockResolvedValue({
    action: 'pass',
    maxScore: 0,
    topCategory: null,
    categories: [],
  }),
}));

// ── Import handler after mocks ──

import { handler } from '../../spots/create';
import { requireRateLimit } from '../../utils/rate-limit';
import { resolveProfileId } from '../../utils/auth';
import { requireActiveAccount, isAccountError } from '../../utils/account-status';
import { filterText } from '../../../shared/moderation/textFilter';
import { analyzeTextToxicity } from '../../../shared/moderation/textModeration';

// ── Helpers ──

const TEST_SUB = 'cognito-sub-test123';
const TEST_PROFILE_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

function makeEvent(overrides: Partial<Record<string, unknown>> = {}): APIGatewayProxyEvent {
  return {
    httpMethod: overrides.httpMethod as string ?? 'POST',
    headers: {},
    body: overrides.body as string ?? null,
    queryStringParameters: overrides.queryStringParameters as Record<string, string> ?? null,
    pathParameters: overrides.pathParameters as Record<string, string> ?? null,
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
const mockPool = { query: mockQuery };

beforeEach(() => {
  jest.clearAllMocks();
  (getPool as jest.Mock).mockResolvedValue(mockPool);
  (resolveProfileId as jest.Mock).mockResolvedValue(TEST_PROFILE_ID);
  (requireRateLimit as jest.Mock).mockResolvedValue(null);
  (requireActiveAccount as jest.Mock).mockResolvedValue({ profileId: TEST_PROFILE_ID, moderationStatus: 'active' });
  (isAccountError as unknown as jest.Mock).mockReturnValue(false);
  (filterText as jest.Mock).mockResolvedValue({ clean: true });
  (analyzeTextToxicity as jest.Mock).mockResolvedValue({ action: 'pass' });
});

// ── Tests ──

describe('spots/create handler', () => {
  it('should return 401 when unauthenticated', async () => {
    const event = makeEvent({ sub: null });
    const res = await handler(event);
    expect(res).toBeDefined();
    const result = res as { statusCode: number };
    expect(result.statusCode).toBe(401);
  });

  it('should return 400 when name is missing', async () => {
    const event = makeEvent({ body: JSON.stringify({}) });
    const res = await handler(event);
    const result = res as { statusCode: number; body: string };
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toBe('Name is required');
  });

  it('should return 400 for invalid latitude', async () => {
    const event = makeEvent({
      body: JSON.stringify({ name: 'Test Spot', latitude: 100 }),
    });
    const res = await handler(event);
    const result = res as { statusCode: number; body: string };
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toContain('Invalid latitude');
  });

  it('should return 400 for invalid longitude', async () => {
    const event = makeEvent({
      body: JSON.stringify({ name: 'Test Spot', longitude: 200 }),
    });
    const res = await handler(event);
    const result = res as { statusCode: number; body: string };
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toContain('Invalid longitude');
  });

  it('should return 400 when images exceed 20', async () => {
    const event = makeEvent({
      body: JSON.stringify({ name: 'Test Spot', images: Array(21).fill('img.jpg') }),
    });
    const res = await handler(event);
    const result = res as { statusCode: number; body: string };
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toContain('Images must be an array');
  });

  it('should return 400 for invalid initial_rating', async () => {
    const event = makeEvent({
      body: JSON.stringify({ name: 'Test Spot', initial_rating: 6 }),
    });
    const res = await handler(event);
    const result = res as { statusCode: number; body: string };
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toContain('Initial rating');
  });

  it('should return 429 when rate limited', async () => {
    const rateLimitResponse = { statusCode: 429, headers: {}, body: JSON.stringify({ message: 'Rate limited' }) };
    (requireRateLimit as jest.Mock).mockResolvedValue(rateLimitResponse);
    const event = makeEvent({ body: JSON.stringify({ name: 'Test' }) });
    const res = await handler(event);
    const result = res as { statusCode: number };
    expect(result.statusCode).toBe(429);
  });

  it('should return 404 when user profile not found', async () => {
    (resolveProfileId as jest.Mock).mockResolvedValue(null);
    const event = makeEvent({ body: JSON.stringify({ name: 'Test Spot' }) });
    const res = await handler(event);
    const result = res as { statusCode: number; body: string };
    expect(result.statusCode).toBe(404);
    expect(JSON.parse(result.body).message).toBe('User profile not found');
  });

  it('should return 400 when text moderation blocks content', async () => {
    (filterText as jest.Mock).mockResolvedValue({ clean: false, severity: 'critical' });
    const event = makeEvent({ body: JSON.stringify({ name: 'Bad Content' }) });
    const res = await handler(event);
    const result = res as { statusCode: number; body: string };
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toBe('Content policy violation');
  });

  it('should return 400 when toxicity analysis blocks content', async () => {
    (analyzeTextToxicity as jest.Mock).mockResolvedValue({ action: 'block', topCategory: 'hate' });
    const event = makeEvent({ body: JSON.stringify({ name: 'Toxic Content' }) });
    const res = await handler(event);
    const result = res as { statusCode: number; body: string };
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toBe('Content policy violation');
  });

  it('should return 201 on successful creation', async () => {
    const spotRow = {
      id: 'spot-id-1',
      creator_id: TEST_PROFILE_ID,
      name: 'Test Spot',
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
      tags: null,
      qualities: null,
      subcategory: null,
      initial_rating: null,
      initial_review: null,
      created_at: new Date().toISOString(),
    };
    mockQuery.mockResolvedValueOnce({ rows: [spotRow] });

    const event = makeEvent({
      body: JSON.stringify({ name: 'Test Spot', latitude: 48.8566, longitude: 2.3522 }),
    });
    const res = await handler(event);
    const result = res as { statusCode: number; body: string };
    expect(result.statusCode).toBe(201);
    const body = JSON.parse(result.body);
    expect(body.success).toBe(true);
    expect(body.spot.name).toBe('Test Spot');
  });

  it('should return 500 on database error', async () => {
    mockQuery.mockRejectedValueOnce(new Error('DB error'));
    const event = makeEvent({
      body: JSON.stringify({ name: 'Test Spot' }),
    });
    const res = await handler(event);
    const result = res as { statusCode: number; body: string };
    expect(result.statusCode).toBe(500);
    expect(JSON.parse(result.body).message).toBe('Internal server error');
  });
});

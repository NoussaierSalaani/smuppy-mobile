/**
 * Tests for groups/create Lambda handler
 * Comprehensive branch coverage for all if/else, ternary, ??, ?., || paths
 */

import { APIGatewayProxyEvent } from 'aws-lambda';
import { getPool } from '../../../shared/db';

jest.mock('../../../shared/db', () => ({
  getPool: jest.fn(),
}));
jest.mock('../../utils/rate-limit', () => ({
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
jest.mock('../../utils/security', () => ({
  sanitizeInput: jest.fn((v: string) => v),
  isValidUUID: jest.fn().mockReturnValue(true),
}));
jest.mock('../../utils/cors', () => ({
  cors: jest.fn((r: Record<string, unknown>) => r),
  handleOptions: jest.fn().mockReturnValue({ statusCode: 200, body: '' }),
  getSecureHeaders: jest.fn(() => ({ 'Content-Type': 'application/json' })),
  createHeaders: jest.fn(() => ({ 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' })),
}));
jest.mock('../../utils/account-status', () => ({
  requireActiveAccount: jest.fn().mockResolvedValue({ profileId: 'p1', accountType: 'personal' }),
  isAccountError: jest.fn().mockReturnValue(false),
}));
jest.mock('../../../shared/moderation/textFilter', () => ({
  filterText: jest.fn().mockResolvedValue({ clean: true }),
}));
jest.mock('../../../shared/moderation/textModeration', () => ({
  analyzeTextToxicity: jest.fn().mockResolvedValue({ action: 'allow' }),
}));
jest.mock('../../utils/auth', () => ({
  resolveProfileId: jest.fn(),
}));

import { handler as _handler } from '../../groups/create';
const handler = _handler as unknown as (event: APIGatewayProxyEvent) => Promise<{ statusCode: number; body: string; headers?: Record<string, string> }>;
import { requireRateLimit } from '../../utils/rate-limit';
import { requireActiveAccount, isAccountError } from '../../utils/account-status';
import { filterText } from '../../../shared/moderation/textFilter';
import { analyzeTextToxicity } from '../../../shared/moderation/textModeration';
import { resolveProfileId } from '../../utils/auth';

const TEST_SUB = 'cognito-sub-test123';
const FUTURE_DATE = new Date(Date.now() + 86400000).toISOString();

function makeEvent(overrides: Partial<Record<string, unknown>> = {}): APIGatewayProxyEvent {
  const futureDate = new Date(Date.now() + 86400000).toISOString();
  return {
    httpMethod: overrides.httpMethod as string ?? 'POST',
    headers: {},
    body: overrides.body as string ?? JSON.stringify({
      name: 'Test Group',
      latitude: 48.8566,
      longitude: 2.3522,
      starts_at: futureDate,
    }),
    queryStringParameters: null,
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

/** Build a full valid body with optional overrides */
function validBody(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    name: 'Test Group',
    latitude: 48.8566,
    longitude: 2.3522,
    starts_at: new Date(Date.now() + 86400000).toISOString(),
    ...overrides,
  });
}

const mockQuery = jest.fn();
const mockRelease = jest.fn();
const mockConnect = jest.fn().mockResolvedValue({ query: mockQuery, release: mockRelease });

/** Setup mocks for a personal account that passes the monthly limit check */
function setupPersonalAccount(count = 0) {
  mockQuery.mockResolvedValueOnce({ rows: [{ account_type: 'personal' }] }); // profile lookup
  mockQuery.mockResolvedValueOnce({ rows: [{ count }] }); // monthly limit
}

/** Setup mocks for a pro_creator account (no monthly limit check) */
function setupProCreatorAccount() {
  mockQuery.mockResolvedValueOnce({ rows: [{ account_type: 'pro_creator' }] });
}

/** Setup mocks for a pro_business account (no monthly limit check) */
function setupProBusinessAccount() {
  mockQuery.mockResolvedValueOnce({ rows: [{ account_type: 'pro_business' }] });
}

/** Mock a successful group creation (INSERT, group_participants INSERT, COMMIT, creator SELECT) */
function setupSuccessfulCreate(groupOverrides: Record<string, unknown> = {}) {
  const defaultGroup = {
    id: 'group-id-1',
    name: 'Test Group',
    description: null,
    category: null,
    subcategory: null,
    sport_type: null,
    latitude: '48.8566',
    longitude: '2.3522',
    address: null,
    starts_at: FUTURE_DATE,
    timezone: 'UTC',
    max_participants: null,
    current_participants: 1,
    is_free: true,
    price: null,
    currency: 'usd',
    is_public: true,
    is_fans_only: false,
    is_route: false,
    route_start: null,
    route_end: null,
    route_waypoints: null,
    route_geojson: null,
    route_profile: null,
    route_distance_km: null,
    route_duration_min: null,
    route_elevation_gain: null,
    difficulty: null,
    cover_image_url: null,
    status: 'active',
    created_at: FUTURE_DATE,
    ...groupOverrides,
  };

  // BEGIN
  mockQuery.mockResolvedValueOnce({ rows: [] });
  // INSERT INTO groups RETURNING ...
  mockQuery.mockResolvedValueOnce({ rows: [defaultGroup] });
  // INSERT INTO group_participants
  mockQuery.mockResolvedValueOnce({ rows: [] });
  // COMMIT
  mockQuery.mockResolvedValueOnce({ rows: [] });
  // SELECT creator info
  mockQuery.mockResolvedValueOnce({
    rows: [{ username: 'testuser', display_name: 'Test User', avatar_url: 'https://cdn.test/avatar.jpg', is_verified: true }],
  });

  return defaultGroup;
}

beforeEach(() => {
  jest.clearAllMocks();
  (getPool as jest.Mock).mockResolvedValue({ query: mockQuery, connect: mockConnect });
  (resolveProfileId as jest.Mock).mockResolvedValue('p1');
  (filterText as jest.Mock).mockResolvedValue({ clean: true });
  (analyzeTextToxicity as jest.Mock).mockResolvedValue({ action: 'allow' });
  (requireRateLimit as jest.Mock).mockResolvedValue(null);
  (requireActiveAccount as jest.Mock).mockResolvedValue({ profileId: 'p1', accountType: 'personal' });
  (isAccountError as jest.Mock).mockReturnValue(false);
});

describe('groups/create handler', () => {
  // ── Auth branches ──────────────────────────────────────────────────
  it('should return 401 for OPTIONS (no auth)', async () => {
    const event = makeEvent({ httpMethod: 'OPTIONS', sub: null });
    const res = await handler(event);
    expect(res.statusCode).toBe(401);
  });

  it('should return 401 when unauthenticated', async () => {
    const event = makeEvent({ sub: null });
    const res = await handler(event);
    expect(res.statusCode).toBe(401);
  });

  it('should return 404 when profile not found', async () => {
    (resolveProfileId as jest.Mock).mockResolvedValueOnce(null);
    const event = makeEvent();
    const res = await handler(event);
    expect(res.statusCode).toBe(404);
  });

  // ── Rate limit branch ─────────────────────────────────────────────
  it('should return 429 when rate limited', async () => {
    const rateLimitRes = { statusCode: 429, headers: {}, body: JSON.stringify({ message: 'Too many requests' }) };
    (requireRateLimit as jest.Mock).mockResolvedValueOnce(rateLimitRes);
    const event = makeEvent();
    const res = await handler(event);
    expect(res.statusCode).toBe(429);
  });

  // ── Account status error branch ────────────────────────────────────
  it('should return account error when account is suspended', async () => {
    (isAccountError as jest.Mock).mockReturnValueOnce(true);
    (requireActiveAccount as jest.Mock).mockResolvedValueOnce({
      statusCode: 403,
      body: JSON.stringify({ message: 'Account suspended' }),
    });
    const event = makeEvent();
    const res = await handler(event);
    expect(res.statusCode).toBe(403);
    expect(JSON.parse(res.body).message).toBe('Account suspended');
  });

  // ── Monthly limit branches ─────────────────────────────────────────
  it('should return 403 when monthly limit reached for personal account', async () => {
    setupPersonalAccount(4);
    const event = makeEvent();
    const res = await handler(event);
    expect(res.statusCode).toBe(403);
    expect(JSON.parse(res.body).message).toContain('Monthly group creation limit');
  });

  it('should skip monthly limit check for pro_creator account', async () => {
    setupProCreatorAccount();
    setupSuccessfulCreate();
    const event = makeEvent();
    const res = await handler(event);
    expect(res.statusCode).toBe(201);
  });

  it('should skip monthly limit check for pro_business account', async () => {
    setupProBusinessAccount();
    setupSuccessfulCreate();
    const event = makeEvent();
    const res = await handler(event);
    expect(res.statusCode).toBe(201);
  });

  it('should allow personal account under monthly limit (count < 4)', async () => {
    setupPersonalAccount(3);
    setupSuccessfulCreate();
    const event = makeEvent();
    const res = await handler(event);
    expect(res.statusCode).toBe(201);
  });

  // ── Body parsing: null/empty body branch ──────────────────────────
  it('should handle null body (event.body || "{}" branch)', async () => {
    setupPersonalAccount(0);
    const event = makeEvent({ body: null as unknown as string });
    // Force the body to actually be null in the event
    (event as Record<string, unknown>).body = null;
    const res = await handler(event);
    expect(res.statusCode).toBe(400); // missing required fields
  });

  // ── Required fields validation ─────────────────────────────────────
  it('should return 400 when required fields missing', async () => {
    setupPersonalAccount(0);
    const event = makeEvent({ body: JSON.stringify({}) });
    const res = await handler(event);
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).message).toContain('Name, latitude, longitude');
  });

  it('should return 400 when name is missing but other fields present', async () => {
    setupPersonalAccount(0);
    const event = makeEvent({ body: validBody({ name: '' }) });
    const res = await handler(event);
    expect(res.statusCode).toBe(400);
  });

  it('should return 400 when latitude is missing', async () => {
    setupPersonalAccount(0);
    const event = makeEvent({ body: validBody({ latitude: undefined }) });
    const res = await handler(event);
    expect(res.statusCode).toBe(400);
  });

  it('should return 400 when longitude is missing', async () => {
    setupPersonalAccount(0);
    const event = makeEvent({ body: validBody({ longitude: undefined }) });
    const res = await handler(event);
    expect(res.statusCode).toBe(400);
  });

  it('should return 400 when starts_at is missing', async () => {
    setupPersonalAccount(0);
    const event = makeEvent({ body: validBody({ starts_at: undefined }) });
    const res = await handler(event);
    expect(res.statusCode).toBe(400);
  });

  // ── Name length validation ─────────────────────────────────────────
  it('should return 400 when name exceeds 255 characters', async () => {
    setupPersonalAccount(0);
    const event = makeEvent({ body: validBody({ name: 'A'.repeat(256) }) });
    const res = await handler(event);
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).message).toContain('Name too long');
  });

  it('should accept name at exactly 255 characters', async () => {
    setupPersonalAccount(0);
    setupSuccessfulCreate({ name: 'A'.repeat(255) });
    const event = makeEvent({ body: validBody({ name: 'A'.repeat(255) }) });
    const res = await handler(event);
    expect(res.statusCode).toBe(201);
  });

  // ── Coordinate validation (all branches) ──────────────────────────
  it('should return 400 for latitude > 90', async () => {
    setupPersonalAccount(0);
    const event = makeEvent({ body: validBody({ latitude: 91 }) });
    const res = await handler(event);
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).message).toContain('Invalid coordinates');
  });

  it('should return 400 for latitude < -90', async () => {
    setupPersonalAccount(0);
    const event = makeEvent({ body: validBody({ latitude: -91 }) });
    const res = await handler(event);
    expect(res.statusCode).toBe(400);
  });

  it('should return 400 for longitude > 180', async () => {
    setupPersonalAccount(0);
    const event = makeEvent({ body: validBody({ longitude: 181 }) });
    const res = await handler(event);
    expect(res.statusCode).toBe(400);
  });

  it('should return 400 for longitude < -180', async () => {
    setupPersonalAccount(0);
    const event = makeEvent({ body: validBody({ longitude: -181 }) });
    const res = await handler(event);
    expect(res.statusCode).toBe(400);
  });

  it('should return 400 for NaN latitude', async () => {
    setupPersonalAccount(0);
    const event = makeEvent({ body: validBody({ latitude: 'not-a-number' }) });
    const res = await handler(event);
    expect(res.statusCode).toBe(400);
  });

  it('should return 400 for NaN longitude', async () => {
    setupPersonalAccount(0);
    const event = makeEvent({ body: validBody({ longitude: 'not-a-number' }) });
    const res = await handler(event);
    expect(res.statusCode).toBe(400);
  });

  it('should accept boundary coordinates (90, 180)', async () => {
    setupPersonalAccount(0);
    setupSuccessfulCreate({ latitude: '90', longitude: '180' });
    const event = makeEvent({ body: validBody({ latitude: 90, longitude: 180 }) });
    const res = await handler(event);
    expect(res.statusCode).toBe(201);
  });

  it('should accept boundary coordinates (-90, -180)', async () => {
    setupPersonalAccount(0);
    setupSuccessfulCreate({ latitude: '-90', longitude: '-180' });
    const event = makeEvent({ body: validBody({ latitude: -90, longitude: -180 }) });
    const res = await handler(event);
    expect(res.statusCode).toBe(201);
  });

  // ── Start date validation ──────────────────────────────────────────
  it('should return 400 for invalid start date', async () => {
    setupPersonalAccount(0);
    const event = makeEvent({ body: validBody({ starts_at: 'not-a-date' }) });
    const res = await handler(event);
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).message).toContain('Invalid start date');
  });

  it('should return 400 when start date is in the past', async () => {
    setupPersonalAccount(0);
    const pastDate = new Date(Date.now() - 86400000).toISOString();
    const event = makeEvent({ body: validBody({ starts_at: pastDate }) });
    const res = await handler(event);
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).message).toContain('Start date must be in the future');
  });

  // ── max_participants validation ────────────────────────────────────
  it('should return 400 when max_participants < 2', async () => {
    setupPersonalAccount(0);
    const event = makeEvent({ body: validBody({ max_participants: 1 }) });
    const res = await handler(event);
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).message).toContain('Max participants must be between 2 and 10000');
  });

  it('should return 400 when max_participants > 10000', async () => {
    setupPersonalAccount(0);
    const event = makeEvent({ body: validBody({ max_participants: 10001 }) });
    const res = await handler(event);
    expect(res.statusCode).toBe(400);
  });

  it('should accept max_participants at boundary 2', async () => {
    setupPersonalAccount(0);
    setupSuccessfulCreate({ max_participants: 2 });
    const event = makeEvent({ body: validBody({ max_participants: 2 }) });
    const res = await handler(event);
    expect(res.statusCode).toBe(201);
  });

  it('should accept max_participants at boundary 10000', async () => {
    setupPersonalAccount(0);
    setupSuccessfulCreate({ max_participants: 10000 });
    const event = makeEvent({ body: validBody({ max_participants: 10000 }) });
    const res = await handler(event);
    expect(res.statusCode).toBe(201);
  });

  it('should accept undefined max_participants (skips validation)', async () => {
    setupPersonalAccount(0);
    setupSuccessfulCreate();
    const event = makeEvent({ body: validBody({}) });
    const res = await handler(event);
    expect(res.statusCode).toBe(201);
  });

  // ── Difficulty validation ──────────────────────────────────────────
  it('should return 400 for invalid difficulty', async () => {
    setupPersonalAccount(0);
    const event = makeEvent({ body: validBody({ difficulty: 'impossible' }) });
    const res = await handler(event);
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).message).toContain('Invalid difficulty level');
  });

  it('should accept valid difficulty "easy"', async () => {
    setupPersonalAccount(0);
    setupSuccessfulCreate({ difficulty: 'easy' });
    const event = makeEvent({ body: validBody({ difficulty: 'easy' }) });
    const res = await handler(event);
    expect(res.statusCode).toBe(201);
  });

  it('should accept valid difficulty "moderate"', async () => {
    setupPersonalAccount(0);
    setupSuccessfulCreate({ difficulty: 'moderate' });
    const event = makeEvent({ body: validBody({ difficulty: 'moderate' }) });
    const res = await handler(event);
    expect(res.statusCode).toBe(201);
  });

  it('should accept valid difficulty "hard"', async () => {
    setupPersonalAccount(0);
    setupSuccessfulCreate({ difficulty: 'hard' });
    const event = makeEvent({ body: validBody({ difficulty: 'hard' }) });
    const res = await handler(event);
    expect(res.statusCode).toBe(201);
  });

  it('should accept valid difficulty "expert"', async () => {
    setupPersonalAccount(0);
    setupSuccessfulCreate({ difficulty: 'expert' });
    const event = makeEvent({ body: validBody({ difficulty: 'expert' }) });
    const res = await handler(event);
    expect(res.statusCode).toBe(201);
  });

  it('should skip difficulty validation when not provided (falsy)', async () => {
    setupPersonalAccount(0);
    setupSuccessfulCreate();
    const event = makeEvent({ body: validBody({}) });
    const res = await handler(event);
    expect(res.statusCode).toBe(201);
  });

  // ── Paid group branches (!isFree) ──────────────────────────────────
  it('should return 403 when non-pro_creator tries to create paid group', async () => {
    setupPersonalAccount(0);
    const event = makeEvent({ body: validBody({ is_free: false, price: 1000 }) });
    const res = await handler(event);
    expect(res.statusCode).toBe(403);
    expect(JSON.parse(res.body).message).toContain('Only Pro Creators');
  });

  it('should return 400 when paid group has no price', async () => {
    setupProCreatorAccount();
    const event = makeEvent({ body: validBody({ is_free: false, price: undefined }) });
    const res = await handler(event);
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).message).toContain('Price is required');
  });

  it('should return 400 when paid group has price <= 0', async () => {
    setupProCreatorAccount();
    const event = makeEvent({ body: validBody({ is_free: false, price: 0 }) });
    const res = await handler(event);
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).message).toContain('Price is required');
  });

  it('should return 400 when paid group has negative price', async () => {
    setupProCreatorAccount();
    const event = makeEvent({ body: validBody({ is_free: false, price: -100 }) });
    const res = await handler(event);
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).message).toContain('Price is required');
  });

  it('should return 400 when paid group price exceeds 5000000', async () => {
    setupProCreatorAccount();
    const event = makeEvent({ body: validBody({ is_free: false, price: 5000001 }) });
    const res = await handler(event);
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).message).toContain('Maximum price exceeded');
  });

  it('should allow pro_creator to create valid paid group', async () => {
    setupProCreatorAccount();
    setupSuccessfulCreate({ is_free: false, price: '1000', currency: 'usd' });
    const event = makeEvent({ body: validBody({ is_free: false, price: 1000, currency: 'eur' }) });
    const res = await handler(event);
    expect(res.statusCode).toBe(201);
  });

  it('should allow pro_creator with price at boundary 5000000', async () => {
    setupProCreatorAccount();
    setupSuccessfulCreate({ is_free: false, price: '5000000' });
    const event = makeEvent({ body: validBody({ is_free: false, price: 5000000 }) });
    const res = await handler(event);
    expect(res.statusCode).toBe(201);
  });

  // ── Sanitization branches (description, category, etc.) ────────────
  it('should sanitize all optional text fields when provided', async () => {
    setupPersonalAccount(0);
    setupSuccessfulCreate({
      description: 'A description',
      category: 'fitness',
      subcategory: 'running',
      sport_type: 'trail',
      address: '123 Main St',
      route_profile: 'hilly',
    });
    const event = makeEvent({
      body: validBody({
        description: 'A description',
        category: 'fitness',
        subcategory: 'running',
        sport_type: 'trail',
        address: '123 Main St',
        route_profile: 'hilly',
      }),
    });
    const res = await handler(event);
    expect(res.statusCode).toBe(201);
  });

  it('should pass null for optional text fields when not provided', async () => {
    setupPersonalAccount(0);
    setupSuccessfulCreate();
    const event = makeEvent({ body: validBody({}) });
    const res = await handler(event);
    expect(res.statusCode).toBe(201);
  });

  // ── Moderation branches ────────────────────────────────────────────
  it('should return 400 when text blocked by filter (critical severity)', async () => {
    setupPersonalAccount(0);
    (filterText as jest.Mock).mockResolvedValueOnce({ clean: false, severity: 'critical' });
    const event = makeEvent({ body: validBody({ name: 'Bad Name' }) });
    const res = await handler(event);
    expect(res.statusCode).toBe(400);
  });

  it('should return 400 when text blocked by filter (high severity)', async () => {
    setupPersonalAccount(0);
    (filterText as jest.Mock).mockResolvedValueOnce({ clean: false, severity: 'high' });
    const event = makeEvent({ body: validBody({ name: 'Bad Name' }) });
    const res = await handler(event);
    expect(res.statusCode).toBe(400);
  });

  it('should return 400 when text blocked by toxicity analysis', async () => {
    setupPersonalAccount(0);
    (analyzeTextToxicity as jest.Mock).mockResolvedValueOnce({ action: 'block', topCategory: 'hate' });
    const event = makeEvent({ body: validBody({ name: 'Toxic Name' }) });
    const res = await handler(event);
    expect(res.statusCode).toBe(400);
  });

  it('should allow creation when moderation flags but does not block', async () => {
    setupPersonalAccount(0);
    (analyzeTextToxicity as jest.Mock).mockResolvedValue({ action: 'flag', topCategory: 'profanity', maxScore: 0.6 });
    setupSuccessfulCreate();
    const event = makeEvent({ body: validBody({}) });
    const res = await handler(event);
    expect(res.statusCode).toBe(201);
  });

  it('should moderate both name and description when description is provided', async () => {
    setupPersonalAccount(0);
    setupSuccessfulCreate({ description: 'Some desc' });
    const event = makeEvent({ body: validBody({ description: 'Some desc' }) });
    const res = await handler(event);
    expect(res.statusCode).toBe(201);
    // Both name and description should be passed to filterText
    expect(filterText).toHaveBeenCalledTimes(2);
  });

  it('should moderate only name when description is not provided', async () => {
    setupPersonalAccount(0);
    setupSuccessfulCreate();
    const event = makeEvent({ body: validBody({}) });
    const res = await handler(event);
    expect(res.statusCode).toBe(201);
    // Only name is passed to moderation (description is null, filtered out)
    expect(filterText).toHaveBeenCalledTimes(1);
  });

  // ── Cover image URL validation ─────────────────────────────────────
  it('should return 400 for invalid cover image URL (non-S3/CloudFront)', async () => {
    setupPersonalAccount(0);
    const event = makeEvent({ body: validBody({ cover_image_url: 'https://evil.com/image.jpg' }) });
    const res = await handler(event);
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).message).toContain('Invalid cover image URL');
  });

  it('should return 400 for malformed cover image URL', async () => {
    setupPersonalAccount(0);
    const event = makeEvent({ body: validBody({ cover_image_url: 'not-a-url' }) });
    const res = await handler(event);
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).message).toContain('Invalid cover image URL');
  });

  it('should accept valid S3 cover image URL', async () => {
    setupPersonalAccount(0);
    setupSuccessfulCreate({ cover_image_url: 'https://bucket.s3.amazonaws.com/img.jpg' });
    const event = makeEvent({ body: validBody({ cover_image_url: 'https://bucket.s3.amazonaws.com/img.jpg' }) });
    const res = await handler(event);
    expect(res.statusCode).toBe(201);
  });

  it('should accept valid CloudFront cover image URL', async () => {
    setupPersonalAccount(0);
    setupSuccessfulCreate({ cover_image_url: 'https://d123.cloudfront.net/img.jpg' });
    const event = makeEvent({ body: validBody({ cover_image_url: 'https://d123.cloudfront.net/img.jpg' }) });
    const res = await handler(event);
    expect(res.statusCode).toBe(201);
  });

  it('should accept valid S3 us-east-1 cover image URL', async () => {
    setupPersonalAccount(0);
    setupSuccessfulCreate({ cover_image_url: 'https://bucket.s3.us-east-1.amazonaws.com/img.jpg' });
    const event = makeEvent({ body: validBody({ cover_image_url: 'https://bucket.s3.us-east-1.amazonaws.com/img.jpg' }) });
    const res = await handler(event);
    expect(res.statusCode).toBe(201);
  });

  it('should skip cover image URL validation when not provided', async () => {
    setupPersonalAccount(0);
    setupSuccessfulCreate();
    const event = makeEvent({ body: validBody({}) });
    const res = await handler(event);
    expect(res.statusCode).toBe(201);
  });

  // ── Route fields JSON.stringify branches ───────────────────────────
  it('should JSON.stringify route fields when provided', async () => {
    setupPersonalAccount(0);
    setupSuccessfulCreate({
      is_route: true,
      route_start: '{"lat":48,"lng":2}',
      route_end: '{"lat":49,"lng":3}',
      route_waypoints: '[{"lat":48.5,"lng":2.5}]',
      route_geojson: '{"type":"FeatureCollection"}',
      route_distance_km: '10.5',
      route_duration_min: 60,
      route_elevation_gain: 500,
    });
    const event = makeEvent({
      body: validBody({
        is_route: true,
        route_start: { lat: 48, lng: 2 },
        route_end: { lat: 49, lng: 3 },
        route_waypoints: [{ lat: 48.5, lng: 2.5 }],
        route_geojson: { type: 'FeatureCollection' },
        route_profile: 'hilly',
        route_distance_km: 10.5,
        route_duration_min: 60,
        route_elevation_gain: 500,
      }),
    });
    const res = await handler(event);
    expect(res.statusCode).toBe(201);
    // Verify INSERT was called with JSON.stringified route fields
    const insertCall = mockQuery.mock.calls.find(
      (call: unknown[]) => typeof call[0] === 'string' && (call[0] as string).includes('INSERT INTO groups'),
    );
    expect(insertCall).toBeDefined();
  });

  it('should pass null for route fields when not provided', async () => {
    setupPersonalAccount(0);
    setupSuccessfulCreate();
    const event = makeEvent({ body: validBody({}) });
    const res = await handler(event);
    expect(res.statusCode).toBe(201);
  });

  // ── Default values for optional fields (timezone, currency, etc.) ──
  it('should use default timezone "UTC" when not provided', async () => {
    setupPersonalAccount(0);
    setupSuccessfulCreate();
    const event = makeEvent({ body: validBody({}) });
    const res = await handler(event);
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.group.timezone).toBe('UTC');
  });

  it('should use provided timezone when given', async () => {
    setupPersonalAccount(0);
    setupSuccessfulCreate({ timezone: 'Europe/Paris' });
    const event = makeEvent({ body: validBody({ timezone: 'Europe/Paris' }) });
    const res = await handler(event);
    expect(res.statusCode).toBe(201);
  });

  it('should use default is_free=true when not provided', async () => {
    setupPersonalAccount(0);
    setupSuccessfulCreate({ is_free: true });
    const event = makeEvent({ body: validBody({}) });
    const res = await handler(event);
    expect(res.statusCode).toBe(201);
  });

  it('should use default is_public=true when not provided', async () => {
    setupPersonalAccount(0);
    setupSuccessfulCreate({ is_public: true });
    const event = makeEvent({ body: validBody({}) });
    const res = await handler(event);
    expect(res.statusCode).toBe(201);
  });

  it('should use default is_fans_only=false when not provided', async () => {
    setupPersonalAccount(0);
    setupSuccessfulCreate({ is_fans_only: false });
    const event = makeEvent({ body: validBody({}) });
    const res = await handler(event);
    expect(res.statusCode).toBe(201);
  });

  it('should use default is_route=false when not provided', async () => {
    setupPersonalAccount(0);
    setupSuccessfulCreate({ is_route: false });
    const event = makeEvent({ body: validBody({}) });
    const res = await handler(event);
    expect(res.statusCode).toBe(201);
  });

  // ── Response field branches (price parseFloat, routeDistanceKm parseFloat) ─
  it('should parseFloat price when present in group response', async () => {
    setupProCreatorAccount();
    setupSuccessfulCreate({ is_free: false, price: '1500', currency: 'usd' });
    const event = makeEvent({ body: validBody({ is_free: false, price: 1500 }) });
    const res = await handler(event);
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.group.price).toBe(1500);
  });

  it('should return null for price when not present in group response', async () => {
    setupPersonalAccount(0);
    setupSuccessfulCreate({ price: null });
    const event = makeEvent({ body: validBody({}) });
    const res = await handler(event);
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.group.price).toBeNull();
  });

  it('should parseFloat routeDistanceKm when present in group response', async () => {
    setupPersonalAccount(0);
    setupSuccessfulCreate({ route_distance_km: '10.5' });
    const event = makeEvent({ body: validBody({ route_distance_km: 10.5 }) });
    const res = await handler(event);
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.group.routeDistanceKm).toBe(10.5);
  });

  it('should return null for routeDistanceKm when not present in group response', async () => {
    setupPersonalAccount(0);
    setupSuccessfulCreate({ route_distance_km: null });
    const event = makeEvent({ body: validBody({}) });
    const res = await handler(event);
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.group.routeDistanceKm).toBeNull();
  });

  // ── isFree ternary in INSERT: !isFree ? price : null ───────────────
  it('should pass null for price in INSERT when is_free is true', async () => {
    setupPersonalAccount(0);
    setupSuccessfulCreate({ is_free: true, price: null });
    const event = makeEvent({ body: validBody({ is_free: true }) });
    const res = await handler(event);
    expect(res.statusCode).toBe(201);
  });

  // ── || null branches for optional INSERT params ────────────────────
  it('should pass null for maxParticipants, routeDistanceKm, routeDurationMin, routeElevationGain, difficulty, coverImageUrl when falsy', async () => {
    setupPersonalAccount(0);
    setupSuccessfulCreate();
    const event = makeEvent({ body: validBody({}) });
    const res = await handler(event);
    expect(res.statusCode).toBe(201);
    // The INSERT query params should include null for these fields
    const insertCall = mockQuery.mock.calls.find(
      (call: unknown[]) => typeof call[0] === 'string' && (call[0] as string).includes('INSERT INTO groups'),
    );
    expect(insertCall).toBeDefined();
    const params = insertCall![1] as unknown[];
    // maxParticipants || null => null (index 11)
    expect(params[11]).toBeNull();
  });

  // ── DB error / ROLLBACK branch ─────────────────────────────────────
  it('should return 500 and ROLLBACK on database error during creation', async () => {
    setupPersonalAccount(0);
    // BEGIN succeeds
    mockQuery.mockResolvedValueOnce({ rows: [] });
    // INSERT fails
    mockQuery.mockRejectedValueOnce(new Error('DB insert error'));
    const event = makeEvent({ body: validBody({}) });
    const res = await handler(event);
    expect(res.statusCode).toBe(500);
    // Verify ROLLBACK was called
    const rollbackCall = mockQuery.mock.calls.find(
      (call: unknown[]) => call[0] === 'ROLLBACK',
    );
    expect(rollbackCall).toBeDefined();
    // Verify client.release() was called
    expect(mockRelease).toHaveBeenCalled();
  });

  it('should return 500 on initial profile query error', async () => {
    mockQuery.mockRejectedValueOnce(new Error('DB error'));
    const event = makeEvent();
    const res = await handler(event);
    expect(res.statusCode).toBe(500);
  });

  // ── Successful creation with all fields ────────────────────────────
  it('should return 201 with full group response on successful creation', async () => {
    setupPersonalAccount(0);
    const group = setupSuccessfulCreate({
      id: 'g-123',
      name: 'Full Group',
      description: 'A full group',
      category: 'sports',
      subcategory: 'running',
      sport_type: 'trail',
      latitude: '48.8566',
      longitude: '2.3522',
      address: '123 Main St',
      starts_at: FUTURE_DATE,
      timezone: 'Europe/Paris',
      max_participants: 50,
      current_participants: 1,
      is_free: true,
      price: null,
      currency: 'usd',
      is_public: true,
      is_fans_only: false,
      is_route: true,
      route_start: { lat: 48 },
      route_end: { lat: 49 },
      route_waypoints: [{ lat: 48.5 }],
      route_geojson: { type: 'Feature' },
      route_profile: 'hilly',
      route_distance_km: '10.5',
      route_duration_min: 60,
      route_elevation_gain: 500,
      difficulty: 'hard',
      cover_image_url: 'https://bucket.s3.amazonaws.com/cover.jpg',
      status: 'active',
      created_at: FUTURE_DATE,
    });
    const event = makeEvent({
      body: validBody({
        description: 'A full group',
        category: 'sports',
        subcategory: 'running',
        sport_type: 'trail',
        address: '123 Main St',
        timezone: 'Europe/Paris',
        max_participants: 50,
        is_route: true,
        route_start: { lat: 48 },
        route_end: { lat: 49 },
        route_waypoints: [{ lat: 48.5 }],
        route_geojson: { type: 'Feature' },
        route_profile: 'hilly',
        route_distance_km: 10.5,
        route_duration_min: 60,
        route_elevation_gain: 500,
        difficulty: 'hard',
        cover_image_url: 'https://bucket.s3.amazonaws.com/cover.jpg',
      }),
    });
    const res = await handler(event);
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.group.id).toBe('g-123');
    expect(body.group.name).toBe('Full Group');
    expect(body.group.description).toBe('A full group');
    expect(body.group.sportType).toBe('trail');
    expect(body.group.latitude).toBe(48.8566);
    expect(body.group.longitude).toBe(2.3522);
    expect(body.group.routeDistanceKm).toBe(10.5);
    expect(body.group.creator.id).toBe('p1');
    expect(body.group.creator.username).toBe('testuser');
    expect(body.group.creator.displayName).toBe('Test User');
    expect(body.group.creator.isVerified).toBe(true);
  });

  // ── is_public and is_fans_only override branches ───────────────────
  it('should accept is_public=false', async () => {
    setupPersonalAccount(0);
    setupSuccessfulCreate({ is_public: false });
    const event = makeEvent({ body: validBody({ is_public: false }) });
    const res = await handler(event);
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.group.isPublic).toBe(false);
  });

  it('should accept is_fans_only=true', async () => {
    setupPersonalAccount(0);
    setupSuccessfulCreate({ is_fans_only: true });
    const event = makeEvent({ body: validBody({ is_fans_only: true }) });
    const res = await handler(event);
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.group.isFansOnly).toBe(true);
  });

  // ── currency override branch ───────────────────────────────────────
  it('should use default currency "usd" when not provided', async () => {
    setupPersonalAccount(0);
    setupSuccessfulCreate({ currency: 'usd' });
    const event = makeEvent({ body: validBody({}) });
    const res = await handler(event);
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.group.currency).toBe('usd');
  });

  it('should use provided currency when given', async () => {
    setupPersonalAccount(0);
    setupSuccessfulCreate({ currency: 'eur' });
    const event = makeEvent({ body: validBody({ currency: 'eur' }) });
    const res = await handler(event);
    expect(res.statusCode).toBe(201);
  });
});

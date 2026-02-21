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
jest.mock('../../utils/constants', () => ({ RATE_WINDOW_1_MIN: 60, RATE_WINDOW_5_MIN: 300,
  DEFAULT_PAGE_SIZE: 20,
  MAX_PAGE_SIZE: 50,
}));
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
import { requireActiveAccount, isAccountError } from '../../utils/account-status';
import { filterText } from '../../../shared/moderation/textFilter';
import { analyzeTextToxicity } from '../../../shared/moderation/textModeration';

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

  // ── Account status branch ──

  describe('account status', () => {
    it('should return error when account is suspended', async () => {
      (requireActiveAccount as jest.Mock).mockResolvedValueOnce({
        statusCode: 403,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'Account suspended' }),
      });
      (isAccountError as unknown as jest.Mock).mockReturnValueOnce(true);

      const event = makeEvent();
      const res = await handler(event);
      const result = res as { statusCode: number };
      expect(result.statusCode).toBe(403);
    });
  });

  // ── Text field type branches ──

  describe('text field type branches', () => {
    it('should handle text field with null value', async () => {
      const spotRow = makeSpotRow();
      mockQuery.mockResolvedValueOnce({ rows: [spotRow] });
      const event = makeEvent({ body: JSON.stringify({ name: null }) });
      const res = await handler(event);
      const result = res as { statusCode: number; body: string };
      expect(result.statusCode).toBe(200);
    });

    it('should skip text field when value is non-string and non-null', async () => {
      // name: 123 is non-string, non-null — should be skipped
      // Need at least one valid field for the update to proceed
      const spotRow = makeSpotRow();
      mockQuery.mockResolvedValueOnce({ rows: [spotRow] });
      const event = makeEvent({ body: JSON.stringify({ name: 123, description: 'Valid' }) });
      const res = await handler(event);
      const result = res as { statusCode: number; body: string };
      expect(result.statusCode).toBe(200);
      // The UPDATE query should contain description but not the invalid name
      const updateCall = mockQuery.mock.calls[0];
      expect(updateCall[0]).toContain('description');
    });

    it('should update description text field', async () => {
      const spotRow = makeSpotRow();
      mockQuery.mockResolvedValueOnce({ rows: [spotRow] });
      const event = makeEvent({ body: JSON.stringify({ description: 'A great spot' }) });
      const res = await handler(event);
      const result = res as { statusCode: number };
      expect(result.statusCode).toBe(200);
    });

    it('should update category text field', async () => {
      const spotRow = makeSpotRow();
      mockQuery.mockResolvedValueOnce({ rows: [spotRow] });
      const event = makeEvent({ body: JSON.stringify({ category: 'park' }) });
      const res = await handler(event);
      const result = res as { statusCode: number };
      expect(result.statusCode).toBe(200);
    });

    it('should update sportType text field', async () => {
      const spotRow = makeSpotRow();
      mockQuery.mockResolvedValueOnce({ rows: [spotRow] });
      const event = makeEvent({ body: JSON.stringify({ sportType: 'running' }) });
      const res = await handler(event);
      const result = res as { statusCode: number };
      expect(result.statusCode).toBe(200);
    });

    it('should update address text field', async () => {
      const spotRow = makeSpotRow();
      mockQuery.mockResolvedValueOnce({ rows: [spotRow] });
      const event = makeEvent({ body: JSON.stringify({ address: '123 Main St' }) });
      const res = await handler(event);
      const result = res as { statusCode: number };
      expect(result.statusCode).toBe(200);
    });

    it('should update city text field', async () => {
      const spotRow = makeSpotRow();
      mockQuery.mockResolvedValueOnce({ rows: [spotRow] });
      const event = makeEvent({ body: JSON.stringify({ city: 'Paris' }) });
      const res = await handler(event);
      const result = res as { statusCode: number };
      expect(result.statusCode).toBe(200);
    });

    it('should update country text field', async () => {
      const spotRow = makeSpotRow();
      mockQuery.mockResolvedValueOnce({ rows: [spotRow] });
      const event = makeEvent({ body: JSON.stringify({ country: 'France' }) });
      const res = await handler(event);
      const result = res as { statusCode: number };
      expect(result.statusCode).toBe(200);
    });

    it('should update subcategory text field', async () => {
      const spotRow = makeSpotRow();
      mockQuery.mockResolvedValueOnce({ rows: [spotRow] });
      const event = makeEvent({ body: JSON.stringify({ subcategory: 'trail' }) });
      const res = await handler(event);
      const result = res as { statusCode: number };
      expect(result.statusCode).toBe(200);
    });
  });

  // ── Number field type branches ──

  describe('number field type branches', () => {
    it('should update latitude with valid number', async () => {
      const spotRow = makeSpotRow();
      mockQuery.mockResolvedValueOnce({ rows: [spotRow] });
      const event = makeEvent({ body: JSON.stringify({ latitude: 48.8566 }) });
      const res = await handler(event);
      const result = res as { statusCode: number };
      expect(result.statusCode).toBe(200);
    });

    it('should update longitude with valid number', async () => {
      const spotRow = makeSpotRow();
      mockQuery.mockResolvedValueOnce({ rows: [spotRow] });
      const event = makeEvent({ body: JSON.stringify({ longitude: 2.3522 }) });
      const res = await handler(event);
      const result = res as { statusCode: number };
      expect(result.statusCode).toBe(200);
    });

    it('should handle number field with null value', async () => {
      const spotRow = makeSpotRow();
      mockQuery.mockResolvedValueOnce({ rows: [spotRow] });
      const event = makeEvent({ body: JSON.stringify({ latitude: null }) });
      const res = await handler(event);
      const result = res as { statusCode: number };
      expect(result.statusCode).toBe(200);
    });

    it('should skip number field when value is non-number and non-null', async () => {
      // latitude: "not-a-number" is non-number — should be skipped
      const spotRow = makeSpotRow();
      mockQuery.mockResolvedValueOnce({ rows: [spotRow] });
      const event = makeEvent({ body: JSON.stringify({ latitude: 'not-a-number', name: 'Valid' }) });
      const res = await handler(event);
      const result = res as { statusCode: number };
      expect(result.statusCode).toBe(200);
    });

    it('should skip latitude when out of range (> 90)', async () => {
      const spotRow = makeSpotRow();
      mockQuery.mockResolvedValueOnce({ rows: [spotRow] });
      const event = makeEvent({ body: JSON.stringify({ latitude: 91, name: 'Valid' }) });
      const res = await handler(event);
      const result = res as { statusCode: number };
      expect(result.statusCode).toBe(200);
      // Extract only the SET clause portion of the query
      const updateCall = mockQuery.mock.calls[0][0] as string;
      const setClause = updateCall.substring(updateCall.indexOf('SET'), updateCall.indexOf('WHERE'));
      expect(setClause).not.toContain('latitude');
    });

    it('should skip latitude when out of range (< -90)', async () => {
      const spotRow = makeSpotRow();
      mockQuery.mockResolvedValueOnce({ rows: [spotRow] });
      const event = makeEvent({ body: JSON.stringify({ latitude: -91, name: 'Valid' }) });
      const res = await handler(event);
      const result = res as { statusCode: number };
      expect(result.statusCode).toBe(200);
      const updateCall = mockQuery.mock.calls[0][0] as string;
      const setClause = updateCall.substring(updateCall.indexOf('SET'), updateCall.indexOf('WHERE'));
      expect(setClause).not.toContain('latitude');
    });

    it('should skip longitude when out of range (> 180)', async () => {
      const spotRow = makeSpotRow();
      mockQuery.mockResolvedValueOnce({ rows: [spotRow] });
      const event = makeEvent({ body: JSON.stringify({ longitude: 181, name: 'Valid' }) });
      const res = await handler(event);
      const result = res as { statusCode: number };
      expect(result.statusCode).toBe(200);
      const updateCall = mockQuery.mock.calls[0][0] as string;
      const setClause = updateCall.substring(updateCall.indexOf('SET'), updateCall.indexOf('WHERE'));
      expect(setClause).not.toContain('longitude');
    });

    it('should skip longitude when out of range (< -180)', async () => {
      const spotRow = makeSpotRow();
      mockQuery.mockResolvedValueOnce({ rows: [spotRow] });
      const event = makeEvent({ body: JSON.stringify({ longitude: -181, name: 'Valid' }) });
      const res = await handler(event);
      const result = res as { statusCode: number };
      expect(result.statusCode).toBe(200);
      const updateCall = mockQuery.mock.calls[0][0] as string;
      const setClause = updateCall.substring(updateCall.indexOf('SET'), updateCall.indexOf('WHERE'));
      expect(setClause).not.toContain('longitude');
    });
  });

  // ── text[] field type branches ──

  describe('text[] field type branches', () => {
    it('should update images with valid array', async () => {
      const spotRow = makeSpotRow({ images: ['img1.jpg', 'img2.jpg'] });
      mockQuery.mockResolvedValueOnce({ rows: [spotRow] });
      const event = makeEvent({ body: JSON.stringify({ images: ['img1.jpg', 'img2.jpg'] }) });
      const res = await handler(event);
      const result = res as { statusCode: number };
      expect(result.statusCode).toBe(200);
    });

    it('should update amenities with valid array', async () => {
      const spotRow = makeSpotRow({ amenities: ['parking', 'wifi'] });
      mockQuery.mockResolvedValueOnce({ rows: [spotRow] });
      const event = makeEvent({ body: JSON.stringify({ amenities: ['parking', 'wifi'] }) });
      const res = await handler(event);
      const result = res as { statusCode: number };
      expect(result.statusCode).toBe(200);
    });

    it('should update tags with valid array', async () => {
      const spotRow = makeSpotRow();
      mockQuery.mockResolvedValueOnce({ rows: [spotRow] });
      const event = makeEvent({ body: JSON.stringify({ tags: ['outdoor', 'free'] }) });
      const res = await handler(event);
      const result = res as { statusCode: number };
      expect(result.statusCode).toBe(200);
    });

    it('should update qualities with valid array', async () => {
      const spotRow = makeSpotRow();
      mockQuery.mockResolvedValueOnce({ rows: [spotRow] });
      const event = makeEvent({ body: JSON.stringify({ qualities: ['scenic', 'quiet'] }) });
      const res = await handler(event);
      const result = res as { statusCode: number };
      expect(result.statusCode).toBe(200);
    });

    it('should handle text[] field with null value', async () => {
      const spotRow = makeSpotRow();
      mockQuery.mockResolvedValueOnce({ rows: [spotRow] });
      const event = makeEvent({ body: JSON.stringify({ images: null }) });
      const res = await handler(event);
      const result = res as { statusCode: number };
      expect(result.statusCode).toBe(200);
    });

    it('should skip text[] field when value is non-array and non-null', async () => {
      const spotRow = makeSpotRow();
      mockQuery.mockResolvedValueOnce({ rows: [spotRow] });
      const event = makeEvent({ body: JSON.stringify({ images: 'not-an-array', name: 'Valid' }) });
      const res = await handler(event);
      const result = res as { statusCode: number };
      expect(result.statusCode).toBe(200);
      const updateCall = mockQuery.mock.calls[0][0] as string;
      const setClause = updateCall.substring(updateCall.indexOf('SET'), updateCall.indexOf('WHERE'));
      expect(setClause).not.toContain('images');
    });
  });

  // ── jsonb field type branches ──

  describe('jsonb field type branches', () => {
    it('should update openingHours with valid object', async () => {
      const spotRow = makeSpotRow({ opening_hours: { mon: '9-17' } });
      mockQuery.mockResolvedValueOnce({ rows: [spotRow] });
      const event = makeEvent({ body: JSON.stringify({ openingHours: { mon: '9-17', tue: '9-17' } }) });
      const res = await handler(event);
      const result = res as { statusCode: number };
      expect(result.statusCode).toBe(200);
      const updateCall = mockQuery.mock.calls[0];
      expect(updateCall[0]).toContain('opening_hours');
    });

    it('should update contactInfo with valid object', async () => {
      const spotRow = makeSpotRow({ contact_info: { phone: '+33123456789' } });
      mockQuery.mockResolvedValueOnce({ rows: [spotRow] });
      const event = makeEvent({ body: JSON.stringify({ contactInfo: { phone: '+33123456789' } }) });
      const res = await handler(event);
      const result = res as { statusCode: number };
      expect(result.statusCode).toBe(200);
      const updateCall = mockQuery.mock.calls[0];
      expect(updateCall[0]).toContain('contact_info');
    });

    it('should handle jsonb field with null value', async () => {
      const spotRow = makeSpotRow();
      mockQuery.mockResolvedValueOnce({ rows: [spotRow] });
      const event = makeEvent({ body: JSON.stringify({ openingHours: null }) });
      const res = await handler(event);
      const result = res as { statusCode: number };
      expect(result.statusCode).toBe(200);
      const updateCall = mockQuery.mock.calls[0];
      expect(updateCall[0]).toContain('opening_hours');
      // null value should be passed as null, not JSON string
      expect(updateCall[1]).toContain(null);
    });
  });

  // ── Content moderation branches ──

  describe('content moderation', () => {
    it('should block when text moderation rejects name', async () => {
      (filterText as jest.Mock).mockResolvedValueOnce({
        clean: false,
        violations: ['hate_speech'],
        severity: 'critical',
      });

      const event = makeEvent({ body: JSON.stringify({ name: 'Bad content' }) });
      const res = await handler(event);
      const result = res as { statusCode: number };
      expect(result.statusCode).toBe(400);
    });

    it('should block when text toxicity analysis rejects description', async () => {
      (analyzeTextToxicity as jest.Mock).mockResolvedValueOnce({
        action: 'block',
        maxScore: 0.95,
        topCategory: 'HATE_SPEECH',
        categories: [],
      });

      const event = makeEvent({ body: JSON.stringify({ description: 'Toxic content' }) });
      const res = await handler(event);
      const result = res as { statusCode: number };
      expect(result.statusCode).toBe(400);
    });

    it('should skip moderation when no text fields are provided', async () => {
      // Only non-text fields (number, jsonb, etc.) — no moderation needed
      const spotRow = makeSpotRow();
      mockQuery.mockResolvedValueOnce({ rows: [spotRow] });
      const event = makeEvent({ body: JSON.stringify({ latitude: 48.8566 }) });
      const res = await handler(event);
      const result = res as { statusCode: number };
      expect(result.statusCode).toBe(200);
    });

    it('should run moderation only for name when description is non-string', async () => {
      // description: 123 is non-string — should not be moderated
      const spotRow = makeSpotRow();
      mockQuery.mockResolvedValueOnce({ rows: [spotRow] });
      const event = makeEvent({ body: JSON.stringify({ name: 'Valid Name', description: 123 }) });
      const res = await handler(event);
      const result = res as { statusCode: number };
      expect(result.statusCode).toBe(200);
    });
  });

  // ── Response mapping branches ──

  describe('response mapping', () => {
    it('should map images as empty array when null', async () => {
      const spotRow = makeSpotRow({ images: null });
      mockQuery.mockResolvedValueOnce({ rows: [spotRow] });
      const event = makeEvent({ body: JSON.stringify({ name: 'Updated' }) });
      const res = await handler(event);
      const result = res as { statusCode: number; body: string };
      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.spot.images).toEqual([]);
    });

    it('should map images as array when present', async () => {
      const spotRow = makeSpotRow({ images: ['img1.jpg', 'img2.jpg'] });
      mockQuery.mockResolvedValueOnce({ rows: [spotRow] });
      const event = makeEvent({ body: JSON.stringify({ name: 'Updated' }) });
      const res = await handler(event);
      const result = res as { statusCode: number; body: string };
      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.spot.images).toEqual(['img1.jpg', 'img2.jpg']);
    });

    it('should map amenities as empty array when null', async () => {
      const spotRow = makeSpotRow({ amenities: null });
      mockQuery.mockResolvedValueOnce({ rows: [spotRow] });
      const event = makeEvent({ body: JSON.stringify({ name: 'Updated' }) });
      const res = await handler(event);
      const result = res as { statusCode: number; body: string };
      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.spot.amenities).toEqual([]);
    });

    it('should map amenities as array when present', async () => {
      const spotRow = makeSpotRow({ amenities: ['parking', 'wifi'] });
      mockQuery.mockResolvedValueOnce({ rows: [spotRow] });
      const event = makeEvent({ body: JSON.stringify({ name: 'Updated' }) });
      const res = await handler(event);
      const result = res as { statusCode: number; body: string };
      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.spot.amenities).toEqual(['parking', 'wifi']);
    });

    it('should map isVerified as true when is_verified is truthy', async () => {
      const spotRow = makeSpotRow({ is_verified: true });
      mockQuery.mockResolvedValueOnce({ rows: [spotRow] });
      const event = makeEvent({ body: JSON.stringify({ name: 'Updated' }) });
      const res = await handler(event);
      const result = res as { statusCode: number; body: string };
      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.spot.isVerified).toBe(true);
    });

    it('should map isVerified as false when is_verified is falsy', async () => {
      const spotRow = makeSpotRow({ is_verified: null });
      mockQuery.mockResolvedValueOnce({ rows: [spotRow] });
      const event = makeEvent({ body: JSON.stringify({ name: 'Updated' }) });
      const res = await handler(event);
      const result = res as { statusCode: number; body: string };
      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.spot.isVerified).toBe(false);
    });

    it('should map all response fields correctly', async () => {
      const spotRow = makeSpotRow({
        images: ['img.jpg'],
        amenities: ['wifi'],
        is_verified: true,
        opening_hours: { mon: '9-17' },
        contact_info: { phone: '+33' },
      });
      mockQuery.mockResolvedValueOnce({ rows: [spotRow] });
      const event = makeEvent({ body: JSON.stringify({ name: 'Updated' }) });
      const res = await handler(event);
      const result = res as { statusCode: number; body: string };
      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.spot.id).toBe(SPOT_ID);
      expect(body.spot.creatorId).toBe(TEST_PROFILE_ID);
      expect(body.spot.name).toBe('Updated');
      expect(body.spot.sportType).toBeNull();
      expect(body.spot.openingHours).toEqual({ mon: '9-17' });
      expect(body.spot.contactInfo).toEqual({ phone: '+33' });
      expect(body.spot.isVerified).toBe(true);
    });
  });

  // ── Edge cases ──

  describe('edge cases', () => {
    it('should handle null body (empty object default)', async () => {
      // Need to construct directly since makeEvent uses ?? fallback
      const event = {
        httpMethod: 'PUT',
        headers: {},
        body: null,
        queryStringParameters: null,
        pathParameters: { id: SPOT_ID },
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

      const res = await handler(event);
      const result = res as { statusCode: number; body: string };
      // No fields in empty object => 400
      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toBe('No valid fields to update');
    });

    it('should handle missing pathParameters.id', async () => {
      (isValidUUID as jest.Mock).mockReturnValue(false);
      const event = makeEvent({ pathParameters: {} });
      const res = await handler(event);
      const result = res as { statusCode: number };
      expect(result.statusCode).toBe(400);
    });

    it('should update multiple fields of different types at once', async () => {
      const spotRow = makeSpotRow({
        images: ['new.jpg'],
        opening_hours: { mon: '10-18' },
      });
      mockQuery.mockResolvedValueOnce({ rows: [spotRow] });
      const event = makeEvent({
        body: JSON.stringify({
          name: 'Multi-update',
          latitude: 48.8566,
          images: ['new.jpg'],
          openingHours: { mon: '10-18' },
        }),
      });
      const res = await handler(event);
      const result = res as { statusCode: number; body: string };
      expect(result.statusCode).toBe(200);
      const updateCall = mockQuery.mock.calls[0];
      expect(updateCall[0]).toContain('name');
      expect(updateCall[0]).toContain('latitude');
      expect(updateCall[0]).toContain('images');
      expect(updateCall[0]).toContain('opening_hours');
    });

    it('should skip all invalid fields and return 400 if none are valid', async () => {
      const event = makeEvent({
        body: JSON.stringify({
          name: 123,            // non-string, skipped
          latitude: 'bad',      // non-number, skipped
          images: 'not-array',  // non-array, skipped
        }),
      });
      const res = await handler(event);
      const result = res as { statusCode: number; body: string };
      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toBe('No valid fields to update');
    });
  });
});

// ── Helper to create spot row ──

function makeSpotRow(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    id: 'b1b2c3d4-e5f6-7890-abcd-ef1234567890',
    creator_id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
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
    ...overrides,
  };
}

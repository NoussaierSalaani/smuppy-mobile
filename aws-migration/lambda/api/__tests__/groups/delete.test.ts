/**
 * Tests for groups/delete (cancel) Lambda handler
 *
 * The handler uses createDeleteHandler factory which imports from:
 * - ../../shared/db (getPool)
 * - ../utils/cors (createHeaders)
 * - ../utils/logger (createLogger)
 * - ../utils/validators (requireAuth, validateUUIDParam, isErrorResponse)
 * - ../utils/auth (resolveProfileId)
 * - ../utils/rate-limit (requireRateLimit)
 * - ../utils/constants (RATE_WINDOW_1_MIN)
 *
 * The handler itself also imports:
 * - ../utils/account-status (requireActiveAccount, isAccountError)
 */

import { APIGatewayProxyEvent } from 'aws-lambda';

// ── Mocks (MUST be before handler import) ────────────────────────────

jest.mock('../../../shared/db', () => ({
  getPool: jest.fn(),
}));
jest.mock('../../utils/cors', () => ({
  createHeaders: jest.fn(() => ({
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Credentials': 'true',
  })),
}));
jest.mock('../../utils/logger', () => ({
  createLogger: jest.fn(() => ({
    info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(),
    initFromEvent: jest.fn(), setRequestId: jest.fn(), setUserId: jest.fn(),
    logRequest: jest.fn(), logResponse: jest.fn(), logQuery: jest.fn(),
    logSecurity: jest.fn(), child: jest.fn().mockReturnThis(),
  })),
}));
jest.mock('../../utils/validators', () => ({
  requireAuth: jest.fn(),
  validateUUIDParam: jest.fn(),
  isErrorResponse: jest.fn(),
}));
jest.mock('../../utils/auth', () => ({
  resolveProfileId: jest.fn(),
}));
jest.mock('../../utils/rate-limit', () => ({
  requireRateLimit: jest.fn().mockResolvedValue(null),
}));
jest.mock('../../utils/account-status', () => ({
  requireActiveAccount: jest.fn().mockResolvedValue({ profileId: 'p1', accountType: 'personal' }),
  isAccountError: jest.fn().mockReturnValue(false),
}));
jest.mock('../../utils/security', () => ({
  isValidUUID: jest.fn().mockReturnValue(true),
  sanitizeInput: jest.fn((v: string) => v),
}));
jest.mock('../../utils/constants', () => ({
  RATE_WINDOW_1_MIN: 60,
  DEFAULT_PAGE_SIZE: 20,
  MAX_PAGE_SIZE: 50,
}));

// ── Imports (after mocks) ────────────────────────────────────────────

import { handler } from '../../groups/delete';
import { getPool } from '../../../shared/db';
import { requireAuth, validateUUIDParam, isErrorResponse } from '../../utils/validators';
import { resolveProfileId } from '../../utils/auth';
import { requireRateLimit } from '../../utils/rate-limit';
import { requireActiveAccount, isAccountError } from '../../utils/account-status';

// ── Constants ────────────────────────────────────────────────────────

const TEST_SUB = 'cognito-sub-delete-test';
const TEST_PROFILE_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const TEST_GROUP_ID = 'b2c3d4e5-f6a7-8901-bcde-f12345678901';
const HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Credentials': 'true',
};

// ── Helpers ──────────────────────────────────────────────────────────

function makeEvent(overrides: Partial<Record<string, unknown>> = {}): APIGatewayProxyEvent {
  return {
    httpMethod: overrides.httpMethod as string ?? 'DELETE',
    headers: {},
    body: null,
    queryStringParameters: null,
    pathParameters: overrides.pathParameters as Record<string, string> ?? { id: TEST_GROUP_ID },
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

// ── Mock setup ───────────────────────────────────────────────────────

const mockQuery = jest.fn();
const mockRelease = jest.fn();
const mockConnect = jest.fn().mockResolvedValue({ query: mockQuery, release: mockRelease });

beforeEach(() => {
  jest.clearAllMocks();

  // Default: auth returns userId string
  (requireAuth as jest.Mock).mockReturnValue(TEST_SUB);
  (isErrorResponse as unknown as jest.Mock).mockImplementation((val: unknown) => typeof val !== 'string');

  // Default: UUID validation returns the groupId
  (validateUUIDParam as jest.Mock).mockReturnValue(TEST_GROUP_ID);

  // Default: profile resolution succeeds
  (resolveProfileId as jest.Mock).mockResolvedValue(TEST_PROFILE_ID);

  // Default: rate limit passes
  (requireRateLimit as jest.Mock).mockResolvedValue(null);

  // Default: account status passes
  (requireActiveAccount as jest.Mock).mockResolvedValue({ profileId: TEST_PROFILE_ID, accountType: 'personal' });
  (isAccountError as unknown as jest.Mock).mockReturnValue(false);

  // Default pool mock: query returns group with this user as creator, connect for transaction
  (getPool as jest.Mock).mockResolvedValue({
    query: mockQuery,
    connect: mockConnect,
  });

  // Default: group exists with this user as creator, status active
  mockQuery.mockResolvedValue({
    rows: [{ id: TEST_GROUP_ID, creator_id: TEST_PROFILE_ID, status: 'active' }],
    rowCount: 1,
  });
});

// ── Tests ────────────────────────────────────────────────────────────

describe('groups/delete handler', () => {
  it('should return 401 when unauthenticated', async () => {
    (requireAuth as jest.Mock).mockReturnValue({
      statusCode: 401,
      headers: HEADERS,
      body: JSON.stringify({ message: 'Unauthorized' }),
    });
    (isErrorResponse as unknown as jest.Mock).mockReturnValue(true);

    const event = makeEvent({ sub: null });
    const result = await handler(event);
    expect(result.statusCode).toBe(401);
  });

  it('should return 429 when rate limited', async () => {
    (requireRateLimit as jest.Mock).mockResolvedValue({
      statusCode: 429,
      headers: HEADERS,
      body: JSON.stringify({ message: 'Too many requests' }),
    });

    const event = makeEvent();
    const result = await handler(event);
    expect(result.statusCode).toBe(429);
  });

  it('should return 400 when group ID is invalid UUID', async () => {
    (validateUUIDParam as jest.Mock).mockReturnValue({
      statusCode: 400,
      headers: HEADERS,
      body: JSON.stringify({ message: 'Invalid group ID format' }),
    });
    // isErrorResponse should return true for the object from validateUUIDParam
    (isErrorResponse as unknown as jest.Mock).mockImplementation((val: unknown) => typeof val !== 'string');

    const event = makeEvent({ pathParameters: { id: 'not-a-uuid' } });
    const result = await handler(event);
    expect(result.statusCode).toBe(400);
  });

  it('should return 404 when profile not found', async () => {
    (resolveProfileId as jest.Mock).mockResolvedValue(null);

    const event = makeEvent();
    const result = await handler(event);
    expect(result.statusCode).toBe(404);
    expect(JSON.parse(result.body).message).toBe('User profile not found');
  });

  it('should return 404 when group not found', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const event = makeEvent();
    const result = await handler(event);
    expect(result.statusCode).toBe(404);
    expect(JSON.parse(result.body).message).toBe('Group not found');
  });

  it('should return 403 when user is not the creator', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: TEST_GROUP_ID, creator_id: 'other-user-id-00-0000-000000000000', status: 'active' }],
      rowCount: 1,
    });

    const event = makeEvent();
    const result = await handler(event);
    expect(result.statusCode).toBe(403);
    expect(JSON.parse(result.body)).toHaveProperty('success', false);
  });

  it('should return 400 when group is already cancelled', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: TEST_GROUP_ID, creator_id: TEST_PROFILE_ID, status: 'cancelled' }],
      rowCount: 1,
    });

    const event = makeEvent();
    const result = await handler(event);
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toBe('Group is already cancelled');
  });

  it('should return 200 on successful cancel', async () => {
    // ownership SELECT returns group with this user as creator
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: TEST_GROUP_ID, creator_id: TEST_PROFILE_ID, status: 'active' }],
      rowCount: 1,
    });
    // BEGIN
    mockQuery.mockResolvedValueOnce({});
    // UPDATE groups SET status = 'cancelled'
    mockQuery.mockResolvedValueOnce({ rowCount: 1 });
    // DELETE FROM group_participants
    mockQuery.mockResolvedValueOnce({ rowCount: 3 });
    // COMMIT
    mockQuery.mockResolvedValueOnce({});

    const event = makeEvent();
    const result = await handler(event);
    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body)).toHaveProperty('success', true);
  });

  it('should call afterAuth hook (account status check)', async () => {
    (requireActiveAccount as jest.Mock).mockResolvedValue({
      statusCode: 403,
      headers: HEADERS,
      body: JSON.stringify({ message: 'Your account has been permanently banned.' }),
    });
    (isAccountError as unknown as jest.Mock).mockReturnValue(true);

    const event = makeEvent();
    const result = await handler(event);
    expect(result.statusCode).toBe(403);
  });

  it('should return 500 on database error', async () => {
    (getPool as jest.Mock).mockRejectedValue(new Error('Connection failed'));

    const event = makeEvent();
    const result = await handler(event);
    expect(result.statusCode).toBe(500);
    expect(JSON.parse(result.body).message).toBe('Internal server error');
  });

  it('should return 500 on transaction error', async () => {
    // ownership SELECT succeeds
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: TEST_GROUP_ID, creator_id: TEST_PROFILE_ID, status: 'active' }],
      rowCount: 1,
    });
    // connect for transaction
    mockConnect.mockResolvedValueOnce({
      query: jest.fn()
        .mockResolvedValueOnce({}) // BEGIN
        .mockRejectedValueOnce(new Error('Transaction failed')), // UPDATE fails
      release: mockRelease,
    });

    const event = makeEvent();
    const result = await handler(event);
    expect(result.statusCode).toBe(500);
  });
});

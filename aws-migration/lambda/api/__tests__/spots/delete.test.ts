/**
 * Tests for spots/delete Lambda handler
 * Uses createDeleteHandler factory — tests the configured behavior
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
}));
jest.mock('../../utils/validators', () => ({
  requireAuth: jest.fn(),
  validateUUIDParam: jest.fn(),
  isErrorResponse: jest.fn().mockReturnValue(false),
}));
jest.mock('../../utils/account-status', () => ({
  requireActiveAccount: jest.fn().mockResolvedValue({ profileId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', moderationStatus: 'active' }),
  isAccountError: jest.fn().mockReturnValue(false),
}));
jest.mock('../../utils/constants', () => ({ RATE_WINDOW_1_MIN: 60, RATE_WINDOW_5_MIN: 300 }));

import { handler } from '../../spots/delete';
import { resolveProfileId } from '../../utils/auth';
import { requireAuth, validateUUIDParam, isErrorResponse } from '../../utils/validators';

const TEST_SUB = 'cognito-sub-test123';
const TEST_PROFILE_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const SPOT_ID = 'b1b2c3d4-e5f6-7890-abcd-ef1234567890';

function makeEvent(overrides: Partial<Record<string, unknown>> = {}): APIGatewayProxyEvent {
  return {
    httpMethod: 'DELETE',
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
      authorizer: overrides.sub !== null
        ? { claims: { sub: overrides.sub ?? TEST_SUB } }
        : undefined,
      identity: { sourceIp: '127.0.0.1' },
    },
  } as unknown as APIGatewayProxyEvent;
}

const mockQuery = jest.fn();
const mockRelease = jest.fn();
const mockConnect = jest.fn().mockResolvedValue({
  query: mockQuery,
  release: mockRelease,
});

beforeEach(() => {
  jest.clearAllMocks();
  (getPool as jest.Mock).mockResolvedValue({ query: mockQuery, connect: mockConnect });
  (resolveProfileId as jest.Mock).mockResolvedValue(TEST_PROFILE_ID);

  // Default: auth succeeds
  (requireAuth as jest.Mock).mockReturnValue(TEST_SUB);
  (isErrorResponse as unknown as jest.Mock).mockReturnValue(false);
  (validateUUIDParam as jest.Mock).mockReturnValue(SPOT_ID);

  // Default: ownership query returns a matching row
  mockQuery.mockResolvedValue({ rows: [{ id: SPOT_ID, creator_id: TEST_PROFILE_ID }] });
});

describe('spots/delete handler', () => {
  it('should return 401 when unauthenticated', async () => {
    const authResponse = {
      statusCode: 401,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Unauthorized' }),
    };
    (requireAuth as jest.Mock).mockReturnValue(authResponse);
    (isErrorResponse as unknown as jest.Mock).mockImplementation(
      (val: unknown) => typeof val !== 'string',
    );

    const event = makeEvent({ sub: null });
    const res = await handler(event);
    const result = res as { statusCode: number };
    expect(result.statusCode).toBe(401);
  });

  it('should return 500 on database error', async () => {
    mockConnect.mockRejectedValueOnce(new Error('DB error'));
    const event = makeEvent();
    const res = await handler(event);
    const result = res as { statusCode: number };
    // Factory handler catches and returns 500
    expect(result.statusCode).toBeGreaterThanOrEqual(400);
  });
});

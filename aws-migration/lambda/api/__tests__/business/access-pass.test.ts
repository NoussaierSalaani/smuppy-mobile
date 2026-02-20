/**
 * Tests for business/access-pass Lambda handler
 * Authenticated endpoint — returns member QR code access pass
 */

import { APIGatewayProxyEvent } from 'aws-lambda';
import { handler } from '../../business/access-pass';

jest.mock('../../../shared/db', () => ({ getPool: jest.fn(), getReaderPool: jest.fn() }));
jest.mock('../../utils/logger', () => ({ createLogger: jest.fn(() => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(), initFromEvent: jest.fn(), setRequestId: jest.fn(), setUserId: jest.fn(), logRequest: jest.fn(), logResponse: jest.fn(), logQuery: jest.fn(), logSecurity: jest.fn(), child: jest.fn().mockReturnThis() })) }));
jest.mock('../../utils/cors', () => ({ createHeaders: jest.fn(() => ({ 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' })), getSecureHeaders: jest.fn(() => ({ 'Content-Type': 'application/json' })) }));
jest.mock('../../utils/auth', () => ({ getUserFromEvent: jest.fn(), resolveProfileId: jest.fn() }));
jest.mock('../../utils/security', () => ({ isValidUUID: jest.fn().mockReturnValue(true) }));
jest.mock('../../../shared/stripe-client', () => ({ getStripeClient: jest.fn() }));

const TEST_SUB = 'cognito-sub-test123';
const TEST_PROFILE_ID = 'profile-id-123';
const TEST_SUB_ID = 'c3d4e5f6-a7b8-9012-cdef-123456789012';

function makeEvent(overrides: Partial<Record<string, unknown>> = {}): APIGatewayProxyEvent {
  return {
    httpMethod: 'GET',
    headers: {},
    body: null,
    queryStringParameters: null,
    pathParameters: overrides.pathParameters as Record<string, string> ?? { subscriptionId: TEST_SUB_ID },
    multiValueHeaders: {},
    multiValueQueryStringParameters: null,
    isBase64Encoded: false,
    path: `/businesses/subscriptions/${TEST_SUB_ID}/access-pass`,
    resource: '/',
    stageVariables: null,
    requestContext: { requestId: 'test-req', authorizer: { claims: { sub: TEST_SUB } }, identity: { sourceIp: '127.0.0.1' } },
  } as unknown as APIGatewayProxyEvent;
}

describe('business/access-pass handler', () => {
  let mockPool: { query: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();
    mockPool = { query: jest.fn() };
    const { getPool } = require('../../../shared/db');
    (getPool as jest.Mock).mockResolvedValue(mockPool);
  });

  it('returns 401 when unauthenticated', async () => {
    const { getUserFromEvent } = require('../../utils/auth');
    (getUserFromEvent as jest.Mock).mockReturnValue(null);
    const result = await handler(makeEvent());
    expect(result.statusCode).toBe(401);
  });

  it('returns 404 when profile not found', async () => {
    const { getUserFromEvent, resolveProfileId } = require('../../utils/auth');
    (getUserFromEvent as jest.Mock).mockReturnValue({ id: TEST_SUB, sub: TEST_SUB });
    (resolveProfileId as jest.Mock).mockResolvedValue(null);
    const result = await handler(makeEvent());
    expect(result.statusCode).toBe(404);
  });

  it('returns 400 when subscriptionId is missing', async () => {
    const { getUserFromEvent, resolveProfileId } = require('../../utils/auth');
    (getUserFromEvent as jest.Mock).mockReturnValue({ id: TEST_SUB, sub: TEST_SUB });
    (resolveProfileId as jest.Mock).mockResolvedValue(TEST_PROFILE_ID);
    const result = await handler(makeEvent({ pathParameters: {} }));
    expect(result.statusCode).toBe(400);
  });

  it('returns 404 when subscription not found', async () => {
    const { getUserFromEvent, resolveProfileId } = require('../../utils/auth');
    (getUserFromEvent as jest.Mock).mockReturnValue({ id: TEST_SUB, sub: TEST_SUB });
    (resolveProfileId as jest.Mock).mockResolvedValue(TEST_PROFILE_ID);
    mockPool.query.mockResolvedValueOnce({ rows: [] });
    const result = await handler(makeEvent());
    expect(result.statusCode).toBe(404);
  });

  it('returns 200 with access pass on success', async () => {
    const { getUserFromEvent, resolveProfileId } = require('../../utils/auth');
    (getUserFromEvent as jest.Mock).mockReturnValue({ id: TEST_SUB, sub: TEST_SUB });
    (resolveProfileId as jest.Mock).mockResolvedValue(TEST_PROFILE_ID);
    mockPool.query.mockResolvedValueOnce({
      rows: [{
        id: TEST_SUB_ID, user_id: TEST_PROFILE_ID, business_id: 'biz1',
        service_id: 'svc1', status: 'active', current_period_end: '2025-12-31',
        sessions_used: 5, sessions_limit: 20,
        member_name: 'Alice', business_name: 'Gym A', business_logo: null,
        membership_type: 'Premium',
      }],
    });
    const result = await handler(makeEvent());
    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.success).toBe(true);
    expect(body.accessPass).toBeDefined();
    expect(body.accessPass.memberName).toBe('Alice');
    expect(body.accessPass.remainingSessions).toBe(15);
  });

  it('returns 500 on unexpected error', async () => {
    const { getUserFromEvent, resolveProfileId } = require('../../utils/auth');
    (getUserFromEvent as jest.Mock).mockReturnValue({ id: TEST_SUB, sub: TEST_SUB });
    (resolveProfileId as jest.Mock).mockResolvedValue(TEST_PROFILE_ID);
    mockPool.query.mockRejectedValueOnce(new Error('DB error'));
    const result = await handler(makeEvent());
    expect(result.statusCode).toBe(500);
  });
});

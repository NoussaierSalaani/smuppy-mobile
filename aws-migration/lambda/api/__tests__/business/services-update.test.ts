/**
 * Tests for business/services-update Lambda handler
 */

import { APIGatewayProxyEvent } from 'aws-lambda';
import { handler } from '../../business/services-update';

jest.mock('../../../shared/db', () => ({ getPool: jest.fn(), getReaderPool: jest.fn() }));
jest.mock('../../utils/rate-limit', () => ({ checkRateLimit: jest.fn().mockResolvedValue({ allowed: true }), requireRateLimit: jest.fn().mockResolvedValue(null) }));
jest.mock('../../utils/logger', () => ({ createLogger: jest.fn(() => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(), initFromEvent: jest.fn(), setRequestId: jest.fn(), setUserId: jest.fn(), logRequest: jest.fn(), logResponse: jest.fn(), logQuery: jest.fn(), logSecurity: jest.fn(), child: jest.fn().mockReturnThis() })) }));
jest.mock('../../utils/cors', () => ({ createHeaders: jest.fn(() => ({ 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' })), getSecureHeaders: jest.fn(() => ({ 'Content-Type': 'application/json' })) }));
jest.mock('../../utils/auth', () => ({ getUserFromEvent: jest.fn() }));
jest.mock('../../utils/security', () => ({ isValidUUID: jest.fn().mockReturnValue(true) }));

const TEST_SUB = 'cognito-sub-test123';
const TEST_SERVICE_ID = 'b2c3d4e5-f6a7-8901-bcde-f12345678901';

function makeEvent(overrides: Partial<Record<string, unknown>> = {}): APIGatewayProxyEvent {
  return {
    httpMethod: 'PATCH',
    headers: {},
    body: overrides.body as string ?? null,
    queryStringParameters: null,
    pathParameters: overrides.pathParameters as Record<string, string> ?? { serviceId: TEST_SERVICE_ID },
    multiValueHeaders: {},
    multiValueQueryStringParameters: null,
    isBase64Encoded: false,
    path: `/businesses/my/services/${TEST_SERVICE_ID}`,
    resource: '/',
    stageVariables: null,
    requestContext: { requestId: 'test-req', authorizer: { claims: { sub: TEST_SUB } }, identity: { sourceIp: '127.0.0.1' } },
  } as unknown as APIGatewayProxyEvent;
}

describe('business/services-update handler', () => {
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

  it('returns 400 when serviceId is invalid', async () => {
    const { getUserFromEvent } = require('../../utils/auth');
    (getUserFromEvent as jest.Mock).mockReturnValue({ id: TEST_SUB, sub: TEST_SUB });
    const { isValidUUID } = require('../../utils/security');
    (isValidUUID as jest.Mock).mockReturnValueOnce(false);
    const result = await handler(makeEvent({ pathParameters: { serviceId: 'bad' }, body: JSON.stringify({ name: 'New' }) }));
    expect(result.statusCode).toBe(400);
  });

  it('returns 400 when no fields to update', async () => {
    const { getUserFromEvent } = require('../../utils/auth');
    (getUserFromEvent as jest.Mock).mockReturnValue({ id: TEST_SUB, sub: TEST_SUB });
    const result = await handler(makeEvent({ body: JSON.stringify({}) }));
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toBe('No fields to update');
  });

  it('returns 404 when service not found (ownership check)', async () => {
    const { getUserFromEvent } = require('../../utils/auth');
    (getUserFromEvent as jest.Mock).mockReturnValue({ id: TEST_SUB, sub: TEST_SUB });
    mockPool.query.mockResolvedValueOnce({ rows: [] }); // ownership check
    const result = await handler(makeEvent({ body: JSON.stringify({ name: 'Updated' }) }));
    expect(result.statusCode).toBe(404);
  });

  it('returns 200 on successful update', async () => {
    const { getUserFromEvent } = require('../../utils/auth');
    (getUserFromEvent as jest.Mock).mockReturnValue({ id: TEST_SUB, sub: TEST_SUB });
    mockPool.query
      .mockResolvedValueOnce({ rows: [{ id: TEST_SERVICE_ID }] }) // ownership
      .mockResolvedValueOnce({
        rows: [{
          id: TEST_SERVICE_ID, name: 'Updated', description: null, category: 'drop_in',
          price_cents: 3000, duration_minutes: 60, is_subscription: false,
          subscription_period: null, trial_days: 0, max_capacity: null,
          entries_total: null, is_active: true, created_at: '2025-01-01', updated_at: '2025-01-02',
        }],
      });
    const result = await handler(makeEvent({ body: JSON.stringify({ name: 'Updated', price_cents: 3000 }) }));
    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.success).toBe(true);
    expect(body.service).toBeDefined();
  });
});

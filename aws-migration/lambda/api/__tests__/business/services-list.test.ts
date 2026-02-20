/**
 * Tests for business/services-list Lambda handler
 * Public endpoint for listing business services
 */

import { APIGatewayProxyEvent } from 'aws-lambda';
import { handler } from '../../business/services-list';

jest.mock('../../../shared/db', () => ({ getPool: jest.fn(), getReaderPool: jest.fn() }));
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

const TEST_BIZ_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

function makeEvent(overrides: Partial<Record<string, unknown>> = {}): APIGatewayProxyEvent {
  return {
    httpMethod: overrides.httpMethod as string ?? 'GET',
    headers: {},
    body: null,
    queryStringParameters: overrides.queryStringParameters as Record<string, string> ?? null,
    pathParameters: overrides.pathParameters as Record<string, string> ?? { businessId: TEST_BIZ_ID },
    multiValueHeaders: {},
    multiValueQueryStringParameters: null,
    isBase64Encoded: false,
    path: `/businesses/${TEST_BIZ_ID}/services`,
    resource: '/',
    stageVariables: null,
    requestContext: { requestId: 'test-req', identity: { sourceIp: '127.0.0.1' } },
  } as unknown as APIGatewayProxyEvent;
}

describe('business/services-list handler', () => {
  let mockPool: { query: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();
    mockPool = { query: jest.fn() };
    const { getPool } = require('../../../shared/db');
    (getPool as jest.Mock).mockResolvedValue(mockPool);
  });

  it('returns 204 for OPTIONS preflight', async () => {
    const result = await handler(makeEvent({ httpMethod: 'OPTIONS' }));
    expect(result.statusCode).toBe(204);
  });

  it('returns 400 when businessId missing', async () => {
    // businessId is undefined (missing from pathParameters), so !businessId short-circuits
    const result = await handler(makeEvent({ pathParameters: {} }));
    expect(result.statusCode).toBe(400);
  });

  it('returns 200 with services list', async () => {
    mockPool.query.mockResolvedValueOnce({
      rows: [{
        id: 's1', name: 'Yoga', description: 'desc', category: 'drop_in',
        price_cents: 2000, duration_minutes: 60, max_capacity: 20,
        is_subscription: false, subscription_period: null, trial_days: 0,
        entries_total: null, image_url: null, is_active: true, created_at: '2025-01-01',
      }],
    });
    const result = await handler(makeEvent());
    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.success).toBe(true);
    expect(body.services).toHaveLength(1);
    expect(body.services[0].name).toBe('Yoga');
  });

  it('returns 500 on DB error', async () => {
    mockPool.query.mockRejectedValueOnce(new Error('DB error'));
    const result = await handler(makeEvent());
    expect(result.statusCode).toBe(500);
  });
});

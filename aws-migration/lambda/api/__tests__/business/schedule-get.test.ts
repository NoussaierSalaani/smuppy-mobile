/**
 * Tests for business/schedule-get Lambda handler
 * Public endpoint — returns weekly schedule for a business
 */

import { APIGatewayProxyEvent } from 'aws-lambda';
import { handler } from '../../business/schedule-get';

jest.mock('../../../shared/db', () => ({ getPool: jest.fn(), getReaderPool: jest.fn() }));
jest.mock('../../utils/rate-limit', () => ({ checkRateLimit: jest.fn().mockResolvedValue({ allowed: true }), requireRateLimit: jest.fn().mockResolvedValue(null) }));
jest.mock('../../utils/logger', () => ({ createLogger: jest.fn(() => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(), initFromEvent: jest.fn(), setRequestId: jest.fn(), setUserId: jest.fn(), logRequest: jest.fn(), logResponse: jest.fn(), logQuery: jest.fn(), logSecurity: jest.fn(), child: jest.fn().mockReturnThis() })) }));
jest.mock('../../utils/cors', () => ({ createHeaders: jest.fn(() => ({ 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' })), getSecureHeaders: jest.fn(() => ({ 'Content-Type': 'application/json' })) }));
jest.mock('../../utils/auth', () => ({ getUserFromEvent: jest.fn() }));
jest.mock('../../utils/security', () => ({ isValidUUID: jest.fn().mockReturnValue(true) }));

const TEST_BIZ_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

function makeEvent(overrides: Partial<Record<string, unknown>> = {}): APIGatewayProxyEvent {
  return {
    httpMethod: 'GET',
    headers: {},
    body: null,
    queryStringParameters: null,
    pathParameters: overrides.pathParameters as Record<string, string> ?? { businessId: TEST_BIZ_ID },
    multiValueHeaders: {},
    multiValueQueryStringParameters: null,
    isBase64Encoded: false,
    path: `/businesses/${TEST_BIZ_ID}/schedule`,
    resource: '/',
    stageVariables: null,
    requestContext: { requestId: 'test-req', identity: { sourceIp: '127.0.0.1' } },
  } as unknown as APIGatewayProxyEvent;
}

describe('business/schedule-get handler', () => {
  let mockPool: { query: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();
    mockPool = { query: jest.fn() };
    const { getPool } = require('../../../shared/db');
    (getPool as jest.Mock).mockResolvedValue(mockPool);
  });

  it('returns 400 when businessId is invalid', async () => {
    // businessId is undefined (missing from pathParameters), so !businessId short-circuits
    const result = await handler(makeEvent({ pathParameters: {} }));
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toBe('Valid businessId is required');
  });

  it('returns 200 with empty activities list', async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [] });
    const result = await handler(makeEvent());
    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.success).toBe(true);
    expect(body.activities).toEqual([]);
  });

  it('returns 200 with schedule activities', async () => {
    mockPool.query.mockResolvedValueOnce({
      rows: [{
        id: 'slot1', day_of_week: 1, start_time: '09:00:00', end_time: '10:00:00',
        instructor: 'John', max_participants: 20,
        activity_id: 'a1', activity_name: 'Yoga', category: 'fitness',
        duration_minutes: 60, color: '#FF0000',
      }],
    });
    const result = await handler(makeEvent());
    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.activities).toHaveLength(1);
    expect(body.activities[0].startTime).toBe('09:00');
    expect(body.activities[0].endTime).toBe('10:00');
    expect(body.activities[0].activityName).toBe('Yoga');
  });

  it('returns 500 on DB error', async () => {
    mockPool.query.mockRejectedValueOnce(new Error('DB error'));
    const result = await handler(makeEvent());
    expect(result.statusCode).toBe(500);
  });
});

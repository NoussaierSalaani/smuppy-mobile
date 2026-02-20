/**
 * Tests for business/availability Lambda handler
 * Public endpoint — returns available time slots for a service and date
 */

import { APIGatewayProxyEvent } from 'aws-lambda';
import { handler } from '../../business/availability';

jest.mock('../../../shared/db', () => ({ getPool: jest.fn(), getReaderPool: jest.fn() }));
jest.mock('../../utils/logger', () => ({ createLogger: jest.fn(() => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(), initFromEvent: jest.fn(), setRequestId: jest.fn(), setUserId: jest.fn(), logRequest: jest.fn(), logResponse: jest.fn(), logQuery: jest.fn(), logSecurity: jest.fn(), child: jest.fn().mockReturnThis() })) }));
jest.mock('../../utils/cors', () => ({ createHeaders: jest.fn(() => ({ 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' })), getSecureHeaders: jest.fn(() => ({ 'Content-Type': 'application/json' })) }));
jest.mock('../../utils/security', () => ({ isValidUUID: jest.fn().mockReturnValue(true) }));

const TEST_BIZ_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const TEST_SERVICE_ID = 'b2c3d4e5-f6a7-8901-bcde-f12345678901';

function makeEvent(overrides: Partial<Record<string, unknown>> = {}): APIGatewayProxyEvent {
  return {
    httpMethod: overrides.httpMethod as string ?? 'GET',
    headers: {},
    body: null,
    queryStringParameters: overrides.queryStringParameters as Record<string, string> ?? { serviceId: TEST_SERVICE_ID, date: '2025-06-15' },
    pathParameters: overrides.pathParameters as Record<string, string> ?? { businessId: TEST_BIZ_ID },
    multiValueHeaders: {},
    multiValueQueryStringParameters: null,
    isBase64Encoded: false,
    path: `/businesses/${TEST_BIZ_ID}/availability`,
    resource: '/',
    stageVariables: null,
    requestContext: { requestId: 'test-req', identity: { sourceIp: '127.0.0.1' } },
  } as unknown as APIGatewayProxyEvent;
}

describe('business/availability handler', () => {
  let mockPool: { query: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();
    mockPool = { query: jest.fn() };
    const { getPool } = require('../../../shared/db');
    (getPool as jest.Mock).mockResolvedValue(mockPool);
    const { isValidUUID } = require('../../utils/security');
    (isValidUUID as jest.Mock).mockReturnValue(true);
  });

  it('returns 204 for OPTIONS preflight', async () => {
    const result = await handler(makeEvent({ httpMethod: 'OPTIONS' }));
    expect(result.statusCode).toBe(204);
  });

  it('returns 400 when businessId is invalid', async () => {
    // businessId is undefined (missing from pathParameters), so !businessId short-circuits
    const result = await handler(makeEvent({ pathParameters: {} }));
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toBe('Valid businessId is required');
  });

  it('returns 400 when serviceId is missing', async () => {
    // serviceId is undefined (missing from queryStringParameters), so !serviceId short-circuits
    const result = await handler(makeEvent({ queryStringParameters: { date: '2025-06-15' } }));
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toBe('Valid serviceId is required');
  });

  it('returns 400 when date format is invalid', async () => {
    const result = await handler(makeEvent({
      queryStringParameters: { serviceId: TEST_SERVICE_ID, date: 'bad-date' },
    }));
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toBe('Date must be in YYYY-MM-DD format');
  });

  it('returns 200 with available slots', async () => {
    // Schedule slots query
    mockPool.query
      .mockResolvedValueOnce({
        rows: [{
          id: 'slot1', start_time: '09:00:00', end_time: '10:00:00',
          instructor: 'John', max_participants: 20,
          activity_name: 'Yoga', duration_minutes: 60, color: '#FF0000',
        }],
      })
      // Booking counts query
      .mockResolvedValueOnce({
        rows: [{ slot_time: '09:00', booked: '5' }],
      });

    const result = await handler(makeEvent());
    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.success).toBe(true);
    expect(body.slots).toHaveLength(1);
    expect(body.slots[0].startTime).toBe('09:00');
    expect(body.slots[0].booked).toBe(5);
    expect(body.slots[0].spotsLeft).toBe(15);
    expect(body.slots[0].available).toBe(true);
  });

  it('returns slot as unavailable when fully booked', async () => {
    mockPool.query
      .mockResolvedValueOnce({
        rows: [{
          id: 'slot1', start_time: '09:00:00', end_time: '10:00:00',
          instructor: null, max_participants: 10,
          activity_name: 'Pilates', duration_minutes: 45, color: null,
        }],
      })
      .mockResolvedValueOnce({
        rows: [{ slot_time: '09:00', booked: '10' }],
      });

    const result = await handler(makeEvent());
    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.slots[0].spotsLeft).toBe(0);
    expect(body.slots[0].available).toBe(false);
  });

  it('returns 500 on DB error', async () => {
    mockPool.query.mockRejectedValueOnce(new Error('DB error'));
    const result = await handler(makeEvent());
    expect(result.statusCode).toBe(500);
  });
});

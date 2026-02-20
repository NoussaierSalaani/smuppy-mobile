/**
 * Tests for business/services-delete Lambda handler
 */

import { APIGatewayProxyEvent } from 'aws-lambda';
import { handler } from '../../business/services-delete';

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
    httpMethod: 'DELETE',
    headers: {},
    body: null,
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

describe('business/services-delete handler', () => {
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
    const result = await handler(makeEvent({ pathParameters: { serviceId: 'bad' } }));
    expect(result.statusCode).toBe(400);
  });

  it('returns 404 when service not found', async () => {
    const { getUserFromEvent } = require('../../utils/auth');
    (getUserFromEvent as jest.Mock).mockReturnValue({ id: TEST_SUB, sub: TEST_SUB });
    mockPool.query.mockResolvedValueOnce({ rows: [] });
    const result = await handler(makeEvent());
    expect(result.statusCode).toBe(404);
  });

  it('returns 200 on successful soft delete', async () => {
    const { getUserFromEvent } = require('../../utils/auth');
    (getUserFromEvent as jest.Mock).mockReturnValue({ id: TEST_SUB, sub: TEST_SUB });
    mockPool.query.mockResolvedValueOnce({ rows: [{ id: TEST_SERVICE_ID }] });
    const result = await handler(makeEvent());
    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body).success).toBe(true);
  });
});

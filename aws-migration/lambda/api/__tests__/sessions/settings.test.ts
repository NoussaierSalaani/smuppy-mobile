/**
 * Tests for sessions/settings Lambda handler
 */

import { APIGatewayProxyEvent } from 'aws-lambda';
import { getPool } from '../../../shared/db';

jest.mock('../../../shared/db', () => ({
  getPool: jest.fn(),
  corsHeaders: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
}));
jest.mock('../../utils/logger', () => ({
  createLogger: jest.fn(() => ({
    info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(),
    initFromEvent: jest.fn(), setRequestId: jest.fn(), setUserId: jest.fn(),
    logRequest: jest.fn(), logResponse: jest.fn(), logQuery: jest.fn(),
    logSecurity: jest.fn(), child: jest.fn().mockReturnThis(),
  })),
}));
jest.mock('../../utils/constants', () => ({
  MIN_SESSION_DURATION_MINUTES: 15,
  MAX_SESSION_DURATION_MINUTES: 480,
  MAX_SESSION_PRICE_CENTS: 10000,
}));
jest.mock('../../utils/cors', () => ({
  createHeaders: jest.fn(() => ({ 'Content-Type': 'application/json' })),
  getSecureHeaders: jest.fn(() => ({ 'Content-Type': 'application/json' })),
}));

import { handler } from '../../sessions/settings';

const TEST_SUB = 'cognito-sub-test123';

function makeEvent(overrides: Partial<Record<string, unknown>> = {}): APIGatewayProxyEvent {
  return {
    httpMethod: overrides.httpMethod as string ?? 'PUT',
    headers: {},
    body: overrides.body as string ?? JSON.stringify({ sessionsEnabled: true }),
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

const mockQuery = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  (getPool as jest.Mock).mockResolvedValue({ query: mockQuery });
});

describe('sessions/settings handler', () => {
  it('should return 401 when unauthenticated', async () => {
    const event = makeEvent({ sub: null });
    const res = await handler(event, {} as never, () => {});
    const result = res as { statusCode: number };
    expect(result.statusCode).toBe(401);
  });

  it('should return 404 when profile not found', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const event = makeEvent();
    const res = await handler(event, {} as never, () => {});
    const result = res as { statusCode: number };
    expect(result.statusCode).toBe(404);
  });

  it('should return 403 when not pro_creator', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'profile-1', account_type: 'personal' }] });
    const event = makeEvent();
    const res = await handler(event, {} as never, () => {});
    const result = res as { statusCode: number };
    expect(result.statusCode).toBe(403);
  });

  it('should return 400 when no updates provided', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'profile-1', account_type: 'pro_creator' }] });
    const event = makeEvent({ body: JSON.stringify({}) });
    const res = await handler(event, {} as never, () => {});
    const result = res as { statusCode: number };
    expect(result.statusCode).toBe(400);
  });

  it('should return 400 for invalid price', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'profile-1', account_type: 'pro_creator' }] });
    const event = makeEvent({ body: JSON.stringify({ sessionPrice: -1 }) });
    const res = await handler(event, {} as never, () => {});
    const result = res as { statusCode: number };
    expect(result.statusCode).toBe(400);
  });

  it('should return 400 for invalid duration', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'profile-1', account_type: 'pro_creator' }] });
    const event = makeEvent({ body: JSON.stringify({ sessionDuration: 5 }) });
    const res = await handler(event, {} as never, () => {});
    const result = res as { statusCode: number };
    expect(result.statusCode).toBe(400);
  });

  it('should return 200 on successful update', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 'profile-1', account_type: 'pro_creator' }] })
      .mockResolvedValueOnce({
        rows: [{
          sessions_enabled: true, session_price: '25.00',
          session_duration: 30, session_availability: null, timezone: 'Europe/Paris',
        }],
      });
    const event = makeEvent({ body: JSON.stringify({ sessionsEnabled: true }) });
    const res = await handler(event, {} as never, () => {});
    const result = res as { statusCode: number; body: string };
    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body).success).toBe(true);
  });

  it('should return 500 on database error', async () => {
    mockQuery.mockRejectedValueOnce(new Error('DB error'));
    const event = makeEvent();
    const res = await handler(event, {} as never, () => {});
    const result = res as { statusCode: number };
    expect(result.statusCode).toBe(500);
  });
});

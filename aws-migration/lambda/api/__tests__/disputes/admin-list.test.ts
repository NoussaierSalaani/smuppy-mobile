/**
 * Tests for disputes/admin-list Lambda handler
 */

import { APIGatewayProxyEvent } from 'aws-lambda';
import { getPool } from '../../../shared/db';

jest.mock('../../../shared/db', () => ({ getPool: jest.fn(), getReaderPool: jest.fn() }));
jest.mock('../../utils/rate-limit', () => ({ requireRateLimit: jest.fn().mockResolvedValue(null) }));
jest.mock('../../utils/logger', () => ({
  createLogger: jest.fn(() => ({
    info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(),
    initFromEvent: jest.fn(), child: jest.fn().mockReturnThis(),
  })),
}));
jest.mock('../../utils/cors', () => ({
  createHeaders: jest.fn(() => ({ 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' })),
}));
jest.mock('../../utils/auth', () => ({ getUserFromEvent: jest.fn() }));
jest.mock('../../utils/dispute-helpers', () => ({
  parseOffsetCursor: jest.fn().mockReturnValue({ offset: 0, parsedLimit: 50 }),
  deriveOffsetPage: jest.fn().mockImplementation((rows, limit) => ({
    data: rows.slice(0, limit),
    nextCursor: rows.length > limit ? String(limit) : null,
    hasMore: rows.length > limit,
  })),
  DISPUTE_STATUS_ORDER_SQL: `CASE d.status WHEN 'open' THEN 1 ELSE 2 END`,
  mapDisputeBase: jest.fn().mockImplementation((d) => ({
    id: d.id,
    disputeNumber: d.dispute_number,
    type: d.type,
    status: d.status,
    priority: d.priority,
    createdAt: d.created_at,
    amount: (d.amount_cents || 0) / 100,
    currency: d.currency,
  })),
}));

import { handler } from '../../disputes/admin-list';
import { getUserFromEvent } from '../../utils/auth';
import { requireRateLimit } from '../../utils/rate-limit';

const TEST_USER_ID = 'admin-user-id';

function makeEvent(overrides: Partial<Record<string, unknown>> = {}): APIGatewayProxyEvent {
  return {
    httpMethod: overrides.httpMethod as string ?? 'GET',
    headers: {},
    body: null,
    queryStringParameters: overrides.queryStringParameters as Record<string, string> ?? null,
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
        ? { claims: { sub: overrides.sub ?? 'cognito-sub-admin' } }
        : undefined,
      identity: { sourceIp: '127.0.0.1' },
    },
  } as unknown as APIGatewayProxyEvent;
}

describe('disputes/admin-list handler', () => {
  let mockDb: { query: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();
    mockDb = { query: jest.fn().mockResolvedValue({ rows: [] }) };
    (getPool as jest.Mock).mockResolvedValue(mockDb);
    (getUserFromEvent as jest.Mock).mockResolvedValue({ id: TEST_USER_ID });
    (requireRateLimit as jest.Mock).mockResolvedValue(null);
  });

  it('should return 204 for OPTIONS', async () => {
    const result = await handler(makeEvent({ httpMethod: 'OPTIONS' }), {} as never, {} as never);
    expect(result!.statusCode).toBe(204);
  });

  it('should return 405 for POST', async () => {
    const result = await handler(makeEvent({ httpMethod: 'POST' }), {} as never, {} as never);
    expect(result!.statusCode).toBe(405);
  });

  it('should return 401 when no auth', async () => {
    (getUserFromEvent as jest.Mock).mockResolvedValueOnce(null);
    const result = await handler(makeEvent(), {} as never, {} as never);
    expect(result!.statusCode).toBe(401);
  });

  it('should return 403 when user is not admin', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ account_type: 'personal' }] });
    const result = await handler(makeEvent(), {} as never, {} as never);
    expect(result!.statusCode).toBe(403);
    expect(JSON.parse(result!.body).message).toContain('Admin access required');
  });

  it('should return 200 with disputes and stats for admin', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ account_type: 'admin' }] }) // admin check
      .mockResolvedValueOnce({ rows: [] }) // disputes query
      .mockResolvedValueOnce({ rows: [{ total: '5', open: '2', under_review: '1', resolved: '2', avg_resolution_hours: '12.5' }] }); // stats

    const result = await handler(makeEvent(), {} as never, {} as never);
    expect(result!.statusCode).toBe(200);
    const body = JSON.parse(result!.body);
    expect(body.success).toBe(true);
    expect(body.stats).toBeDefined();
    expect(body.stats.total).toBe(5);
  });

  it('should return 500 on database error', async () => {
    mockDb.query.mockRejectedValueOnce(new Error('DB error'));
    (getUserFromEvent as jest.Mock).mockResolvedValue({ id: TEST_USER_ID });
    const result = await handler(makeEvent(), {} as never, {} as never);
    expect(result!.statusCode).toBe(500);
  });
});

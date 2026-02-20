/**
 * Tests for disputes/admin-resolve Lambda handler
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
jest.mock('../../../shared/stripe-client', () => ({
  getStripeClient: jest.fn().mockResolvedValue({
    refunds: {
      create: jest.fn().mockResolvedValue({ id: 're_123', status: 'succeeded' }),
    },
  }),
}));

import { handler } from '../../disputes/admin-resolve';
import { getUserFromEvent } from '../../utils/auth';
import { requireRateLimit } from '../../utils/rate-limit';

const VALID_DISPUTE_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const TEST_USER_ID = 'admin-user-id';

function makeEvent(overrides: Partial<Record<string, unknown>> = {}): APIGatewayProxyEvent {
  return {
    httpMethod: overrides.httpMethod as string ?? 'POST',
    headers: {},
    body: overrides.body as string ?? JSON.stringify({
      resolution: 'full_refund',
      reason: 'Creator was not present during the session',
      refundAmount: 50,
      processRefund: true,
    }),
    queryStringParameters: null,
    pathParameters: overrides.pathParameters as Record<string, string> ?? { id: VALID_DISPUTE_ID },
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

describe('disputes/admin-resolve handler', () => {
  let mockDb: { query: jest.Mock; connect: jest.Mock };
  let mockClient: { query: jest.Mock; release: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();
    mockClient = {
      query: jest.fn().mockResolvedValue({ rows: [] }),
      release: jest.fn(),
    };
    mockDb = {
      query: jest.fn().mockResolvedValue({ rows: [] }),
      connect: jest.fn().mockResolvedValue(mockClient),
    };
    (getPool as jest.Mock).mockResolvedValue(mockDb);
    (getUserFromEvent as jest.Mock).mockResolvedValue({ id: TEST_USER_ID });
    (requireRateLimit as jest.Mock).mockResolvedValue(null);
  });

  it('should return 204 for OPTIONS', async () => {
    const result = await handler(makeEvent({ httpMethod: 'OPTIONS' }), {} as never, {} as never);
    expect(result!.statusCode).toBe(204);
  });

  it('should return 405 for GET', async () => {
    const result = await handler(makeEvent({ httpMethod: 'GET' }), {} as never, {} as never);
    expect(result!.statusCode).toBe(405);
  });

  it('should return 400 when dispute ID is invalid', async () => {
    const result = await handler(makeEvent({ pathParameters: { id: 'bad' } }), {} as never, {} as never);
    expect(result!.statusCode).toBe(400);
  });

  it('should return 401 when no auth', async () => {
    (getUserFromEvent as jest.Mock).mockResolvedValueOnce(null);
    const result = await handler(makeEvent(), {} as never, {} as never);
    expect(result!.statusCode).toBe(401);
  });

  it('should return 403 when user is not admin', async () => {
    mockClient.query.mockResolvedValueOnce({ rows: [{ account_type: 'personal' }] });
    const result = await handler(makeEvent(), {} as never, {} as never);
    expect(result!.statusCode).toBe(403);
  });

  it('should return 400 when resolution or reason is missing', async () => {
    mockClient.query.mockResolvedValueOnce({ rows: [{ account_type: 'admin' }] });
    const result = await handler(makeEvent({
      body: JSON.stringify({ resolution: 'full_refund' }),
    }), {} as never, {} as never);
    expect(result!.statusCode).toBe(400);
  });

  it('should return 400 for invalid resolution type', async () => {
    mockClient.query.mockResolvedValueOnce({ rows: [{ account_type: 'admin' }] });
    const result = await handler(makeEvent({
      body: JSON.stringify({ resolution: 'invalid', reason: 'test', refundAmount: 0, processRefund: false }),
    }), {} as never, {} as never);
    expect(result!.statusCode).toBe(400);
  });

  it('should return 404 when dispute not found', async () => {
    mockClient.query
      .mockResolvedValueOnce({ rows: [{ account_type: 'admin' }] }) // admin check
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [] }); // dispute not found
    const result = await handler(makeEvent(), {} as never, {} as never);
    expect(result!.statusCode).toBe(404);
  });

  it('should return 400 when dispute is already resolved', async () => {
    mockClient.query
      .mockResolvedValueOnce({ rows: [{ account_type: 'admin' }] })
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [{
        id: VALID_DISPUTE_ID,
        status: 'resolved',
        dispute_number: 'D-001',
        payment_id: 'pay-1',
        complainant_id: 'comp-1',
        respondent_id: 'resp-1',
        amount_cents: 5000,
        currency: 'eur',
        stripe_payment_intent_id: 'pi_123',
        creator_stripe_account: null,
      }] });
    const result = await handler(makeEvent(), {} as never, {} as never);
    expect(result!.statusCode).toBe(400);
    expect(JSON.parse(result!.body).message).toContain('already resolved');
  });

  it('should return 500 on database error', async () => {
    mockClient.query.mockRejectedValueOnce(new Error('DB error'));
    const result = await handler(makeEvent(), {} as never, {} as never);
    expect(result!.statusCode).toBe(500);
    expect(mockClient.release).toHaveBeenCalled();
  });
});

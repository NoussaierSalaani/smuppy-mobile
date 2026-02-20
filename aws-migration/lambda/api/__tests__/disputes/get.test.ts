/**
 * Tests for disputes/get Lambda handler
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
jest.mock('../../utils/security', () => ({
  isValidUUID: jest.fn((uuid: string) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(uuid)
  ),
}));

import { handler } from '../../disputes/get';
import { getUserFromEvent } from '../../utils/auth';
import { requireRateLimit } from '../../utils/rate-limit';

const VALID_DISPUTE_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const VALID_PROFILE_ID = 'b2c3d4e5-f6a7-8901-bcde-f12345678901';
const TEST_USER_ID = 'cognito-sub-123';

function makeEvent(overrides: Partial<Record<string, unknown>> = {}): APIGatewayProxyEvent {
  return {
    httpMethod: overrides.httpMethod as string ?? 'GET',
    headers: {},
    body: null,
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
        ? { claims: { sub: overrides.sub ?? TEST_USER_ID } }
        : undefined,
      identity: { sourceIp: '127.0.0.1' },
    },
  } as unknown as APIGatewayProxyEvent;
}

describe('disputes/get handler', () => {
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

  it('should return 400 when dispute ID is missing', async () => {
    const result = await handler(makeEvent({ pathParameters: {} }), {} as never, {} as never);
    expect(result!.statusCode).toBe(400);
  });

  it('should return 400 when dispute ID is not valid UUID', async () => {
    const result = await handler(makeEvent({ pathParameters: { id: 'bad' } }), {} as never, {} as never);
    expect(result!.statusCode).toBe(400);
  });

  it('should return 401 when no auth', async () => {
    (getUserFromEvent as jest.Mock).mockResolvedValueOnce(null);
    const result = await handler(makeEvent(), {} as never, {} as never);
    expect(result!.statusCode).toBe(401);
  });

  it('should return 429 when rate limited', async () => {
    (requireRateLimit as jest.Mock).mockResolvedValueOnce({
      statusCode: 429, headers: {}, body: JSON.stringify({ message: 'Rate limited' }),
    });
    const result = await handler(makeEvent(), {} as never, {} as never);
    expect(result!.statusCode).toBe(429);
  });

  it('should return 404 when profile not found', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] }); // profile lookup
    const result = await handler(makeEvent(), {} as never, {} as never);
    expect(result!.statusCode).toBe(404);
    expect(JSON.parse(result!.body).message).toBe('Profile not found');
  });

  it('should return 404 when dispute not found', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: VALID_PROFILE_ID, account_type: 'personal' }] }) // profile
      .mockResolvedValueOnce({ rows: [] }); // dispute not found
    const result = await handler(makeEvent(), {} as never, {} as never);
    expect(result!.statusCode).toBe(404);
    expect(JSON.parse(result!.body).message).toBe('Dispute not found');
  });

  it('should return 403 when user is not a party to the dispute', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: VALID_PROFILE_ID, account_type: 'personal' }] })
      .mockResolvedValueOnce({ rows: [{
        id: VALID_DISPUTE_ID,
        complainant_id: 'other-id-1',
        respondent_id: 'other-id-2',
        session_id: 'session-1',
      }] });
    const result = await handler(makeEvent(), {} as never, {} as never);
    expect(result!.statusCode).toBe(403);
  });

  it('should return 200 with dispute data when user is complainant', async () => {
    const disputeRow = {
      id: VALID_DISPUTE_ID,
      dispute_number: 'D-001',
      type: 'no_show',
      status: 'open',
      priority: 'normal',
      created_at: '2026-01-01',
      resolved_at: null,
      resolution: null,
      resolution_reason: null,
      evidence_deadline: '2026-01-03',
      amount_cents: 5000,
      refund_amount_cents: null,
      currency: 'eur',
      complainant_id: VALID_PROFILE_ID,
      respondent_id: 'resp-id',
      session_id: 'session-1',
      payment_id: 'pay-1',
      complainant_description: 'No show',
      respondent_response: null,
      auto_verification: {},
      session_date: '2026-01-01',
      session_duration: 30,
      creator_notes: null,
      complainant_username: 'user1',
      complainant_avatar: null,
      complainant_email: 'user1@test.com',
      respondent_username: 'user2',
      respondent_avatar: null,
      respondent_email: 'user2@test.com',
      stripe_payment_intent_id: 'pi_123',
      payment_status: 'succeeded',
    };

    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: VALID_PROFILE_ID, account_type: 'personal' }] })
      .mockResolvedValueOnce({ rows: [disputeRow] })
      // Promise.all: evidence, logs, messages, timeline
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const result = await handler(makeEvent(), {} as never, {} as never);
    expect(result!.statusCode).toBe(200);
    const body = JSON.parse(result!.body);
    expect(body.success).toBe(true);
    expect(body.dispute.id).toBe(VALID_DISPUTE_ID);
    expect(body.dispute.userRole).toBe('complainant');
  });

  it('should return 500 on database error', async () => {
    mockDb.query.mockRejectedValueOnce(new Error('DB error'));
    (getUserFromEvent as jest.Mock).mockResolvedValue({ id: TEST_USER_ID });
    const result = await handler(makeEvent(), {} as never, {} as never);
    expect(result!.statusCode).toBe(500);
  });
});

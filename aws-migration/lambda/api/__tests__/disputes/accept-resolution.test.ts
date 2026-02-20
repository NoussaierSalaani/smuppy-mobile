/**
 * Tests for disputes/accept-resolution Lambda handler
 *
 * POST /disputes/{id}/accept
 * Allows the complainant to accept a dispute resolution,
 * transitioning the dispute to 'closed' status.
 */

jest.mock('../../../shared/db', () => ({ getPool: jest.fn(), getReaderPool: jest.fn() }));
jest.mock('../../utils/logger', () => ({
  createLogger: jest.fn(() => ({
    info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(),
    initFromEvent: jest.fn(), setRequestId: jest.fn(), setUserId: jest.fn(),
    logRequest: jest.fn(), logResponse: jest.fn(), logQuery: jest.fn(),
    logSecurity: jest.fn(), child: jest.fn().mockReturnThis(),
  })),
}));
jest.mock('../../utils/auth', () => ({ getUserFromEvent: jest.fn() }));
jest.mock('../../utils/cors', () => ({
  createHeaders: jest.fn(() => ({ 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' })),
}));
jest.mock('../../utils/rate-limit', () => ({ requireRateLimit: jest.fn().mockResolvedValue(null) }));

import { APIGatewayProxyEvent } from 'aws-lambda';
import { getPool } from '../../../shared/db';
import { handler } from '../../disputes/accept-resolution';
import { getUserFromEvent } from '../../utils/auth';
import { requireRateLimit } from '../../utils/rate-limit';
import { createHeaders } from '../../utils/cors';

const VALID_DISPUTE_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const TEST_USER_ID = 'b2c3d4e5-f6a7-8901-bcde-f12345678901';
const RESPONDENT_ID = 'c3d4e5f6-a7b8-9012-cdef-123456789012';
const OTHER_USER_ID = 'd4e5f6a7-b8c9-0123-defa-234567890123';

function makeEvent(overrides: Partial<Record<string, unknown>> = {}): APIGatewayProxyEvent {
  return {
    httpMethod: overrides.httpMethod as string ?? 'POST',
    headers: {},
    body: overrides.body as string ?? null,
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
        ? { claims: { sub: overrides.sub ?? 'cognito-sub-123' } }
        : undefined,
      identity: { sourceIp: '127.0.0.1' },
    },
  } as unknown as APIGatewayProxyEvent;
}

function makeDisputeRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: VALID_DISPUTE_ID,
    dispute_number: 'D-001',
    status: 'resolved',
    resolution: 'full_refund',
    complainant_id: TEST_USER_ID,
    respondent_id: RESPONDENT_ID,
    ...overrides,
  };
}

describe('disputes/accept-resolution handler', () => {
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

  // ---------- HTTP method handling ----------

  describe('HTTP method handling', () => {
    it('should return 204 for OPTIONS (CORS preflight)', async () => {
      const result = await handler(makeEvent({ httpMethod: 'OPTIONS' }), {} as never, {} as never);
      expect(result!.statusCode).toBe(204);
      expect(result!.body).toBe('');
    });

    it('should return 405 for GET', async () => {
      const result = await handler(makeEvent({ httpMethod: 'GET' }), {} as never, {} as never);
      expect(result!.statusCode).toBe(405);
      const body = JSON.parse(result!.body);
      expect(body.success).toBe(false);
      expect(body.message).toBe('Method not allowed');
    });

    it('should return 405 for PUT', async () => {
      const result = await handler(makeEvent({ httpMethod: 'PUT' }), {} as never, {} as never);
      expect(result!.statusCode).toBe(405);
      const body = JSON.parse(result!.body);
      expect(body.success).toBe(false);
      expect(body.message).toBe('Method not allowed');
    });

    it('should return 405 for DELETE', async () => {
      const result = await handler(makeEvent({ httpMethod: 'DELETE' }), {} as never, {} as never);
      expect(result!.statusCode).toBe(405);
    });

    it('should return 405 for PATCH', async () => {
      const result = await handler(makeEvent({ httpMethod: 'PATCH' }), {} as never, {} as never);
      expect(result!.statusCode).toBe(405);
    });

    it('should include headers on OPTIONS response', async () => {
      const result = await handler(makeEvent({ httpMethod: 'OPTIONS' }), {} as never, {} as never);
      expect(result!.headers).toBeDefined();
      expect(createHeaders).toHaveBeenCalled();
    });

    it('should include headers on 405 response', async () => {
      const result = await handler(makeEvent({ httpMethod: 'GET' }), {} as never, {} as never);
      expect(result!.headers).toBeDefined();
    });
  });

  // ---------- Path parameter validation ----------

  describe('dispute ID validation', () => {
    it('should return 400 when pathParameters has no id key', async () => {
      const event = makeEvent();
      event.pathParameters = null;
      const result = await handler(event, {} as never, {} as never);
      expect(result!.statusCode).toBe(400);
      const body = JSON.parse(result!.body);
      expect(body.success).toBe(false);
      expect(body.message).toBe('Valid dispute ID required');
    });

    it('should return 400 when dispute ID is missing', async () => {
      const result = await handler(makeEvent({ pathParameters: {} }), {} as never, {} as never);
      expect(result!.statusCode).toBe(400);
      const body = JSON.parse(result!.body);
      expect(body.message).toBe('Valid dispute ID required');
    });

    it('should return 400 when dispute ID is an empty string', async () => {
      const result = await handler(makeEvent({ pathParameters: { id: '' } }), {} as never, {} as never);
      expect(result!.statusCode).toBe(400);
    });

    it('should return 400 when dispute ID is not a valid UUID', async () => {
      const result = await handler(makeEvent({ pathParameters: { id: 'bad-uuid' } }), {} as never, {} as never);
      expect(result!.statusCode).toBe(400);
      const body = JSON.parse(result!.body);
      expect(body.message).toBe('Valid dispute ID required');
    });

    it('should return 400 when dispute ID is a partial UUID', async () => {
      const result = await handler(
        makeEvent({ pathParameters: { id: 'a1b2c3d4-e5f6-7890-abcd' } }),
        {} as never,
        {} as never,
      );
      expect(result!.statusCode).toBe(400);
    });

    it('should return 400 when dispute ID contains invalid characters', async () => {
      const result = await handler(
        makeEvent({ pathParameters: { id: 'zzzzzzzz-zzzz-zzzz-zzzz-zzzzzzzzzzzz' } }),
        {} as never,
        {} as never,
      );
      expect(result!.statusCode).toBe(400);
    });

    it('should accept uppercase UUID', async () => {
      mockClient.query.mockResolvedValueOnce({ rows: [makeDisputeRow()] })
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [] }) // UPDATE
        .mockResolvedValueOnce({ rows: [] }) // INSERT timeline
        .mockResolvedValueOnce({ rows: [] }) // INSERT notification
        .mockResolvedValueOnce({ rows: [] }); // COMMIT
      const result = await handler(
        makeEvent({ pathParameters: { id: 'A1B2C3D4-E5F6-7890-ABCD-EF1234567890' } }),
        {} as never,
        {} as never,
      );
      expect(result!.statusCode).toBe(200);
    });
  });

  // ---------- Authentication ----------

  describe('authentication', () => {
    it('should return 401 when user is not authenticated', async () => {
      (getUserFromEvent as jest.Mock).mockResolvedValueOnce(null);
      const result = await handler(makeEvent(), {} as never, {} as never);
      expect(result!.statusCode).toBe(401);
      const body = JSON.parse(result!.body);
      expect(body.success).toBe(false);
      expect(body.message).toBe('Unauthorized');
    });

    it('should return 401 when getUserFromEvent returns undefined', async () => {
      (getUserFromEvent as jest.Mock).mockResolvedValueOnce(undefined);
      const result = await handler(makeEvent(), {} as never, {} as never);
      expect(result!.statusCode).toBe(401);
    });

    it('should call getUserFromEvent with the event', async () => {
      mockClient.query.mockResolvedValueOnce({ rows: [makeDisputeRow()] })
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [] }) // UPDATE
        .mockResolvedValueOnce({ rows: [] }) // INSERT timeline
        .mockResolvedValueOnce({ rows: [] }) // INSERT notification
        .mockResolvedValueOnce({ rows: [] }); // COMMIT
      const event = makeEvent();
      await handler(event, {} as never, {} as never);
      expect(getUserFromEvent).toHaveBeenCalledWith(event);
    });
  });

  // ---------- Rate limiting ----------

  describe('rate limiting', () => {
    it('should return rate limit response when rate limited', async () => {
      const rateLimitResponse = {
        statusCode: 429,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ success: false, message: 'Too many requests' }),
      };
      (requireRateLimit as jest.Mock).mockResolvedValueOnce(rateLimitResponse);
      const result = await handler(makeEvent(), {} as never, {} as never);
      expect(result!.statusCode).toBe(429);
      expect(JSON.parse(result!.body).message).toBe('Too many requests');
    });

    it('should call requireRateLimit with correct parameters', async () => {
      mockClient.query.mockResolvedValueOnce({ rows: [makeDisputeRow()] })
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [] }) // UPDATE
        .mockResolvedValueOnce({ rows: [] }) // INSERT timeline
        .mockResolvedValueOnce({ rows: [] }) // INSERT notification
        .mockResolvedValueOnce({ rows: [] }); // COMMIT
      await handler(makeEvent(), {} as never, {} as never);
      expect(requireRateLimit).toHaveBeenCalledWith(
        {
          prefix: 'dispute-accept',
          identifier: TEST_USER_ID,
          maxRequests: 5,
          windowSeconds: 60,
        },
        expect.any(Object),
      );
    });

    it('should not proceed to DB when rate limited', async () => {
      (requireRateLimit as jest.Mock).mockResolvedValueOnce({
        statusCode: 429,
        headers: {},
        body: JSON.stringify({ success: false, message: 'Rate limited' }),
      });
      await handler(makeEvent(), {} as never, {} as never);
      expect(mockDb.connect).not.toHaveBeenCalled();
    });
  });

  // ---------- Dispute not found ----------

  describe('dispute not found', () => {
    it('should return 404 when dispute does not exist', async () => {
      mockClient.query.mockResolvedValueOnce({ rows: [] });
      const result = await handler(makeEvent(), {} as never, {} as never);
      expect(result!.statusCode).toBe(404);
      const body = JSON.parse(result!.body);
      expect(body.success).toBe(false);
      expect(body.message).toBe('Dispute not found');
    });

    it('should query the correct dispute by ID', async () => {
      mockClient.query.mockResolvedValueOnce({ rows: [] });
      await handler(makeEvent(), {} as never, {} as never);
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('FROM session_disputes d'),
        [VALID_DISPUTE_ID],
      );
    });

    it('should not start a transaction when dispute is not found', async () => {
      mockClient.query.mockResolvedValueOnce({ rows: [] });
      await handler(makeEvent(), {} as never, {} as never);
      const queryCalls = mockClient.query.mock.calls.map((c: unknown[]) => c[0]);
      expect(queryCalls).not.toContain('BEGIN');
    });
  });

  // ---------- Authorization ----------

  describe('authorization — complainant check', () => {
    it('should return 403 when user is not the complainant', async () => {
      mockClient.query.mockResolvedValueOnce({
        rows: [makeDisputeRow({ complainant_id: OTHER_USER_ID })],
      });
      const result = await handler(makeEvent(), {} as never, {} as never);
      expect(result!.statusCode).toBe(403);
      const body = JSON.parse(result!.body);
      expect(body.success).toBe(false);
      expect(body.message).toBe('Only the complainant can accept the resolution');
    });

    it('should return 403 when user is the respondent (not complainant)', async () => {
      (getUserFromEvent as jest.Mock).mockResolvedValueOnce({ id: RESPONDENT_ID });
      mockClient.query.mockResolvedValueOnce({
        rows: [makeDisputeRow()],
      });
      const result = await handler(makeEvent(), {} as never, {} as never);
      expect(result!.statusCode).toBe(403);
    });
  });

  // ---------- Status validation ----------

  describe('dispute status validation', () => {
    it('should return 400 with specific message when dispute is already closed', async () => {
      mockClient.query.mockResolvedValueOnce({
        rows: [makeDisputeRow({ status: 'closed' })],
      });
      const result = await handler(makeEvent(), {} as never, {} as never);
      expect(result!.statusCode).toBe(400);
      const body = JSON.parse(result!.body);
      expect(body.success).toBe(false);
      expect(body.message).toBe('Dispute is already closed');
    });

    it('should return 400 with generic message when dispute is in open status', async () => {
      mockClient.query.mockResolvedValueOnce({
        rows: [makeDisputeRow({ status: 'open' })],
      });
      const result = await handler(makeEvent(), {} as never, {} as never);
      expect(result!.statusCode).toBe(400);
      const body = JSON.parse(result!.body);
      expect(body.success).toBe(false);
      expect(body.message).toBe('Dispute must be resolved before it can be accepted');
    });

    it('should return 400 when dispute is in pending status', async () => {
      mockClient.query.mockResolvedValueOnce({
        rows: [makeDisputeRow({ status: 'pending' })],
      });
      const result = await handler(makeEvent(), {} as never, {} as never);
      expect(result!.statusCode).toBe(400);
      const body = JSON.parse(result!.body);
      expect(body.message).toBe('Dispute must be resolved before it can be accepted');
    });

    it('should return 400 when dispute is in investigating status', async () => {
      mockClient.query.mockResolvedValueOnce({
        rows: [makeDisputeRow({ status: 'investigating' })],
      });
      const result = await handler(makeEvent(), {} as never, {} as never);
      expect(result!.statusCode).toBe(400);
      expect(JSON.parse(result!.body).message).toBe('Dispute must be resolved before it can be accepted');
    });

    it('should not start a transaction when dispute status is invalid', async () => {
      mockClient.query.mockResolvedValueOnce({
        rows: [makeDisputeRow({ status: 'open' })],
      });
      await handler(makeEvent(), {} as never, {} as never);
      const queryCalls = mockClient.query.mock.calls.map((c: unknown[]) => c[0]);
      expect(queryCalls).not.toContain('BEGIN');
    });
  });

  // ---------- Happy path ----------

  describe('happy path — successful acceptance', () => {
    beforeEach(() => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [makeDisputeRow()] }) // SELECT dispute
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [] }) // UPDATE session_disputes
        .mockResolvedValueOnce({ rows: [] }) // INSERT dispute_timeline
        .mockResolvedValueOnce({ rows: [] }) // INSERT notifications
        .mockResolvedValueOnce({ rows: [] }); // COMMIT
    });

    it('should return 200 with success response', async () => {
      const result = await handler(makeEvent(), {} as never, {} as never);
      expect(result!.statusCode).toBe(200);
      const body = JSON.parse(result!.body);
      expect(body.success).toBe(true);
      expect(body.message).toBe('Resolution accepted — dispute closed');
    });

    it('should include headers in the response', async () => {
      const result = await handler(makeEvent(), {} as never, {} as never);
      expect(result!.headers).toBeDefined();
      expect(result!.headers!['Content-Type']).toBe('application/json');
    });

    it('should call BEGIN before any mutation', async () => {
      await handler(makeEvent(), {} as never, {} as never);
      const queryCalls = mockClient.query.mock.calls.map((c: unknown[]) => c[0]);
      expect(queryCalls[1]).toBe('BEGIN');
    });

    it('should call COMMIT after all mutations', async () => {
      await handler(makeEvent(), {} as never, {} as never);
      const queryCalls = mockClient.query.mock.calls.map((c: unknown[]) => c[0]);
      expect(queryCalls.at(-1)!).toBe('COMMIT');
    });

    it('should UPDATE dispute status to closed', async () => {
      await handler(makeEvent(), {} as never, {} as never);
      const updateCall = mockClient.query.mock.calls[2];
      expect(updateCall[0]).toContain('UPDATE session_disputes');
      expect(updateCall[0]).toContain("status = 'closed'");
      expect(updateCall[0]).toContain('updated_at = NOW()');
      expect(updateCall[1]).toEqual([VALID_DISPUTE_ID]);
    });

    it('should INSERT timeline event with accepted type', async () => {
      await handler(makeEvent(), {} as never, {} as never);
      const timelineCall = mockClient.query.mock.calls[3];
      expect(timelineCall[0]).toContain('INSERT INTO dispute_timeline');
      expect(timelineCall[0]).toContain("'accepted'");
      expect(timelineCall[1][0]).toBe(VALID_DISPUTE_ID);
      expect(JSON.parse(timelineCall[1][1])).toEqual({ resolution: 'full_refund' });
      expect(timelineCall[1][2]).toBe(TEST_USER_ID);
    });

    it('should INSERT notification for respondent', async () => {
      await handler(makeEvent(), {} as never, {} as never);
      const notifCall = mockClient.query.mock.calls[4];
      expect(notifCall[0]).toContain('INSERT INTO notifications');
      expect(notifCall[1][0]).toBe(RESPONDENT_ID);
      expect(notifCall[1][1]).toBe('dispute_closed');
      expect(notifCall[1][2]).toBe('Litige clôturé');
      expect(notifCall[1][3]).toContain('D-001');
      expect(notifCall[1][3]).toContain('accepté et clôturé');
      const notifData = JSON.parse(notifCall[1][4]);
      expect(notifData.disputeId).toBe(VALID_DISPUTE_ID);
      expect(notifData.disputeNumber).toBe('D-001');
    });

    it('should release the client after success', async () => {
      await handler(makeEvent(), {} as never, {} as never);
      expect(mockClient.release).toHaveBeenCalledTimes(1);
    });

    it('should execute queries in correct order: SELECT, BEGIN, UPDATE, INSERT timeline, INSERT notification, COMMIT', async () => {
      await handler(makeEvent(), {} as never, {} as never);
      expect(mockClient.query).toHaveBeenCalledTimes(6);
      const calls = mockClient.query.mock.calls;
      expect(calls[0][0]).toContain('SELECT');
      expect(calls[1][0]).toBe('BEGIN');
      expect(calls[2][0]).toContain('UPDATE session_disputes');
      expect(calls[3][0]).toContain('INSERT INTO dispute_timeline');
      expect(calls[4][0]).toContain('INSERT INTO notifications');
      expect(calls[5][0]).toBe('COMMIT');
    });

    it('should handle dispute with partial_refund resolution', async () => {
      mockClient.query.mockReset();
      mockClient.query
        .mockResolvedValueOnce({ rows: [makeDisputeRow({ resolution: 'partial_refund' })] })
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [] }) // UPDATE
        .mockResolvedValueOnce({ rows: [] }) // INSERT timeline
        .mockResolvedValueOnce({ rows: [] }) // INSERT notification
        .mockResolvedValueOnce({ rows: [] }); // COMMIT
      const result = await handler(makeEvent(), {} as never, {} as never);
      expect(result!.statusCode).toBe(200);
      const timelineCall = mockClient.query.mock.calls[3];
      expect(JSON.parse(timelineCall[1][1])).toEqual({ resolution: 'partial_refund' });
    });

    it('should handle dispute with null resolution', async () => {
      mockClient.query.mockReset();
      mockClient.query
        .mockResolvedValueOnce({ rows: [makeDisputeRow({ resolution: null })] })
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [] }) // UPDATE
        .mockResolvedValueOnce({ rows: [] }) // INSERT timeline
        .mockResolvedValueOnce({ rows: [] }) // INSERT notification
        .mockResolvedValueOnce({ rows: [] }); // COMMIT
      const result = await handler(makeEvent(), {} as never, {} as never);
      expect(result!.statusCode).toBe(200);
      const timelineCall = mockClient.query.mock.calls[3];
      expect(JSON.parse(timelineCall[1][1])).toEqual({ resolution: null });
    });

    it('should connect to the database pool', async () => {
      await handler(makeEvent(), {} as never, {} as never);
      expect(getPool).toHaveBeenCalled();
      expect(mockDb.connect).toHaveBeenCalledTimes(1);
    });
  });

  // ---------- Error handling ----------

  describe('error handling', () => {
    it('should return 500 on database query error', async () => {
      mockClient.query.mockRejectedValueOnce(new Error('Connection lost'));
      const result = await handler(makeEvent(), {} as never, {} as never);
      expect(result!.statusCode).toBe(500);
      const body = JSON.parse(result!.body);
      expect(body.success).toBe(false);
      expect(body.message).toBe('Internal server error');
    });

    it('should ROLLBACK on error when client is connected', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [makeDisputeRow()] }) // SELECT dispute
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockRejectedValueOnce(new Error('UPDATE failed')); // UPDATE fails
      const result = await handler(makeEvent(), {} as never, {} as never);
      expect(result!.statusCode).toBe(500);
      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    });

    it('should release the client after error', async () => {
      mockClient.query.mockRejectedValueOnce(new Error('DB error'));
      await handler(makeEvent(), {} as never, {} as never);
      expect(mockClient.release).toHaveBeenCalledTimes(1);
    });

    it('should release the client when error occurs during COMMIT', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [makeDisputeRow()] })
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [] }) // UPDATE
        .mockResolvedValueOnce({ rows: [] }) // INSERT timeline
        .mockResolvedValueOnce({ rows: [] }) // INSERT notification
        .mockRejectedValueOnce(new Error('COMMIT failed')); // COMMIT fails
      const result = await handler(makeEvent(), {} as never, {} as never);
      expect(result!.statusCode).toBe(500);
      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
      expect(mockClient.release).toHaveBeenCalledTimes(1);
    });

    it('should not leak internal error details in response', async () => {
      mockClient.query.mockRejectedValueOnce(new Error('FATAL: password authentication failed'));
      const result = await handler(makeEvent(), {} as never, {} as never);
      expect(result!.body).not.toContain('password');
      expect(result!.body).not.toContain('FATAL');
      expect(JSON.parse(result!.body).message).toBe('Internal server error');
    });

    it('should throw when getPool rejects (error before try/catch)', async () => {
      (getPool as jest.Mock).mockRejectedValueOnce(new Error('Pool creation failed'));
      await expect(handler(makeEvent(), {} as never, {} as never)).rejects.toThrow('Pool creation failed');
    });

    it('should return 500 when db.connect rejects', async () => {
      mockDb.connect.mockRejectedValueOnce(new Error('Cannot connect'));
      const result = await handler(makeEvent(), {} as never, {} as never);
      expect(result!.statusCode).toBe(500);
    });

    it('should not call ROLLBACK when client was never connected (error before connect)', async () => {
      (getUserFromEvent as jest.Mock).mockRejectedValueOnce(new Error('Auth service down'));
      const result = await handler(makeEvent(), {} as never, {} as never);
      expect(result!.statusCode).toBe(500);
      // client is null, so ROLLBACK should not be called on mockClient
      // (the handler catches the error before client is assigned)
      expect(mockClient.query).not.toHaveBeenCalledWith('ROLLBACK');
    });

    it('should not call client.release when client was never connected', async () => {
      (getUserFromEvent as jest.Mock).mockRejectedValueOnce(new Error('Auth error'));
      await handler(makeEvent(), {} as never, {} as never);
      // client was never assigned since error happened before db.connect()
      // Note: mockClient.release may still not be called because the handler
      // only releases if client is truthy
      expect(mockDb.connect).not.toHaveBeenCalled();
    });

    it('should handle error during timeline INSERT', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [makeDisputeRow()] })
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [] }) // UPDATE
        .mockRejectedValueOnce(new Error('Timeline insert failed')); // INSERT timeline fails
      const result = await handler(makeEvent(), {} as never, {} as never);
      expect(result!.statusCode).toBe(500);
      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('should handle error during notification INSERT', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [makeDisputeRow()] })
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [] }) // UPDATE
        .mockResolvedValueOnce({ rows: [] }) // INSERT timeline
        .mockRejectedValueOnce(new Error('Notification insert failed')); // INSERT notification fails
      const result = await handler(makeEvent(), {} as never, {} as never);
      expect(result!.statusCode).toBe(500);
      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('should include headers in 500 response', async () => {
      mockClient.query.mockRejectedValueOnce(new Error('DB crash'));
      const result = await handler(makeEvent(), {} as never, {} as never);
      expect(result!.headers).toBeDefined();
    });
  });

  // ---------- Edge cases ----------

  describe('edge cases', () => {
    it('should handle dispute with special characters in dispute_number', async () => {
      mockClient.query
        .mockResolvedValueOnce({
          rows: [makeDisputeRow({ dispute_number: 'D-2026-00123' })],
        })
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [] }) // UPDATE
        .mockResolvedValueOnce({ rows: [] }) // INSERT timeline
        .mockResolvedValueOnce({ rows: [] }) // INSERT notification
        .mockResolvedValueOnce({ rows: [] }); // COMMIT
      const result = await handler(makeEvent(), {} as never, {} as never);
      expect(result!.statusCode).toBe(200);
      const notifCall = mockClient.query.mock.calls[4];
      expect(notifCall[1][3]).toContain('D-2026-00123');
    });

    it('should correctly serialize resolution data in timeline event_data', async () => {
      mockClient.query
        .mockResolvedValueOnce({
          rows: [makeDisputeRow({ resolution: 'warning_issued' })],
        })
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [] }) // UPDATE
        .mockResolvedValueOnce({ rows: [] }) // INSERT timeline
        .mockResolvedValueOnce({ rows: [] }) // INSERT notification
        .mockResolvedValueOnce({ rows: [] }); // COMMIT
      await handler(makeEvent(), {} as never, {} as never);
      const timelineCall = mockClient.query.mock.calls[3];
      const eventData = JSON.parse(timelineCall[1][1]);
      expect(eventData).toEqual({ resolution: 'warning_issued' });
    });

    it('should correctly serialize notification data with disputeId and disputeNumber', async () => {
      const customDisputeId = 'e5f6a7b8-c9d0-1234-efab-567890123456';
      mockClient.query
        .mockResolvedValueOnce({
          rows: [makeDisputeRow({ dispute_number: 'D-999' })],
        })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });
      await handler(
        makeEvent({ pathParameters: { id: customDisputeId } }),
        {} as never,
        {} as never,
      );
      const notifCall = mockClient.query.mock.calls[4];
      const notifData = JSON.parse(notifCall[1][4]);
      expect(notifData.disputeId).toBe(customDisputeId);
      expect(notifData.disputeNumber).toBe('D-999');
    });
  });

  // ---------- Isolation / no side effects ----------

  describe('early returns do not mutate', () => {
    it('should not connect to DB when method is OPTIONS', async () => {
      await handler(makeEvent({ httpMethod: 'OPTIONS' }), {} as never, {} as never);
      expect(getPool).not.toHaveBeenCalled();
    });

    it('should not connect to DB when method is GET', async () => {
      await handler(makeEvent({ httpMethod: 'GET' }), {} as never, {} as never);
      expect(getPool).not.toHaveBeenCalled();
    });

    it('should not connect to DB when dispute ID is invalid', async () => {
      await handler(makeEvent({ pathParameters: { id: 'invalid' } }), {} as never, {} as never);
      expect(getPool).not.toHaveBeenCalled();
    });

    it('should call getPool but not connect when user is not authenticated', async () => {
      (getUserFromEvent as jest.Mock).mockResolvedValueOnce(null);
      await handler(makeEvent(), {} as never, {} as never);
      expect(getPool).toHaveBeenCalled();
      expect(mockDb.connect).not.toHaveBeenCalled();
    });
  });
});

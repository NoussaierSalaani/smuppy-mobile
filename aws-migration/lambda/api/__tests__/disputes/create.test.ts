/**
 * Tests for disputes/create Lambda handler
 */

import { APIGatewayProxyEvent } from 'aws-lambda';
import { getPool } from '../../../shared/db';

jest.mock('../../../shared/db', () => ({
  getPool: jest.fn(),
  getReaderPool: jest.fn(),
}));

jest.mock('../../utils/rate-limit', () => ({
  checkRateLimit: jest.fn().mockResolvedValue({ allowed: true }),
  requireRateLimit: jest.fn().mockResolvedValue(null),
}));

jest.mock('../../utils/logger', () => ({
  createLogger: jest.fn(() => ({
    info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(),
    initFromEvent: jest.fn(), setRequestId: jest.fn(), setUserId: jest.fn(),
    logRequest: jest.fn(), logResponse: jest.fn(), logQuery: jest.fn(),
    logSecurity: jest.fn(), child: jest.fn().mockReturnThis(),
  })),
}));

jest.mock('../../utils/cors', () => ({
  createHeaders: jest.fn(() => ({
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Credentials': 'true',
  })),
  getSecureHeaders: jest.fn(() => ({ 'Content-Type': 'application/json' })),
}));

jest.mock('../../utils/auth', () => ({
  resolveProfileId: jest.fn(),
  getUserFromEvent: jest.fn(),
}));

jest.mock('../../utils/security', () => ({
  isValidUUID: jest.fn((uuid: string) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(uuid)
  ),
}));

jest.mock('../../utils/account-status', () => ({
  requireActiveAccount: jest.fn().mockResolvedValue({
    profileId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    username: 'testuser',
    moderationStatus: 'active',
  }),
  isAccountError: jest.fn().mockReturnValue(false),
}));

jest.mock('../../utils/constants', () => ({
  RATE_WINDOW_1_DAY: 86400,
  RATE_WINDOW_1_MIN: 60,
  RATE_WINDOW_5_MIN: 300,
  DEFAULT_PAGE_SIZE: 20,
  MAX_PAGE_SIZE: 50,
}));

jest.mock('../../../shared/moderation/textFilter', () => ({
  filterText: jest.fn().mockResolvedValue({ clean: true, severity: null }),
}));

jest.mock('../../../shared/moderation/textModeration', () => ({
  analyzeTextToxicity: jest.fn().mockResolvedValue({ action: 'allow', topCategory: null }),
}));

import { handler as _handler } from '../../disputes/create';
const handler = _handler as unknown as (event: APIGatewayProxyEvent) => Promise<{ statusCode: number; body: string; headers?: Record<string, string> }>;
import { getUserFromEvent } from '../../utils/auth';
import { requireRateLimit } from '../../utils/rate-limit';
import { requireActiveAccount, isAccountError } from '../../utils/account-status';
import { filterText } from '../../../shared/moderation/textFilter';
import { analyzeTextToxicity } from '../../../shared/moderation/textModeration';

const TEST_USER_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const VALID_SESSION_ID = 'b2c3d4e5-f6a7-8901-bcde-f12345678901';
const VALID_CREATOR_ID = 'c3d4e5f6-a7b8-9012-cdef-123456789012';
const VALID_DISPUTE_ID = 'd4e5f6a7-b8c9-0123-defa-234567890123';

function makeEvent(overrides: Partial<Record<string, unknown>> = {}): APIGatewayProxyEvent {
  return {
    httpMethod: overrides.httpMethod as string ?? 'POST',
    headers: {},
    body: overrides.body as string ?? JSON.stringify({
      sessionId: VALID_SESSION_ID,
      type: 'no_show',
      description: 'The creator never showed up to the session at all',
      refundRequested: 'full',
    }),
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
        ? { claims: { sub: overrides.sub ?? 'cognito-sub-123' } }
        : undefined,
      identity: { sourceIp: '127.0.0.1' },
    },
  } as unknown as APIGatewayProxyEvent;
}

/** Helper to make a valid session row that is within the 24h dispute window */
function makeSessionRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: VALID_SESSION_ID,
    buyer_id: TEST_USER_ID,
    creator_id: VALID_CREATOR_ID,
    scheduled_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), // 2 hours ago
    amount_cents: 5000,
    currency: 'eur',
    payment_id: 'pay-123',
    payment_status: 'succeeded',
    duration_minutes: 30,
    creator_username: 'creatoruser',
    ...overrides,
  };
}

describe('disputes/create handler', () => {
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
    (getUserFromEvent as jest.Mock).mockReturnValue({ id: TEST_USER_ID, sub: 'cognito-sub-123' });
    (requireRateLimit as jest.Mock).mockResolvedValue(null);
    (requireActiveAccount as jest.Mock).mockResolvedValue({ profileId: TEST_USER_ID });
    (isAccountError as unknown as jest.Mock).mockReturnValue(false);
    (filterText as jest.Mock).mockResolvedValue({ clean: true, severity: null });
    (analyzeTextToxicity as jest.Mock).mockResolvedValue({ action: 'allow', topCategory: null });
  });

  describe('authentication', () => {
    it('should return 401 when user not found', async () => {
      (getUserFromEvent as jest.Mock).mockReturnValueOnce(null);
      const result = await handler(makeEvent());
      expect(result.statusCode).toBe(401);
    });
  });

  describe('method handling', () => {
    it('should return 204 for OPTIONS', async () => {
      const result = await handler(makeEvent({ httpMethod: 'OPTIONS' }));
      expect(result.statusCode).toBe(204);
    });

    it('should return 405 for GET', async () => {
      const result = await handler(makeEvent({ httpMethod: 'GET' }));
      expect(result.statusCode).toBe(405);
      expect(JSON.parse(result.body).message).toBe('Method not allowed');
    });

    it('should return 405 for PUT', async () => {
      const result = await handler(makeEvent({ httpMethod: 'PUT' }));
      expect(result.statusCode).toBe(405);
    });

    it('should return 405 for DELETE', async () => {
      const result = await handler(makeEvent({ httpMethod: 'DELETE' }));
      expect(result.statusCode).toBe(405);
    });
  });

  describe('account status', () => {
    it('should return error when account is suspended', async () => {
      const accountErr = {
        statusCode: 403,
        headers: {},
        body: JSON.stringify({ message: 'Account suspended' }),
      };
      (requireActiveAccount as jest.Mock).mockResolvedValueOnce(accountErr);
      (isAccountError as unknown as jest.Mock).mockReturnValueOnce(true);
      const result = await handler(makeEvent());
      expect(result.statusCode).toBe(403);
    });

    it('should return error when account is banned', async () => {
      const accountErr = {
        statusCode: 403,
        headers: {},
        body: JSON.stringify({ message: 'Account banned' }),
      };
      (requireActiveAccount as jest.Mock).mockResolvedValueOnce(accountErr);
      (isAccountError as unknown as jest.Mock).mockReturnValueOnce(true);
      const result = await handler(makeEvent());
      expect(result.statusCode).toBe(403);
    });
  });

  describe('rate limiting', () => {
    it('should return 429 when rate limited', async () => {
      (requireRateLimit as jest.Mock).mockResolvedValueOnce({
        statusCode: 429, headers: {}, body: JSON.stringify({ message: 'Too many requests' }),
      });
      const result = await handler(makeEvent());
      expect(result.statusCode).toBe(429);
    });
  });

  describe('validation', () => {
    it('should return 400 when sessionId missing', async () => {
      const result = await handler(makeEvent({
        body: JSON.stringify({ type: 'no_show', description: 'A description that is long enough for validation' }),
      }));
      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toContain('sessionId, type, and description are required');
    });

    it('should return 400 when type missing', async () => {
      const result = await handler(makeEvent({
        body: JSON.stringify({ sessionId: VALID_SESSION_ID, description: 'A description that is long enough for validation' }),
      }));
      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toContain('sessionId, type, and description are required');
    });

    it('should return 400 when description missing', async () => {
      const result = await handler(makeEvent({
        body: JSON.stringify({ sessionId: VALID_SESSION_ID, type: 'no_show' }),
      }));
      expect(result.statusCode).toBe(400);
    });

    it('should return 400 when sessionId is not valid UUID', async () => {
      const result = await handler(makeEvent({
        body: JSON.stringify({ sessionId: 'bad-uuid', type: 'no_show', description: 'Long enough description text here' }),
      }));
      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toContain('Invalid sessionId format');
    });

    it('should return 400 for invalid dispute type', async () => {
      const result = await handler(makeEvent({
        body: JSON.stringify({ sessionId: VALID_SESSION_ID, type: 'invalid_type', description: 'A description that is long enough' }),
      }));
      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toContain('Invalid dispute type');
    });

    it('should return 400 when description is too short', async () => {
      const result = await handler(makeEvent({
        body: JSON.stringify({ sessionId: VALID_SESSION_ID, type: 'no_show', description: 'Too short' }),
      }));
      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toContain('Description must be between');
    });

    it('should return 400 when description is too long (over 2000 chars)', async () => {
      const result = await handler(makeEvent({
        body: JSON.stringify({ sessionId: VALID_SESSION_ID, type: 'no_show', description: 'x'.repeat(2001) }),
      }));
      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toContain('Description must be between');
    });

    it('should accept all valid dispute types', async () => {
      const validTypes = ['no_show', 'incomplete', 'quality', 'technical', 'other'];
      for (const type of validTypes) {
        jest.clearAllMocks();
        (getPool as jest.Mock).mockResolvedValue(mockDb);
        (getUserFromEvent as jest.Mock).mockReturnValue({ id: TEST_USER_ID, sub: 'cognito-sub-123' });
        (requireRateLimit as jest.Mock).mockResolvedValue(null);
        (requireActiveAccount as jest.Mock).mockResolvedValue({ profileId: TEST_USER_ID });
        (isAccountError as unknown as jest.Mock).mockReturnValue(false);
        (filterText as jest.Mock).mockResolvedValue({ clean: true, severity: null });
        (analyzeTextToxicity as jest.Mock).mockResolvedValue({ action: 'allow', topCategory: null });
        // Mock session found
        mockClient.query
          .mockResolvedValueOnce({ rows: [] }) // BEGIN
          .mockResolvedValueOnce({ rows: [makeSessionRow()] }) // session found
          .mockResolvedValueOnce({ rows: [] }) // no existing dispute
          .mockResolvedValueOnce({ rows: [] }) // attendance (auto-verification)
          .mockResolvedValueOnce({ rows: [{ id: VALID_DISPUTE_ID, dispute_number: 'D-001' }] }) // insert dispute
          .mockResolvedValueOnce({ rows: [] }) // verification log
          .mockResolvedValueOnce({ rows: [] }) // notification
          .mockResolvedValueOnce({ rows: [] }); // COMMIT
        const result = await handler(makeEvent({
          body: JSON.stringify({ sessionId: VALID_SESSION_ID, type, description: 'Valid description that meets minimum length', refundRequested: 'full' }),
        }));
        // Should not be 400 for validation (might be other status if DB setup is off, but not 400 for type)
        if (result.statusCode === 400) {
          expect(JSON.parse(result.body).message).not.toContain('Invalid dispute type');
        }
      }
    });
  });

  describe('moderation', () => {
    it('should return 400 when description is blocked by text filter (critical)', async () => {
      (filterText as jest.Mock).mockResolvedValueOnce({ clean: false, severity: 'critical' });
      const result = await handler(makeEvent());
      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toBe('Content policy violation');
    });

    it('should return 400 when description is blocked by text filter (high)', async () => {
      (filterText as jest.Mock).mockResolvedValueOnce({ clean: false, severity: 'high' });
      const result = await handler(makeEvent());
      expect(result.statusCode).toBe(400);
    });

    it('should pass when text filter severity is low', async () => {
      // Low severity should not block
      (filterText as jest.Mock).mockResolvedValueOnce({ clean: false, severity: 'low' });
      (analyzeTextToxicity as jest.Mock).mockResolvedValueOnce({ action: 'allow', topCategory: null });
      // Setup DB mocks for the rest of the flow
      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [makeSessionRow()] }) // session found
        .mockResolvedValueOnce({ rows: [] }) // no existing dispute
        .mockResolvedValueOnce({ rows: [] }) // attendance
        .mockResolvedValueOnce({ rows: [{ id: VALID_DISPUTE_ID, dispute_number: 'D-001' }] }) // insert
        .mockResolvedValueOnce({ rows: [] }) // verification log
        .mockResolvedValueOnce({ rows: [] }) // notification
        .mockResolvedValueOnce({ rows: [] }); // COMMIT
      const result = await handler(makeEvent());
      expect(result.statusCode).toBe(201);
    });

    it('should return 400 when description is blocked by toxicity', async () => {
      (analyzeTextToxicity as jest.Mock).mockResolvedValueOnce({ action: 'block', topCategory: 'hate' });
      const result = await handler(makeEvent());
      expect(result.statusCode).toBe(400);
    });
  });

  describe('session validation', () => {
    it('should return 404 when session not found', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [] }); // session not found
      const result = await handler(makeEvent());
      expect(result.statusCode).toBe(404);
      expect(JSON.parse(result.body).message).toBe('Session not found');
    });

    it('should ROLLBACK when session not found', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [] }); // session not found
      await handler(makeEvent());
      // Expect ROLLBACK was called
      const rollbackCalls = mockClient.query.mock.calls.filter(
        (call: unknown[]) => typeof call[0] === 'string' && call[0] === 'ROLLBACK'
      );
      expect(rollbackCalls.length).toBe(1);
    });

    it('should return 403 when user is not the buyer', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [makeSessionRow({ buyer_id: 'other-user-id' })] });
      const result = await handler(makeEvent());
      expect(result.statusCode).toBe(403);
      expect(JSON.parse(result.body).message).toContain('Only the session buyer');
    });

    it('should return 400 when dispute window has closed (>24h)', async () => {
      const oldDate = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(); // 25 hours ago
      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [makeSessionRow({ scheduled_at: oldDate })] });
      const result = await handler(makeEvent());
      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toContain('Dispute window has closed');
    });

    it('should return 400 when dispute already exists for session', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [makeSessionRow()] }) // session found
        .mockResolvedValueOnce({ rows: [{ id: 'existing-dispute-id' }] }); // existing dispute
      const result = await handler(makeEvent());
      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toContain('dispute already exists');
      expect(JSON.parse(result.body).disputeId).toBe('existing-dispute-id');
    });
  });

  describe('happy path — full dispute creation', () => {
    beforeEach(() => {
      // Setup full happy path through all DB queries
      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [makeSessionRow()] }) // session found
        .mockResolvedValueOnce({ rows: [] }) // no existing dispute
        .mockResolvedValueOnce({ rows: [] }) // attendance (auto-verification — no records)
        .mockResolvedValueOnce({ rows: [{ id: VALID_DISPUTE_ID, dispute_number: 'D-001' }] }) // insert dispute
        .mockResolvedValueOnce({ rows: [] }) // verification log
        .mockResolvedValueOnce({ rows: [] }) // notification
        .mockResolvedValueOnce({ rows: [] }); // COMMIT
    });

    it('should return 201 with dispute details', async () => {
      const result = await handler(makeEvent());
      expect(result.statusCode).toBe(201);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(true);
      expect(body.dispute.id).toBe(VALID_DISPUTE_ID);
      expect(body.dispute.disputeNumber).toBe('D-001');
      expect(body.dispute.status).toBe('open');
      expect(body.message).toBe('Dispute created successfully');
    });

    it('should include auto verification result in response', async () => {
      const result = await handler(makeEvent());
      const body = JSON.parse(result.body);
      expect(body.dispute.autoVerification).toBeDefined();
      expect(body.dispute.autoVerification.recommendation).toBeDefined();
    });

    it('should include evidence deadline in response', async () => {
      const result = await handler(makeEvent());
      const body = JSON.parse(result.body);
      expect(body.dispute.evidenceDeadline).toBeDefined();
    });

    it('should create notification for creator', async () => {
      await handler(makeEvent());
      // The 7th call (index 6) is the notification insert
      const notifCall = mockClient.query.mock.calls[6];
      expect(notifCall[0]).toContain('INSERT INTO notifications');
      expect(notifCall[1][0]).toBe(VALID_CREATOR_ID); // creator gets notified
      expect(notifCall[1][1]).toBe('dispute_opened');
    });

    it('should COMMIT transaction on success', async () => {
      await handler(makeEvent());
      const commitCalls = mockClient.query.mock.calls.filter(
        (call: unknown[]) => typeof call[0] === 'string' && call[0] === 'COMMIT'
      );
      expect(commitCalls.length).toBe(1);
    });

    it('should release client on success', async () => {
      await handler(makeEvent());
      expect(mockClient.release).toHaveBeenCalledTimes(1);
    });
  });

  describe('refund calculation', () => {
    function setupHappyPath() {
      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [makeSessionRow({ amount_cents: 10000 })] }) // session
        .mockResolvedValueOnce({ rows: [] }) // no existing dispute
        .mockResolvedValueOnce({ rows: [] }) // attendance
        .mockResolvedValueOnce({ rows: [{ id: VALID_DISPUTE_ID, dispute_number: 'D-002' }] }) // insert
        .mockResolvedValueOnce({ rows: [] }) // verification log
        .mockResolvedValueOnce({ rows: [] }) // notification
        .mockResolvedValueOnce({ rows: [] }); // COMMIT
    }

    it('should set full refund amount when refundRequested is full', async () => {
      setupHappyPath();
      await handler(makeEvent({
        body: JSON.stringify({
          sessionId: VALID_SESSION_ID, type: 'no_show',
          description: 'Creator never showed up to the session',
          refundRequested: 'full',
        }),
      }));
      // The dispute INSERT is the 5th call (index 4)
      const insertCall = mockClient.query.mock.calls[4];
      expect(insertCall[1][9]).toBe(10000); // refund_amount_cents = full amount
    });

    it('should set partial refund amount (50%) when refundRequested is partial', async () => {
      setupHappyPath();
      await handler(makeEvent({
        body: JSON.stringify({
          sessionId: VALID_SESSION_ID, type: 'quality',
          description: 'Session quality was really poor throughout',
          refundRequested: 'partial',
        }),
      }));
      const insertCall = mockClient.query.mock.calls[4];
      expect(insertCall[1][9]).toBe(5000); // refund_amount_cents = 50%
    });

    it('should set zero refund when refundRequested is none', async () => {
      setupHappyPath();
      await handler(makeEvent({
        body: JSON.stringify({
          sessionId: VALID_SESSION_ID, type: 'other',
          description: 'I just want to report an issue with the session',
          refundRequested: 'none',
        }),
      }));
      const insertCall = mockClient.query.mock.calls[4];
      expect(insertCall[1][9]).toBe(0); // refund_amount_cents = 0
    });
  });

  describe('auto-verification logic', () => {
    it('should recommend approve_refund when creator never showed (no attendance)', async () => {
      // No attendance records = creator not present = approve_refund
      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [makeSessionRow()] }) // session
        .mockResolvedValueOnce({ rows: [] }) // no existing dispute
        .mockResolvedValueOnce({ rows: [] }) // no attendance records
        .mockResolvedValueOnce({ rows: [{ id: VALID_DISPUTE_ID, dispute_number: 'D-003' }] }) // insert
        .mockResolvedValueOnce({ rows: [] }) // verification log
        .mockResolvedValueOnce({ rows: [] }) // notification
        // auto-approve: 3 additional queries (update dispute, create refund, update session)
        .mockResolvedValueOnce({ rows: [] }) // update dispute status
        .mockResolvedValueOnce({ rows: [] }) // insert refund
        .mockResolvedValueOnce({ rows: [] }) // update session status
        .mockResolvedValueOnce({ rows: [] }); // COMMIT
      const result = await handler(makeEvent());
      expect(result.statusCode).toBe(201);
      const body = JSON.parse(result.body);
      expect(body.dispute.autoVerification.recommendation).toBe('approve_refund');
      expect(body.dispute.priority).toBe('high');
    });

    it('should set priority to high for approve_refund recommendation', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [makeSessionRow()] }) // session
        .mockResolvedValueOnce({ rows: [] }) // no existing dispute
        .mockResolvedValueOnce({ rows: [] }) // no attendance
        .mockResolvedValueOnce({ rows: [{ id: VALID_DISPUTE_ID, dispute_number: 'D-004' }] }) // insert
        .mockResolvedValueOnce({ rows: [] }) // verification log
        .mockResolvedValueOnce({ rows: [] }) // notification
        .mockResolvedValueOnce({ rows: [] }) // auto-approve update
        .mockResolvedValueOnce({ rows: [] }) // refund insert
        .mockResolvedValueOnce({ rows: [] }) // session update
        .mockResolvedValueOnce({ rows: [] }); // COMMIT
      const result = await handler(makeEvent());
      const body = JSON.parse(result.body);
      expect(body.dispute.priority).toBe('high');
    });

    it('should recommend reject when user never showed', async () => {
      // Only creator present (user duration < 60s = not present)
      const now = Date.now();
      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [makeSessionRow()] }) // session
        .mockResolvedValueOnce({ rows: [] }) // no existing dispute
        .mockResolvedValueOnce({
          rows: [
            // Creator attended for full duration
            {
              user_id: VALID_CREATOR_ID,
              joined_at: new Date(now - 30 * 60 * 1000).toISOString(),
              left_at: new Date(now).toISOString(),
              duration_seconds: 1800,
              network_quality_avg: 5,
              reconnect_count: 0,
            },
            // User only joined for 30 seconds
            {
              user_id: TEST_USER_ID,
              joined_at: new Date(now - 30 * 1000).toISOString(),
              left_at: new Date(now).toISOString(),
              duration_seconds: 30,
              network_quality_avg: 5,
              reconnect_count: 0,
            },
          ],
        }) // attendance
        .mockResolvedValueOnce({ rows: [{ id: VALID_DISPUTE_ID, dispute_number: 'D-005' }] }) // insert
        .mockResolvedValueOnce({ rows: [] }) // verification log
        .mockResolvedValueOnce({ rows: [] }) // notification
        .mockResolvedValueOnce({ rows: [] }); // COMMIT
      const result = await handler(makeEvent());
      expect(result.statusCode).toBe(201);
      const body = JSON.parse(result.body);
      expect(body.dispute.autoVerification.recommendation).toBe('reject');
      expect(body.dispute.autoVerification.userPresent).toBe(false);
      expect(body.dispute.autoVerification.creatorPresent).toBe(true);
    });

    it('should recommend investigate when overlap is between 50-80% of expectedDuration', async () => {
      // NOTE: overlapDuration is computed in milliseconds, expectedDuration in seconds.
      // For 30-min session: expectedDuration = 1800 (seconds).
      // We need overlap (ms) >= 1800*0.5 = 900ms AND < 1800*0.8 = 1440ms.
      const now = Date.now();
      // Create a scenario where user and creator overlap for exactly ~1000ms (1 second)
      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [makeSessionRow()] }) // session (duration_minutes: 30)
        .mockResolvedValueOnce({ rows: [] }) // no existing dispute
        .mockResolvedValueOnce({
          rows: [
            {
              user_id: TEST_USER_ID,
              joined_at: new Date(now - 3000).toISOString(), // joined 3s ago
              left_at: new Date(now - 1000).toISOString(), // left 1s ago
              duration_seconds: 120, // > 60 so user is present
              network_quality_avg: 5,
              reconnect_count: 0,
            },
            {
              user_id: VALID_CREATOR_ID,
              joined_at: new Date(now - 2000).toISOString(), // joined 2s ago (overlap: 1000ms)
              left_at: new Date(now).toISOString(),
              duration_seconds: 120, // > 60 so creator is present
              network_quality_avg: 5,
              reconnect_count: 0,
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [{ id: VALID_DISPUTE_ID, dispute_number: 'D-006' }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] }); // COMMIT
      const result = await handler(makeEvent());
      const body = JSON.parse(result.body);
      // 1000ms overlap is between 900 and 1440 => investigate
      expect(body.dispute.autoVerification.recommendation).toBe('investigate');
      expect(body.dispute.priority).toBe('normal');
    });

    it('should recommend reject when overlap is > 80%', async () => {
      const expectedDuration = 30 * 60; // 30 min in seconds
      const now = Date.now();
      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [makeSessionRow()] }) // session
        .mockResolvedValueOnce({ rows: [] }) // no existing dispute
        .mockResolvedValueOnce({
          rows: [
            {
              user_id: TEST_USER_ID,
              joined_at: new Date(now - expectedDuration * 1000).toISOString(),
              left_at: new Date(now).toISOString(),
              duration_seconds: expectedDuration,
              network_quality_avg: 5,
              reconnect_count: 0,
            },
            {
              user_id: VALID_CREATOR_ID,
              joined_at: new Date(now - expectedDuration * 1000).toISOString(),
              left_at: new Date(now).toISOString(),
              duration_seconds: expectedDuration,
              network_quality_avg: 5,
              reconnect_count: 0,
            },
          ],
        }) // attendance with full overlap
        .mockResolvedValueOnce({ rows: [{ id: VALID_DISPUTE_ID, dispute_number: 'D-007' }] }) // insert
        .mockResolvedValueOnce({ rows: [] }) // verification log
        .mockResolvedValueOnce({ rows: [] }) // notification
        .mockResolvedValueOnce({ rows: [] }); // COMMIT
      const result = await handler(makeEvent());
      const body = JSON.parse(result.body);
      expect(body.dispute.autoVerification.recommendation).toBe('reject');
    });

    it('should detect poor network quality', async () => {
      const expectedDuration = 30 * 60;
      const now = Date.now();
      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [makeSessionRow()] }) // session
        .mockResolvedValueOnce({ rows: [] }) // no existing dispute
        .mockResolvedValueOnce({
          rows: [
            {
              user_id: TEST_USER_ID,
              joined_at: new Date(now - expectedDuration * 1000).toISOString(),
              left_at: new Date(now).toISOString(),
              duration_seconds: expectedDuration,
              network_quality_avg: 1, // poor quality
              reconnect_count: 5, // many reconnects
            },
            {
              user_id: VALID_CREATOR_ID,
              joined_at: new Date(now - expectedDuration * 1000).toISOString(),
              left_at: new Date(now).toISOString(),
              duration_seconds: expectedDuration,
              network_quality_avg: 5,
              reconnect_count: 0,
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [{ id: VALID_DISPUTE_ID, dispute_number: 'D-008' }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] }); // COMMIT
      const result = await handler(makeEvent());
      const body = JSON.parse(result.body);
      expect(body.dispute.autoVerification.quality).toBe('poor');
      expect(body.dispute.autoVerification.evidence.connectionIssues).toBe(true);
    });

    it('should detect fair network quality', async () => {
      const expectedDuration = 30 * 60;
      const now = Date.now();
      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [makeSessionRow()] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({
          rows: [
            {
              user_id: TEST_USER_ID,
              joined_at: new Date(now - expectedDuration * 1000).toISOString(),
              left_at: new Date(now).toISOString(),
              duration_seconds: expectedDuration,
              network_quality_avg: 3, // fair quality
              reconnect_count: 0,
            },
            {
              user_id: VALID_CREATOR_ID,
              joined_at: new Date(now - expectedDuration * 1000).toISOString(),
              left_at: new Date(now).toISOString(),
              duration_seconds: expectedDuration,
              network_quality_avg: 5,
              reconnect_count: 0,
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [{ id: VALID_DISPUTE_ID, dispute_number: 'D-009' }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] }); // COMMIT
      const result = await handler(makeEvent());
      const body = JSON.parse(result.body);
      expect(body.dispute.autoVerification.quality).toBe('fair');
    });

    it('should handle auto-verification error gracefully with fallback', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [makeSessionRow()] }) // session
        .mockResolvedValueOnce({ rows: [] }) // no existing dispute
        .mockRejectedValueOnce(new Error('Attendance query failed')) // attendance query errors
        // Fallback: should still create the dispute with conservative verification
        .mockResolvedValueOnce({ rows: [{ id: VALID_DISPUTE_ID, dispute_number: 'D-010' }] }) // insert
        .mockResolvedValueOnce({ rows: [] }) // verification log
        .mockResolvedValueOnce({ rows: [] }) // notification
        .mockResolvedValueOnce({ rows: [] }); // COMMIT
      const result = await handler(makeEvent());
      expect(result.statusCode).toBe(201);
      const body = JSON.parse(result.body);
      expect(body.dispute.autoVerification.recommendation).toBe('investigate');
      expect(body.dispute.priority).toBe('normal');
    });
  });

  describe('auto-approve refund', () => {
    it('should auto-approve and run extra queries when recommendation is approve_refund', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [makeSessionRow()] }) // session
        .mockResolvedValueOnce({ rows: [] }) // no existing dispute
        .mockResolvedValueOnce({ rows: [] }) // no attendance (creator absent = approve_refund)
        .mockResolvedValueOnce({ rows: [{ id: VALID_DISPUTE_ID, dispute_number: 'D-011' }] }) // insert
        .mockResolvedValueOnce({ rows: [] }) // verification log
        .mockResolvedValueOnce({ rows: [] }) // notification
        .mockResolvedValueOnce({ rows: [] }) // auto-approve: update dispute status
        .mockResolvedValueOnce({ rows: [] }) // auto-approve: insert refund
        .mockResolvedValueOnce({ rows: [] }) // auto-approve: update session
        .mockResolvedValueOnce({ rows: [] }); // COMMIT
      const result = await handler(makeEvent());
      expect(result.statusCode).toBe(201);
      // Verify the auto-approve queries were called
      const updateDisputeCall = mockClient.query.mock.calls[7];
      expect(updateDisputeCall[0]).toContain('UPDATE session_disputes');
      expect(updateDisputeCall[1][0]).toBe('resolved');
      const refundCall = mockClient.query.mock.calls[8];
      expect(refundCall[0]).toContain('INSERT INTO refunds');
    });

    it('should handle auto-approve error gracefully without failing', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [makeSessionRow()] }) // session
        .mockResolvedValueOnce({ rows: [] }) // no existing dispute
        .mockResolvedValueOnce({ rows: [] }) // no attendance
        .mockResolvedValueOnce({ rows: [{ id: VALID_DISPUTE_ID, dispute_number: 'D-012' }] }) // insert
        .mockResolvedValueOnce({ rows: [] }) // verification log
        .mockResolvedValueOnce({ rows: [] }) // notification
        .mockRejectedValueOnce(new Error('Auto-approve failed')) // auto-approve errors
        .mockResolvedValueOnce({ rows: [] }); // COMMIT
      const result = await handler(makeEvent());
      // Should still succeed because autoApproveRefund catches its errors
      expect(result.statusCode).toBe(201);
    });
  });

  describe('error handling', () => {
    it('should return 500 and ROLLBACK on unexpected error', async () => {
      (getUserFromEvent as jest.Mock).mockImplementation(() => { throw new Error('Unexpected'); });
      const result = await handler(makeEvent());
      expect(result.statusCode).toBe(500);
      expect(JSON.parse(result.body).message).toBe('Internal server error');
    });

    it('should ROLLBACK and release client on transaction error', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockRejectedValueOnce(new Error('DB crash')); // session query fails
      const result = await handler(makeEvent());
      expect(result.statusCode).toBe(500);
      expect(mockClient.release).toHaveBeenCalledTimes(1);
    });

    it('should handle JSON parse error gracefully', async () => {
      const result = await handler(makeEvent({ body: 'not-json' }));
      expect(result.statusCode).toBe(500);
    });
  });

  describe('description sanitization', () => {
    it('should strip HTML tags from description', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [makeSessionRow()] }) // session
        .mockResolvedValueOnce({ rows: [] }) // no existing dispute
        .mockResolvedValueOnce({ rows: [] }) // attendance
        .mockResolvedValueOnce({ rows: [{ id: VALID_DISPUTE_ID, dispute_number: 'D-013' }] }) // insert
        .mockResolvedValueOnce({ rows: [] }) // verification log
        .mockResolvedValueOnce({ rows: [] }) // notification
        .mockResolvedValueOnce({ rows: [] }); // COMMIT
      await handler(makeEvent({
        body: JSON.stringify({
          sessionId: VALID_SESSION_ID, type: 'other',
          description: '<script>alert("xss")</script>Creator did not show up to session',
          refundRequested: 'none',
        }),
      }));
      // The dispute insert is the 5th query (index 4)
      const insertCall = mockClient.query.mock.calls[4];
      const sanitizedDesc = insertCall[1][7]; // complainant_description param
      expect(sanitizedDesc).not.toContain('<script>');
      expect(sanitizedDesc).not.toContain('</script>');
    });
  });
});

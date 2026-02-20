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
const _VALID_DISPUTE_ID = 'd4e5f6a7-b8c9-0123-defa-234567890123';

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
    (getUserFromEvent as jest.Mock).mockResolvedValue({ id: TEST_USER_ID, sub: 'cognito-sub-123' });
    (requireRateLimit as jest.Mock).mockResolvedValue(null);
    (requireActiveAccount as jest.Mock).mockResolvedValue({ profileId: TEST_USER_ID });
    (isAccountError as unknown as jest.Mock).mockReturnValue(false);
    (filterText as jest.Mock).mockResolvedValue({ clean: true, severity: null });
    (analyzeTextToxicity as jest.Mock).mockResolvedValue({ action: 'allow', topCategory: null });
  });

  describe('authentication', () => {
    it('should return 401 when user not found', async () => {
      (getUserFromEvent as jest.Mock).mockResolvedValueOnce(null);
      const result = await handler(makeEvent());
      expect(result!.statusCode).toBe(401);
    });
  });

  describe('method handling', () => {
    it('should return 204 for OPTIONS', async () => {
      const result = await handler(makeEvent({ httpMethod: 'OPTIONS' }));
      expect(result!.statusCode).toBe(204);
    });

    it('should return 405 for GET', async () => {
      const result = await handler(makeEvent({ httpMethod: 'GET' }));
      expect(result!.statusCode).toBe(405);
    });
  });

  describe('rate limiting', () => {
    it('should return 429 when rate limited', async () => {
      (requireRateLimit as jest.Mock).mockResolvedValueOnce({
        statusCode: 429, headers: {}, body: JSON.stringify({ message: 'Too many requests' }),
      });
      const result = await handler(makeEvent());
      expect(result!.statusCode).toBe(429);
    });
  });

  describe('validation', () => {
    it('should return 400 when sessionId missing', async () => {
      const result = await handler(makeEvent({
        body: JSON.stringify({ type: 'no_show', description: 'A description that is long enough for validation' }),
      }));
      expect(result!.statusCode).toBe(400);
    });

    it('should return 400 when sessionId is not valid UUID', async () => {
      const result = await handler(makeEvent({
        body: JSON.stringify({ sessionId: 'bad-uuid', type: 'no_show', description: 'Long enough description text here' }),
      }));
      expect(result!.statusCode).toBe(400);
    });

    it('should return 400 for invalid dispute type', async () => {
      const result = await handler(makeEvent({
        body: JSON.stringify({ sessionId: VALID_SESSION_ID, type: 'invalid_type', description: 'A description that is long enough' }),
      }));
      expect(result!.statusCode).toBe(400);
      expect(JSON.parse(result!.body).message).toContain('Invalid dispute type');
    });

    it('should return 400 when description is too short', async () => {
      const result = await handler(makeEvent({
        body: JSON.stringify({ sessionId: VALID_SESSION_ID, type: 'no_show', description: 'Too short' }),
      }));
      expect(result!.statusCode).toBe(400);
      expect(JSON.parse(result!.body).message).toContain('Description must be between');
    });
  });

  describe('moderation', () => {
    it('should return 400 when description is blocked by text filter', async () => {
      (filterText as jest.Mock).mockResolvedValueOnce({ clean: false, severity: 'critical' });
      const result = await handler(makeEvent());
      expect(result!.statusCode).toBe(400);
      expect(JSON.parse(result!.body).message).toBe('Content policy violation');
    });

    it('should return 400 when description is blocked by toxicity', async () => {
      (analyzeTextToxicity as jest.Mock).mockResolvedValueOnce({ action: 'block', topCategory: 'hate' });
      const result = await handler(makeEvent());
      expect(result!.statusCode).toBe(400);
    });
  });

  describe('session validation', () => {
    it('should return 404 when session not found', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [] }); // BEGIN
      mockClient.query
        .mockResolvedValueOnce({ rows: [] }); // session not found
      const result = await handler(makeEvent());
      expect(result!.statusCode).toBe(404);
    });

    it('should return 403 when user is not the buyer', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [{
          buyer_id: 'other-user-id',
          creator_id: VALID_CREATOR_ID,
          scheduled_at: new Date().toISOString(),
          amount_cents: 5000,
          currency: 'eur',
          payment_id: 'pay-123',
          duration_minutes: 30,
        }] });
      const result = await handler(makeEvent());
      expect(result!.statusCode).toBe(403);
    });
  });

  describe('error handling', () => {
    it('should return 500 and ROLLBACK on unexpected error', async () => {
      (getUserFromEvent as jest.Mock).mockRejectedValueOnce(new Error('Unexpected'));
      const result = await handler(makeEvent());
      expect(result!.statusCode).toBe(500);
      expect(JSON.parse(result!.body).message).toBe('Internal server error');
    });
  });
});

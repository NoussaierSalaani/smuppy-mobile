/**
 * Tests for reports/report-livestream Lambda handler
 * Uses createReportHandler with entityTable='live_streams'.
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
  createCacheableHeaders: jest.fn(() => ({
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  })),
  getSecureHeaders: jest.fn(() => ({ 'Content-Type': 'application/json' })),
}));

jest.mock('../../utils/auth', () => ({
  resolveProfileId: jest.fn(),
  checkPrivacyAccess: jest.fn(),
}));

jest.mock('../../utils/security', () => ({
  isValidUUID: jest.fn((uuid: string) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(uuid)
  ),
}));

jest.mock('../../../shared/moderation/autoEscalation', () => ({
  checkUserEscalation: jest.fn().mockResolvedValue({ action: 'none' }),
  checkPostEscalation: jest.fn().mockResolvedValue({ action: 'none' }),
  checkPeakEscalation: jest.fn().mockResolvedValue({ action: 'none' }),
}));

import { handler } from '../../reports/report-livestream';
import { requireRateLimit } from '../../utils/rate-limit';
import { resolveProfileId } from '../../utils/auth';
import { checkUserEscalation } from '../../../shared/moderation/autoEscalation';

const TEST_SUB = 'cognito-sub-test123';
const VALID_STREAM_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const VALID_PROFILE_ID = 'b2c3d4e5-f6a7-8901-bcde-f12345678901';
const VALID_REPORT_ID = 'c3d4e5f6-a7b8-9012-cdef-123456789012';
const VALID_HOST_ID = 'd4e5f6a7-b8c9-0123-defa-234567890123';

function makeEvent(overrides: Partial<Record<string, unknown>> = {}): APIGatewayProxyEvent {
  const sub = overrides.sub === null ? null : (overrides.sub ?? TEST_SUB);
  const body = overrides.body === undefined
    ? { liveStreamId: VALID_STREAM_ID, reason: 'inappropriate', details: 'Bad content' }
    : overrides.body;
  return {
    httpMethod: 'POST',
    headers: {},
    body: body !== null ? JSON.stringify(body) : null,
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
      authorizer: sub !== null ? { claims: { sub } } : undefined,
      identity: { sourceIp: '127.0.0.1' },
    },
  } as unknown as APIGatewayProxyEvent;
}

describe('reports/report-livestream handler', () => {
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
    (requireRateLimit as jest.Mock).mockResolvedValue(null);
    (resolveProfileId as jest.Mock).mockResolvedValue(VALID_PROFILE_ID);
  });

  describe('authentication', () => {
    it('should return 401 when no auth', async () => {
      const result = await handler(makeEvent({ sub: null }));
      expect(result.statusCode).toBe(401);
    });
  });

  describe('validation', () => {
    it('should return 400 when liveStreamId is missing', async () => {
      const result = await handler(makeEvent({ body: { reason: 'spam' } }));
      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toContain('Invalid live stream ID format');
    });

    it('should return 400 when reason is missing', async () => {
      const result = await handler(makeEvent({ body: { liveStreamId: VALID_STREAM_ID } }));
      expect(result.statusCode).toBe(400);
    });
  });

  describe('live stream existence', () => {
    it('should return 404 when live stream not found', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });
      const result = await handler(makeEvent());
      expect(result.statusCode).toBe(404);
      expect(JSON.parse(result.body).message).toBe('Live stream not found');
    });
  });

  describe('happy path', () => {
    it('should create report and return 201', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [{ id: VALID_STREAM_ID }] });
      mockClient.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ id: VALID_REPORT_ID }] })
        .mockResolvedValueOnce({ rows: [] });
      mockDb.query.mockResolvedValueOnce({ rows: [{ host_id: VALID_HOST_ID }] });

      const result = await handler(makeEvent());
      expect(result.statusCode).toBe(201);
      expect(JSON.parse(result.body).success).toBe(true);
    });

    it('should call checkUserEscalation for host', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [{ id: VALID_STREAM_ID }] });
      mockClient.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ id: VALID_REPORT_ID }] })
        .mockResolvedValueOnce({ rows: [] });
      mockDb.query.mockResolvedValueOnce({ rows: [{ host_id: VALID_HOST_ID }] });

      await handler(makeEvent());
      expect(checkUserEscalation).toHaveBeenCalledWith(mockDb, VALID_HOST_ID);
    });
  });

  describe('error handling', () => {
    it('should return 500 on database error', async () => {
      mockDb.query.mockRejectedValueOnce(new Error('DB error'));
      const result = await handler(makeEvent());
      expect(result.statusCode).toBe(500);
    });
  });
});

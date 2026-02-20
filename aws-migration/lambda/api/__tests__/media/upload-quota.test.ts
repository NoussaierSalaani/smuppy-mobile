/**
 * Tests for media/upload-quota Lambda handler
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
jest.mock('../../utils/constants', () => ({ RATE_WINDOW_1_MIN: 60 }));
jest.mock('../../utils/upload-quota', () => ({
  getQuotaLimits: jest.fn().mockReturnValue({
    dailyVideoSeconds: 600,
    dailyPhotoCount: 50,
    dailyPeakCount: 10,
    maxVideoSeconds: 120,
    maxVideoSizeBytes: 100 * 1024 * 1024,
    videoRenditions: ['480p', '720p'],
  }),
  getQuotaUsage: jest.fn().mockResolvedValue({ videoSecondsUsed: 100, photoCountUsed: 5, peakCountUsed: 2 }),
  isPremiumAccount: jest.fn().mockReturnValue(false),
}));

import { handler } from '../../media/upload-quota';
import { requireRateLimit } from '../../utils/rate-limit';

const TEST_SUB = 'cognito-sub-test123';

function makeEvent(overrides: Partial<Record<string, unknown>> = {}): APIGatewayProxyEvent {
  return {
    httpMethod: 'GET',
    headers: {},
    body: null,
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

describe('media/upload-quota handler', () => {
  let mockDb: { query: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();
    mockDb = { query: jest.fn().mockResolvedValue({ rows: [{ id: 'profile-1', account_type: 'personal' }] }) };
    (getPool as jest.Mock).mockResolvedValue(mockDb);
    (requireRateLimit as jest.Mock).mockResolvedValue(null);
  });

  it('should return 401 when no auth', async () => {
    const result = await handler(makeEvent({ sub: null }));
    expect(result.statusCode).toBe(401);
  });

  it('should return 404 when profile not found', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] });
    const result = await handler(makeEvent());
    expect(result.statusCode).toBe(404);
  });

  it('should return 200 with quota info', async () => {
    const result = await handler(makeEvent());
    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.success).toBe(true);
    expect(body.quotas).toBeDefined();
    expect(body.quotas.videoSeconds).toBeDefined();
    expect(body.quotas.photoCount).toBeDefined();
    expect(body.resetsAt).toBeDefined();
  });

  it('should return 500 on error', async () => {
    mockDb.query.mockRejectedValueOnce(new Error('DB error'));
    const result = await handler(makeEvent());
    expect(result.statusCode).toBe(500);
  });
});

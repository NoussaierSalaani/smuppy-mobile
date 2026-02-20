/**
 * Tests for media/upload-url Lambda handler
 */

import { APIGatewayProxyEvent } from 'aws-lambda';

// Set env before import
process.env.MEDIA_BUCKET = 'test-media-bucket';

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
jest.mock('../../utils/constants', () => ({
  RATE_WINDOW_1_MIN: 60,
  PRESIGNED_URL_EXPIRY_SECONDS: 300,
}));
jest.mock('../../utils/upload-quota', () => ({
  checkQuota: jest.fn().mockResolvedValue({ allowed: true, remaining: 10, limit: 20 }),
  getQuotaLimits: jest.fn().mockReturnValue({
    dailyVideoSeconds: 600,
    dailyPhotoCount: 50,
    dailyPeakCount: 10,
    maxVideoSeconds: 120,
    maxVideoSizeBytes: 100 * 1024 * 1024,
    videoRenditions: ['480p', '720p'],
  }),
}));
jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn(() => ({ send: jest.fn().mockResolvedValue({}) })),
  PutObjectCommand: jest.fn(),
}));
jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn().mockResolvedValue('https://s3.amazonaws.com/signed-url'),
}));
jest.mock('../../utils/auth', () => ({
  resolveProfileId: jest.fn(),
}));

import { getPool } from '../../../shared/db';
import { handler } from '../../media/upload-url';
import { requireRateLimit } from '../../utils/rate-limit';
import { resolveProfileId } from '../../utils/auth';

const TEST_SUB = 'cognito-sub-test123';
const TEST_PROFILE_ID = 'profile-1';

function makeEvent(overrides: Partial<Record<string, unknown>> = {}): APIGatewayProxyEvent {
  return {
    httpMethod: 'POST',
    headers: {},
    body: overrides.body as string ?? JSON.stringify({
      contentType: 'image/jpeg',
      fileSize: 5 * 1024 * 1024,
      uploadType: 'post',
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
        ? { claims: { sub: overrides.sub ?? TEST_SUB } }
        : undefined,
      identity: { sourceIp: '127.0.0.1' },
    },
  } as unknown as APIGatewayProxyEvent;
}

describe('media/upload-url handler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    const mockDb = { query: jest.fn().mockResolvedValue({ rows: [{ account_type: 'personal' }] }) };
    (getPool as jest.Mock).mockResolvedValue(mockDb);
    (resolveProfileId as jest.Mock).mockResolvedValue(TEST_PROFILE_ID);
    (requireRateLimit as jest.Mock).mockResolvedValue(null);
  });

  it('should return 401 when no auth', async () => {
    const result = await handler(makeEvent({ sub: null }));
    expect(result.statusCode).toBe(401);
  });

  it('should return 429 when rate limited', async () => {
    (requireRateLimit as jest.Mock).mockResolvedValueOnce({
      statusCode: 429, headers: {}, body: JSON.stringify({ message: 'Rate limited' }),
    });
    const result = await handler(makeEvent());
    expect(result.statusCode).toBe(429);
  });

  it('should return 400 when body is missing', async () => {
    const event = makeEvent();
    event.body = null;
    const result = await handler(event);
    expect(result.statusCode).toBe(400);
  });

  it('should return 400 when fileSize is missing', async () => {
    const result = await handler(makeEvent({
      body: JSON.stringify({ contentType: 'image/jpeg' }),
    }));
    expect(result.statusCode).toBe(400);
  });

  it('should return 400 when contentType is invalid', async () => {
    const result = await handler(makeEvent({
      body: JSON.stringify({ contentType: 'application/pdf', fileSize: 1000 }),
    }));
    expect(result.statusCode).toBe(400);
  });

  it('should return 400 when file is too large', async () => {
    const result = await handler(makeEvent({
      body: JSON.stringify({ contentType: 'image/jpeg', fileSize: 50 * 1024 * 1024, uploadType: 'post' }),
    }));
    expect(result.statusCode).toBe(400);
  });

  it('should return 200 with upload URL on success', async () => {
    const result = await handler(makeEvent());
    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.success).toBe(true);
    expect(body.uploadUrl).toBeDefined();
    expect(body.key).toBeDefined();
  });

  it('should return 500 on unexpected error', async () => {
    (getPool as jest.Mock).mockRejectedValueOnce(new Error('DB error'));
    const result = await handler(makeEvent());
    expect(result.statusCode).toBe(500);
  });
});

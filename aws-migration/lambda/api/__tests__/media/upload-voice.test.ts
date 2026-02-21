/**
 * Tests for media/upload-voice Lambda handler
 */

import { APIGatewayProxyEvent } from 'aws-lambda';

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
jest.mock('../../utils/security', () => ({
  isValidUUID: jest.fn((uuid: string) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(uuid)
  ),
}));
jest.mock('../../utils/constants', () => ({
  RATE_WINDOW_1_MIN: 60,
  PRESIGNED_URL_EXPIRY_SECONDS: 300,
  MAX_VOICE_MESSAGE_SECONDS: 300,
  MAX_VOICE_SIZE_BYTES: 5 * 1024 * 1024,
  DEFAULT_PAGE_SIZE: 20,
  MAX_PAGE_SIZE: 50,
}));
jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn(() => ({ send: jest.fn().mockResolvedValue({}) })),
  PutObjectCommand: jest.fn(),
}));
jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn().mockResolvedValue('https://s3.amazonaws.com/signed-voice-url'),
}));
jest.mock('../../utils/auth', () => ({
  resolveProfileId: jest.fn(),
}));

import { getPool } from '../../../shared/db';
import { handler } from '../../media/upload-voice';
import { requireRateLimit } from '../../utils/rate-limit';
import { resolveProfileId } from '../../utils/auth';

const TEST_SUB = 'cognito-sub-test123';
const VALID_CONV_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const VALID_PROFILE_ID = 'b2c3d4e5-f6a7-8901-bcde-f12345678901';

function makeEvent(overrides: Partial<Record<string, unknown>> = {}): APIGatewayProxyEvent {
  return {
    httpMethod: 'POST',
    headers: {},
    body: overrides.body as string ?? JSON.stringify({ conversationId: VALID_CONV_ID, duration: 15 }),
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

describe('media/upload-voice handler', () => {
  let mockDb: { query: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();
    mockDb = { query: jest.fn() };
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: VALID_CONV_ID }] }); // conversation check
    (getPool as jest.Mock).mockResolvedValue(mockDb);
    (resolveProfileId as jest.Mock).mockResolvedValue(VALID_PROFILE_ID);
    (requireRateLimit as jest.Mock).mockResolvedValue(null);
  });

  it('should return 401 when no auth', async () => {
    const result = await handler(makeEvent({ sub: null }));
    expect(result.statusCode).toBe(401);
  });

  it('should return 400 when body is missing', async () => {
    const event = makeEvent();
    event.body = null;
    const result = await handler(event);
    expect(result.statusCode).toBe(400);
  });

  it('should return 400 when conversationId is missing', async () => {
    const result = await handler(makeEvent({ body: JSON.stringify({}) }));
    expect(result.statusCode).toBe(400);
  });

  it('should return 400 when conversationId is invalid UUID', async () => {
    const result = await handler(makeEvent({ body: JSON.stringify({ conversationId: 'bad' }) }));
    expect(result.statusCode).toBe(400);
  });

  it('should return 400 for invalid duration', async () => {
    const result = await handler(makeEvent({
      body: JSON.stringify({ conversationId: VALID_CONV_ID, duration: 500 }),
    }));
    expect(result.statusCode).toBe(400);
  });

  it('should return 404 when profile not found', async () => {
    (resolveProfileId as jest.Mock).mockResolvedValueOnce(null);
    const result = await handler(makeEvent());
    expect(result.statusCode).toBe(404);
  });

  it('should return 403 when not a conversation participant', async () => {
    mockDb.query.mockReset();
    mockDb.query
      .mockResolvedValueOnce({ rows: [] }); // not participant
    const result = await handler(makeEvent());
    expect(result.statusCode).toBe(403);
  });

  it('should return 200 with upload URL on success', async () => {
    const result = await handler(makeEvent());
    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.success).toBe(true);
    expect(body.url).toBeDefined();
    expect(body.key).toBeDefined();
  });

  it('should return 500 on unexpected error', async () => {
    (getPool as jest.Mock).mockRejectedValueOnce(new Error('DB error'));
    const result = await handler(makeEvent());
    expect(result.statusCode).toBe(500);
  });
});

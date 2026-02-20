/**
 * Tests for media/video-status Lambda handler
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
jest.mock('../../utils/security', () => ({
  isValidUUID: jest.fn((uuid: string) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(uuid)
  ),
}));
jest.mock('../../utils/constants', () => ({ RATE_WINDOW_1_MIN: 60 }));

import { handler } from '../../media/video-status';
import { requireRateLimit } from '../../utils/rate-limit';

const TEST_SUB = 'cognito-sub-test123';
const VALID_POST_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const VALID_PROFILE_ID = 'b2c3d4e5-f6a7-8901-bcde-f12345678901';

function makeEvent(overrides: Partial<Record<string, unknown>> = {}): APIGatewayProxyEvent {
  return {
    httpMethod: 'GET',
    headers: {},
    body: null,
    queryStringParameters: overrides.queryStringParameters as Record<string, string> ?? { type: 'post', id: VALID_POST_ID },
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

describe('media/video-status handler', () => {
  let mockDb: { query: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();
    mockDb = { query: jest.fn() };
    (getPool as jest.Mock).mockResolvedValue(mockDb);
    (requireRateLimit as jest.Mock).mockResolvedValue(null);
  });

  it('should return 401 when no auth', async () => {
    const result = await handler(makeEvent({ sub: null }));
    expect(result.statusCode).toBe(401);
  });

  it('should return 400 when type is invalid', async () => {
    const result = await handler(makeEvent({ queryStringParameters: { type: 'invalid', id: VALID_POST_ID } }));
    expect(result.statusCode).toBe(400);
  });

  it('should return 400 when id is missing', async () => {
    const result = await handler(makeEvent({ queryStringParameters: { type: 'post' } }));
    expect(result.statusCode).toBe(400);
  });

  it('should return 400 when id is invalid UUID', async () => {
    const result = await handler(makeEvent({ queryStringParameters: { type: 'post', id: 'bad' } }));
    expect(result.statusCode).toBe(400);
  });

  it('should return 404 when profile not found', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] }); // profile not found
    const result = await handler(makeEvent());
    expect(result.statusCode).toBe(404);
  });

  it('should return 404 when post not found', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: VALID_PROFILE_ID }] }) // profile
      .mockResolvedValueOnce({ rows: [] }); // post not found
    const result = await handler(makeEvent());
    expect(result.statusCode).toBe(404);
  });

  it('should return 200 with video status', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: VALID_PROFILE_ID }] })
      .mockResolvedValueOnce({ rows: [{
        video_status: 'ready',
        hls_url: 'https://cdn.example.com/hls/master.m3u8',
        thumbnail_url: 'https://cdn.example.com/thumb.jpg',
        video_variants: '[{"url": "test"}]',
        video_duration: 30,
      }] });
    const result = await handler(makeEvent());
    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.success).toBe(true);
    expect(body.videoStatus).toBe('ready');
    expect(body.hlsUrl).toBeDefined();
  });

  it('should return 500 on error', async () => {
    mockDb.query.mockRejectedValueOnce(new Error('DB error'));
    const result = await handler(makeEvent());
    expect(result.statusCode).toBe(500);
  });
});

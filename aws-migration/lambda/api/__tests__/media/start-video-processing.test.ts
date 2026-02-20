/**
 * Tests for media/start-video-processing Lambda handler
 */

import { APIGatewayProxyEvent } from 'aws-lambda';

process.env.MEDIA_CONVERT_ENDPOINT = 'https://mediaconvert.us-east-1.amazonaws.com';
process.env.MEDIA_CONVERT_ROLE_ARN = 'arn:aws:iam::role/MediaConvertRole';
process.env.MEDIA_BUCKET = 'test-media-bucket';

jest.mock('../../../shared/db', () => ({ getPool: jest.fn(), getReaderPool: jest.fn() }));
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
jest.mock('@aws-sdk/client-mediaconvert', () => ({
  MediaConvertClient: jest.fn(() => ({
    send: jest.fn().mockResolvedValue({ Job: { Id: 'mc-job-123' } }),
  })),
  CreateJobCommand: jest.fn(),
}));

import { getPool } from '../../../shared/db';
import { handler } from '../../media/start-video-processing';

const VALID_ENTITY_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

function makeEvent(overrides: Partial<Record<string, unknown>> = {}): APIGatewayProxyEvent {
  return {
    httpMethod: 'POST',
    headers: {},
    body: overrides.body as string ?? JSON.stringify({
      entityType: 'post',
      entityId: VALID_ENTITY_ID,
      sourceKey: 'posts/user1/video.mp4',
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
      authorizer: { claims: { sub: 'internal' } },
      identity: { sourceIp: '127.0.0.1' },
    },
  } as unknown as APIGatewayProxyEvent;
}

describe('media/start-video-processing handler', () => {
  let mockDb: { query: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();
    mockDb = { query: jest.fn().mockResolvedValue({ rows: [] }) };
    (getPool as jest.Mock).mockResolvedValue(mockDb);
  });

  it('should return 400 when body is missing', async () => {
    const event = makeEvent();
    event.body = null;
    const result = await handler(event);
    expect(result.statusCode).toBe(400);
  });

  it('should return 400 for invalid entityType', async () => {
    const result = await handler(makeEvent({ body: JSON.stringify({ entityType: 'invalid', entityId: VALID_ENTITY_ID, sourceKey: 'key' }) }));
    expect(result.statusCode).toBe(400);
  });

  it('should return 400 for invalid entityId', async () => {
    const result = await handler(makeEvent({ body: JSON.stringify({ entityType: 'post', entityId: 'bad', sourceKey: 'key' }) }));
    expect(result.statusCode).toBe(400);
  });

  it('should return 400 for missing sourceKey', async () => {
    const result = await handler(makeEvent({ body: JSON.stringify({ entityType: 'post', entityId: VALID_ENTITY_ID }) }));
    expect(result.statusCode).toBe(400);
  });

  it('should return 200 and create MediaConvert job', async () => {
    const result = await handler(makeEvent());
    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.success).toBe(true);
    expect(body.jobId).toBe('mc-job-123');
    expect(body.status).toBe('processing');
    expect(mockDb.query).toHaveBeenCalled();
  });

  it('should return 500 on error', async () => {
    (getPool as jest.Mock).mockRejectedValueOnce(new Error('DB error'));
    const result = await handler(makeEvent());
    expect(result.statusCode).toBe(500);
  });
});

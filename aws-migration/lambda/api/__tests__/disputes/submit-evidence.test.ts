/**
 * Tests for disputes/submit-evidence Lambda handler
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
jest.mock('../../utils/auth', () => ({
  getUserFromEvent: jest.fn(),
  resolveProfileId: jest.fn(),
}));
jest.mock('../../utils/security', () => ({
  isValidUUID: jest.fn((uuid: string) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(uuid)
  ),
}));

import { handler } from '../../disputes/submit-evidence';
import { getUserFromEvent, resolveProfileId } from '../../utils/auth';
import { requireRateLimit } from '../../utils/rate-limit';

const VALID_DISPUTE_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const VALID_PROFILE_ID = 'b2c3d4e5-f6a7-8901-bcde-f12345678901';
const TEST_USER_ID = 'cognito-sub-123';

function makeEvent(overrides: Partial<Record<string, unknown>> = {}): APIGatewayProxyEvent {
  return {
    httpMethod: overrides.httpMethod as string ?? 'POST',
    headers: {},
    body: overrides.body as string ?? JSON.stringify({
      type: 'screenshot',
      url: 'https://example.com/screenshot.png',
      filename: 'screenshot.png',
      description: 'Evidence screenshot of the issue during session',
    }),
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

describe('disputes/submit-evidence handler', () => {
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
    (resolveProfileId as jest.Mock).mockResolvedValue(VALID_PROFILE_ID);
    (requireRateLimit as jest.Mock).mockResolvedValue(null);
  });

  it('should return 204 for OPTIONS', async () => {
    const result = await handler(makeEvent({ httpMethod: 'OPTIONS' }), {} as never, {} as never);
    expect(result!.statusCode).toBe(204);
  });

  it('should return 405 for GET', async () => {
    const result = await handler(makeEvent({ httpMethod: 'GET' }), {} as never, {} as never);
    expect(result!.statusCode).toBe(405);
  });

  it('should return 400 when dispute ID is missing', async () => {
    const result = await handler(makeEvent({ pathParameters: {} }), {} as never, {} as never);
    expect(result!.statusCode).toBe(400);
  });

  it('should return 400 when dispute ID is invalid UUID', async () => {
    const result = await handler(makeEvent({ pathParameters: { id: 'bad' } }), {} as never, {} as never);
    expect(result!.statusCode).toBe(400);
  });

  it('should return 401 when no auth', async () => {
    (getUserFromEvent as jest.Mock).mockResolvedValueOnce(null);
    const result = await handler(makeEvent(), {} as never, {} as never);
    expect(result!.statusCode).toBe(401);
  });

  it('should return 400 when type or description is missing', async () => {
    const result = await handler(makeEvent({
      body: JSON.stringify({ url: 'https://example.com/file.png' }),
    }), {} as never, {} as never);
    expect(result!.statusCode).toBe(400);
  });

  it('should return 400 when description is too short', async () => {
    const result = await handler(makeEvent({
      body: JSON.stringify({ type: 'screenshot', url: 'https://x.com/f.png', description: 'Short' }),
    }), {} as never, {} as never);
    expect(result!.statusCode).toBe(400);
  });

  it('should return 400 when file URL missing for non-text type', async () => {
    const result = await handler(makeEvent({
      body: JSON.stringify({ type: 'screenshot', description: 'A description that is at least 10 chars' }),
    }), {} as never, {} as never);
    expect(result!.statusCode).toBe(400);
    expect(JSON.parse(result!.body).message).toContain('File URL is required');
  });

  it('should return 400 when text content missing for text type', async () => {
    const result = await handler(makeEvent({
      body: JSON.stringify({ type: 'text', description: 'A description that is at least 10 chars' }),
    }), {} as never, {} as never);
    expect(result!.statusCode).toBe(400);
    expect(JSON.parse(result!.body).message).toContain('Text content is required');
  });

  it('should return 404 when profile not found', async () => {
    (resolveProfileId as jest.Mock).mockResolvedValueOnce(null);
    const result = await handler(makeEvent(), {} as never, {} as never);
    expect(result!.statusCode).toBe(404);
  });

  it('should return 404 when dispute not found', async () => {
    mockClient.query.mockResolvedValueOnce({ rows: [] }); // dispute not found
    const result = await handler(makeEvent(), {} as never, {} as never);
    expect(result!.statusCode).toBe(404);
  });

  it('should return 403 when user is not a party', async () => {
    mockClient.query.mockResolvedValueOnce({ rows: [{
      id: VALID_DISPUTE_ID,
      status: 'open',
      evidence_deadline: new Date(Date.now() + 86400000).toISOString(),
      complainant_id: 'other-1',
      respondent_id: 'other-2',
      complainant_username: 'user1',
      respondent_username: 'user2',
    }] });
    const result = await handler(makeEvent(), {} as never, {} as never);
    expect(result!.statusCode).toBe(403);
  });

  it('should return 400 when dispute is resolved', async () => {
    mockClient.query.mockResolvedValueOnce({ rows: [{
      id: VALID_DISPUTE_ID,
      status: 'resolved',
      evidence_deadline: new Date(Date.now() + 86400000).toISOString(),
      complainant_id: VALID_PROFILE_ID,
      respondent_id: 'other-2',
      complainant_username: 'user1',
      respondent_username: 'user2',
    }] });
    const result = await handler(makeEvent(), {} as never, {} as never);
    expect(result!.statusCode).toBe(400);
    expect(JSON.parse(result!.body).message).toContain('resolved');
  });

  it('should return 500 on database error', async () => {
    (getUserFromEvent as jest.Mock).mockRejectedValueOnce(new Error('DB error'));
    const result = await handler(makeEvent(), {} as never, {} as never);
    expect(result!.statusCode).toBe(500);
  });
});

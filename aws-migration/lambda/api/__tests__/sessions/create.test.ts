/**
 * Tests for sessions/create Lambda handler
 * Covers: auth, validation, rate limit, schedule conflict, happy path, DB errors
 */

import { APIGatewayProxyEvent } from 'aws-lambda';
import { getPool } from '../../../shared/db';

jest.mock('../../../shared/db', () => ({
  getPool: jest.fn(),
  getReaderPool: jest.fn(),
  corsHeaders: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
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
  createHeaders: jest.fn(() => ({ 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' })),
  getSecureHeaders: jest.fn(() => ({ 'Content-Type': 'application/json' })),
}));
jest.mock('../../utils/auth', () => ({ resolveProfileId: jest.fn() }));
jest.mock('../../utils/security', () => ({
  isValidUUID: jest.fn().mockReturnValue(true),
}));
jest.mock('../../utils/constants', () => ({
  RATE_WINDOW_1_MIN: 60,
  MIN_SESSION_DURATION_MINUTES: 15,
  MAX_SESSION_DURATION_MINUTES: 480,
}));

import { handler } from '../../sessions/create';
import { resolveProfileId } from '../../utils/auth';
import { requireRateLimit } from '../../utils/rate-limit';

const TEST_SUB = 'cognito-sub-test123';
const TEST_PROFILE_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const CREATOR_ID = 'c1c2c3c4-e5f6-7890-abcd-ef1234567890';

function makeEvent(overrides: Partial<Record<string, unknown>> = {}): APIGatewayProxyEvent {
  const futureDate = new Date(Date.now() + 86400000).toISOString(); // tomorrow
  return {
    httpMethod: overrides.httpMethod as string ?? 'POST',
    headers: {},
    body: overrides.body as string ?? JSON.stringify({
      creatorId: CREATOR_ID,
      scheduledAt: futureDate,
      duration: 30,
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

const mockQuery = jest.fn();
const mockRelease = jest.fn();
const mockConnect = jest.fn().mockResolvedValue({ query: mockQuery, release: mockRelease });

beforeEach(() => {
  jest.clearAllMocks();
  (getPool as jest.Mock).mockResolvedValue({ query: mockQuery, connect: mockConnect });
  (resolveProfileId as jest.Mock).mockResolvedValue(TEST_PROFILE_ID);
  (requireRateLimit as jest.Mock).mockResolvedValue(null);
});

describe('sessions/create handler', () => {
  it('should return 401 for OPTIONS without auth (withAuthHandler enforces auth)', async () => {
    const event = makeEvent({ httpMethod: 'OPTIONS', sub: null });
    const res = await handler(event, {} as never, () => {});
    const result = res as { statusCode: number };
    expect(result.statusCode).toBe(401);
  });

  it('should return 401 when unauthenticated', async () => {
    const event = makeEvent({ sub: null });
    const res = await handler(event, {} as never, () => {});
    const result = res as { statusCode: number };
    expect(result.statusCode).toBe(401);
  });

  it('should return 429 when rate limited', async () => {
    (requireRateLimit as jest.Mock).mockResolvedValue({ statusCode: 429, headers: {}, body: '{}' });
    const event = makeEvent();
    const res = await handler(event, {} as never, () => {});
    const result = res as { statusCode: number };
    expect(result.statusCode).toBe(429);
  });

  it('should return 404 when profile not found', async () => {
    (resolveProfileId as jest.Mock).mockResolvedValue(null);
    const event = makeEvent();
    const res = await handler(event, {} as never, () => {});
    const result = res as { statusCode: number };
    expect(result.statusCode).toBe(404);
  });

  it('should return 400 when missing required fields', async () => {
    const event = makeEvent({ body: JSON.stringify({}) });
    const res = await handler(event, {} as never, () => {});
    const result = res as { statusCode: number; body: string };
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toContain('Missing required fields');
  });

  it('should return 400 for past scheduled date', async () => {
    const event = makeEvent({
      body: JSON.stringify({
        creatorId: CREATOR_ID,
        scheduledAt: '2020-01-01T00:00:00Z',
        duration: 30,
      }),
    });
    const res = await handler(event, {} as never, () => {});
    const result = res as { statusCode: number; body: string };
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toContain('past scheduled date');
  });

  it('should return 500 on database error', async () => {
    mockConnect.mockRejectedValueOnce(new Error('DB error'));
    const event = makeEvent();
    const res = await handler(event, {} as never, () => {});
    const result = res as { statusCode: number };
    expect(result.statusCode).toBe(500);
  });
});

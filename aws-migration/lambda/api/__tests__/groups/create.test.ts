/**
 * Tests for groups/create Lambda handler
 */

import { APIGatewayProxyEvent } from 'aws-lambda';
import { getPool } from '../../../shared/db';

jest.mock('../../../shared/db', () => ({
  getPool: jest.fn(),
}));
jest.mock('../../utils/rate-limit', () => ({
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
jest.mock('../../utils/security', () => ({
  sanitizeInput: jest.fn((v: string) => v),
  isValidUUID: jest.fn().mockReturnValue(true),
}));
jest.mock('../../utils/cors', () => ({
  cors: jest.fn((r: Record<string, unknown>) => r),
  handleOptions: jest.fn().mockReturnValue({ statusCode: 200, body: '' }),
  getSecureHeaders: jest.fn(() => ({ 'Content-Type': 'application/json' })),
  createHeaders: jest.fn(() => ({ 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' })),
}));
jest.mock('../../utils/account-status', () => ({
  requireActiveAccount: jest.fn().mockResolvedValue({ profileId: 'p1', accountType: 'personal' }),
  isAccountError: jest.fn().mockReturnValue(false),
}));
jest.mock('../../../shared/moderation/textFilter', () => ({
  filterText: jest.fn().mockResolvedValue({ clean: true }),
}));
jest.mock('../../../shared/moderation/textModeration', () => ({
  analyzeTextToxicity: jest.fn().mockResolvedValue({ action: 'allow' }),
}));
jest.mock('../../utils/auth', () => ({
  resolveProfileId: jest.fn(),
}));

import { handler as _handler } from '../../groups/create';
const handler = _handler as unknown as (event: APIGatewayProxyEvent) => Promise<{ statusCode: number; body: string; headers?: Record<string, string> }>;
import { filterText } from '../../../shared/moderation/textFilter';
import { analyzeTextToxicity } from '../../../shared/moderation/textModeration';
import { resolveProfileId } from '../../utils/auth';

const TEST_SUB = 'cognito-sub-test123';

function makeEvent(overrides: Partial<Record<string, unknown>> = {}): APIGatewayProxyEvent {
  const futureDate = new Date(Date.now() + 86400000).toISOString();
  return {
    httpMethod: overrides.httpMethod as string ?? 'POST',
    headers: {},
    body: overrides.body as string ?? JSON.stringify({
      name: 'Test Group',
      latitude: 48.8566,
      longitude: 2.3522,
      starts_at: futureDate,
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
  (resolveProfileId as jest.Mock).mockResolvedValue('p1');
});

describe('groups/create handler', () => {
  it('should return 401 for OPTIONS (no auth, handler does not handle OPTIONS; API Gateway does)', async () => {
    const event = makeEvent({ httpMethod: 'OPTIONS', sub: null });
    const res = await handler(event);
    const result = res as { statusCode: number };
    expect(result.statusCode).toBe(401);
  });

  it('should return 401 when unauthenticated', async () => {
    const event = makeEvent({ sub: null });
    const res = await handler(event);
    const result = res as { statusCode: number };
    expect(result.statusCode).toBe(401);
  });

  it('should return 404 when profile not found', async () => {
    (resolveProfileId as jest.Mock).mockResolvedValueOnce(null);
    const event = makeEvent();
    const res = await handler(event);
    const result = res as { statusCode: number };
    expect(result.statusCode).toBe(404);
  });

  it('should return 400 when required fields missing', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'p1', account_type: 'personal' }] });
    mockQuery.mockResolvedValueOnce({ rows: [{ count: 0 }] }); // monthly limit
    const event = makeEvent({ body: JSON.stringify({}) });
    const res = await handler(event);
    const result = res as { statusCode: number };
    expect(result.statusCode).toBe(400);
  });

  it('should return 400 for invalid coordinates', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'p1', account_type: 'personal' }] });
    mockQuery.mockResolvedValueOnce({ rows: [{ count: 0 }] });
    const futureDate = new Date(Date.now() + 86400000).toISOString();
    const event = makeEvent({
      body: JSON.stringify({ name: 'Test', latitude: 999, longitude: 2.35, starts_at: futureDate }),
    });
    const res = await handler(event);
    const result = res as { statusCode: number };
    expect(result.statusCode).toBe(400);
  });

  it('should return 400 when text blocked by moderation', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'p1', account_type: 'personal' }] });
    mockQuery.mockResolvedValueOnce({ rows: [{ count: 0 }] });
    (filterText as jest.Mock).mockResolvedValueOnce({ clean: false, severity: 'critical' });
    const futureDate = new Date(Date.now() + 86400000).toISOString();
    const event = makeEvent({
      body: JSON.stringify({ name: 'Bad Name', latitude: 48.85, longitude: 2.35, starts_at: futureDate }),
    });
    const res = await handler(event);
    const result = res as { statusCode: number };
    expect(result.statusCode).toBe(400);
  });

  it('should return 400 when text blocked by toxicity', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'p1', account_type: 'personal' }] });
    mockQuery.mockResolvedValueOnce({ rows: [{ count: 0 }] });
    (filterText as jest.Mock).mockResolvedValue({ clean: true });
    (analyzeTextToxicity as jest.Mock).mockResolvedValueOnce({ action: 'block', topCategory: 'hate' });
    const futureDate = new Date(Date.now() + 86400000).toISOString();
    const event = makeEvent({
      body: JSON.stringify({ name: 'Toxic Name', latitude: 48.85, longitude: 2.35, starts_at: futureDate }),
    });
    const res = await handler(event);
    const result = res as { statusCode: number };
    expect(result.statusCode).toBe(400);
  });

  it('should return 403 when monthly limit reached for personal account', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'p1', account_type: 'personal' }] });
    mockQuery.mockResolvedValueOnce({ rows: [{ count: 4 }] }); // monthly limit reached
    const event = makeEvent();
    const res = await handler(event);
    const result = res as { statusCode: number };
    expect(result.statusCode).toBe(403);
  });

  it('should return 500 on database error', async () => {
    // Mock a query failure inside the try/catch (pool.connect() is called before try/catch)
    mockQuery.mockRejectedValueOnce(new Error('DB error'));
    const event = makeEvent();
    const res = await handler(event);
    const result = res as { statusCode: number };
    expect(result.statusCode).toBe(500);
  });
});

/**
 * Tests for channel-subscription Lambda handler
 * Validates fan-to-creator channel subscription flows
 */

import { APIGatewayProxyEvent } from 'aws-lambda';
import { handler } from '../../payments/channel-subscription';

// ── Mocks ────────────────────────────────────────────────────────────

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

jest.mock('../../../shared/stripe-client', () => ({
  getStripeClient: jest.fn().mockResolvedValue({
    customers: { create: jest.fn().mockResolvedValue({ id: 'cus_test' }) },
    products: {
      search: jest.fn().mockResolvedValue({ data: [] }),
      create: jest.fn().mockResolvedValue({ id: 'prod_test' }),
    },
    prices: {
      list: jest.fn().mockResolvedValue({ data: [] }),
      create: jest.fn().mockResolvedValue({ id: 'price_test' }),
      update: jest.fn().mockResolvedValue({}),
    },
    checkout: {
      sessions: {
        create: jest.fn().mockResolvedValue({ id: 'cs_test', url: 'https://checkout.stripe.com/test' }),
      },
    },
    subscriptions: {
      update: jest.fn().mockResolvedValue({ id: 'sub_test', cancel_at: 1234567890 }),
    },
  }),
}));

jest.mock('../../../shared/stripe-resilience', () => ({
  safeStripeCall: jest.fn(async (fn: () => Promise<unknown>) => fn()),
}));

jest.mock('../../utils/auth', () => ({
  resolveProfileId: jest.fn().mockResolvedValue('a1b2c3d4-e5f6-7890-abcd-ef1234567890'),
}));

jest.mock('../../utils/security', () => ({
  isValidUUID: jest.fn().mockReturnValue(true),
}));

jest.mock('@aws-sdk/client-cognito-identity-provider', () => ({
  CognitoIdentityProviderClient: jest.fn().mockImplementation(() => ({
    send: jest.fn().mockResolvedValue({ Users: [{ Attributes: [{ Name: 'email', Value: 'test@test.com' }] }] }),
  })),
  ListUsersCommand: jest.fn(),
}));

// ── Helpers ──────────────────────────────────────────────────────────

const TEST_SUB = 'cognito-sub-test123';
const TEST_PROFILE_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const TEST_CREATOR_ID = 'b2c3d4e5-f6a7-8901-bcde-f12345678901';

function makeEvent(overrides: Partial<Record<string, unknown>> = {}): APIGatewayProxyEvent {
  return {
    httpMethod: overrides.httpMethod as string ?? 'POST',
    headers: {},
    body: overrides.body as string ?? null,
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

// ── Tests ────────────────────────────────────────────────────────────

describe('payments/channel-subscription handler', () => {
  let mockClient: { query: jest.Mock; release: jest.Mock };
  let mockPool: { query: jest.Mock; connect: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();
    mockClient = { query: jest.fn(), release: jest.fn() };
    mockPool = {
      query: jest.fn(),
      connect: jest.fn().mockResolvedValue(mockClient),
    };
    const { getPool } = require('../../../shared/db');
    (getPool as jest.Mock).mockResolvedValue(mockPool);
  });

  it('returns 200 for OPTIONS preflight', async () => {
    const event = makeEvent({ httpMethod: 'OPTIONS' });
    const result = await handler(event);
    expect(result.statusCode).toBe(200);
  });

  it('returns 401 when unauthenticated', async () => {
    const event = makeEvent({ sub: null });
    const result = await handler(event);
    expect(result.statusCode).toBe(401);
  });

  it('returns 429 when rate limited', async () => {
    const { requireRateLimit } = require('../../utils/rate-limit');
    (requireRateLimit as jest.Mock).mockResolvedValueOnce({
      statusCode: 429, headers: {}, body: JSON.stringify({ message: 'Rate limited' }),
    });
    const event = makeEvent({ body: JSON.stringify({ action: 'list-subscriptions' }) });
    const result = await handler(event);
    expect(result.statusCode).toBe(429);
  });

  it('returns 404 when profile not found', async () => {
    const { resolveProfileId } = require('../../utils/auth');
    (resolveProfileId as jest.Mock).mockResolvedValueOnce(null);
    const event = makeEvent({ body: JSON.stringify({ action: 'list-subscriptions' }) });
    const result = await handler(event);
    expect(result.statusCode).toBe(404);
  });

  it('returns 400 for invalid creatorId UUID format', async () => {
    const { isValidUUID } = require('../../utils/security');
    (isValidUUID as jest.Mock).mockReturnValueOnce(false);
    const event = makeEvent({ body: JSON.stringify({ action: 'subscribe', creatorId: 'not-a-uuid' }) });
    const result = await handler(event);
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toBe('Invalid creatorId format');
  });

  it('returns 400 for invalid action', async () => {
    const event = makeEvent({ body: JSON.stringify({ action: 'invalid' }) });
    const result = await handler(event);
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toBe('Invalid action');
  });

  it('subscribe returns 400 when creatorId missing', async () => {
    const event = makeEvent({ body: JSON.stringify({ action: 'subscribe' }) });
    const result = await handler(event);
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toBe('creatorId is required');
  });

  it('cancel returns 400 when subscriptionId missing', async () => {
    const event = makeEvent({ body: JSON.stringify({ action: 'cancel' }) });
    const result = await handler(event);
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toBe('subscriptionId is required');
  });

  it('list-subscriptions returns 200 with subscriptions array', async () => {
    mockClient.query.mockResolvedValueOnce({
      rows: [{
        id: 'sub-1', creator_id: TEST_CREATOR_ID, status: 'active', price_cents: 999,
        current_period_start: '2025-01-01', current_period_end: '2025-02-01',
        cancel_at: null, username: 'creator', full_name: 'Creator Name',
        avatar_url: null, is_verified: true,
      }],
    });
    const event = makeEvent({ body: JSON.stringify({ action: 'list-subscriptions' }) });
    const result = await handler(event);
    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.success).toBe(true);
    expect(body.subscriptions).toHaveLength(1);
  });

  it('get-channel-info returns 404 when creator not found', async () => {
    mockClient.query.mockResolvedValueOnce({ rows: [] });
    const event = makeEvent({ body: JSON.stringify({ action: 'get-channel-info', creatorId: TEST_CREATOR_ID }) });
    const result = await handler(event);
    expect(result.statusCode).toBe(404);
  });

  it('set-price returns 403 when not a pro_creator', async () => {
    mockClient.query.mockResolvedValueOnce({ rows: [{ account_type: 'personal' }] });
    const event = makeEvent({ body: JSON.stringify({ action: 'set-price', pricePerMonth: 999 }) });
    const result = await handler(event);
    expect(result.statusCode).toBe(403);
  });

  it('set-price returns 400 for price out of range', async () => {
    mockClient.query.mockResolvedValueOnce({ rows: [{ account_type: 'pro_creator' }] });
    const event = makeEvent({ body: JSON.stringify({ action: 'set-price', pricePerMonth: 50 }) });
    const result = await handler(event);
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toContain('between $1 and $999');
  });

  it('get-subscribers returns 200 with subscribers and earnings', async () => {
    mockClient.query
      .mockResolvedValueOnce({ rows: [] }) // subscribers
      .mockResolvedValueOnce({ rows: [{ total_gross: '0', total_net: '0' }] }); // earnings
    const event = makeEvent({ body: JSON.stringify({ action: 'get-subscribers' }) });
    const result = await handler(event);
    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.success).toBe(true);
    expect(body.subscriberCount).toBe(0);
  });

  it('returns 500 on unexpected error', async () => {
    const { resolveProfileId } = require('../../utils/auth');
    (resolveProfileId as jest.Mock).mockRejectedValueOnce(new Error('DB error'));
    const event = makeEvent({ body: JSON.stringify({ action: 'list-subscriptions' }) });
    const result = await handler(event);
    expect(result.statusCode).toBe(500);
  });
});

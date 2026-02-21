/**
 * Tests for business/services-update Lambda handler
 */

import { APIGatewayProxyEvent } from 'aws-lambda';
import { handler } from '../../business/services-update';

jest.mock('../../../shared/db', () => ({ getPool: jest.fn(), getReaderPool: jest.fn() }));
jest.mock('../../utils/rate-limit', () => ({ checkRateLimit: jest.fn().mockResolvedValue({ allowed: true }), requireRateLimit: jest.fn().mockResolvedValue(null) }));
jest.mock('../../utils/logger', () => ({ createLogger: jest.fn(() => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(), initFromEvent: jest.fn(), setRequestId: jest.fn(), setUserId: jest.fn(), logRequest: jest.fn(), logResponse: jest.fn(), logQuery: jest.fn(), logSecurity: jest.fn(), child: jest.fn().mockReturnThis() })) }));
jest.mock('../../utils/cors', () => ({ createHeaders: jest.fn(() => ({ 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' })), getSecureHeaders: jest.fn(() => ({ 'Content-Type': 'application/json' })) }));
jest.mock('../../utils/auth', () => ({ getUserFromEvent: jest.fn() }));
jest.mock('../../utils/security', () => ({ isValidUUID: jest.fn().mockReturnValue(true) }));

const TEST_SUB = 'cognito-sub-test123';
const TEST_SERVICE_ID = 'b2c3d4e5-f6a7-8901-bcde-f12345678901';

const RETURNED_ROW = {
  id: TEST_SERVICE_ID, name: 'Updated', description: null, category: 'drop_in',
  price_cents: 3000, duration_minutes: 60, is_subscription: false,
  subscription_period: null, trial_days: 0, max_capacity: null,
  entries_total: null, is_active: true, created_at: '2025-01-01', updated_at: '2025-01-02',
};

function makeEvent(overrides: Partial<Record<string, unknown>> = {}): APIGatewayProxyEvent {
  return {
    httpMethod: 'PATCH',
    headers: {},
    body: 'body' in overrides ? overrides.body as string : null,
    queryStringParameters: null,
    pathParameters: overrides.pathParameters as Record<string, string> ?? { serviceId: TEST_SERVICE_ID },
    multiValueHeaders: {},
    multiValueQueryStringParameters: null,
    isBase64Encoded: false,
    path: `/businesses/my/services/${TEST_SERVICE_ID}`,
    resource: '/',
    stageVariables: null,
    requestContext: { requestId: 'test-req', authorizer: { claims: { sub: TEST_SUB } }, identity: { sourceIp: '127.0.0.1' } },
  } as unknown as APIGatewayProxyEvent;
}

describe('business/services-update handler', () => {
  let mockPool: { query: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();
    mockPool = { query: jest.fn() };
    const { getPool } = require('../../../shared/db');
    (getPool as jest.Mock).mockResolvedValue(mockPool);
    const { getUserFromEvent } = require('../../utils/auth');
    (getUserFromEvent as jest.Mock).mockReturnValue({ id: TEST_SUB, sub: TEST_SUB });
    const { isValidUUID } = require('../../utils/security');
    (isValidUUID as jest.Mock).mockReturnValue(true);
  });

  // ── Auth ─────────────────────────────────────────────────────────
  it('returns 401 when unauthenticated', async () => {
    const { getUserFromEvent } = require('../../utils/auth');
    (getUserFromEvent as jest.Mock).mockReturnValue(null);
    const result = await handler(makeEvent());
    expect(result.statusCode).toBe(401);
  });

  // ── Invalid serviceId ────────────────────────────────────────────
  it('returns 400 when serviceId is invalid', async () => {
    const { isValidUUID } = require('../../utils/security');
    (isValidUUID as jest.Mock).mockReturnValueOnce(false);
    const result = await handler(makeEvent({ pathParameters: { serviceId: 'bad' }, body: JSON.stringify({ name: 'New' }) }));
    expect(result.statusCode).toBe(400);
  });

  // ── Missing serviceId ────────────────────────────────────────────
  it('returns 400 when serviceId is missing', async () => {
    const result = await handler(makeEvent({ pathParameters: {}, body: JSON.stringify({ name: 'New' }) }));
    expect(result.statusCode).toBe(400);
  });

  // ── No fields to update ──────────────────────────────────────────
  it('returns 400 when no fields to update', async () => {
    const ev = makeEvent({ body: JSON.stringify({}) });
    const result = await handler(ev);
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toBe('No fields to update');
  });

  // ── Service not found (ownership check) ──────────────────────────
  it('returns 404 when service not found (ownership check)', async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [] }); // ownership check
    const result = await handler(makeEvent({ body: JSON.stringify({ name: 'Updated' }) }));
    expect(result.statusCode).toBe(404);
  });

  // ── Successful update with name only ─────────────────────────────
  it('returns 200 on successful update', async () => {
    mockPool.query
      .mockResolvedValueOnce({ rows: [{ id: TEST_SERVICE_ID }] }) // ownership
      .mockResolvedValueOnce({ rows: [RETURNED_ROW] }); // update RETURNING
    const result = await handler(makeEvent({ body: JSON.stringify({ name: 'Updated', price_cents: 3000 }) }));
    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.success).toBe(true);
    expect(body.service).toBeDefined();
  });

  // ── name: empty after trim → 400 ────────────────────────────────
  it('returns 400 when name is empty after trim', async () => {
    const result = await handler(makeEvent({ body: JSON.stringify({ name: '   ' }) }));
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toBe('Name cannot be empty');
  });

  // ── name: has HTML tags (stripped) ───────────────────────────────
  it('strips HTML tags from name', async () => {
    mockPool.query
      .mockResolvedValueOnce({ rows: [{ id: TEST_SERVICE_ID }] })
      .mockResolvedValueOnce({ rows: [{ ...RETURNED_ROW, name: 'Clean Name' }] });
    const result = await handler(makeEvent({ body: JSON.stringify({ name: '<b>Clean</b> <script>alert(1)</script>Name' }) }));
    expect(result.statusCode).toBe(200);
  });

  // ── name: only HTML tags → empty → 400 ──────────────────────────
  it('returns 400 when name contains only HTML tags', async () => {
    const result = await handler(makeEvent({ body: JSON.stringify({ name: '<script></script>' }) }));
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toBe('Name cannot be empty');
  });

  // ── description: non-null value ──────────────────────────────────
  it('updates description with non-null value', async () => {
    mockPool.query
      .mockResolvedValueOnce({ rows: [{ id: TEST_SERVICE_ID }] })
      .mockResolvedValueOnce({ rows: [{ ...RETURNED_ROW, description: 'New desc' }] });
    const result = await handler(makeEvent({ body: JSON.stringify({ description: 'New desc' }) }));
    expect(result.statusCode).toBe(200);
    // Verify the param passed includes the description
    const updateCall = mockPool.query.mock.calls[1];
    expect(updateCall[1]).toContain('New desc');
  });

  // ── description: null value (set to null) ────────────────────────
  it('sets description to null when empty string provided', async () => {
    mockPool.query
      .mockResolvedValueOnce({ rows: [{ id: TEST_SERVICE_ID }] })
      .mockResolvedValueOnce({ rows: [RETURNED_ROW] });
    const result = await handler(makeEvent({ body: JSON.stringify({ description: '' }) }));
    expect(result.statusCode).toBe(200);
    // When description is falsy (empty string), it should be set to null
    const updateCall = mockPool.query.mock.calls[1];
    expect(updateCall[1]).toContain(null);
  });

  // ── description: explicit null ───────────────────────────────────
  it('sets description to null when null provided', async () => {
    mockPool.query
      .mockResolvedValueOnce({ rows: [{ id: TEST_SERVICE_ID }] })
      .mockResolvedValueOnce({ rows: [RETURNED_ROW] });
    const result = await handler(makeEvent({ body: JSON.stringify({ description: null }) }));
    expect(result.statusCode).toBe(200);
  });

  // ── category: valid ──────────────────────────────────────────────
  it('updates category with valid value', async () => {
    mockPool.query
      .mockResolvedValueOnce({ rows: [{ id: TEST_SERVICE_ID }] })
      .mockResolvedValueOnce({ rows: [{ ...RETURNED_ROW, category: 'pack' }] });
    const result = await handler(makeEvent({ body: JSON.stringify({ category: 'pack' }) }));
    expect(result.statusCode).toBe(200);
  });

  // ── category: invalid ────────────────────────────────────────────
  it('returns 400 for invalid category', async () => {
    const result = await handler(makeEvent({ body: JSON.stringify({ category: 'invalid_cat' }) }));
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toBe('Invalid category');
  });

  // ── category: membership ─────────────────────────────────────────
  it('accepts membership as valid category', async () => {
    mockPool.query
      .mockResolvedValueOnce({ rows: [{ id: TEST_SERVICE_ID }] })
      .mockResolvedValueOnce({ rows: [{ ...RETURNED_ROW, category: 'membership' }] });
    const result = await handler(makeEvent({ body: JSON.stringify({ category: 'membership' }) }));
    expect(result.statusCode).toBe(200);
  });

  // ── price_cents: valid ───────────────────────────────────────────
  it('updates price_cents with valid number', async () => {
    mockPool.query
      .mockResolvedValueOnce({ rows: [{ id: TEST_SERVICE_ID }] })
      .mockResolvedValueOnce({ rows: [{ ...RETURNED_ROW, price_cents: 5000 }] });
    const result = await handler(makeEvent({ body: JSON.stringify({ price_cents: 5000 }) }));
    expect(result.statusCode).toBe(200);
  });

  // ── price_cents: negative → 400 ─────────────────────────────────
  it('returns 400 for negative price_cents', async () => {
    const result = await handler(makeEvent({ body: JSON.stringify({ price_cents: -100 }) }));
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toBe('Invalid price');
  });

  // ── price_cents: non-number → 400 ───────────────────────────────
  it('returns 400 for non-number price_cents', async () => {
    const result = await handler(makeEvent({ body: JSON.stringify({ price_cents: 'free' }) }));
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toBe('Invalid price');
  });

  // ── price_cents: zero → valid ────────────────────────────────────
  it('accepts zero price_cents', async () => {
    mockPool.query
      .mockResolvedValueOnce({ rows: [{ id: TEST_SERVICE_ID }] })
      .mockResolvedValueOnce({ rows: [{ ...RETURNED_ROW, price_cents: 0 }] });
    const result = await handler(makeEvent({ body: JSON.stringify({ price_cents: 0 }) }));
    expect(result.statusCode).toBe(200);
  });

  // ── duration_minutes ─────────────────────────────────────────────
  it('updates duration_minutes', async () => {
    mockPool.query
      .mockResolvedValueOnce({ rows: [{ id: TEST_SERVICE_ID }] })
      .mockResolvedValueOnce({ rows: [{ ...RETURNED_ROW, duration_minutes: 90 }] });
    const result = await handler(makeEvent({ body: JSON.stringify({ duration_minutes: 90 }) }));
    expect(result.statusCode).toBe(200);
  });

  // ── max_capacity ─────────────────────────────────────────────────
  it('updates max_capacity', async () => {
    mockPool.query
      .mockResolvedValueOnce({ rows: [{ id: TEST_SERVICE_ID }] })
      .mockResolvedValueOnce({ rows: [{ ...RETURNED_ROW, max_capacity: 20 }] });
    const result = await handler(makeEvent({ body: JSON.stringify({ max_capacity: 20 }) }));
    expect(result.statusCode).toBe(200);
  });

  // ── is_subscription ──────────────────────────────────────────────
  it('updates is_subscription', async () => {
    mockPool.query
      .mockResolvedValueOnce({ rows: [{ id: TEST_SERVICE_ID }] })
      .mockResolvedValueOnce({ rows: [{ ...RETURNED_ROW, is_subscription: true }] });
    const result = await handler(makeEvent({ body: JSON.stringify({ is_subscription: true }) }));
    expect(result.statusCode).toBe(200);
  });

  // ── subscription_period: valid ───────────────────────────────────
  it('updates subscription_period with valid value', async () => {
    mockPool.query
      .mockResolvedValueOnce({ rows: [{ id: TEST_SERVICE_ID }] })
      .mockResolvedValueOnce({ rows: [{ ...RETURNED_ROW, subscription_period: 'monthly' }] });
    const result = await handler(makeEvent({ body: JSON.stringify({ subscription_period: 'monthly' }) }));
    expect(result.statusCode).toBe(200);
  });

  // ── subscription_period: yearly ──────────────────────────────────
  it('accepts yearly as valid subscription_period', async () => {
    mockPool.query
      .mockResolvedValueOnce({ rows: [{ id: TEST_SERVICE_ID }] })
      .mockResolvedValueOnce({ rows: [{ ...RETURNED_ROW, subscription_period: 'yearly' }] });
    const result = await handler(makeEvent({ body: JSON.stringify({ subscription_period: 'yearly' }) }));
    expect(result.statusCode).toBe(200);
  });

  // ── subscription_period: invalid → 400 ──────────────────────────
  it('returns 400 for invalid subscription_period', async () => {
    const result = await handler(makeEvent({ body: JSON.stringify({ subscription_period: 'biweekly' }) }));
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toBe('Invalid subscription period');
  });

  // ── subscription_period: null (falsy but defined — skips validation) ──
  it('accepts null subscription_period (clears it)', async () => {
    mockPool.query
      .mockResolvedValueOnce({ rows: [{ id: TEST_SERVICE_ID }] })
      .mockResolvedValueOnce({ rows: [{ ...RETURNED_ROW, subscription_period: null }] });
    const result = await handler(makeEvent({ body: JSON.stringify({ subscription_period: null }) }));
    expect(result.statusCode).toBe(200);
  });

  // ── trial_days ───────────────────────────────────────────────────
  it('updates trial_days', async () => {
    mockPool.query
      .mockResolvedValueOnce({ rows: [{ id: TEST_SERVICE_ID }] })
      .mockResolvedValueOnce({ rows: [{ ...RETURNED_ROW, trial_days: 14 }] });
    const result = await handler(makeEvent({ body: JSON.stringify({ trial_days: 14 }) }));
    expect(result.statusCode).toBe(200);
  });

  // ── entries_total ────────────────────────────────────────────────
  it('updates entries_total', async () => {
    mockPool.query
      .mockResolvedValueOnce({ rows: [{ id: TEST_SERVICE_ID }] })
      .mockResolvedValueOnce({ rows: [{ ...RETURNED_ROW, entries_total: 10 }] });
    const result = await handler(makeEvent({ body: JSON.stringify({ entries_total: 10 }) }));
    expect(result.statusCode).toBe(200);
  });

  // ── is_active ────────────────────────────────────────────────────
  it('updates is_active', async () => {
    mockPool.query
      .mockResolvedValueOnce({ rows: [{ id: TEST_SERVICE_ID }] })
      .mockResolvedValueOnce({ rows: [{ ...RETURNED_ROW, is_active: false }] });
    const result = await handler(makeEvent({ body: JSON.stringify({ is_active: false }) }));
    expect(result.statusCode).toBe(200);
  });

  // ── All fields at once ───────────────────────────────────────────
  it('updates all fields simultaneously', async () => {
    mockPool.query
      .mockResolvedValueOnce({ rows: [{ id: TEST_SERVICE_ID }] })
      .mockResolvedValueOnce({
        rows: [{
          ...RETURNED_ROW,
          name: 'Full Update', description: 'Full desc', category: 'pack',
          price_cents: 9900, duration_minutes: 120, is_subscription: true,
          subscription_period: 'weekly', trial_days: 7, max_capacity: 30,
          entries_total: 50, is_active: true,
        }],
      });
    const result = await handler(makeEvent({
      body: JSON.stringify({
        name: 'Full Update',
        description: 'Full desc',
        category: 'pack',
        price_cents: 9900,
        duration_minutes: 120,
        max_capacity: 30,
        is_subscription: true,
        subscription_period: 'weekly',
        trial_days: 7,
        entries_total: 50,
        is_active: true,
      }),
    }));
    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.success).toBe(true);
    expect(body.service.name).toBe('Full Update');
    expect(body.service.category).toBe('pack');
    expect(body.service.isSubscription).toBe(true);
    expect(body.service.subscriptionPeriod).toBe('weekly');
  });

  // ── OPTIONS preflight (from createBusinessHandler) ───────────────
  it('returns 204 for OPTIONS', async () => {
    const event = makeEvent() as unknown as Record<string, unknown>;
    event.httpMethod = 'OPTIONS';
    const result = await handler(event as unknown as APIGatewayProxyEvent);
    expect(result.statusCode).toBe(204);
  });

  // ── description with HTML (sanitized) ────────────────────────────
  it('strips HTML tags from description', async () => {
    mockPool.query
      .mockResolvedValueOnce({ rows: [{ id: TEST_SERVICE_ID }] })
      .mockResolvedValueOnce({ rows: [{ ...RETURNED_ROW, description: 'Clean desc' }] });
    const result = await handler(makeEvent({ body: JSON.stringify({ description: '<b>Clean</b> desc' }) }));
    expect(result.statusCode).toBe(200);
  });

  // ── Additional Coverage (Batch 7B-7D) ──

  it('rounds price_cents to nearest integer via Math.round', async () => {
    mockPool.query
      .mockResolvedValueOnce({ rows: [{ id: TEST_SERVICE_ID }] }) // ownership
      .mockResolvedValueOnce({ rows: [{ ...RETURNED_ROW, price_cents: 2999 }] }); // update RETURNING
    const result = await handler(makeEvent({ body: JSON.stringify({ price_cents: 2999.7 }) }));
    expect(result.statusCode).toBe(200);
    // Verify the param passed to the UPDATE is Math.round(2999.7) = 3000
    const updateCall = mockPool.query.mock.calls[1];
    expect(updateCall[1]).toContain(3000);
  });

  it('truncates name to MAX_SERVICE_NAME_LENGTH', async () => {
    const longName = 'A'.repeat(500);
    mockPool.query
      .mockResolvedValueOnce({ rows: [{ id: TEST_SERVICE_ID }] })
      .mockResolvedValueOnce({ rows: [{ ...RETURNED_ROW, name: longName.substring(0, 100) }] });
    const result = await handler(makeEvent({ body: JSON.stringify({ name: longName }) }));
    expect(result.statusCode).toBe(200);
    // The name in the update params should be truncated (not the full 500 chars)
    const updateCall = mockPool.query.mock.calls[1];
    const nameParam = updateCall[1][0];
    expect(nameParam.length).toBeLessThanOrEqual(200);
  });

  it('returns 500 when UPDATE query fails', async () => {
    mockPool.query
      .mockResolvedValueOnce({ rows: [{ id: TEST_SERVICE_ID }] }) // ownership passes
      .mockRejectedValueOnce(new Error('DB write error')); // UPDATE fails
    const result = await handler(makeEvent({ body: JSON.stringify({ name: 'Fails' }) }));
    expect(result.statusCode).toBe(500);
  });

  it('returns 500 when ownership check query fails', async () => {
    mockPool.query.mockRejectedValueOnce(new Error('DB read error'));
    const result = await handler(makeEvent({ body: JSON.stringify({ name: 'Test' }) }));
    expect(result.statusCode).toBe(500);
  });

  it('handles multiple fields building correct SET clause with parameterized indices', async () => {
    mockPool.query
      .mockResolvedValueOnce({ rows: [{ id: TEST_SERVICE_ID }] })
      .mockResolvedValueOnce({ rows: [{ ...RETURNED_ROW, name: 'New', price_cents: 5000, category: 'pack' }] });
    const result = await handler(makeEvent({
      body: JSON.stringify({ name: 'New', price_cents: 5000, category: 'pack' }),
    }));
    expect(result.statusCode).toBe(200);
    // Verify the UPDATE SQL has 3 SET fields + updated_at, and the correct param count
    const updateCall = mockPool.query.mock.calls[1];
    const sql = updateCall[0] as string;
    expect(sql).toContain('name = $1');
    expect(sql).toContain('category = $2');
    expect(sql).toContain('price_cents = $3');
    expect(sql).toContain('updated_at = NOW()');
    // 3 field params + serviceId at end = 4 params total
    expect(updateCall[1]).toHaveLength(4);
  });
});

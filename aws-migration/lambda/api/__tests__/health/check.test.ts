/**
 * Tests for health/check Lambda handler
 * Validates the simple health check endpoint (no auth, no DB)
 */

import { APIGatewayProxyEvent } from 'aws-lambda';

// ── Mocks (must be before handler import — Jest hoists jest.mock calls) ──

jest.mock('../../utils/cors', () => ({
  getSecureHeaders: jest.fn(() => ({
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  })),
  createHeaders: jest.fn(() => ({
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  })),
}));

// ── Import handler AFTER all mocks are declared ──

import { handler } from '../../health/check';

// ── Helpers ──

function makeEvent(overrides: Record<string, unknown> = {}): APIGatewayProxyEvent {
  return {
    httpMethod: 'GET',
    headers: { origin: 'https://smuppy.com' },
    body: null,
    pathParameters: null,
    queryStringParameters: null,
    requestContext: {
      requestId: 'test-request-id',
      identity: { sourceIp: '127.0.0.1' },
    },
    ...overrides,
  } as unknown as APIGatewayProxyEvent;
}

// ── Test suite ──

describe('health/check handler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return 200 with ok status', async () => {
    const event = makeEvent();
    const result = await handler(event);
    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.status).toBe('ok');
  });

  it('should include a valid ISO timestamp', async () => {
    const event = makeEvent();
    const result = await handler(event);
    const body = JSON.parse(result.body);
    expect(body.timestamp).toBeDefined();
    expect(new Date(body.timestamp).toISOString()).toBe(body.timestamp);
  });

  it('should include environment from env var', async () => {
    process.env.ENVIRONMENT = 'staging';
    const event = makeEvent();
    const result = await handler(event);
    const body = JSON.parse(result.body);
    expect(body.environment).toBe('staging');
    delete process.env.ENVIRONMENT;
  });

  it('should return "unknown" when ENVIRONMENT is not set', async () => {
    delete process.env.ENVIRONMENT;
    const event = makeEvent();
    const result = await handler(event);
    const body = JSON.parse(result.body);
    expect(body.environment).toBe('unknown');
  });

  it('should include CORS headers', async () => {
    const event = makeEvent();
    const result = await handler(event);
    expect(result.headers).toBeDefined();
    expect(result.headers!['Content-Type']).toBe('application/json');
  });

  it('should work without origin header', async () => {
    const event = makeEvent({ headers: {} });
    const result = await handler(event);
    expect(result.statusCode).toBe(200);
  });

  it('should use Origin header (capital O) if lowercase origin is missing', async () => {
    const event = makeEvent({ headers: { Origin: 'https://app.smuppy.com' } });
    const result = await handler(event);
    expect(result.statusCode).toBe(200);
  });
});

/**
 * Unit Tests: createAuthHandler
 *
 * Tests the factory for auth handlers (confirm-signup, check-user, confirm-forgot-password).
 * Handles: IP-based rate limit with custom 429 response (Retry-After + code: 'RATE_LIMITED')
 *          -> body parsing -> required field validation -> onAction.
 *
 * NOTE: This uses checkRateLimit (not requireRateLimit) with a custom 429 response.
 */

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
  Logger: jest.fn(),
}));
jest.mock('../../utils/cors', () => ({
  createHeaders: jest.fn(() => ({
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Credentials': 'true',
  })),
  createCacheableHeaders: jest.fn(() => ({
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  })),
  getSecureHeaders: jest.fn(() => ({ 'Content-Type': 'application/json' })),
}));

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { createAuthHandler } from '../../utils/create-auth-handler';
import { checkRateLimit } from '../../utils/rate-limit';

const mockedCheckRateLimit = checkRateLimit as jest.MockedFunction<typeof checkRateLimit>;

function makeEvent(overrides: Partial<Record<string, unknown>> = {}): APIGatewayProxyEvent {
  return {
    httpMethod: 'POST',
    headers: overrides.headers as Record<string, string> ?? {},
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
      authorizer: undefined,
      identity: { sourceIp: '127.0.0.1' },
    },
  } as unknown as APIGatewayProxyEvent;
}

describe('createAuthHandler', () => {
  let mockOnAction: jest.Mock;

  const baseConfig = {
    loggerName: 'auth-confirm-signup',
    rateLimitPrefix: 'confirm-signup',
    rateLimitMax: 5,
    requireFields: ['email', 'code'],
    onAction: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockedCheckRateLimit.mockResolvedValue({ allowed: true });
    mockOnAction = jest.fn().mockResolvedValue({
      statusCode: 200,
      headers: {},
      body: JSON.stringify({ success: true }),
    });
  });

  it('should return 429 with Retry-After header when rate limited', async () => {
    mockedCheckRateLimit.mockResolvedValue({ allowed: false, retryAfter: 120 });

    const { handler } = createAuthHandler({ ...baseConfig, onAction: mockOnAction });
    const result = await handler(makeEvent({
      body: JSON.stringify({ email: 'test@example.com', code: '123456' }),
    }));

    expect(result.statusCode).toBe(429);
    expect(result.headers?.['Retry-After']).toBe('120');
    const body = JSON.parse(result.body);
    expect(body.code).toBe('RATE_LIMITED');
    expect(body.retryAfter).toBe(120);
  });

  it('should use rateLimitWindowSeconds as Retry-After when retryAfter not provided', async () => {
    mockedCheckRateLimit.mockResolvedValue({ allowed: false });

    const { handler } = createAuthHandler({
      ...baseConfig,
      rateLimitWindowSeconds: 600,
      onAction: mockOnAction,
    });
    const result = await handler(makeEvent({
      body: JSON.stringify({ email: 'test@example.com', code: '123456' }),
    }));

    expect(result.statusCode).toBe(429);
    expect(result.headers?.['Retry-After']).toBe('600');
  });

  it('should return 400 when body is missing', async () => {
    const { handler } = createAuthHandler({ ...baseConfig, onAction: mockOnAction });
    const result = await handler(makeEvent());

    expect(result.statusCode).toBe(400);
    const body = JSON.parse(result.body);
    expect(body.success).toBe(false);
    expect(body.message).toBe('Missing request body');
  });

  it('should return 400 when required fields are missing', async () => {
    const { handler } = createAuthHandler({ ...baseConfig, onAction: mockOnAction });
    const result = await handler(makeEvent({
      body: JSON.stringify({ email: 'test@example.com' }),
    }));

    expect(result.statusCode).toBe(400);
    const body = JSON.parse(result.body);
    expect(body.success).toBe(false);
    expect(body.message).toContain('code');
    expect(body.message).toContain('is required');
  });

  it('should return 400 with plural message when multiple fields missing', async () => {
    const { handler } = createAuthHandler({ ...baseConfig, onAction: mockOnAction });
    const result = await handler(makeEvent({
      body: JSON.stringify({}),
    }));

    expect(result.statusCode).toBe(400);
    const body = JSON.parse(result.body);
    expect(body.message).toContain('are required');
  });

  it('should normalize email to lowercase and trimmed', async () => {
    const { handler } = createAuthHandler({ ...baseConfig, onAction: mockOnAction });
    await handler(makeEvent({
      body: JSON.stringify({ email: '  Test@EXAMPLE.com  ', code: '123456' }),
    }));

    expect(mockOnAction).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'test@example.com' }),
      expect.anything(),
      expect.anything(),
      expect.anything(),
    );
  });

  it('should call onAction with parsed body on successful validation', async () => {
    const { handler } = createAuthHandler({ ...baseConfig, onAction: mockOnAction });
    const event = makeEvent({
      body: JSON.stringify({ email: 'test@example.com', code: '123456' }),
    });

    const result = await handler(event);

    expect(result.statusCode).toBe(200);
    expect(mockOnAction).toHaveBeenCalledWith(
      { email: 'test@example.com', code: '123456' },
      expect.objectContaining({ 'Content-Type': 'application/json' }),
      expect.anything(),
      event,
    );
  });

  it('should use named error handlers for known exceptions', async () => {
    class CodeMismatchException extends Error {
      constructor() {
        super('Code mismatch');
        this.name = 'CodeMismatchException';
      }
    }

    const errorResponse: APIGatewayProxyResult = {
      statusCode: 400,
      headers: {},
      body: JSON.stringify({ message: 'Invalid verification code' }),
    };

    mockOnAction.mockRejectedValue(new CodeMismatchException());

    const { handler } = createAuthHandler({
      ...baseConfig,
      onAction: mockOnAction,
      errorHandlers: {
        CodeMismatchException: () => errorResponse,
      },
    });

    const result = await handler(makeEvent({
      body: JSON.stringify({ email: 'test@example.com', code: 'wrong' }),
    }));

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toBe('Invalid verification code');
  });

  it('should return 500 on unhandled error with default message', async () => {
    mockOnAction.mockRejectedValue(new Error('Unexpected'));

    const { handler } = createAuthHandler({ ...baseConfig, onAction: mockOnAction });
    const result = await handler(makeEvent({
      body: JSON.stringify({ email: 'test@example.com', code: '123456' }),
    }));

    expect(result.statusCode).toBe(500);
    const body = JSON.parse(result.body);
    expect(body.success).toBe(false);
    expect(body.message).toBe('Internal server error');
  });

  it('should use custom fallback error message when configured', async () => {
    mockOnAction.mockRejectedValue(new Error('Unexpected'));

    const { handler } = createAuthHandler({
      ...baseConfig,
      onAction: mockOnAction,
      fallbackErrorMessage: 'Confirmation failed',
    });

    const result = await handler(makeEvent({
      body: JSON.stringify({ email: 'test@example.com', code: '123456' }),
    }));

    expect(result.statusCode).toBe(500);
    expect(JSON.parse(result.body).message).toBe('Confirmation failed');
  });

  it('should rate limit by client IP from requestContext', async () => {
    const { handler } = createAuthHandler({ ...baseConfig, onAction: mockOnAction });
    await handler(makeEvent({
      body: JSON.stringify({ email: 'test@example.com', code: '123456' }),
    }));

    expect(mockedCheckRateLimit).toHaveBeenCalledWith(
      expect.objectContaining({
        prefix: 'confirm-signup',
        identifier: '127.0.0.1',
      }),
    );
  });

  it('should fall back to X-Forwarded-For header for IP', async () => {
    const event = makeEvent({
      body: JSON.stringify({ email: 'test@example.com', code: '123456' }),
      headers: { 'X-Forwarded-For': '10.0.0.1, 192.168.0.1' },
    });
    // Override the sourceIp to be falsy
    (event.requestContext.identity as unknown as Record<string, unknown>).sourceIp = '';

    const { handler } = createAuthHandler({ ...baseConfig, onAction: mockOnAction });
    await handler(event);

    expect(mockedCheckRateLimit).toHaveBeenCalledWith(
      expect.objectContaining({
        identifier: '10.0.0.1',
      }),
    );
  });
});

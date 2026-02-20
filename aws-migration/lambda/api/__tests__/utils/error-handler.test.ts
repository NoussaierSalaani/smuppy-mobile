/**
 * Tests for utils/error-handler
 * Covers: logError, createErrorResponse, createValidationError, hasErrorCode,
 *         isNamedError, hasStatusCode, withErrorHandler, handleUnexpectedError,
 *         createNotFoundError, createUnauthorizedError, createForbiddenError,
 *         createRateLimitError, ErrorCodes
 */

import { APIGatewayProxyEvent } from 'aws-lambda';

// ── Mocks (must be before handler import — Jest hoists jest.mock calls) ──

const mockLogError = jest.fn();

jest.mock('../../utils/logger', () => ({
  createLogger: jest.fn(() => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: mockLogError,
    debug: jest.fn(),
    initFromEvent: jest.fn(),
    setRequestId: jest.fn(),
    setUserId: jest.fn(),
    logRequest: jest.fn(),
    logResponse: jest.fn(),
    logQuery: jest.fn(),
    logSecurity: jest.fn(),
    child: jest.fn().mockReturnThis(),
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

import {
  logError,
  createErrorResponse,
  createValidationError,
  handleUnexpectedError,
  hasErrorCode,
  isNamedError,
  hasStatusCode,
  withErrorHandler,
  ErrorCodes,
  createNotFoundError,
  createUnauthorizedError,
  createForbiddenError,
  createRateLimitError,
} from '../../utils/error-handler';

// ── Helpers ──

function buildEvent(overrides?: {
  requestId?: string;
  origin?: string;
}): Partial<APIGatewayProxyEvent> {
  return {
    headers: { origin: overrides?.origin },
    requestContext: {
      requestId: overrides?.requestId ?? 'test-req-123',
    },
  } as unknown as Partial<APIGatewayProxyEvent>;
}

// ── Test Suite ──

describe('utils/error-handler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── 1. logError ──

  describe('logError', () => {
    it('should log an Error instance with context', () => {
      const err = new Error('DB connection failed');
      logError('test-context', err, { extra: 'info' });

      expect(mockLogError).toHaveBeenCalledWith(
        'DB connection failed',
        err,
        expect.objectContaining({
          logContext: 'test-context',
          extra: 'info',
        }),
      );
    });

    it('should log a string error by converting to string', () => {
      logError('string-ctx', 'plain string error');

      expect(mockLogError).toHaveBeenCalledWith(
        'plain string error',
        'plain string error',
        expect.objectContaining({ logContext: 'string-ctx' }),
      );
    });

    it('should log a non-Error object by converting to string', () => {
      logError('obj-ctx', { weird: 'object' });

      expect(mockLogError).toHaveBeenCalled();
    });
  });

  // ── 2. createErrorResponse ──

  describe('createErrorResponse', () => {
    it('should return a response with the correct status code and error code', () => {
      const result = createErrorResponse(401, ErrorCodes.UNAUTHORIZED);

      expect(result.statusCode).toBe(401);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('UNAUTHORIZED');
      expect(body.code).toBe('UNAUTHORIZED');
      expect(body.message).toBe('Authentication required');
    });

    it('should use custom message when provided', () => {
      const result = createErrorResponse(400, ErrorCodes.VALIDATION_ERROR, undefined, 'Custom message');

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.message).toBe('Custom message');
    });

    it('should include headers from createHeaders', () => {
      const result = createErrorResponse(500, ErrorCodes.INTERNAL_ERROR);

      expect(result.headers).toBeDefined();
      expect(result.headers!['Content-Type']).toBe('application/json');
    });

    it('should include debug info in non-production when event has requestId', () => {
      // Default ENVIRONMENT is 'staging' (non-production)
      const event = buildEvent({ requestId: 'req-abc-123' });
      const result = createErrorResponse(500, ErrorCodes.INTERNAL_ERROR, event as unknown as APIGatewayProxyEvent);

      const body = JSON.parse(result.body);
      expect(body.debug).toBeDefined();
      expect(body.debug.requestId).toBe('req-abc-123');
    });

    it('should use safe fallback message for unknown error codes', () => {
      const result = createErrorResponse(500, 'UNKNOWN_CODE' as unknown as Parameters<typeof createErrorResponse>[1]);

      const body = JSON.parse(result.body);
      expect(body.message).toBe('An error occurred');
    });
  });

  // ── 3. handleUnexpectedError ──

  describe('handleUnexpectedError', () => {
    it('should return 500 with generic message', () => {
      const result = handleUnexpectedError(new Error('crash'), 'test-handler');

      expect(result.statusCode).toBe(500);
      const body = JSON.parse(result.body);
      expect(body.code).toBe('INTERNAL_ERROR');
      expect(body.message).toBe('An unexpected error occurred');
    });

    it('should log the full error server-side', () => {
      const err = new Error('secret details');
      handleUnexpectedError(err, 'my-handler');

      expect(mockLogError).toHaveBeenCalled();
    });

    it('should never expose internal error message to client', () => {
      const result = handleUnexpectedError(new Error('password=secret123'), 'auth-handler');

      const body = JSON.parse(result.body);
      expect(body.message).not.toContain('secret123');
      expect(body.message).not.toContain('password');
    });
  });

  // ── 4. createValidationError ──

  describe('createValidationError', () => {
    it('should return 400 with VALIDATION_ERROR code', () => {
      const result = createValidationError(['email', 'username']);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('VALIDATION_ERROR');
      expect(body.code).toBe('VALIDATION_ERROR');
      expect(body.message).toBe('Validation failed');
    });

    it('should include the field names in the response', () => {
      const result = createValidationError(['password', 'confirmPassword']);

      const body = JSON.parse(result.body);
      expect(body.fields).toEqual(['password', 'confirmPassword']);
    });

    it('should handle empty fields array', () => {
      const result = createValidationError([]);

      const body = JSON.parse(result.body);
      expect(body.fields).toEqual([]);
      expect(result.statusCode).toBe(400);
    });
  });

  // ── 5. createNotFoundError ──

  describe('createNotFoundError', () => {
    it('should return 404 with resource type in message', () => {
      const result = createNotFoundError('Post');

      expect(result.statusCode).toBe(404);
      const body = JSON.parse(result.body);
      expect(body.code).toBe('NOT_FOUND');
      expect(body.message).toBe('Post not found');
    });
  });

  // ── 6. createUnauthorizedError ──

  describe('createUnauthorizedError', () => {
    it('should return 401 with UNAUTHORIZED code', () => {
      const result = createUnauthorizedError();

      expect(result.statusCode).toBe(401);
      const body = JSON.parse(result.body);
      expect(body.code).toBe('UNAUTHORIZED');
      expect(body.message).toBe('Authentication required');
    });
  });

  // ── 7. createForbiddenError ──

  describe('createForbiddenError', () => {
    it('should return 403 with FORBIDDEN code', () => {
      const result = createForbiddenError();

      expect(result.statusCode).toBe(403);
      const body = JSON.parse(result.body);
      expect(body.code).toBe('FORBIDDEN');
      expect(body.message).toBe('Access denied');
    });
  });

  // ── 8. createRateLimitError ──

  describe('createRateLimitError', () => {
    it('should return 429 with RATE_LIMITED code', () => {
      const result = createRateLimitError();

      expect(result.statusCode).toBe(429);
      const body = JSON.parse(result.body);
      expect(body.code).toBe('RATE_LIMITED');
      expect(body.message).toContain('Too many requests');
    });

    it('should include Retry-After header when retryAfterSeconds is provided', () => {
      const result = createRateLimitError(undefined, 30);

      expect(result.headers!['Retry-After']).toBe('30');
      const body = JSON.parse(result.body);
      expect(body.retryAfter).toBe(30);
    });

    it('should not include Retry-After header when retryAfterSeconds is not provided', () => {
      const result = createRateLimitError();

      expect(result.headers!['Retry-After']).toBeUndefined();
    });
  });

  // ── 9. hasErrorCode type guard ──

  describe('hasErrorCode', () => {
    it('should return true for objects with a string code property', () => {
      expect(hasErrorCode({ code: '23505' })).toBe(true);
    });

    it('should return false for null', () => {
      expect(hasErrorCode(null)).toBe(false);
    });

    it('should return false for undefined', () => {
      expect(hasErrorCode(undefined)).toBe(false);
    });

    it('should return false for objects with non-string code', () => {
      expect(hasErrorCode({ code: 42 })).toBe(false);
    });

    it('should return false for plain strings', () => {
      expect(hasErrorCode('some error')).toBe(false);
    });
  });

  // ── 10. isNamedError type guard ──

  describe('isNamedError', () => {
    it('should return true for objects with a string name property', () => {
      expect(isNamedError({ name: 'ConditionalCheckFailedException', message: 'oops' })).toBe(true);
    });

    it('should return true for standard Error instances', () => {
      expect(isNamedError(new Error('test'))).toBe(true);
    });

    it('should return false for null', () => {
      expect(isNamedError(null)).toBe(false);
    });

    it('should return false for objects without name', () => {
      expect(isNamedError({ message: 'no name' })).toBe(false);
    });

    it('should return false for primitive values', () => {
      expect(isNamedError(42)).toBe(false);
      expect(isNamedError('string')).toBe(false);
    });
  });

  // ── 11. hasStatusCode type guard ──

  describe('hasStatusCode', () => {
    it('should return true for objects with a numeric statusCode', () => {
      expect(hasStatusCode({ statusCode: 404 })).toBe(true);
    });

    it('should return false for objects with a string statusCode', () => {
      expect(hasStatusCode({ statusCode: '404' })).toBe(false);
    });

    it('should return false for null', () => {
      expect(hasStatusCode(null)).toBe(false);
    });
  });

  // ── 12. withErrorHandler ──

  describe('withErrorHandler', () => {
    it('should return the result of the wrapped function on success', async () => {
      const wrapped = withErrorHandler('test-handler', async (_event, { headers }) => {
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({ success: true }),
        };
      });

      const event = {
        headers: {},
        requestContext: { requestId: 'req-1', authorizer: { claims: { sub: 'user1' } }, identity: { sourceIp: '127.0.0.1' } },
      } as unknown as APIGatewayProxyEvent;

      const result = await wrapped(event);

      expect(result.statusCode).toBe(200);
      expect(JSON.parse(result.body).success).toBe(true);
    });

    it('should catch errors and return 500 with generic message', async () => {
      const wrapped = withErrorHandler('crash-handler', async () => {
        throw new Error('unexpected crash');
      });

      const event = {
        headers: {},
        requestContext: { requestId: 'req-2', identity: { sourceIp: '127.0.0.1' } },
      } as unknown as APIGatewayProxyEvent;

      const result = await wrapped(event);

      expect(result.statusCode).toBe(500);
      const body = JSON.parse(result.body);
      expect(body.message).toBe('Internal server error');
    });

    it('should not expose internal error details in the response', async () => {
      const wrapped = withErrorHandler('secret-handler', async () => {
        throw new Error('Connection to db.internal.example.com:5432 refused');
      });

      const event = {
        headers: {},
        requestContext: { requestId: 'req-3', identity: { sourceIp: '127.0.0.1' } },
      } as unknown as APIGatewayProxyEvent;

      const result = await wrapped(event);

      expect(result.body).not.toContain('db.internal');
      expect(result.body).not.toContain('5432');
    });

    it('should provide headers and log in context to the wrapped function', async () => {
      let receivedHeaders: Record<string, string> | undefined;
      let receivedLog: Record<string, unknown> | undefined;

      const wrapped = withErrorHandler('ctx-handler', async (_event, { headers, log }) => {
        receivedHeaders = headers;
        receivedLog = log as unknown as Record<string, unknown>;
        return { statusCode: 200, headers, body: '{}' };
      });

      const event = {
        headers: {},
        requestContext: { requestId: 'req-4', identity: { sourceIp: '127.0.0.1' } },
      } as unknown as APIGatewayProxyEvent;

      await wrapped(event);

      expect(receivedHeaders).toBeDefined();
      expect(receivedHeaders!['Content-Type']).toBe('application/json');
      expect(receivedLog).toBeDefined();
      expect(typeof receivedLog!.info).toBe('function');
      expect(typeof receivedLog!.error).toBe('function');
    });

    it('should call initFromEvent on the logger', async () => {
      const { createLogger } = require('../../utils/logger');

      const wrapped = withErrorHandler('init-handler', async (_event, { headers }) => {
        return { statusCode: 200, headers, body: '{}' };
      });

      const event = {
        headers: {},
        requestContext: { requestId: 'req-5', identity: { sourceIp: '127.0.0.1' } },
      } as unknown as APIGatewayProxyEvent;

      await wrapped(event);

      // Get the logger instance created by withErrorHandler (last createLogger call)
      const lastCallIdx = createLogger.mock.results.length - 1;
      const handlerLogger = createLogger.mock.results[lastCallIdx].value;
      expect(handlerLogger.initFromEvent).toHaveBeenCalled();
    });
  });

  // ── 13. ErrorCodes constants ──

  describe('ErrorCodes', () => {
    it('should expose all expected error codes', () => {
      expect(ErrorCodes.UNAUTHORIZED).toBe('UNAUTHORIZED');
      expect(ErrorCodes.FORBIDDEN).toBe('FORBIDDEN');
      expect(ErrorCodes.VALIDATION_ERROR).toBe('VALIDATION_ERROR');
      expect(ErrorCodes.NOT_FOUND).toBe('NOT_FOUND');
      expect(ErrorCodes.RATE_LIMITED).toBe('RATE_LIMITED');
      expect(ErrorCodes.INTERNAL_ERROR).toBe('INTERNAL_ERROR');
      expect(ErrorCodes.ALREADY_EXISTS).toBe('ALREADY_EXISTS');
      expect(ErrorCodes.CONFLICT).toBe('CONFLICT');
    });
  });
});

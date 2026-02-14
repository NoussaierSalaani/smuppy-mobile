/**
 * Validators Utils Unit Tests
 *
 * Tests requireAuth(), validateUUIDParam(), isErrorResponse()
 * from utils/validators.ts
 */

import { APIGatewayProxyEvent } from 'aws-lambda';
import { requireAuth, validateUUIDParam, isErrorResponse } from '../../utils/validators';

const VALID_UUID = '550e8400-e29b-41d4-a716-446655440000';
const TEST_HEADERS = { 'Content-Type': 'application/json' };

function createMockEvent(overrides?: {
  claims?: Record<string, string> | null;
  pathParameters?: Record<string, string> | null;
}): APIGatewayProxyEvent {
  return {
    httpMethod: 'GET',
    path: '/test',
    body: null,
    headers: {},
    multiValueHeaders: {},
    isBase64Encoded: false,
    pathParameters: overrides?.pathParameters ?? null,
    queryStringParameters: null,
    multiValueQueryStringParameters: null,
    stageVariables: null,
    requestContext: {
      accountId: '123456789012',
      apiId: 'test',
      authorizer: overrides?.claims !== undefined
        ? (overrides.claims ? { claims: overrides.claims } : null)
        : null,
      protocol: 'HTTP/1.1',
      httpMethod: 'GET',
      identity: {} as never,
      path: '/test',
      stage: 'prod',
      requestId: 'test-request-id',
      requestTimeEpoch: Date.now(),
      resourceId: 'test',
      resourcePath: '/test',
    },
    resource: '/test',
  };
}

describe('Validators Utils', () => {
  describe('requireAuth', () => {
    it('should return userId when valid claims present', () => {
      const event = createMockEvent({ claims: { sub: VALID_UUID } });
      const result = requireAuth(event, TEST_HEADERS);
      expect(result).toBe(VALID_UUID);
    });

    it('should return 401 response when authorizer is null', () => {
      const event = createMockEvent({ claims: null });
      const result = requireAuth(event, TEST_HEADERS);
      expect(typeof result).not.toBe('string');
      expect((result as { statusCode: number }).statusCode).toBe(401);
    });

    it('should return 401 response when claims have no sub', () => {
      const event = createMockEvent({ claims: { email: 'test@example.com' } });
      const result = requireAuth(event, TEST_HEADERS);
      expect(typeof result).not.toBe('string');
      expect((result as { statusCode: number }).statusCode).toBe(401);
    });
  });

  describe('validateUUIDParam', () => {
    it('should return UUID when valid path parameter present', () => {
      const event = createMockEvent({ pathParameters: { id: VALID_UUID } });
      const result = validateUUIDParam(event, TEST_HEADERS);
      expect(result).toBe(VALID_UUID);
    });

    it('should return 400 when path parameter is missing', () => {
      const event = createMockEvent({ pathParameters: null });
      const result = validateUUIDParam(event, TEST_HEADERS);
      expect(typeof result).not.toBe('string');
      expect((result as { statusCode: number }).statusCode).toBe(400);
      expect(JSON.parse((result as { body: string }).body).message).toBe('Resource ID is required');
    });

    it('should return 400 when UUID format is invalid', () => {
      const event = createMockEvent({ pathParameters: { id: 'not-a-uuid' } });
      const result = validateUUIDParam(event, TEST_HEADERS);
      expect(typeof result).not.toBe('string');
      expect((result as { statusCode: number }).statusCode).toBe(400);
      expect(JSON.parse((result as { body: string }).body).message).toBe('Invalid resource ID format');
    });

    it('should use custom paramName', () => {
      const event = createMockEvent({ pathParameters: { postId: VALID_UUID } });
      const result = validateUUIDParam(event, TEST_HEADERS, 'postId', 'Post');
      expect(result).toBe(VALID_UUID);
    });

    it('should use custom label in error messages', () => {
      const event = createMockEvent({ pathParameters: {} });
      const result = validateUUIDParam(event, TEST_HEADERS, 'postId', 'Post');
      expect(typeof result).not.toBe('string');
      expect(JSON.parse((result as { body: string }).body).message).toBe('Post ID is required');
    });

    it('should reject SQL injection in UUID', () => {
      const event = createMockEvent({ pathParameters: { id: "'; DROP TABLE users; --" } });
      const result = validateUUIDParam(event, TEST_HEADERS);
      expect(typeof result).not.toBe('string');
      expect((result as { statusCode: number }).statusCode).toBe(400);
    });
  });

  describe('isErrorResponse', () => {
    it('should return true for error response objects', () => {
      const response = { statusCode: 401, headers: TEST_HEADERS, body: '{}' };
      expect(isErrorResponse(response)).toBe(true);
    });

    it('should return false for string values', () => {
      expect(isErrorResponse(VALID_UUID)).toBe(false);
    });
  });
});

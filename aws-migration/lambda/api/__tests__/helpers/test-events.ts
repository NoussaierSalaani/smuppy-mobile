/**
 * Shared Test Event Builders
 *
 * Replaces the ~20-line makeEvent() function duplicated across 185+ test files.
 */

import { APIGatewayProxyEvent } from 'aws-lambda';

// ── Shared Constants ──

export const TEST_SUB = 'cognito-sub-test123';
export const TEST_PROFILE_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
export const TEST_OTHER_PROFILE_ID = 'b2c3d4e5-f6a7-8901-bcde-f12345678901';
export const TEST_RESOURCE_ID = 'c3d4e5f6-a7b8-9012-cdef-123456789012';

// ── Pattern A: makeEvent (90 % of tests) ──

/**
 * Build an APIGatewayProxyEvent with sensible defaults.
 *
 * Pass `sub: null` to simulate an unauthenticated request.
 */
export function makeEvent(
  overrides: Partial<Record<string, unknown>> = {},
): APIGatewayProxyEvent {
  return {
    httpMethod: (overrides.httpMethod as string) ?? 'GET',
    headers: (overrides.headers as Record<string, string>) ?? {},
    body: (overrides.body as string) ?? null,
    queryStringParameters:
      (overrides.queryStringParameters as Record<string, string>) ?? null,
    pathParameters:
      (overrides.pathParameters as Record<string, string>) ?? null,
    multiValueHeaders: {},
    multiValueQueryStringParameters: null,
    isBase64Encoded: false,
    path: '/',
    resource: '/',
    stageVariables: null,
    requestContext: {
      requestId: 'test-request-id',
      authorizer:
        overrides.sub !== null
          ? { claims: { sub: (overrides.sub as string) ?? TEST_SUB } }
          : undefined,
      identity: { sourceIp: '127.0.0.1' },
    },
  } as unknown as APIGatewayProxyEvent;
}

// ── Pattern B: buildEvent (typed overrides) ──

interface BuildEventOptions {
  sub?: string | null;
  profileId?: string | null;
  queryParams?: Record<string, string> | null;
  pathParams?: Record<string, string> | null;
  httpMethod?: string;
  body?: string | null;
}

/**
 * Build an APIGatewayProxyEvent with explicit typed overrides.
 *
 * Useful when tests need to control pathParameters by profile ID.
 */
export function buildEvent(overrides: BuildEventOptions = {}): APIGatewayProxyEvent {
  const sub = overrides.sub === undefined ? TEST_SUB : overrides.sub;
  const profileId = overrides.profileId === undefined ? TEST_PROFILE_ID : overrides.profileId;

  return {
    httpMethod: overrides.httpMethod ?? 'GET',
    headers: {},
    body: overrides.body ?? null,
    pathParameters: overrides.pathParams !== undefined
      ? overrides.pathParams
      : profileId !== null
        ? { id: profileId }
        : null,
    queryStringParameters: overrides.queryParams !== undefined ? overrides.queryParams : null,
    multiValueHeaders: {},
    multiValueQueryStringParameters: null,
    isBase64Encoded: false,
    stageVariables: null,
    resource: '',
    path: '',
    requestContext: {
      requestId: 'test-request-id',
      authorizer: sub !== null ? { claims: { sub } } : undefined,
      identity: { sourceIp: '127.0.0.1' },
    },
  } as unknown as APIGatewayProxyEvent;
}

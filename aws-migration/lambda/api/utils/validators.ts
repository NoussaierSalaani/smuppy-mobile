/**
 * Shared validation helpers for Lambda handlers.
 * Eliminates repeated auth + UUID boilerplate.
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { createHeaders } from './cors';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Extract and validate the authenticated user ID from the event.
 * Returns the userId string or an early 401 response.
 */
export function requireAuth(
  event: APIGatewayProxyEvent,
  headers: Record<string, string>,
): string | APIGatewayProxyResult {
  const userId = event.requestContext.authorizer?.claims?.sub;
  if (!userId) {
    return {
      statusCode: 401,
      headers,
      body: JSON.stringify({ message: 'Unauthorized' }),
    };
  }
  return userId;
}

/**
 * Extract and validate a UUID path parameter.
 * Returns the validated string or an early 400 response.
 *
 * @param event      - API Gateway event
 * @param headers    - CORS headers
 * @param paramName  - Path parameter key (default: "id")
 * @param label      - Human label for error messages (e.g. "Post", "Comment")
 */
export function validateUUIDParam(
  event: APIGatewayProxyEvent,
  headers: Record<string, string>,
  paramName = 'id',
  label = 'Resource',
): string | APIGatewayProxyResult {
  const value = event.pathParameters?.[paramName];
  if (!value) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ message: `${label} ID is required` }),
    };
  }
  if (!UUID_REGEX.test(value)) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ message: `Invalid ${label.toLowerCase()} ID format` }),
    };
  }
  return value;
}

/**
 * Type guard: returns true if the value is an early-exit response.
 */
export function isErrorResponse(
  value: string | APIGatewayProxyResult,
): value is APIGatewayProxyResult {
  return typeof value !== 'string';
}

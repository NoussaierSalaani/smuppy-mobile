/**
 * Request parsing utilities for Lambda handlers.
 * Eliminates repeated JSON.parse(event.body) boilerplate.
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';

/**
 * Safely parse JSON request body with type assertion.
 * Returns parsed body or an early-exit 400 error response.
 */
export function parseBody<T = Record<string, unknown>>(
  event: APIGatewayProxyEvent,
  headers: Record<string, string>
): T | APIGatewayProxyResult {
  try {
    return JSON.parse(event.body || '{}') as T;
  } catch {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ success: false, message: 'Invalid JSON body' }),
    };
  }
}

/**
 * Type guard: checks if parseBody returned an error response.
 */
export function isParseError(result: unknown): result is APIGatewayProxyResult {
  return typeof result === 'object' && result !== null && 'statusCode' in result;
}

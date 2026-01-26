/**
 * Centralized Error Handling Utility
 *
 * SECURITY: Never expose internal error details to clients
 * All errors are logged server-side but generic messages are returned to clients
 */

import { APIGatewayProxyResult } from 'aws-lambda';
import { createHeaders } from './cors';
import { createLogger } from './logger';

const log = createLogger('error-handler');

const ENVIRONMENT = process.env.ENVIRONMENT || 'staging';

/**
 * Error codes for client responses
 * These are safe to expose to clients
 */
export const ErrorCodes = {
  // Authentication errors
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  INVALID_TOKEN: 'INVALID_TOKEN',

  // Validation errors
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  INVALID_INPUT: 'INVALID_INPUT',
  MISSING_REQUIRED_FIELD: 'MISSING_REQUIRED_FIELD',

  // Resource errors
  NOT_FOUND: 'NOT_FOUND',
  ALREADY_EXISTS: 'ALREADY_EXISTS',
  CONFLICT: 'CONFLICT',

  // Rate limiting
  RATE_LIMITED: 'RATE_LIMITED',
  TOO_MANY_REQUESTS: 'TOO_MANY_REQUESTS',

  // Server errors
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
} as const;

type ErrorCode = typeof ErrorCodes[keyof typeof ErrorCodes];

/**
 * Safe error messages that can be shown to clients
 */
const SafeErrorMessages: Record<ErrorCode, string> = {
  [ErrorCodes.UNAUTHORIZED]: 'Authentication required',
  [ErrorCodes.FORBIDDEN]: 'Access denied',
  [ErrorCodes.TOKEN_EXPIRED]: 'Session expired, please login again',
  [ErrorCodes.INVALID_TOKEN]: 'Invalid authentication token',
  [ErrorCodes.VALIDATION_ERROR]: 'Invalid request data',
  [ErrorCodes.INVALID_INPUT]: 'Invalid input provided',
  [ErrorCodes.MISSING_REQUIRED_FIELD]: 'Required field missing',
  [ErrorCodes.NOT_FOUND]: 'Resource not found',
  [ErrorCodes.ALREADY_EXISTS]: 'Resource already exists',
  [ErrorCodes.CONFLICT]: 'Operation conflicts with current state',
  [ErrorCodes.RATE_LIMITED]: 'Too many requests, please try again later',
  [ErrorCodes.TOO_MANY_REQUESTS]: 'Rate limit exceeded',
  [ErrorCodes.INTERNAL_ERROR]: 'An unexpected error occurred',
  [ErrorCodes.SERVICE_UNAVAILABLE]: 'Service temporarily unavailable',
};

interface ErrorResponse {
  error: string;
  code: ErrorCode;
  message: string;
  // Only in non-production for debugging
  debug?: {
    requestId?: string;
  };
}

/**
 * Log error securely (server-side only)
 * Never log sensitive data like passwords, tokens, or PII
 */
export function logError(
  context: string,
  error: unknown,
  additionalInfo?: Record<string, unknown>
): void {
  const errorMessage = error instanceof Error ? error.message : String(error);
  const errorStack = error instanceof Error ? error.stack : undefined;

  // Log for CloudWatch - never include sensitive data
  log.error(errorMessage, error, {
    logContext: context,
    environment: ENVIRONMENT,
    ...additionalInfo,
  });
}

/**
 * Create a safe error response for clients
 *
 * SECURITY: Never expose internal error details
 * Only predefined safe messages are returned
 */
export function createErrorResponse(
  statusCode: number,
  code: ErrorCode,
  event?: { headers?: Record<string, string | undefined>; requestContext?: { requestId?: string } },
  customMessage?: string
): APIGatewayProxyResult {
  const headers = createHeaders(event);

  const response: ErrorResponse = {
    error: code,
    code,
    message: customMessage || SafeErrorMessages[code] || 'An error occurred',
  };

  // Only add debug info in non-production
  if (ENVIRONMENT !== 'production' && event?.requestContext?.requestId) {
    response.debug = {
      requestId: event.requestContext.requestId,
    };
  }

  return {
    statusCode,
    headers,
    body: JSON.stringify(response),
  };
}

/**
 * Handle unexpected errors safely
 * Logs full error server-side, returns generic message to client
 */
export function handleUnexpectedError(
  error: unknown,
  context: string,
  event?: { headers?: Record<string, string | undefined>; requestContext?: { requestId?: string } }
): APIGatewayProxyResult {
  // Log full error details server-side
  logError(context, error, {
    requestId: event?.requestContext?.requestId,
  });

  // Return generic error to client
  return createErrorResponse(500, ErrorCodes.INTERNAL_ERROR, event);
}

/**
 * Create validation error response with safe field names
 *
 * @param fields - Array of field names that failed validation (safe to expose)
 */
export function createValidationError(
  fields: string[],
  event?: { headers?: Record<string, string | undefined> }
): APIGatewayProxyResult {
  const headers = createHeaders(event);

  return {
    statusCode: 400,
    headers,
    body: JSON.stringify({
      error: ErrorCodes.VALIDATION_ERROR,
      code: ErrorCodes.VALIDATION_ERROR,
      message: 'Validation failed',
      fields, // Safe to expose field names
    }),
  };
}

/**
 * Create not found error response
 */
export function createNotFoundError(
  resourceType: string,
  event?: { headers?: Record<string, string | undefined> }
): APIGatewayProxyResult {
  return createErrorResponse(404, ErrorCodes.NOT_FOUND, event, `${resourceType} not found`);
}

/**
 * Create unauthorized error response
 */
export function createUnauthorizedError(
  event?: { headers?: Record<string, string | undefined> }
): APIGatewayProxyResult {
  return createErrorResponse(401, ErrorCodes.UNAUTHORIZED, event);
}

/**
 * Create forbidden error response
 */
export function createForbiddenError(
  event?: { headers?: Record<string, string | undefined> }
): APIGatewayProxyResult {
  return createErrorResponse(403, ErrorCodes.FORBIDDEN, event);
}

/**
 * Create rate limit error response
 */
export function createRateLimitError(
  event?: { headers?: Record<string, string | undefined> },
  retryAfterSeconds?: number
): APIGatewayProxyResult {
  const headers = createHeaders(event);

  if (retryAfterSeconds) {
    headers['Retry-After'] = String(retryAfterSeconds);
  }

  return {
    statusCode: 429,
    headers,
    body: JSON.stringify({
      error: ErrorCodes.RATE_LIMITED,
      code: ErrorCodes.RATE_LIMITED,
      message: SafeErrorMessages[ErrorCodes.RATE_LIMITED],
      retryAfter: retryAfterSeconds,
    }),
  };
}

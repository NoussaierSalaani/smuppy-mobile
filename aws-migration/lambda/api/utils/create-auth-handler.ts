/**
 * Auth Handler Factory
 * Eliminates shared boilerplate across auth handlers (confirm-signup, check-user, confirm-forgot-password).
 *
 * Handles: headers -> IP-based rate limit with custom 429 response (Retry-After + code: 'RATE_LIMITED')
 *          -> body parsing -> required field validation.
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { createHeaders } from './cors';
import { createLogger, Logger } from './logger';
import { checkRateLimit } from './rate-limit';

interface AuthHandlerConfig {
  /** Logger name for createLogger (e.g. 'auth-confirm-signup') */
  loggerName: string;
  /** Rate limit key prefix (e.g. 'confirm-signup') */
  rateLimitPrefix: string;
  /** Max requests per window */
  rateLimitMax: number;
  /** Rate limit window in seconds (default: 300 = 5 min) */
  rateLimitWindowSeconds?: number;
  /** Required body fields — handler returns 400 if any are missing */
  requireFields: string[];
  /**
   * Custom action executed after validation passes.
   * Receives the parsed body, response headers, and logger.
   * Must return the final APIGatewayProxyResult.
   */
  onAction: (
    body: Record<string, unknown>,
    headers: Record<string, string>,
    log: Logger,
    event: APIGatewayProxyEvent,
  ) => Promise<APIGatewayProxyResult>;
  /**
   * Optional Cognito exception handlers.
   * Key: exception constructor name (e.g. 'CodeMismatchException').
   * Value: function returning an APIGatewayProxyResult for that error.
   */
  errorHandlers?: Record<string, (headers: Record<string, string>) => APIGatewayProxyResult>;
  /** Custom error message for the generic 500 fallback (default: 'Internal server error') */
  fallbackErrorMessage?: string;
}

/**
 * Create an auth Lambda handler with shared boilerplate.
 */
export function createAuthHandler(config: AuthHandlerConfig) {
  const {
    loggerName,
    rateLimitPrefix,
    rateLimitMax,
    rateLimitWindowSeconds = 300,
    requireFields,
    onAction,
    errorHandlers,
    fallbackErrorMessage = 'Internal server error',
  } = config;

  const log = createLogger(loggerName);

  async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
    const headers = createHeaders(event);
    log.initFromEvent(event);

    // IP-based rate limit with custom 429 response
    const clientIp = event.requestContext.identity?.sourceIp ||
                     event.headers['X-Forwarded-For']?.split(',')[0]?.trim() ||
                     'unknown';

    const rateLimit = await checkRateLimit({
      prefix: rateLimitPrefix,
      identifier: clientIp,
      windowSeconds: rateLimitWindowSeconds,
      maxRequests: rateLimitMax,
    });

    if (!rateLimit.allowed) {
      return {
        statusCode: 429,
        headers: {
          ...headers,
          'Retry-After': rateLimit.retryAfter?.toString() || String(rateLimitWindowSeconds),
        },
        body: JSON.stringify({
          success: false,
          code: 'RATE_LIMITED',
          message: 'Too many attempts. Please try again later.',
          retryAfter: rateLimit.retryAfter,
        }),
      };
    }

    try {
      // Body parsing
      if (!event.body) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ success: false, message: 'Missing request body' }),
        };
      }

      const body: Record<string, unknown> = JSON.parse(event.body);

      // Email validation (if email is a required field, normalize it)
      if (body.email && typeof body.email === 'string') {
        body.email = (body.email as string).toLowerCase().trim();
      }

      // Required field validation
      const missingFields = requireFields.filter(field => !body[field]);
      if (missingFields.length > 0) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({
            success: false,
            message: `${missingFields.join(', ')} ${missingFields.length === 1 ? 'is' : 'are'} required`,
          }),
        };
      }

      return await onAction(body, headers, log, event);
    } catch (error: unknown) {
      log.error(`${loggerName} error`, error, {
        errorName: error instanceof Error ? error.name : String(error),
      });

      // Check named error handlers
      if (errorHandlers && error instanceof Error) {
        const errorName = error.constructor.name;
        const errorHandler = errorHandlers[errorName];
        if (errorHandler) {
          return errorHandler(headers);
        }
      }

      // Generic 500 fallback
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ success: false, message: fallbackErrorMessage }),
      };
    }
  }

  return { handler };
}

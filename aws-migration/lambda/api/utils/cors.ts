/**
 * CORS Utility - Secure CORS headers for all Lambda responses
 *
 * IMPORTANT: All Lambda handlers MUST use these headers
 * This module ensures CORS headers match API Gateway configuration
 *
 * SECURITY: In production, only smuppy.com domains are allowed
 * In staging/dev, localhost origins are also permitted for development
 */

import { HSTS_MAX_AGE_PRELOAD } from './constants';

// Allowed origins for CORS - must match API Gateway configuration in smuppy-stack.ts
const ALLOWED_ORIGINS = [
  'https://smuppy.com',
  'https://www.smuppy.com',
  'https://app.smuppy.com',
];

// Development origins (only allowed in non-production)
const DEV_ORIGINS = [
  'http://localhost:8081',
  'http://localhost:19006',
  'http://localhost:3000',
  'exp://localhost:8081',
];

// Mobile app origins (React Native WebView if applicable)
const MOBILE_APP_ORIGINS = [
  'smuppy://',
];

/**
 * Get the allowed origin based on the request origin header
 * Returns the origin if it's in the allowed list, otherwise returns the default
 *
 * SECURITY: Never returns '*' in production
 */
export function getAllowedOrigin(requestOrigin?: string): string {
  const isProduction = process.env.ENVIRONMENT === 'production';
  const allAllowedOrigins = isProduction
    ? ALLOWED_ORIGINS
    : [...ALLOWED_ORIGINS, ...DEV_ORIGINS, ...MOBILE_APP_ORIGINS];

  if (requestOrigin && allAllowedOrigins.includes(requestOrigin)) {
    return requestOrigin;
  }

  // SECURITY: For mobile apps (no Origin header), or unknown origins:
  // Always return primary domain - never return arbitrary origins
  // This prevents CORS attacks even in non-production environments
  // Mobile apps don't send Origin headers, so this works for them too
  return 'https://smuppy.com';
}

/**
 * Get secure CORS headers for Lambda responses
 * @param requestOrigin - The Origin header from the request
 */
export function getCorsHeaders(requestOrigin?: string): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': getAllowedOrigin(requestOrigin),
    'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Request-Id,X-Amz-Date',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Max-Age': '3600',
  };
}

/**
 * Get all secure response headers including CORS and security headers
 * @param requestOrigin - The Origin header from the request
 */
export function getSecureHeaders(requestOrigin?: string): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    ...getCorsHeaders(requestOrigin),
    // Security headers
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '1; mode=block',
    'Strict-Transport-Security': `max-age=${HSTS_MAX_AGE_PRELOAD}; includeSubDomains; preload`,
    'Content-Security-Policy': "default-src 'none'",
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Cache-Control': 'no-store, no-cache, must-revalidate',
    'Pragma': 'no-cache',
  };
}

/**
 * Standard headers for responses
 *
 * @deprecated Use getSecureHeaders(event.headers?.origin) instead for proper CORS handling
 *
 * SECURITY: Production uses fixed origin, non-production allows smuppy.com
 * This is a fallback for backwards compatibility
 */
export const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': 'https://smuppy.com',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Request-Id',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
  'Access-Control-Allow-Credentials': 'true',
};

/**
 * Create headers with dynamic CORS origin validation
 * Use this function to get proper CORS headers based on request origin
 *
 * @param event - The API Gateway event (to extract Origin header)
 * @returns Headers object with validated CORS origin
 */
export function createHeaders(event?: { headers?: Record<string, string | undefined> }): Record<string, string> {
  const origin = event?.headers?.origin || event?.headers?.Origin;
  const requestId = event?.headers?.['x-request-id'] || event?.headers?.['X-Request-Id'];
  const responseHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    ...getCorsHeaders(origin),
  };
  if (requestId) {
    responseHeaders['X-Request-Id'] = requestId;
  }
  return responseHeaders;
}

/**
 * Create a full API Gateway response with CORS headers
 * Convenience function for Lambda handlers
 *
 * @param statusCode - HTTP status code
 * @param body - Response body (will be JSON stringified)
 * @param requestOrigin - Optional origin header from request
 * @returns APIGatewayProxyResult compatible response
 */
export function createCorsResponse(
  statusCode: number,
  body: Record<string, unknown>,
  requestOrigin?: string
): { statusCode: number; headers: Record<string, string>; body: string } {
  return {
    statusCode,
    headers: getSecureHeaders(requestOrigin),
    body: JSON.stringify(body),
  };
}

/**
 * Wrap a response object with CORS headers
 * @param response - The response object to wrap
 * @returns Response with CORS headers added
 */
export function cors(
  response: { statusCode: number; body: string; headers?: Record<string, string> }
): { statusCode: number; headers: Record<string, string>; body: string } {
  return {
    ...response,
    headers: {
      ...getSecureHeaders(),
      ...(response.headers || {}),
    },
  };
}

/**
 * Handle OPTIONS preflight requests
 * @returns 200 response with CORS headers
 */
export function handleOptions(): { statusCode: number; headers: Record<string, string>; body: string } {
  return {
    statusCode: 200,
    headers: getSecureHeaders(),
    body: '',
  };
}

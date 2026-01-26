/**
 * CORS Utility - Secure CORS headers for all Lambda responses
 *
 * IMPORTANT: All Lambda handlers MUST use these headers
 * This module ensures CORS headers match API Gateway configuration
 *
 * SECURITY: In production, only smuppy.com domains are allowed
 * In staging/dev, localhost origins are also permitted for development
 */

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

  // For mobile apps (no Origin header), or unknown origins:
  // - Production: return primary domain (browsers will reject if mismatch)
  // - Dev/Staging: allow for easier development
  if (isProduction) {
    return 'https://smuppy.com';
  }

  // In dev, if no origin or unknown origin, be permissive for mobile app testing
  // Note: Actual browser security is enforced; this just sets the header
  return requestOrigin || 'https://smuppy.com';
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
    'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
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
  return {
    'Content-Type': 'application/json',
    ...getCorsHeaders(origin),
  };
}

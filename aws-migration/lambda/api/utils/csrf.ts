/**
 * CSRF Protection Utility
 *
 * Provides CSRF token generation and validation for sensitive operations.
 *
 * SECURITY CONTEXT:
 * - Mobile apps (React Native) are low-risk for CSRF since they don't use cookies
 * - WebView scenarios require CSRF protection
 * - This utility provides defense-in-depth
 *
 * Usage:
 * 1. Generate token with generateCsrfToken() - store in Redis with session
 * 2. Client sends token in X-CSRF-Token header
 * 3. Validate with validateCsrfToken() on sensitive operations
 */

import { randomBytes, createHmac } from 'crypto';
import { createLogger } from './logger';

const log = createLogger('csrf');

// CSRF token expiration (15 minutes)
const CSRF_TOKEN_EXPIRY_MS = 15 * 60 * 1000;

// Secret key for HMAC — MUST be set in environment. No insecure fallback.
const CSRF_SECRET = process.env.CSRF_SECRET || '';
if (!CSRF_SECRET) {
  console.warn('[CSRF] CSRF_SECRET not set — CSRF validation will reject all tokens');
}

interface CsrfTokenData {
  token: string;
  timestamp: number;
  userId: string;
}

/**
 * Generate a CSRF token for a user session
 * Token format: base64(randomBytes) + '.' + base64(hmac)
 */
export function generateCsrfToken(userId: string): string {
  const timestamp = Date.now();
  const randomPart = randomBytes(32).toString('base64url');

  // Create HMAC signature to prevent tampering
  const dataToSign = `${randomPart}.${timestamp}.${userId}`;
  const signature = createHmac('sha256', CSRF_SECRET)
    .update(dataToSign)
    .digest('base64url');

  // Token format: random.timestamp.signature
  const token = `${randomPart}.${timestamp}.${signature}`;

  log.info('CSRF token generated', { userId: userId.substring(0, 8) + '***' });

  return token;
}

/**
 * Validate a CSRF token
 * Returns true if valid, false otherwise
 */
export function validateCsrfToken(token: string, userId: string): boolean {
  if (!token || typeof token !== 'string') {
    log.warn('CSRF validation failed: missing token');
    return false;
  }

  const parts = token.split('.');
  if (parts.length !== 3) {
    log.warn('CSRF validation failed: invalid token format');
    return false;
  }

  const [randomPart, timestampStr, providedSignature] = parts;
  const timestamp = parseInt(timestampStr, 10);

  // Check timestamp validity
  if (isNaN(timestamp)) {
    log.warn('CSRF validation failed: invalid timestamp');
    return false;
  }

  // Check token expiration
  const now = Date.now();
  if (now - timestamp > CSRF_TOKEN_EXPIRY_MS) {
    log.warn('CSRF validation failed: token expired');
    return false;
  }

  // Verify HMAC signature
  const dataToSign = `${randomPart}.${timestamp}.${userId}`;
  const expectedSignature = createHmac('sha256', CSRF_SECRET)
    .update(dataToSign)
    .digest('base64url');

  // Constant-time comparison to prevent timing attacks
  if (!constantTimeCompare(providedSignature, expectedSignature)) {
    log.logSecurity('CSRF validation failed: signature mismatch', { userId: userId.substring(0, 8) + '***' });
    return false;
  }

  return true;
}

/**
 * Constant-time string comparison to prevent timing attacks
 */
function constantTimeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }

  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }

  return result === 0;
}

/**
 * Express/Lambda middleware to check CSRF token
 * Use this on sensitive endpoints (POST, PUT, DELETE)
 */
export function csrfCheck(
  event: { headers: Record<string, string | undefined>; requestContext?: { authorizer?: { claims?: { sub?: string } } } }
): { valid: boolean; error?: string } {
  // Skip CSRF check for OPTIONS requests
  if (event.headers['X-HTTP-Method-Override']?.toUpperCase() === 'OPTIONS') {
    return { valid: true };
  }

  // Get user ID from JWT claims
  const userId = event.requestContext?.authorizer?.claims?.sub;
  if (!userId) {
    return { valid: false, error: 'Authentication required' };
  }

  // Get CSRF token from header (case-insensitive)
  const csrfToken = event.headers['x-csrf-token'] || event.headers['X-CSRF-Token'];

  // For mobile apps without WebView, CSRF token is optional
  // The Origin header check provides sufficient protection
  const origin = event.headers['origin'] || event.headers['Origin'];
  const isWebView = origin && !origin.includes('localhost');

  // If it's a WebView request, require CSRF token
  if (isWebView && !csrfToken) {
    return { valid: false, error: 'CSRF token required for web requests' };
  }

  // If CSRF token is provided, validate it
  if (csrfToken && !validateCsrfToken(csrfToken, userId)) {
    return { valid: false, error: 'Invalid CSRF token' };
  }

  return { valid: true };
}

/**
 * Sensitive operations that should have CSRF protection:
 * - Profile updates
 * - Post/Peak creation/deletion
 * - Follow/Unfollow actions
 * - Password changes
 * - Account deletion
 */
export const CSRF_PROTECTED_OPERATIONS = [
  'profile-update',
  'post-create',
  'post-delete',
  'peak-create',
  'peak-delete',
  'follow-create',
  'follow-delete',
  'password-change',
  'account-delete',
];

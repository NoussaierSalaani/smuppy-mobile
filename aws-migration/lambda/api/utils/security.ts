/**
 * Security Utilities for Lambda Handlers
 * Provides secure headers, input validation, and rate limiting helpers
 */

import { APIGatewayProxyEvent } from 'aws-lambda';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { createLogger } from './logger';

const log = createLogger('security');

const secretsClient = new SecretsManagerClient({});

// Cache for secrets (Lambda warm start optimization)
const secretsCache: Map<string, { value: string; expiry: number }> = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Get secret from AWS Secrets Manager with caching
 */
export async function getSecret(secretArn: string): Promise<string> {
  const now = Date.now();
  const cached = secretsCache.get(secretArn);

  if (cached && cached.expiry > now) {
    return cached.value;
  }

  const command = new GetSecretValueCommand({ SecretId: secretArn });
  const response = await secretsClient.send(command);
  const value = response.SecretString || '';

  secretsCache.set(secretArn, { value, expiry: now + CACHE_TTL });

  return value;
}

/**
 * SECURITY: Sanitize user input to prevent injection attacks
 */
export function sanitizeInput(input: string, maxLength: number = 1000): string {
  if (!input || typeof input !== 'string') return '';

  return input
    .trim()
    .slice(0, maxLength)
    // Remove null bytes
    .replaceAll('\0', '')
    // Remove control characters except newlines and tabs
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, ''); // NOSONAR — intentional control char sanitization
}

/**
 * SECURITY: Strip HTML tags in linear time to avoid regex backtracking (ReDoS).
 * Uses a simple state machine instead of regex; input is length-capped before processing.
 */
function stripHtmlTagsLinear(input: string): string {
  let result = '';
  let inTag = false;

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (ch === '<') {
      inTag = true;
      continue;
    }
    if (ch === '>' && inTag) {
      inTag = false;
      continue;
    }
    if (!inTag) result += ch;
  }

  return result;
}

/**
 * SECURITY: Sanitize text input with HTML stripping
 * Use for user-generated content (comments, bios, captions, etc.)
 */
export function sanitizeText(text: string, maxLength: number = 500): string {
  if (!text || typeof text !== 'string') return '';

  // Bound the work up front
  const capped = String(text).slice(0, maxLength);

  const stripped = stripHtmlTagsLinear(capped);

  return stripped
    .trim()
    .slice(0, maxLength)
    .replaceAll('\0', '') // Remove null bytes
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, ''); // Remove control chars
}

/**
 * SECURITY: Validate UUID format to prevent injection
 */
export function isValidUUID(uuid: string | undefined | null): boolean {
  if (!uuid || typeof uuid !== 'string') return false;
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
}

/**
 * SECURITY: Validate email format
 */
export function isValidEmail(email: string): boolean {
  if (!email || typeof email !== 'string') return false;
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  return emailRegex.test(email) && email.length <= 254;
}

/**
 * SECURITY: Validate username format
 */
export function isValidUsername(username: string): boolean {
  if (!username || typeof username !== 'string') return false;
  // Alphanumeric, underscores, dots, 3-30 characters
  const usernameRegex = /^[a-zA-Z0-9_.]{3,30}$/;
  return usernameRegex.test(username);
}

/**
 * SECURITY: Rate limit check using request context
 * Returns true if request should be blocked
 */
export function checkRateLimit(
  requestId: string,
  sourceIp: string,
  limits: Map<string, { count: number; resetTime: number }>,
  maxRequests: number = 100,
  windowMs: number = 60000
): boolean {
  const now = Date.now();
  const key = sourceIp;
  const current = limits.get(key);

  if (!current || current.resetTime < now) {
    limits.set(key, { count: 1, resetTime: now + windowMs });
    return false;
  }

  if (current.count >= maxRequests) {
    return true; // Block request
  }

  current.count++;
  return false;
}

/**
 * Extract Cognito sub from API Gateway event.
 * SECURITY: Only trusts the Cognito authorizer claims (verified by API Gateway).
 * Never decodes JWT manually — unverified tokens allow impersonation.
 */
export function extractCognitoSub(event: APIGatewayProxyEvent): string | undefined {
  return event.requestContext.authorizer?.claims?.sub;
}

/**
 * SECURITY: Reserved usernames that cannot be claimed by users.
 * Prevents brand impersonation, social engineering, and confusion.
 */
const RESERVED_USERNAMES = new Set([
  // Brand / platform
  'smuppy', 'smuppyapp', 'smuppy_app', 'smuppyofficial', 'smuppy_official',
  'admin', 'administrator', 'mod', 'moderator', 'moderation',
  'support', 'help', 'helpdesk', 'customer_support', 'customersupport',
  'official', 'verified', 'team', 'staff', 'employee',
  // System / technical
  'system', 'bot', 'automod', 'noreply', 'no_reply', 'mailer',
  'security', 'abuse', 'report', 'reports', 'legal', 'compliance',
  'api', 'dev', 'developer', 'root', 'superuser', 'sysadmin',
  'null', 'undefined', 'void', 'test', 'testing', 'debug',
  // Common impersonation targets
  'ceo', 'cto', 'cfo', 'founder', 'cofounder', 'co_founder',
  'press', 'media', 'news', 'info', 'contact', 'feedback',
  'billing', 'payments', 'finance', 'sales', 'marketing',
  // Safety
  'everyone', 'all', 'here', 'channel', 'announcement', 'announcements',
  'notification', 'notifications', 'alert', 'alerts',
  'delete', 'deleted', 'removed', 'banned', 'suspended',
]);

/**
 * SECURITY: Check if a username is reserved (case-insensitive).
 */
export function isReservedUsername(username: string): boolean {
  return RESERVED_USERNAMES.has(username.toLowerCase());
}

/**
 * SECURITY: Log security events for monitoring
 */
export function logSecurityEvent(
  eventType: 'auth_failure' | 'rate_limit' | 'invalid_input' | 'suspicious_activity',
  details: Record<string, unknown>
): void {
  log.logSecurity(eventType, details);
}

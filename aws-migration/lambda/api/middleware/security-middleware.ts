/**
 * SECURITY MIDDLEWARE
 * Comprehensive protection against all types of attacks
 */

import { APIGatewayProxyEvent } from 'aws-lambda';
import { createLogger } from '../utils/logger';

const log = createLogger('security-middleware');

// ============================================
// ATTACK DETECTION PATTERNS
// ============================================

// SQL Injection patterns
const SQL_INJECTION_PATTERNS = [
  /(%27)|(')|(--)|(%23)|(#)/i,
  /((%3D)|(=))[^\n]*((%27)|(')|(--)|(%3B)|(;))/i,
  /\w*((%27)|(''))((%6F)|o|(%4F))((%72)|r|(%52))/i,
  /((%27)|(''))union/i,
  /exec(\s|\+)+(s|x)p\w+/i,
  /UNION(\s+)ALL(\s+)SELECT/i,
  /INSERT(\s+)INTO/i,
  /DELETE(\s+)FROM/i,
  /DROP(\s+)TABLE/i,
  /UPDATE(\s+)\w+(\s+)SET/i,
];

// XSS patterns
const XSS_PATTERNS = [
  /<script[^>]*>[\s\S]*?<\/script>/gi,
  /<[^>]+on\w+\s*=/gi,
  /javascript:/gi,
  /vbscript:/gi,
  /data:text\/html/gi,
  /<iframe[^>]*>/gi,
  /<object[^>]*>/gi,
  /<embed[^>]*>/gi,
  /<svg[^>]*onload/gi,
  /expression\s*\(/gi,
];

// Path Traversal patterns
const PATH_TRAVERSAL_PATTERNS = [
  /\.\.\//g,
  /\.\.\\/,
  /%2e%2e%2f/gi,
  /%2e%2e\//gi,
  /\.%2e\//gi,
  /%2e\.\//gi,
  /etc\/passwd/gi,
  /etc\/shadow/gi,
  /proc\/self/gi,
];

// Command Injection patterns
const COMMAND_INJECTION_PATTERNS = [
  /[;&|`$]/,
  /\$\(/,
  /`[^`]*`/,
  /\|\|/,
  /&&/,
  /\n/,
  /\r/,
];

// LDAP Injection patterns
const LDAP_INJECTION_PATTERNS = [
  /[)(|*\\]/,
  // eslint-disable-next-line no-control-regex
  /\x00/,
];

// XML/XXE patterns
const XML_INJECTION_PATTERNS = [
  /<!ENTITY/gi,
  /<!DOCTYPE/gi,
  /SYSTEM\s+["']/gi,
  /PUBLIC\s+["']/gi,
];

// NoSQL Injection patterns
const NOSQL_INJECTION_PATTERNS = [
  /\$where/gi,
  /\$regex/gi,
  /\$ne/gi,
  /\$gt/gi,
  /\$lt/gi,
  /\$or/gi,
  /\$and/gi,
];

// ============================================
// SECURITY CHECKS
// ============================================

export interface SecurityCheckResult {
  safe: boolean;
  threats: string[];
  blockedReason?: string;
}

/**
 * Check for SQL Injection attempts
 */
export function checkSQLInjection(input: string): boolean {
  return SQL_INJECTION_PATTERNS.some(pattern => pattern.test(input));
}

/**
 * Check for XSS attempts
 */
export function checkXSS(input: string): boolean {
  return XSS_PATTERNS.some(pattern => pattern.test(input));
}

/**
 * Check for Path Traversal attempts
 */
export function checkPathTraversal(input: string): boolean {
  return PATH_TRAVERSAL_PATTERNS.some(pattern => pattern.test(input));
}

/**
 * Check for Command Injection attempts
 */
export function checkCommandInjection(input: string): boolean {
  return COMMAND_INJECTION_PATTERNS.some(pattern => pattern.test(input));
}

/**
 * Check for LDAP Injection attempts
 */
export function checkLDAPInjection(input: string): boolean {
  return LDAP_INJECTION_PATTERNS.some(pattern => pattern.test(input));
}

/**
 * Check for XML/XXE attacks
 */
export function checkXMLInjection(input: string): boolean {
  return XML_INJECTION_PATTERNS.some(pattern => pattern.test(input));
}

/**
 * Check for NoSQL Injection attempts
 */
export function checkNoSQLInjection(input: string): boolean {
  return NOSQL_INJECTION_PATTERNS.some(pattern => pattern.test(input));
}

/**
 * Comprehensive security check on all inputs
 */
export function performSecurityCheck(event: APIGatewayProxyEvent): SecurityCheckResult {
  const threats: string[] = [];

  // Collect all input sources
  const inputsToCheck: string[] = [];

  // Check query parameters
  if (event.queryStringParameters) {
    Object.values(event.queryStringParameters).forEach(v => {
      if (v) inputsToCheck.push(v);
    });
  }

  // Check path parameters
  if (event.pathParameters) {
    Object.values(event.pathParameters).forEach(v => {
      if (v) inputsToCheck.push(v);
    });
  }

  // Check body
  if (event.body) {
    inputsToCheck.push(event.body);
    try {
      const bodyObj = JSON.parse(event.body);
      collectStrings(bodyObj, inputsToCheck);
    } catch {
      // Not JSON, just check the raw body
    }
  }

  // Check headers (selected sensitive ones)
  const sensitiveHeaders = ['user-agent', 'referer', 'x-forwarded-for'];
  sensitiveHeaders.forEach(h => {
    const value = event.headers[h] || event.headers[h.toUpperCase()];
    if (value) inputsToCheck.push(value);
  });

  // Run all checks
  for (const input of inputsToCheck) {
    if (checkSQLInjection(input)) threats.push('SQL_INJECTION');
    if (checkXSS(input)) threats.push('XSS');
    if (checkPathTraversal(input)) threats.push('PATH_TRAVERSAL');
    if (checkCommandInjection(input)) threats.push('COMMAND_INJECTION');
    if (checkXMLInjection(input)) threats.push('XML_INJECTION');
    if (checkNoSQLInjection(input)) threats.push('NOSQL_INJECTION');
  }

  // Remove duplicates
  const uniqueThreats = [...new Set(threats)];

  return {
    safe: uniqueThreats.length === 0,
    threats: uniqueThreats,
    blockedReason: uniqueThreats.length > 0
      ? `Blocked: Potential ${uniqueThreats.join(', ')} attack detected`
      : undefined,
  };
}

/**
 * Recursively collect all string values from an object
 */
function collectStrings(obj: unknown, result: string[]): void {
  if (typeof obj === 'string') {
    result.push(obj);
  } else if (Array.isArray(obj)) {
    obj.forEach(item => collectStrings(item, result));
  } else if (obj && typeof obj === 'object') {
    Object.values(obj).forEach(value => collectStrings(value, result));
  }
}

/**
 * Sanitize input string - remove potentially dangerous content
 */
export function sanitizeInput(input: string): string {
  if (!input || typeof input !== 'string') return '';

  let sanitized = input
    // Remove null bytes
    .replace(/\0/g, '')
    // Remove control characters
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    // Encode HTML entities
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');

  return sanitized;
}

/**
 * Validate and sanitize email
 */
export function sanitizeEmail(email: string): string | null {
  if (!email || typeof email !== 'string') return null;

  const trimmed = email.trim().toLowerCase();
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

  if (!emailRegex.test(trimmed) || trimmed.length > 254) {
    return null;
  }

  return trimmed;
}

/**
 * Validate UUID format strictly
 */
export function validateUUID(uuid: string): boolean {
  if (!uuid || typeof uuid !== 'string') return false;
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
}

/**
 * Check if request is from a known bot/crawler
 */
export function isBot(userAgent: string): boolean {
  if (!userAgent) return false;

  const botPatterns = [
    /bot/i,
    /crawler/i,
    /spider/i,
    /scraper/i,
    /curl/i,
    /wget/i,
    /python-requests/i,
    /java\//i,
    /apache-httpclient/i,
    /go-http-client/i,
    /headless/i,
    /phantom/i,
    /selenium/i,
    /puppeteer/i,
  ];

  return botPatterns.some(pattern => pattern.test(userAgent));
}

/**
 * Generate secure response headers
 */
export function getSecureHeaders(origin?: string): Record<string, string> {
  const allowedOrigins = [
    'https://smuppy.com',
    'https://www.smuppy.com',
    'https://app.smuppy.com',
  ];

  // Development origins (only in non-production)
  const devOrigins = [
    'http://localhost:8081',
    'http://localhost:19006',
    'http://localhost:3000',
  ];

  const isProduction = process.env.ENVIRONMENT === 'production';
  const allAllowedOrigins = isProduction ? allowedOrigins : [...allowedOrigins, ...devOrigins];

  // SECURITY: Only allow whitelisted origins, never '*' in production
  const corsOrigin = origin && allAllowedOrigins.includes(origin)
    ? origin
    : 'https://smuppy.com';

  return {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': corsOrigin,
    'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Request-Id,X-Amz-Date',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Max-Age': '3600',
    // Security headers
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '1; mode=block',
    'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
    'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'geolocation=(), microphone=(), camera=()',
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0',
  };
}

/**
 * Log security event for monitoring and alerting
 */
export function logSecurityEvent(
  type: string,
  severity: 'low' | 'medium' | 'high' | 'critical',
  details: Record<string, unknown>
): void {
  const event = {
    timestamp: new Date().toISOString(),
    type: 'SECURITY_EVENT',
    eventType: type,
    severity,
    ...details,
  };

  // Use appropriate log level based on severity
  if (severity === 'critical') {
    log.error('Security event', null, event);
  } else if (severity === 'high' || severity === 'medium') {
    log.warn('Security event', event);
  } else {
    log.info('Security event', event);
  }
}

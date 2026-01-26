/**
 * Forgot Password Lambda Handler
 * Initiates password reset flow by sending reset code
 *
 * Includes rate limiting and security measures
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import {
  CognitoIdentityProviderClient,
  ForgotPasswordCommand,
  UserNotFoundException,
  LimitExceededException,
  InvalidParameterException,
} from '@aws-sdk/client-cognito-identity-provider';
import { createHeaders } from '../utils/cors';
import { createLogger, getRequestId } from '../utils/logger';

const log = createLogger('auth-forgot-password');
const cognitoClient = new CognitoIdentityProviderClient({});

// Validate required environment variables at module load
if (!process.env.CLIENT_ID) throw new Error('CLIENT_ID environment variable is required');

const CLIENT_ID = process.env.CLIENT_ID;

/**
 * Rate Limiting
 *
 * IMPORTANT: This in-memory rate limiting only works per Lambda instance.
 * In a distributed Lambda environment, different requests may hit different instances.
 *
 * PRODUCTION MITIGATION:
 * - Primary rate limiting is handled by WAF (see smuppy-stack.ts AuthRateLimitRule)
 *   which limits to 100 requests per 5 minutes per IP for /auth/ endpoints
 * - Cognito also has built-in rate limiting (LimitExceededException)
 * - This in-memory check provides additional defense-in-depth per instance
 *
 * For stricter rate limiting, implement Redis-based rate limiting using
 * the existing ElastiCache Redis cluster.
 */
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
const MAX_REQUESTS_PER_WINDOW = 3; // Max 3 requests per 5 minutes

// Generate username from email - MUST match client-side logic
// Client uses: email.split('@')[0] (the part before @)
const generateUsername = (email: string): string => {
  return email.toLowerCase().split('@')[0];
};

const checkRateLimit = (email: string): { allowed: boolean; retryAfter?: number } => {
  const now = Date.now();
  const key = email.toLowerCase();
  const record = rateLimitMap.get(key);

  if (!record || now > record.resetTime) {
    rateLimitMap.set(key, { count: 1, resetTime: now + RATE_LIMIT_WINDOW_MS });
    return { allowed: true };
  }

  if (record.count >= MAX_REQUESTS_PER_WINDOW) {
    const retryAfter = Math.ceil((record.resetTime - now) / 1000);
    return { allowed: false, retryAfter };
  }

  record.count++;
  return { allowed: true };
};

// Clean up old entries
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of rateLimitMap.entries()) {
    if (now > value.resetTime) {
      rateLimitMap.delete(key);
    }
  }
}, 60 * 1000);

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  const headers = createHeaders(event);

  try {
    if (!event.body) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          success: false,
          message: 'Missing request body'
        }),
      };
    }

    const { email, username } = JSON.parse(event.body);

    if (!email) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          success: false,
          message: 'Email is required'
        }),
      };
    }

    // Check rate limit
    const rateLimit = checkRateLimit(email);
    if (!rateLimit.allowed) {
      return {
        statusCode: 429,
        headers: {
          ...headers,
          'Retry-After': rateLimit.retryAfter?.toString() || '300',
        },
        body: JSON.stringify({
          success: false,
          code: 'RATE_LIMITED',
          message: `Too many requests. Please wait ${Math.ceil((rateLimit.retryAfter || 300) / 60)} minutes before trying again.`,
          retryAfter: rateLimit.retryAfter,
        }),
      };
    }

    const cognitoUsername = username || generateUsername(email);

    // SECURITY: Log only masked identifier to prevent PII in logs
    log.setRequestId(getRequestId(event));
    log.info('Initiating reset for user', { username: cognitoUsername.substring(0, 2) + '***' });

    await cognitoClient.send(
      new ForgotPasswordCommand({
        ClientId: CLIENT_ID,
        Username: cognitoUsername,
      })
    );

    log.info('Reset code sent successfully');

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        message: 'If an account exists with this email, a password reset code has been sent.',
      }),
    };

  } catch (error: any) {
    log.error('ForgotPassword error', error, { errorName: error.name });

    // Always return success message to prevent email enumeration
    if (error instanceof UserNotFoundException) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          message: 'If an account exists with this email, a password reset code has been sent.',
        }),
      };
    }

    if (error instanceof LimitExceededException) {
      return {
        statusCode: 429,
        headers,
        body: JSON.stringify({
          success: false,
          code: 'LIMIT_EXCEEDED',
          message: 'Too many attempts. Please wait before trying again.',
        }),
      };
    }

    if (error instanceof InvalidParameterException) {
      // User might not be confirmed
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          success: false,
          code: 'NOT_CONFIRMED',
          message: 'Please verify your email first before resetting your password.',
        }),
      };
    }

    // Generic success to prevent enumeration
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        message: 'If an account exists with this email, a password reset code has been sent.',
      }),
    };
  }
};

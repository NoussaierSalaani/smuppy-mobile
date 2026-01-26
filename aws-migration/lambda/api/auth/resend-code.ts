/**
 * Resend Confirmation Code Lambda Handler
 * Resends the verification code to user's email
 *
 * Includes rate limiting to prevent abuse
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import {
  CognitoIdentityProviderClient,
  ResendConfirmationCodeCommand,
  UserNotFoundException,
  LimitExceededException,
  InvalidParameterException,
} from '@aws-sdk/client-cognito-identity-provider';
import { createHeaders } from '../utils/cors';

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
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 3; // Max 3 requests per minute

// Generate username from email - MUST match client-side logic
// Client uses: email.split('@')[0] (the part before @)
const generateUsername = (email: string): string => {
  return email.toLowerCase().split('@')[0];
};

// Simple rate limiting check
const checkRateLimit = (email: string): { allowed: boolean; retryAfter?: number } => {
  const now = Date.now();
  const key = email.toLowerCase();
  const record = rateLimitMap.get(key);

  if (!record || now > record.resetTime) {
    // Reset or create new record
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

// Clean up old entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of rateLimitMap.entries()) {
    if (now > value.resetTime) {
      rateLimitMap.delete(key);
    }
  }
}, 60 * 1000); // Clean every minute

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
          'Retry-After': rateLimit.retryAfter?.toString() || '60',
        },
        body: JSON.stringify({
          success: false,
          code: 'RATE_LIMITED',
          message: `Too many requests. Please wait ${rateLimit.retryAfter} seconds before trying again.`,
          retryAfter: rateLimit.retryAfter,
        }),
      };
    }

    // Generate the Cognito username
    const cognitoUsername = username || generateUsername(email);

    // SECURITY: Log only masked identifier to prevent PII in logs
    console.log('[ResendCode] Resending code for user:', cognitoUsername.substring(0, 2) + '***');

    await cognitoClient.send(
      new ResendConfirmationCodeCommand({
        ClientId: CLIENT_ID,
        Username: cognitoUsername,
      })
    );

    console.log('[ResendCode] Code resent successfully');

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        message: 'A new verification code has been sent to your email.',
      }),
    };

  } catch (error: any) {
    console.error('[ResendCode] Error:', error.name, error.message);

    // Handle specific Cognito errors
    if (error instanceof UserNotFoundException) {
      // Return generic message to prevent email enumeration
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          message: 'If an account exists, a new verification code has been sent.',
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
          message: 'Too many attempts. Please wait a few minutes before trying again.',
        }),
      };
    }

    if (error instanceof InvalidParameterException) {
      // User might already be confirmed
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          success: false,
          code: 'ALREADY_CONFIRMED',
          message: 'This email has already been verified. You can sign in now.',
        }),
      };
    }

    // For any other error, return success to prevent enumeration
    console.error('[ResendCode] Unexpected error, returning generic success');
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        message: 'If an account exists, a new verification code has been sent.',
      }),
    };
  }
};

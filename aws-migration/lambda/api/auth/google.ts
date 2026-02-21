/**
 * Google Sign-In Lambda Handler
 * Verifies Google ID token and creates/authenticates user in Cognito
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { OAuth2Client } from 'google-auth-library';
import { createHeaders } from '../utils/cors';
import { createLogger, getRequestId } from '../utils/logger';
import { requireRateLimit } from '../utils/rate-limit';
import { getOrCreateCognitoUser, authenticateUser } from './_shared-social';

const log = createLogger('auth/google');

// Google OAuth client IDs
const GOOGLE_CLIENT_IDS = [
  process.env.GOOGLE_IOS_CLIENT_ID,
  process.env.GOOGLE_ANDROID_CLIENT_ID,
  process.env.GOOGLE_WEB_CLIENT_ID,
].filter(Boolean) as string[];

if (GOOGLE_CLIENT_IDS.length === 0) {
  throw new Error('At least one GOOGLE_CLIENT_ID must be configured');
}

const googleClient = new OAuth2Client();

interface GoogleTokenPayload {
  sub: string; // Google user ID
  email?: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
  given_name?: string;
  family_name?: string;
}

// Verify Google ID token
const verifyGoogleToken = async (idToken: string): Promise<GoogleTokenPayload> => {
  const ticket = await googleClient.verifyIdToken({
    idToken,
    audience: GOOGLE_CLIENT_IDS,
  });

  const payload = ticket.getPayload();
  if (!payload) {
    throw new Error('Invalid token payload');
  }

  return {
    sub: payload.sub,
    email: payload.email,
    email_verified: payload.email_verified,
    name: payload.name,
    picture: payload.picture,
    given_name: payload.given_name,
    family_name: payload.family_name,
  };
};

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  const headers = createHeaders(event);
  log.initFromEvent(event);
  const requestId = getRequestId(event);
  log.setRequestId(requestId);

  const startTime = Date.now();

  try {
    if (!event.body) {
      log.warn('Missing request body');
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ success: false, message: 'Missing request body' }),
      };
    }

    const { idToken } = JSON.parse(event.body);

    if (!idToken) {
      log.warn('Missing ID token');
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ success: false, message: 'Missing ID token' }),
      };
    }

    // Rate limit: 10 requests per minute per IP
    const ip = event.requestContext.identity?.sourceIp || 'unknown';
    const rateLimitResponse = await requireRateLimit({
      prefix: 'auth-google',
      identifier: ip,
      windowSeconds: 60,
      maxRequests: 10,
    }, headers);
    if (rateLimitResponse) return rateLimitResponse;

    // Verify Google token
    log.info('Verifying Google token');
    const googlePayload = await verifyGoogleToken(idToken);
    log.info('Token verified', { googleUserId: googlePayload.sub.substring(0, 8) + '***' });

    // Get or create Cognito user
    const { userId, isNewUser, password } = await getOrCreateCognitoUser(
      'google',
      googlePayload.sub,
      googlePayload.email,
      'google.com',
      googlePayload.name,
    );
    log.info('User authenticated', { userId: userId.substring(0, 10) + '***', isNewUser });

    // Get Cognito tokens
    const tokens = await authenticateUser(userId, password);

    log.logResponse(200, Date.now() - startTime, { isNewUser });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        user: {
          id: googlePayload.sub,
          email: googlePayload.email,
          emailVerified: googlePayload.email_verified,
          username: googlePayload.email?.split('@')[0],
          attributes: {
            sub: googlePayload.sub,
            email: googlePayload.email,
            name: googlePayload.name,
            picture: googlePayload.picture,
          },
        },
        tokens,
        isNewUser,
      }),
    };
  } catch (error_: unknown) {
    // SECURITY: Log full error server-side, return generic message to client
    log.error('Authentication failed', error_);
    log.logResponse(401, Date.now() - startTime);

    return {
      statusCode: 401,
      headers,
      body: JSON.stringify({
        error: 'Authentication failed',
        message: 'Unable to authenticate with Google. Please try again.',
      }),
    };
  }
};

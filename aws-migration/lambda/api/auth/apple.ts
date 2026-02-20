/**
 * Apple Sign-In Lambda Handler
 * Verifies Apple ID token and creates/authenticates user in Cognito
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import * as jwt from 'jsonwebtoken';
import * as jwksClient from 'jwks-rsa';
import { createHash } from 'crypto';
import { createHeaders } from '../utils/cors';
import { createLogger, getRequestId } from '../utils/logger';
import { requireRateLimit } from '../utils/rate-limit';
import { getOrCreateCognitoUser, authenticateUser } from './_shared-social';

const log = createLogger('auth/apple');

// Apple's JWKS endpoint
const APPLE_JWKS_URL = 'https://appleid.apple.com/auth/keys';
const APPLE_ISSUER = 'https://appleid.apple.com';
const APPLE_CLIENT_ID = process.env.APPLE_CLIENT_ID || 'com.nou09.Smuppy';

// JWKS client for Apple token verification
const jwks = jwksClient.default({
  jwksUri: APPLE_JWKS_URL,
  cache: true,
  cacheMaxEntries: 5,
  cacheMaxAge: 600000, // 10 minutes
});

interface AppleTokenPayload {
  iss: string;
  aud: string;
  exp: number;
  iat: number;
  sub: string; // Apple user ID
  email?: string;
  email_verified?: string;
  nonce?: string;
  nonce_supported?: boolean;
}

// Get signing key from Apple JWKS
const getAppleSigningKey = (kid: string): Promise<string> => {
  return new Promise((resolve, reject) => {
    jwks.getSigningKey(kid, (err, key) => {
      if (err) {
        reject(err);
        return;
      }
      const signingKey = key?.getPublicKey();
      if (!signingKey) {
        reject(new Error('No signing key found'));
        return;
      }
      resolve(signingKey);
    });
  });
};

// Verify Apple ID token
const verifyAppleToken = async (identityToken: string): Promise<AppleTokenPayload> => {
  // Decode header to get key ID
  const decoded = jwt.decode(identityToken, { complete: true });
  if (!decoded || !decoded.header || !decoded.header.kid) {
    throw new Error('Invalid token format');
  }

  // Get public key from Apple
  const publicKey = await getAppleSigningKey(decoded.header.kid);

  // Verify token
  const payload = jwt.verify(identityToken, publicKey, {
    algorithms: ['RS256'],
    issuer: APPLE_ISSUER,
    audience: APPLE_CLIENT_ID,
  }) as AppleTokenPayload;

  return payload;
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

    const { identityToken, nonce } = JSON.parse(event.body);

    if (!identityToken) {
      log.warn('Missing identity token');
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ success: false, message: 'Missing identity token' }),
      };
    }

    // Rate limit: 10 requests per minute per IP
    const ip = event.requestContext.identity?.sourceIp || 'unknown';
    const rateLimitResponse = await requireRateLimit({
      prefix: 'auth-apple',
      identifier: ip,
      windowSeconds: 60,
      maxRequests: 10,
    }, headers);
    if (rateLimitResponse) return rateLimitResponse;

    // Verify Apple token
    log.info('Verifying Apple token');
    const applePayload = await verifyAppleToken(identityToken);

    // Verify nonce - MANDATORY for replay attack prevention
    if (!nonce) {
      log.warn('Missing nonce');
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ success: false, message: 'Missing nonce - required for security' }),
      };
    }
    // The client sends SHA256(rawNonce) to Apple as the nonce parameter.
    // Apple includes it as-is in the JWT. We must hash the rawNonce from
    // the client to compare with the JWT claim.
    const hashedClientNonce = createHash('sha256').update(nonce).digest('hex');
    if (applePayload.nonce !== hashedClientNonce) {
      log.logSecurity('Nonce mismatch - possible replay attack', {
        expectedNonce: hashedClientNonce ? '[PRESENT]' : '[MISSING]',
      });
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ success: false, message: 'Invalid nonce' }),
      };
    }

    // Get or create Cognito user
    const { userId, isNewUser, password } = await getOrCreateCognitoUser(
      'apple',
      applePayload.sub,
      applePayload.email,
      'privaterelay.appleid.com',
    );
    log.info('User authenticated', { userId, isNewUser });

    // Get Cognito tokens
    const tokens = await authenticateUser(userId, password);

    log.logResponse(200, Date.now() - startTime, { isNewUser });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        user: {
          id: applePayload.sub,
          email: applePayload.email,
          emailVerified: applePayload.email_verified === 'true',
          attributes: {
            sub: applePayload.sub,
            email: applePayload.email,
          },
        },
        tokens,
        isNewUser,
      }),
    };
  } catch (error: unknown) {
    // SECURITY: Log full error server-side, return generic message to client
    log.error('Authentication failed', error);
    log.logResponse(401, Date.now() - startTime);

    return {
      statusCode: 401,
      headers,
      body: JSON.stringify({
        error: 'Authentication failed',
        message: 'Unable to authenticate with Apple. Please try again.',
      }),
    };
  }
};

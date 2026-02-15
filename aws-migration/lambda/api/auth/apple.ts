/**
 * Apple Sign-In Lambda Handler
 * Verifies Apple ID token and creates/authenticates user in Cognito
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import {
  CognitoIdentityProviderClient,
  AdminCreateUserCommand,
  AdminSetUserPasswordCommand,
  AdminInitiateAuthCommand,
  AdminGetUserCommand,
  UserNotFoundException,
} from '@aws-sdk/client-cognito-identity-provider';
import * as jwt from 'jsonwebtoken';
import * as jwksClient from 'jwks-rsa';
import { randomBytes, createHash } from 'crypto';
import { createHeaders } from '../utils/cors';
import { createLogger, getRequestId } from '../utils/logger';
import { checkRateLimit } from '../utils/rate-limit';

const cognitoClient = new CognitoIdentityProviderClient({});
const log = createLogger('auth/apple');

// Validate required environment variables at module load
if (!process.env.USER_POOL_ID) throw new Error('USER_POOL_ID environment variable is required');
if (!process.env.CLIENT_ID) throw new Error('CLIENT_ID environment variable is required');

const USER_POOL_ID = process.env.USER_POOL_ID;
const CLIENT_ID = process.env.CLIENT_ID;

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

// Generate a cryptographically secure random password for Cognito user
const generateSecurePassword = (): string => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
  const bytes = randomBytes(32);
  let password = '';
  for (let i = 0; i < 32; i++) {
    password += chars.charAt(bytes[i] % chars.length);
  }
  return password;
};

// Create or get Cognito user
const getOrCreateCognitoUser = async (
  appleUserId: string,
  email?: string
): Promise<{ userId: string; isNewUser: boolean; password: string }> => {
  const username = `apple_${appleUserId}`;

  try {
    // Try to get existing user
    await cognitoClient.send(
      new AdminGetUserCommand({
        UserPoolId: USER_POOL_ID,
        Username: username,
      })
    );
    // ADMIN_NO_SRP_AUTH requires a known password. Since social-auth users
    // don't have a user-facing password, we set a transient one each login.
    // This is the standard Cognito pattern for federated users via Admin API.
    const newPassword = generateSecurePassword();
    await cognitoClient.send(
      new AdminSetUserPasswordCommand({
        UserPoolId: USER_POOL_ID,
        Username: username,
        Password: newPassword,
        Permanent: true,
      })
    );
    return { userId: username, isNewUser: false, password: newPassword };
  } catch (error) {
    if (!(error instanceof UserNotFoundException)) {
      throw error;
    }
  }

  // Create new user
  const password = generateSecurePassword();

  await cognitoClient.send(
    new AdminCreateUserCommand({
      UserPoolId: USER_POOL_ID,
      Username: username,
      UserAttributes: [
        { Name: 'email', Value: email || `${appleUserId}@privaterelay.appleid.com` },
        { Name: 'email_verified', Value: 'true' },
      ],
      MessageAction: 'SUPPRESS', // Don't send welcome email
    })
  );

  // Set permanent password
  await cognitoClient.send(
    new AdminSetUserPasswordCommand({
      UserPoolId: USER_POOL_ID,
      Username: username,
      Password: password,
      Permanent: true,
    })
  );

  return { userId: username, isNewUser: true, password };
};

// Authenticate user and get tokens
const authenticateUser = async (username: string, password: string): Promise<{
  accessToken: string;
  idToken: string;
  refreshToken: string;
}> => {
  // Use admin auth with the password we set
  const authResult = await cognitoClient.send(
    new AdminInitiateAuthCommand({
      UserPoolId: USER_POOL_ID,
      ClientId: CLIENT_ID,
      AuthFlow: 'ADMIN_NO_SRP_AUTH',
      AuthParameters: {
        USERNAME: username,
        PASSWORD: password,
      },
    })
  );

  const tokens = authResult.AuthenticationResult;
  if (!tokens?.AccessToken || !tokens.IdToken || !tokens.RefreshToken) {
    throw new Error('Incomplete token set from Cognito');
  }

  return {
    accessToken: tokens.AccessToken,
    idToken: tokens.IdToken,
    refreshToken: tokens.RefreshToken,
  };
};

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  const headers = createHeaders(event);
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
    const rateLimitResult = await checkRateLimit({
      prefix: 'auth-apple',
      identifier: ip,
      windowSeconds: 60,
      maxRequests: 10,
    });
    if (!rateLimitResult.allowed) {
      log.warn('Rate limit exceeded for Apple auth', { ip: ip.substring(0, 2) + '***' });
      return {
        statusCode: 429,
        headers,
        body: JSON.stringify({ success: false, message: 'Too many requests. Please try again later.' }),
      };
    }

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
      applePayload.sub,
      applePayload.email
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

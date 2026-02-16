/**
 * Google Sign-In Lambda Handler
 * Verifies Google ID token and creates/authenticates user in Cognito
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
import { OAuth2Client } from 'google-auth-library';
import { randomBytes } from 'crypto';
import { createHeaders } from '../utils/cors';
import { createLogger, getRequestId } from '../utils/logger';
import { checkRateLimit } from '../utils/rate-limit';

const cognitoClient = new CognitoIdentityProviderClient({});
const log = createLogger('auth/google');

// Validate required environment variables at module load
if (!process.env.USER_POOL_ID) throw new Error('USER_POOL_ID environment variable is required');
if (!process.env.CLIENT_ID) throw new Error('CLIENT_ID environment variable is required');

const USER_POOL_ID = process.env.USER_POOL_ID;
const CLIENT_ID = process.env.CLIENT_ID;

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
  googleUserId: string,
  email?: string,
  name?: string
): Promise<{ userId: string; isNewUser: boolean; password: string }> => {
  const username = `google_${googleUserId}`;

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

  const userAttributes = [
    { Name: 'email', Value: email || `${googleUserId}@google.com` },
    { Name: 'email_verified', Value: 'true' },
  ];

  if (name) {
    userAttributes.push({ Name: 'name', Value: name });
  }

  await cognitoClient.send(
    new AdminCreateUserCommand({
      UserPoolId: USER_POOL_ID,
      Username: username,
      UserAttributes: userAttributes,
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
    const rateLimitResult = await checkRateLimit({
      prefix: 'auth-google',
      identifier: ip,
      windowSeconds: 60,
      maxRequests: 10,
    });
    if (!rateLimitResult.allowed) {
      log.warn('Rate limit exceeded for Google auth', { ip: ip.substring(0, 2) + '***' });
      return {
        statusCode: 429,
        headers,
        body: JSON.stringify({ success: false, message: 'Too many requests. Please try again later.' }),
      };
    }

    // Verify Google token
    log.info('Verifying Google token');
    const googlePayload = await verifyGoogleToken(idToken);
    log.info('Token verified', { googleUserId: googlePayload.sub.substring(0, 8) + '***' });

    // Get or create Cognito user
    const { userId, isNewUser, password } = await getOrCreateCognitoUser(
      googlePayload.sub,
      googlePayload.email,
      googlePayload.name
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
  } catch (error: unknown) {
    // SECURITY: Log full error server-side, return generic message to client
    log.error('Authentication failed', error);
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

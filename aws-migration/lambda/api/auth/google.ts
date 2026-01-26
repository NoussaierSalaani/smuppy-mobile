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

const cognitoClient = new CognitoIdentityProviderClient({});

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
): Promise<{ userId: string; isNewUser: boolean }> => {
  const username = `google_${googleUserId}`;

  try {
    // Try to get existing user
    await cognitoClient.send(
      new AdminGetUserCommand({
        UserPoolId: USER_POOL_ID,
        Username: username,
      })
    );
    return { userId: username, isNewUser: false };
  } catch (error) {
    if (!(error instanceof UserNotFoundException)) {
      throw error;
    }
  }

  // Create new user
  const tempPassword = generateSecurePassword();

  const userAttributes = [
    { Name: 'email', Value: email || `${googleUserId}@google.com` },
    { Name: 'email_verified', Value: 'true' },
    { Name: 'custom:auth_provider', Value: 'google' },
    { Name: 'custom:google_user_id', Value: googleUserId },
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
      Password: tempPassword,
      Permanent: true,
    })
  );

  return { userId: username, isNewUser: true };
};

// Authenticate user and get tokens
const authenticateUser = async (username: string): Promise<{
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
      },
    })
  );

  if (!authResult.AuthenticationResult) {
    throw new Error('Authentication failed');
  }

  return {
    accessToken: authResult.AuthenticationResult.AccessToken!,
    idToken: authResult.AuthenticationResult.IdToken!,
    refreshToken: authResult.AuthenticationResult.RefreshToken!,
  };
};

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  const headers = createHeaders(event);

  try {
    if (!event.body) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Missing request body' }),
      };
    }

    const { idToken } = JSON.parse(event.body);

    if (!idToken) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Missing ID token' }),
      };
    }

    // Verify Google token
    console.log('[Google Auth] Verifying token...');
    const googlePayload = await verifyGoogleToken(idToken);
    console.log('[Google Auth] Token verified for user:', googlePayload.sub);

    // Get or create Cognito user
    const { userId, isNewUser } = await getOrCreateCognitoUser(
      googlePayload.sub,
      googlePayload.email,
      googlePayload.name
    );
    console.log('[Google Auth] User:', userId, 'isNew:', isNewUser);

    // Get Cognito tokens
    const tokens = await authenticateUser(userId);

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
  } catch (error: any) {
    console.error('[Google Auth] Error:', error);

    // SECURITY: Log full error server-side, return generic message to client
    console.error('[GoogleAuth] Authentication error:', error.message);

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

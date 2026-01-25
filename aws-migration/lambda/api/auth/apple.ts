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

const cognitoClient = new CognitoIdentityProviderClient({});
const USER_POOL_ID = process.env.USER_POOL_ID!;
const CLIENT_ID = process.env.CLIENT_ID!;

// Apple's JWKS endpoint
const APPLE_JWKS_URL = 'https://appleid.apple.com/auth/keys';
const APPLE_ISSUER = 'https://appleid.apple.com';
const APPLE_CLIENT_ID = process.env.APPLE_CLIENT_ID || 'com.smuppy.app';

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

// Generate a secure random password for Cognito user
const generateSecurePassword = (): string => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
  let password = '';
  for (let i = 0; i < 32; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
};

// Create or get Cognito user
const getOrCreateCognitoUser = async (
  appleUserId: string,
  email?: string
): Promise<{ userId: string; isNewUser: boolean }> => {
  const username = `apple_${appleUserId}`;

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

  await cognitoClient.send(
    new AdminCreateUserCommand({
      UserPoolId: USER_POOL_ID,
      Username: username,
      UserAttributes: [
        { Name: 'email', Value: email || `${appleUserId}@privaterelay.appleid.com` },
        { Name: 'email_verified', Value: 'true' },
        { Name: 'custom:auth_provider', Value: 'apple' },
        { Name: 'custom:apple_user_id', Value: appleUserId },
      ],
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
  // Use admin auth to bypass password
  const authResult = await cognitoClient.send(
    new AdminInitiateAuthCommand({
      UserPoolId: USER_POOL_ID,
      ClientId: CLIENT_ID,
      AuthFlow: 'ADMIN_NO_SRP_AUTH',
      AuthParameters: {
        USERNAME: username,
        // For social login, we use a custom auth flow
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
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  };

  try {
    if (!event.body) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Missing request body' }),
      };
    }

    const { identityToken, nonce } = JSON.parse(event.body);

    if (!identityToken) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Missing identity token' }),
      };
    }

    // Verify Apple token
    console.log('[Apple Auth] Verifying token...');
    const applePayload = await verifyAppleToken(identityToken);
    console.log('[Apple Auth] Token verified for user:', applePayload.sub);

    // Verify nonce if provided
    if (nonce && applePayload.nonce !== nonce) {
      console.log('[Apple Auth] Nonce mismatch');
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ error: 'Invalid nonce' }),
      };
    }

    // Get or create Cognito user
    const { userId, isNewUser } = await getOrCreateCognitoUser(
      applePayload.sub,
      applePayload.email
    );
    console.log('[Apple Auth] User:', userId, 'isNew:', isNewUser);

    // Get Cognito tokens
    const tokens = await authenticateUser(userId);

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
  } catch (error: any) {
    console.error('[Apple Auth] Error:', error);

    return {
      statusCode: 401,
      headers,
      body: JSON.stringify({
        error: 'Authentication failed',
        message: error.message,
      }),
    };
  }
};

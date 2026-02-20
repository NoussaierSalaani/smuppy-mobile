/**
 * Shared utilities for social sign-in handlers (Google, Apple).
 *
 * Extracts the three functions that were duplicated verbatim between
 * google.ts and apple.ts:
 *   - generateSecurePassword
 *   - getOrCreateCognitoUser
 *   - authenticateUser
 *
 * Provider-specific logic (token verification, nonce checks, response
 * shape) stays in the individual handler files.
 */

import {
  AdminCreateUserCommand,
  AdminSetUserPasswordCommand,
  AdminInitiateAuthCommand,
  AdminGetUserCommand,
  UserNotFoundException,
} from '@aws-sdk/client-cognito-identity-provider';
import { randomBytes } from 'node:crypto';
import { cognitoClient, USER_POOL_ID, CLIENT_ID } from '../utils/cognito-helpers';

// ── Password Generation ──────────────────────────────────────────────

/** Generate a cryptographically secure random password for Cognito social-auth users. */
export const generateSecurePassword = (): string => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
  const bytes = randomBytes(32);
  let password = '';
  for (let i = 0; i < 32; i++) {
    password += chars.charAt(bytes[i] % chars.length);
  }
  return password;
};

// ── User Creation / Retrieval ────────────────────────────────────────

export interface SocialUserResult {
  userId: string;
  isNewUser: boolean;
  password: string;
}

/**
 * Get or create a Cognito user for a social provider.
 *
 * @param provider       - Provider prefix for the username (e.g. "google", "apple")
 * @param providerUserId - The user's ID from the social provider
 * @param email          - User's email (optional — falls back to `<id>@<fallbackDomain>`)
 * @param fallbackDomain - Domain used when email is missing (e.g. "google.com", "privaterelay.appleid.com")
 * @param name           - User's display name (optional — only Google provides this)
 */
export const getOrCreateCognitoUser = async (
  provider: string,
  providerUserId: string,
  email: string | undefined,
  fallbackDomain: string,
  name?: string,
): Promise<SocialUserResult> => {
  const username = `${provider}_${providerUserId}`;

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
    { Name: 'email', Value: email || `${providerUserId}@${fallbackDomain}` },
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

// ── Token Authentication ─────────────────────────────────────────────

export interface CognitoTokens {
  accessToken: string;
  idToken: string;
  refreshToken: string;
}

/** Authenticate a social-auth user via ADMIN_NO_SRP_AUTH and return Cognito tokens. */
export const authenticateUser = async (
  username: string,
  password: string,
): Promise<CognitoTokens> => {
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

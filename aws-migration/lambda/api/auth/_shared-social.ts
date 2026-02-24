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
  ListUsersCommand,
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
  const normalizedEmail = email?.trim().toLowerCase();

  const setPasswordForUser = async (targetUsername: string): Promise<SocialUserResult> => {
    // ADMIN_NO_SRP_AUTH requires a known password. Since social-auth users
    // don't have a user-facing password, we set a transient one each login.
    const newPassword = generateSecurePassword();
    await cognitoClient.send(
      new AdminSetUserPasswordCommand({
        UserPoolId: USER_POOL_ID,
        Username: targetUsername,
        Password: newPassword,
        Permanent: true,
      })
    );
    return { userId: targetUsername, isNewUser: false, password: newPassword };
  };

  try {
    // Try to get existing user
    await cognitoClient.send(
      new AdminGetUserCommand({
        UserPoolId: USER_POOL_ID,
        Username: username,
      })
    );
    return setPasswordForUser(username);
  } catch (error_) {
    if (!(error_ instanceof UserNotFoundException)) {
      throw error_;
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

  try {
    await cognitoClient.send(
      new AdminCreateUserCommand({
        UserPoolId: USER_POOL_ID,
        Username: username,
        UserAttributes: userAttributes,
        MessageAction: 'SUPPRESS', // Don't send welcome email
      })
    );
  } catch (error_) {
    const err = error_ as { name?: string };

    // Idempotent social auth: if user/alias already exists, recover by reusing existing Cognito user.
    if (err?.name === 'UsernameExistsException' || err?.name === 'AliasExistsException') {
      // First, try direct lookup by provider username.
      try {
        await cognitoClient.send(
          new AdminGetUserCommand({
            UserPoolId: USER_POOL_ID,
            Username: username,
          })
        );
        return setPasswordForUser(username);
      } catch {
        // Continue to email lookup fallback.
      }

      // If a user already exists with this email (e.g., email/password account), reuse it.
      if (normalizedEmail) {
        const escapedEmail = normalizedEmail.replaceAll('\\', '\\\\').replaceAll('"', '\\"');
        const list = await cognitoClient.send(
          new ListUsersCommand({
            UserPoolId: USER_POOL_ID,
            Filter: `email = "${escapedEmail}"`,
            Limit: 1,
          })
        );
        const existingUsername = list.Users?.[0]?.Username;
        if (existingUsername) {
          return setPasswordForUser(existingUsername);
        }
      }
    }

    throw error_;
  }

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

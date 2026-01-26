/**
 * Check User Exists Lambda Handler
 * Checks if a user already exists in Cognito (confirmed status)
 *
 * Returns generic message to prevent email enumeration
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import {
  CognitoIdentityProviderClient,
  AdminGetUserCommand,
  UserNotFoundException,
} from '@aws-sdk/client-cognito-identity-provider';
import { createHeaders } from '../utils/cors';

const cognitoClient = new CognitoIdentityProviderClient({});

// Validate required environment variables at module load
if (!process.env.USER_POOL_ID) throw new Error('USER_POOL_ID environment variable is required');

const USER_POOL_ID = process.env.USER_POOL_ID;

// Generate unique username from email
// SECURITY: Uses full email hash to prevent collisions
// Example: john@gmail.com -> u_johngmailcom (no special chars)
// This MUST match client-side logic in aws-auth.ts and signup.ts
const generateUsername = (email: string): string => {
  const emailHash = email.toLowerCase().replace(/[^a-z0-9]/g, '');
  return `u_${emailHash}`;
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
        body: JSON.stringify({
          success: false,
          message: 'Missing request body'
        }),
      };
    }

    const { email } = JSON.parse(event.body);

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

    const cognitoUsername = generateUsername(email);

    console.log('[CheckUser] Checking user:', cognitoUsername);

    try {
      const user = await cognitoClient.send(
        new AdminGetUserCommand({
          UserPoolId: USER_POOL_ID,
          Username: cognitoUsername,
        })
      );

      // User exists - check if confirmed
      const isConfirmed = user.UserStatus === 'CONFIRMED';

      console.log('[CheckUser] User found, confirmed:', isConfirmed);

      if (isConfirmed) {
        // User exists and is confirmed - generic message (anti-enumeration)
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            success: true,
            exists: true,
            confirmed: true,
            message: 'Unable to proceed.',
          }),
        };
      } else {
        // User exists but not confirmed - allow signup (will delete and recreate)
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            success: true,
            exists: true,
            confirmed: false,
            message: 'OK',
          }),
        };
      }

    } catch (error) {
      if (error instanceof UserNotFoundException) {
        // User doesn't exist - can proceed with signup
        console.log('[CheckUser] User not found, can proceed');
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            success: true,
            exists: false,
            confirmed: false,
            message: 'OK',
          }),
        };
      }
      throw error;
    }

  } catch (error: any) {
    console.error('[CheckUser] Error:', error.name, error.message);

    // Generic error - allow signup to continue (will fail later if needed)
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        exists: false,
        confirmed: false,
        message: 'Unable to verify. Please continue.',
      }),
    };
  }
};

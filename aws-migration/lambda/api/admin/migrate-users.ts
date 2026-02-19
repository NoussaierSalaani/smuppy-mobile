/**
 * User Migration Lambda Handler
 * Imports users from external source (Supabase/JSON) to Cognito + Aurora
 * SECURITY: Admin key stored in AWS Secrets Manager
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import {
  CognitoIdentityProviderClient,
  AdminCreateUserCommand,
  AdminSetUserPasswordCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { timingSafeEqual } from 'crypto';
import { Pool } from 'pg';
import { getPool } from '../../shared/db';
import { createHeaders } from '../utils/cors';
import { createLogger } from '../utils/logger';

const log = createLogger('admin-migrate-users');
let cachedAdminKey: string | null = null;

const secretsClient = new SecretsManagerClient({});
const cognitoClient = new CognitoIdentityProviderClient({});

interface UserToMigrate {
  email: string;
  password?: string; // Optional - will send invite if not provided
  username: string;
  fullName?: string;
  avatarUrl?: string;
  bio?: string;
  accountType?: 'personal' | 'pro_creator' | 'pro_business';
  isVerified?: boolean;
}

interface MigrationResult {
  email: string;
  success: boolean;
  cognitoSub?: string;
  profileId?: string;
  error?: string;
}

// SECURITY: Get admin key from Secrets Manager (not env variable)
async function getAdminKey(): Promise<string> {
  if (cachedAdminKey) return cachedAdminKey;

  const secretArn = process.env.ADMIN_KEY_SECRET_ARN;
  if (!secretArn) {
    throw new Error('ADMIN_KEY_SECRET_ARN not configured');
  }

  const command = new GetSecretValueCommand({ SecretId: secretArn });
  const response = await secretsClient.send(command);
  cachedAdminKey = response.SecretString || '';
  return cachedAdminKey;
}


async function createCognitoUser(user: UserToMigrate): Promise<string> {
  const userPoolId = process.env.USER_POOL_ID;
  if (!userPoolId) {
    throw new Error('USER_POOL_ID not configured');
  }

  // Create user in Cognito
  const createCommand = new AdminCreateUserCommand({
    UserPoolId: userPoolId,
    Username: user.email,
    UserAttributes: [
      { Name: 'email', Value: user.email },
      { Name: 'email_verified', Value: 'true' },
      { Name: 'preferred_username', Value: user.username },
    ],
    MessageAction: user.password ? 'SUPPRESS' : undefined, // Don't send welcome email if we're setting password
  });

  const createResult = await cognitoClient.send(createCommand);
  const cognitoSub = createResult.User?.Attributes?.find(a => a.Name === 'sub')?.Value;

  if (!cognitoSub) {
    throw new Error('Failed to get Cognito sub');
  }

  // Set permanent password if provided
  if (user.password) {
    const setPasswordCommand = new AdminSetUserPasswordCommand({
      UserPoolId: userPoolId,
      Username: user.email,
      Password: user.password,
      Permanent: true,
    });
    await cognitoClient.send(setPasswordCommand);
  }

  return cognitoSub;
}

async function createAuroraProfile(
  db: Pool,
  cognitoSub: string,
  user: UserToMigrate
): Promise<string> {
  const result = await db.query(
    `INSERT INTO profiles (
      cognito_sub, username, full_name, avatar_url, bio,
      account_type, is_verified, onboarding_completed
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, true)
    ON CONFLICT (cognito_sub) DO UPDATE SET
      username = EXCLUDED.username,
      full_name = EXCLUDED.full_name,
      avatar_url = EXCLUDED.avatar_url,
      bio = EXCLUDED.bio
    RETURNING id`,
    [
      cognitoSub,
      user.username,
      user.fullName || user.username,
      user.avatarUrl || null,
      user.bio || null,
      user.accountType || 'personal',
      user.isVerified || false,
    ]
  );

  return result.rows[0].id;
}

async function migrateUser(db: Pool, user: UserToMigrate): Promise<MigrationResult> {
  try {
    // Create in Cognito
    const cognitoSub = await createCognitoUser(user);

    // Create profile in Aurora
    const profileId = await createAuroraProfile(db, cognitoSub, user);

    return {
      email: user.email,
      success: true,
      cognitoSub,
      profileId,
    };
  } catch (error: unknown) {
    // SECURITY: Log only masked email to prevent PII in logs
    const maskedEmail = user.email.substring(0, 2) + '***@' + user.email.split('@')[1];
    log.error('Failed to migrate user', error, { maskedEmail });
    return {
      email: user.email,
      success: false,
      error: 'Migration failed for this user',
    };
  }
}

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  const headers = createHeaders(event);
  log.initFromEvent(event);

  try {
    // SECURITY: Verify admin key from Secrets Manager
    const body = event.body ? JSON.parse(event.body) : {};
    const providedKey = body.adminKey || event.headers['x-admin-key'] || event.headers['X-Admin-Key'];
    const adminKey = await getAdminKey();

    if (!providedKey || providedKey.length !== adminKey.length || !timingSafeEqual(Buffer.from(providedKey), Buffer.from(adminKey))) {
      log.warn('Unauthorized admin access attempt');
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ success: false, message: 'Unauthorized' }),
      };
    }

    // Validate input
    const users: UserToMigrate[] = body.users;
    if (!users || !Array.isArray(users) || users.length === 0) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          error: 'Invalid request',
          message: 'Please provide an array of users to migrate',
          example: {
            users: [
              {
                email: 'user@example.com',
                username: 'johndoe',
                fullName: 'John Doe',
                password: 'optional-password', // NOSONAR
              },
            ],
          },
        }),
      };
    }

    // Limit batch size
    if (users.length > 100) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          error: 'Batch too large',
          message: 'Maximum 100 users per batch',
        }),
      };
    }

    log.info('Starting migration', { userCount: users.length });
    const db = await getPool();

    // Migrate users
    const results: MigrationResult[] = [];
    for (const user of users) {
      const result = await migrateUser(db, user);
      results.push(result);
    }

    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;

    log.info('Migration completed', { successful, failed });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        message: 'User migration completed',
        summary: {
          total: users.length,
          successful,
          failed,
        },
        results,
      }),
    };
  } catch (error: unknown) {
    log.error('Migration error', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ success: false, message: 'Internal server error' }),
    };
  }
};

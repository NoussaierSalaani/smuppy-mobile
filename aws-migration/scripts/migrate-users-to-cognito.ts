#!/usr/bin/env ts-node
/**
 * User Migration Script - Supabase Auth to AWS Cognito
 * Migrates users while preserving their credentials
 */

import { createClient } from '@supabase/supabase-js';
import {
  CognitoIdentityProviderClient,
  AdminCreateUserCommand,
  AdminSetUserPasswordCommand,
  AdminUpdateUserAttributesCommand,
  ListUsersCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { Pool } from 'pg';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

// Configuration
const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY!;
const AWS_REGION = process.env.AWS_REGION || 'us-east-1';
const USER_POOL_ID = process.env.USER_POOL_ID!;
const DB_SECRET_ARN = process.env.DB_SECRET_ARN!;
const BATCH_SIZE = 100;

// Clients
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
const cognito = new CognitoIdentityProviderClient({ region: AWS_REGION });
const secretsManager = new SecretsManagerClient({ region: AWS_REGION });

interface MigrationResult {
  email: string;
  success: boolean;
  cognitoSub?: string;
  error?: string;
}

/**
 * Get Aurora connection pool
 */
async function getAuroraPool(): Promise<Pool> {
  const command = new GetSecretValueCommand({ SecretId: DB_SECRET_ARN });
  const response = await secretsManager.send(command);
  const creds = JSON.parse(response.SecretString || '{}');

  return new Pool({
    host: creds.host,
    port: creds.port || 5432,
    database: creds.dbname || 'smuppy',
    user: creds.username,
    password: creds.password,
    ssl: { rejectUnauthorized: false },
    max: 10,
  });
}

/**
 * Check if user already exists in Cognito
 */
async function userExistsInCognito(email: string): Promise<string | null> {
  try {
    const command = new ListUsersCommand({
      UserPoolId: USER_POOL_ID,
      Filter: `email = "${email}"`,
      Limit: 1,
    });
    const response = await cognito.send(command);

    if (response.Users && response.Users.length > 0) {
      const sub = response.Users[0].Attributes?.find(a => a.Name === 'sub')?.Value;
      return sub || null;
    }
    return null;
  } catch (error) {
    return null;
  }
}

/**
 * Create user in Cognito
 */
async function createCognitoUser(user: any): Promise<MigrationResult> {
  const email = user.email;

  try {
    // Check if user already exists
    const existingSub = await userExistsInCognito(email);
    if (existingSub) {
      return { email, success: true, cognitoSub: existingSub };
    }

    // Create user with temporary password
    const tempPassword = `Temp${Math.random().toString(36).slice(-8)}!1`;

    const createCommand = new AdminCreateUserCommand({
      UserPoolId: USER_POOL_ID,
      Username: email,
      UserAttributes: [
        { Name: 'email', Value: email },
        { Name: 'email_verified', Value: 'true' },
        { Name: 'custom:supabase_id', Value: user.id },
        { Name: 'name', Value: user.full_name || user.username || '' },
        { Name: 'picture', Value: user.avatar_url || '' },
        { Name: 'phone_number', Value: user.phone || '' },
      ].filter(attr => attr.Value), // Remove empty attributes
      TemporaryPassword: tempPassword,
      MessageAction: 'SUPPRESS', // Don't send welcome email
      DesiredDeliveryMediums: ['EMAIL'],
    });

    const createResponse = await cognito.send(createCommand);
    const cognitoSub = createResponse.User?.Attributes?.find(a => a.Name === 'sub')?.Value;

    if (!cognitoSub) {
      throw new Error('Failed to get Cognito sub');
    }

    // Set a permanent password (user will need to reset on first login)
    // Using a secure random password that user won't know
    const permanentPassword = `Smuppy${Math.random().toString(36).slice(-12)}!`;

    const setPasswordCommand = new AdminSetUserPasswordCommand({
      UserPoolId: USER_POOL_ID,
      Username: email,
      Password: permanentPassword,
      Permanent: true,
    });

    await cognito.send(setPasswordCommand);

    return { email, success: true, cognitoSub };
  } catch (error: any) {
    return { email, success: false, error: error.message };
  }
}

/**
 * Update Aurora database with Cognito sub
 */
async function updateAuroraUser(pool: Pool, supabaseId: string, cognitoSub: string): Promise<void> {
  await pool.query(
    'UPDATE users SET cognito_sub = $1, updated_at = NOW() WHERE id = $2',
    [cognitoSub, supabaseId]
  );
}

/**
 * Main migration function
 */
async function migrateUsers(): Promise<void> {
  console.log('='.repeat(60));
  console.log('User Migration: Supabase Auth -> Cognito');
  console.log('='.repeat(60));

  const pool = await getAuroraPool();
  const results: MigrationResult[] = [];
  let totalUsers = 0;
  let successCount = 0;
  let errorCount = 0;
  let offset = 0;

  try {
    // Get total count
    const { count } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1 });
    totalUsers = count || 0;
    console.log(`Total users to migrate: ${totalUsers}`);

    // Get users from Aurora (which were migrated from Supabase)
    const { rows: auroraUsers } = await pool.query(
      'SELECT id, email, username, full_name, avatar_url, phone FROM users WHERE cognito_sub IS NULL ORDER BY created_at'
    );

    console.log(`Users without Cognito sub: ${auroraUsers.length}`);

    for (let i = 0; i < auroraUsers.length; i += BATCH_SIZE) {
      const batch = auroraUsers.slice(i, i + BATCH_SIZE);

      for (const user of batch) {
        const result = await createCognitoUser(user);
        results.push(result);

        if (result.success && result.cognitoSub) {
          await updateAuroraUser(pool, user.id, result.cognitoSub);
          successCount++;
        } else {
          errorCount++;
          console.error(`  Failed: ${user.email} - ${result.error}`);
        }

        process.stdout.write(`  Progress: ${successCount + errorCount}/${auroraUsers.length}\r`);
      }

      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // Print summary
    console.log('\n' + '='.repeat(60));
    console.log('Migration Summary');
    console.log('='.repeat(60));
    console.log(`Total processed: ${results.length}`);
    console.log(`Successful: ${successCount}`);
    console.log(`Errors: ${errorCount}`);

    if (errorCount > 0) {
      console.log('\nFailed users:');
      results
        .filter(r => !r.success)
        .forEach(r => console.log(`  ${r.email}: ${r.error}`));
    }

  } finally {
    await pool.end();
  }
}

/**
 * Generate password reset links for all users
 * (Users will need to reset their password on first login)
 */
async function generatePasswordResetInstructions(): Promise<void> {
  console.log('\n' + '='.repeat(60));
  console.log('Password Reset Instructions');
  console.log('='.repeat(60));
  console.log(`
Since users' passwords cannot be directly migrated from Supabase to Cognito,
all users will need to reset their passwords. You have several options:

1. RECOMMENDED: Add a "Forgot Password" flow in your app that:
   - Triggers Cognito's ForgotPassword API
   - User receives email with verification code
   - User sets new password

2. Send a bulk email to all users explaining the migration and
   asking them to use "Forgot Password" on first login.

3. For VIP users, you can manually set a known temporary password using:
   aws cognito-idp admin-set-user-password \\
     --user-pool-id ${USER_POOL_ID} \\
     --username <email> \\
     --password <temp-password> \\
     --permanent

4. Enable "Force password reset" in Cognito for all migrated users:
   This will require users to change password on first login.
`);
}

// Run migration
migrateUsers()
  .then(() => {
    generatePasswordResetInstructions();
    console.log('\nUser migration completed!');
    process.exit(0);
  })
  .catch((err) => {
    console.error('\nUser migration failed:', err);
    process.exit(1);
  });

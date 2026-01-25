/**
 * User Migration Lambda
 * Migrates users from Supabase Auth to AWS Cognito and links profiles
 *
 * Strategy:
 * 1. Fetch all users from Supabase Auth
 * 2. For each user:
 *    - Try to find existing Cognito user by email
 *    - If not found, create new Cognito user
 *    - Link profile to Cognito sub
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { Pool } from 'pg';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import {
  CognitoIdentityProviderClient,
  AdminCreateUserCommand,
  AdminSetUserPasswordCommand,
  AdminGetUserCommand,
  ListUsersCommand,
} from '@aws-sdk/client-cognito-identity-provider';

let pool: Pool | null = null;
const secretsClient = new SecretsManagerClient({});
const cognitoClient = new CognitoIdentityProviderClient({});

// Supabase configuration
const SUPABASE_URL = 'https://wbgfaeytioxnkdsuvvlx.supabase.co';
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndiZ2ZhZXl0aW94bmtkc3V2dmx4Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NzcwNjc4NSwiZXhwIjoyMDgzMjgyNzg1fQ.9VdScdCAll_3qafbEzqtA2r_MM_BQoJKiakqgZ7zan0';

interface MigrationStats {
  usersProcessed: number;
  usersCreated: number;
  usersExisting: number;
  profilesLinked: number;
  errors: string[];
}

async function getDbCredentials(): Promise<{ host: string; port: number; dbname: string; username: string; password: string }> {
  const command = new GetSecretValueCommand({
    SecretId: process.env.DB_SECRET_ARN,
  });
  const response = await secretsClient.send(command);
  return JSON.parse(response.SecretString || '{}');
}

async function getPool(): Promise<Pool> {
  if (!pool) {
    const credentials = await getDbCredentials();
    pool = new Pool({
      host: credentials.host,
      port: credentials.port,
      database: credentials.dbname || 'smuppy',
      user: credentials.username,
      password: credentials.password,
      ssl: { rejectUnauthorized: false },
      max: 10,
      idleTimeoutMillis: 30000,
    });
  }
  return pool;
}

async function fetchSupabaseUsers(): Promise<any[]> {
  const response = await fetch(`${SUPABASE_URL}/auth/v1/admin/users?per_page=1000`, {
    headers: {
      'apikey': SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch users: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  return data.users || [];
}

async function findCognitoUserByEmail(
  userPoolId: string,
  email: string
): Promise<{ sub: string; username: string } | null> {
  try {
    const command = new ListUsersCommand({
      UserPoolId: userPoolId,
      Filter: `email = "${email}"`,
      Limit: 1,
    });

    const response = await cognitoClient.send(command);

    if (response.Users && response.Users.length > 0) {
      const user = response.Users[0];
      const sub = user.Attributes?.find(a => a.Name === 'sub')?.Value;
      return sub ? { sub, username: user.Username || '' } : null;
    }
    return null;
  } catch (error) {
    return null;
  }
}

async function createCognitoUser(
  user: any,
  userPoolId: string
): Promise<string | null> {
  const email = user.email;

  if (!email) {
    return null;
  }

  // Use Supabase ID as username
  const username = user.id;

  try {
    const createCommand = new AdminCreateUserCommand({
      UserPoolId: userPoolId,
      Username: username,
      UserAttributes: [
        { Name: 'email', Value: email },
        { Name: 'email_verified', Value: 'true' },
      ],
      MessageAction: 'SUPPRESS',
    });

    const createResponse = await cognitoClient.send(createCommand);
    const cognitoSub = createResponse.User?.Attributes?.find(a => a.Name === 'sub')?.Value;

    if (cognitoSub) {
      // Set a permanent password so user can login
      const tempPassword = `Smuppy2026!${Math.random().toString(36).slice(2, 8)}`;

      await cognitoClient.send(new AdminSetUserPasswordCommand({
        UserPoolId: userPoolId,
        Username: username,
        Password: tempPassword,
        Permanent: true,
      }));
    }

    return cognitoSub || null;
  } catch (error: any) {
    if (error.name === 'UsernameExistsException') {
      // User already exists, try to get their sub
      try {
        const getCommand = new AdminGetUserCommand({
          UserPoolId: userPoolId,
          Username: username,
        });
        const getResponse = await cognitoClient.send(getCommand);
        return getResponse.UserAttributes?.find(a => a.Name === 'sub')?.Value || null;
      } catch {
        return null;
      }
    }
    throw error;
  }
}

async function linkProfileToCognito(
  db: Pool,
  supabaseId: string,
  cognitoSub: string
): Promise<boolean> {
  const result = await db.query(
    `UPDATE profiles SET cognito_sub = $1, updated_at = NOW() WHERE id = $2 AND (cognito_sub IS NULL OR cognito_sub != $1)`,
    [cognitoSub, supabaseId]
  );
  return (result.rowCount || 0) > 0;
}

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  };

  try {
    // Auth check (skip for direct Lambda invocation)
    const isDirectInvocation = !event.headers;
    if (!isDirectInvocation) {
      const authHeader = event.headers['x-admin-key'] || event.headers['X-Admin-Key'];
      if (authHeader !== process.env.ADMIN_KEY) {
        return { statusCode: 401, headers, body: JSON.stringify({ message: 'Unauthorized' }) };
      }
    }

    const userPoolId = process.env.USER_POOL_ID;
    if (!userPoolId) {
      return { statusCode: 500, headers, body: JSON.stringify({ message: 'USER_POOL_ID not configured' }) };
    }

    console.log('Starting user migration from Supabase to Cognito...');
    const startTime = Date.now();

    const db = await getPool();
    const stats: MigrationStats = {
      usersProcessed: 0,
      usersCreated: 0,
      usersExisting: 0,
      profilesLinked: 0,
      errors: [],
    };

    // Fetch users from Supabase Auth
    console.log('Fetching users from Supabase Auth...');
    const users = await fetchSupabaseUsers();
    console.log(`Found ${users.length} users to process`);

    // Process each user
    for (const user of users) {
      stats.usersProcessed++;
      const email = user.email;

      if (!email) {
        stats.errors.push(`User ${user.id}: No email`);
        continue;
      }

      try {
        let cognitoSub: string | null = null;

        // First, check if user already exists in Cognito by email
        const existingUser = await findCognitoUserByEmail(userPoolId, email);

        if (existingUser) {
          cognitoSub = existingUser.sub;
          stats.usersExisting++;
          console.log(`Found existing Cognito user for ${email}: ${cognitoSub}`);
        } else {
          // Create new user in Cognito
          cognitoSub = await createCognitoUser(user, userPoolId);
          if (cognitoSub) {
            stats.usersCreated++;
            console.log(`Created Cognito user for ${email}: ${cognitoSub}`);
          }
        }

        // Link profile to Cognito
        if (cognitoSub) {
          const linked = await linkProfileToCognito(db, user.id, cognitoSub);
          if (linked) {
            stats.profilesLinked++;
          }
        }
      } catch (error: any) {
        stats.errors.push(`User ${user.id} (${email}): ${error.message}`);
      }
    }

    const duration = Date.now() - startTime;
    console.log(`User migration completed in ${duration}ms`);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        message: 'User migration completed',
        duration: `${duration}ms`,
        stats,
        errorCount: stats.errors.length,
        errors: stats.errors.slice(0, 20),
      }),
    };
  } catch (error: any) {
    console.error('User migration error:', error);
    return { statusCode: 500, headers, body: JSON.stringify({ message: 'User migration failed', error: error.message }) };
  }
}

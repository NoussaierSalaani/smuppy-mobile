/**
 * Check Profiles Lambda - Debug tool to verify profile-cognito linking
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { Pool } from 'pg';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

let pool: Pool | null = null;
const secretsClient = new SecretsManagerClient({});

async function getDbCredentials(): Promise<any> {
  const command = new GetSecretValueCommand({ SecretId: process.env.DB_SECRET_ARN });
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
      max: 5,
    });
  }
  return pool;
}

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };

  try {
    const db = await getPool();

    // Count profiles with and without cognito_sub
    const statsResult = await db.query(`
      SELECT
        COUNT(*) as total,
        COUNT(cognito_sub) as with_cognito,
        COUNT(*) - COUNT(cognito_sub) as without_cognito
      FROM profiles
    `);

    // Get sample profiles
    const sampleResult = await db.query(`
      SELECT id, username, cognito_sub
      FROM profiles
      ORDER BY created_at DESC
      LIMIT 5
    `);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        stats: statsResult.rows[0],
        samples: sampleResult.rows,
      }),
    };
  } catch (error: any) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: error.message }) };
  }
}

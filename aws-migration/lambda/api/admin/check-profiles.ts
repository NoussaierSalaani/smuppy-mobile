/**
 * Check Profiles Lambda - Debug tool to verify profile-cognito linking
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { timingSafeEqual } from 'crypto';
import { getPool } from '../../shared/db';
import { createHeaders } from '../utils/cors';

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const headers = createHeaders(event);

  // SECURITY: Verify admin API key
  const adminKey = event.headers['x-admin-key'] || event.headers['X-Admin-Key'];
  const expectedKey = process.env.ADMIN_API_KEY;
  if (!adminKey || !expectedKey || adminKey.length !== expectedKey.length || !timingSafeEqual(Buffer.from(adminKey), Buffer.from(expectedKey))) {
    return {
      statusCode: 403,
      headers,
      body: JSON.stringify({ message: 'Forbidden' }),
    };
  }

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

    // Get sample profiles (masked for security)
    const sampleResult = await db.query(`
      SELECT id, LEFT(username, 2) || '***' as username, LEFT(cognito_sub, 8) || '***' as cognito_sub
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
    return { statusCode: 500, headers, body: JSON.stringify({ message: 'Internal server error' }) };
  }
}

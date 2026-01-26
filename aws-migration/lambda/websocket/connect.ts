/**
 * WebSocket Connect Handler
 * Handles new WebSocket connections and stores connection info
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { CognitoJwtVerifier } from 'aws-jwt-verify';
import { getPool } from '../shared/db';
import { createLogger } from '../api/utils/logger';

const log = createLogger('websocket-connect');

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const connectionId = event.requestContext.connectionId;

  try {
    // Get token from query string (WebSocket doesn't support headers on connect)
    const token = event.queryStringParameters?.token;

    if (!token) {
      log.info('No token provided');
      return {
        statusCode: 401,
        body: JSON.stringify({ message: 'Unauthorized - No token provided' }),
      };
    }

    // Verify JWT token
    // SECURITY: CLIENT_ID is required to prevent token from other apps
    if (!process.env.CLIENT_ID) {
      log.error('CLIENT_ID not configured');
      return {
        statusCode: 500,
        body: JSON.stringify({ message: 'Server configuration error' }),
      };
    }

    const verifier = CognitoJwtVerifier.create({
      userPoolId: process.env.USER_POOL_ID!,
      tokenUse: 'id',
      clientId: process.env.CLIENT_ID,
    });

    let payload;
    try {
      payload = await verifier.verify(token);
    } catch (err) {
      log.error('Token verification failed', err);
      return {
        statusCode: 401,
        body: JSON.stringify({ message: 'Unauthorized - Invalid token' }),
      };
    }

    const userId = payload.sub;

    const db = await getPool();

    // Get user's profile ID
    const userResult = await db.query(
      'SELECT id FROM profiles WHERE cognito_sub = $1',
      [userId]
    );

    if (userResult.rows.length === 0) {
      return {
        statusCode: 404,
        body: JSON.stringify({ message: 'User profile not found' }),
      };
    }

    const profileId = userResult.rows[0].id;

    // Store connection in database
    await db.query(
      `INSERT INTO websocket_connections (connection_id, user_id, connected_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (connection_id) DO UPDATE SET user_id = $2, connected_at = NOW()`,
      [connectionId, profileId]
    );

    log.info('WebSocket connected', { connectionId, profileId });

    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Connected' }),
    };
  } catch (error: any) {
    log.error('Error in WebSocket connect', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ message: 'Internal server error' }),
    };
  }
}

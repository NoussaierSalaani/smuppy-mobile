/**
 * Register Push Token Lambda Handler
 * Registers or updates a push notification token for the user
 * Creates SNS Platform Endpoint for receiving push notifications
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import {
  SNSClient,
  CreatePlatformEndpointCommand,
  SetEndpointAttributesCommand,
  DeleteEndpointCommand,
} from '@aws-sdk/client-sns';
import { getPool } from '../../shared/db';
import { createHeaders } from '../utils/cors';
import { createLogger, getRequestId } from '../utils/logger';
import { isNamedError } from '../utils/error-handler';

const log = createLogger('notifications-push-token');
const snsClient = new SNSClient({});

// Rate limit: max 5 token registrations per user per minute
const tokenRateLimits = new Map<string, { count: number; resetAt: number }>();
const TOKEN_RATE_LIMIT = 5;
const TOKEN_RATE_WINDOW_MS = 60_000;

// Platform Application ARNs (set via environment variables)
const IOS_PLATFORM_ARN = process.env.IOS_PLATFORM_APPLICATION_ARN || '';
const ANDROID_PLATFORM_ARN = process.env.ANDROID_PLATFORM_APPLICATION_ARN || '';

/**
 * Create or update SNS Platform Endpoint
 */
async function createOrUpdateEndpoint(
  token: string,
  platformArn: string,
  userId: string
): Promise<string | null> {
  if (!platformArn) {
    log.info('Platform ARN not configured, skipping SNS endpoint creation');
    return null;
  }

  try {
    // Try to create a new endpoint
    const createCommand = new CreatePlatformEndpointCommand({
      PlatformApplicationArn: platformArn,
      Token: token,
      CustomUserData: userId,
    });

    const response = await snsClient.send(createCommand);
    const endpointArn = response.EndpointArn;

    if (endpointArn) {
      // Ensure the endpoint is enabled and has the correct token
      await snsClient.send(
        new SetEndpointAttributesCommand({
          EndpointArn: endpointArn,
          Attributes: {
            Token: token,
            Enabled: 'true',
            CustomUserData: userId,
          },
        })
      );
    }

    return endpointArn || null;
  } catch (error: unknown) {
    // If endpoint already exists, update it
    if (isNamedError(error) && error.name === 'InvalidParameterException' && error.message?.includes('already exists')) {
      // Extract the endpoint ARN from the error message
      const match = error.message.match(/Endpoint (arn:aws:sns:[^:]+:\d+:endpoint\/[^\s]+)/);
      if (match) {
        const existingArn = match[1];

        try {
          await snsClient.send(
            new SetEndpointAttributesCommand({
              EndpointArn: existingArn,
              Attributes: {
                Token: token,
                Enabled: 'true',
                CustomUserData: userId,
              },
            })
          );
          return existingArn;
        } catch (updateError) {
          log.error('Error updating existing endpoint', updateError);
        }
      }
    }

    log.error('Error creating SNS endpoint', error);
    return null;
  }
}

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const headers = createHeaders(event);

  try {
    const userId = event.requestContext.authorizer?.claims?.sub;
    if (!userId) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ message: 'Unauthorized' }),
      };
    }

    // Rate limit POST requests
    if (event.httpMethod === 'POST') {
      const now = Date.now();
      const record = tokenRateLimits.get(userId);
      if (record && now < record.resetAt) {
        if (record.count >= TOKEN_RATE_LIMIT) {
          return {
            statusCode: 429,
            headers,
            body: JSON.stringify({ message: 'Too many token registrations. Please wait.' }),
          };
        }
        record.count++;
      } else {
        tokenRateLimits.set(userId, { count: 1, resetAt: now + TOKEN_RATE_WINDOW_MS });
      }
    }

    // Handle DELETE method
    if (event.httpMethod === 'DELETE') {
      const deviceId = event.pathParameters?.deviceId;
      if (!deviceId) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ message: 'Device ID is required' }),
        };
      }

      const db = await getPool();

      // Get the endpoint ARN before deleting
      const tokenResult = await db.query(
        `SELECT sns_endpoint_arn FROM push_tokens
         WHERE user_id = (SELECT id FROM profiles WHERE cognito_sub = $1)
         AND device_id = $2`,
        [userId, deviceId]
      );

      if (tokenResult.rows.length > 0 && tokenResult.rows[0].sns_endpoint_arn) {
        try {
          await snsClient.send(
            new DeleteEndpointCommand({
              EndpointArn: tokenResult.rows[0].sns_endpoint_arn,
            })
          );
        } catch (error) {
          log.error('Error deleting SNS endpoint', error);
        }
      }

      // Delete from database
      await db.query(
        `DELETE FROM push_tokens
         WHERE user_id = (SELECT id FROM profiles WHERE cognito_sub = $1)
         AND device_id = $2`,
        [userId, deviceId]
      );

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: true, message: 'Push token unregistered' }),
      };
    }

    // Handle POST method
    const body = event.body ? JSON.parse(event.body) : {};
    const { token, platform, deviceId } = body;

    if (!token || typeof token !== 'string' || token.trim().length === 0) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ message: 'Push token is required' }),
      };
    }

    if (!deviceId || typeof deviceId !== 'string') {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ message: 'Device ID is required' }),
      };
    }

    // Validate platform
    const validPlatforms = ['ios', 'android', 'web', 'expo'];
    const normalizedPlatform = platform?.toLowerCase() || 'unknown';
    if (platform && !validPlatforms.includes(normalizedPlatform)) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ message: 'Invalid platform. Must be ios, android, web, or expo' }),
      };
    }

    const db = await getPool();

    // Get user's profile ID (check both id and cognito_sub for consistency)
    const userResult = await db.query(
      'SELECT id FROM profiles WHERE cognito_sub = $1',
      [userId]
    );

    if (userResult.rows.length === 0) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ message: 'User profile not found' }),
      };
    }

    const profileId = userResult.rows[0].id;

    // Create SNS Platform Endpoint based on platform
    let snsEndpointArn: string | null = null;
    if (normalizedPlatform === 'ios') {
      snsEndpointArn = await createOrUpdateEndpoint(token.trim(), IOS_PLATFORM_ARN, profileId);
    } else if (normalizedPlatform === 'android') {
      snsEndpointArn = await createOrUpdateEndpoint(token.trim(), ANDROID_PLATFORM_ARN, profileId);
    }

    // Upsert push token with SNS endpoint ARN
    await db.query(
      `INSERT INTO push_tokens (user_id, token, platform, device_id, sns_endpoint_arn, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT (user_id, device_id)
       DO UPDATE SET token = $2, platform = $3, sns_endpoint_arn = $5, updated_at = NOW()`,
      [profileId, token.trim(), normalizedPlatform, deviceId, snsEndpointArn]
    );

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        message: 'Push token registered successfully',
        snsEnabled: !!snsEndpointArn,
      }),
    };
  } catch (error: unknown) {
    log.error('Error registering push token', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ message: 'Internal server error' }),
    };
  }
}

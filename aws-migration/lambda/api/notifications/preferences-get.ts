/**
 * Get Notification Preferences Lambda Handler
 * Returns the user's push notification preferences
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getPool } from '../../shared/db';
import { createHeaders } from '../utils/cors';
import { createLogger } from '../utils/logger';

const log = createLogger('notifications-preferences-get');

const DEFAULTS = {
  likes: true,
  comments: true,
  follows: true,
  messages: true,
  mentions: true,
  live: true,
};

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const headers = createHeaders(event);

  try {
    const cognitoSub = event.requestContext.authorizer?.claims?.sub;
    if (!cognitoSub) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ message: 'Unauthorized' }),
      };
    }

    const db = await getPool();

    const userResult = await db.query(
      'SELECT id FROM profiles WHERE cognito_sub = $1',
      [cognitoSub]
    );

    if (userResult.rows.length === 0) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ message: 'User profile not found' }),
      };
    }

    const profileId = userResult.rows[0].id;

    const result = await db.query(
      `SELECT likes_enabled, comments_enabled, follows_enabled,
              messages_enabled, mentions_enabled, live_enabled
       FROM notification_preferences
       WHERE user_id = $1`,
      [profileId]
    );

    let preferences;
    if (result.rows.length === 0) {
      preferences = DEFAULTS;
    } else {
      const row = result.rows[0];
      preferences = {
        likes: row.likes_enabled ?? true,
        comments: row.comments_enabled ?? true,
        follows: row.follows_enabled ?? true,
        messages: row.messages_enabled ?? true,
        mentions: row.mentions_enabled ?? true,
        live: row.live_enabled ?? true,
      };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ success: true, preferences }),
    };
  } catch (error: unknown) {
    log.error('Error fetching notification preferences', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ message: 'Internal server error' }),
    };
  }
}

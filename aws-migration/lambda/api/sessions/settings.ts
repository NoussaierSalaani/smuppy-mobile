/**
 * Update Creator Session Settings Handler
 * PUT /sessions/settings - Update creator's session availability and pricing
 */

import { APIGatewayProxyHandler } from 'aws-lambda';
import { getPool, corsHeaders, SqlParam } from '../../shared/db';
import { createLogger } from '../utils/logger';
import { MIN_SESSION_DURATION_MINUTES, MAX_SESSION_DURATION_MINUTES, MAX_SESSION_PRICE_CENTS } from '../utils/constants';

const log = createLogger('sessions-settings');

interface SessionAvailability {
  [day: string]: { start: string; end: string }[];
}

interface UpdateSettingsBody {
  sessionsEnabled?: boolean;
  sessionPrice?: number;
  sessionDuration?: number;
  sessionAvailability?: SessionAvailability;
  timezone?: string;
}

export const handler: APIGatewayProxyHandler = async (event) => {
  log.initFromEvent(event);
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders, body: '' };
  }

  const cognitoSub = event.requestContext.authorizer?.claims?.sub;
  if (!cognitoSub) {
    return {
      statusCode: 401,
      headers: corsHeaders,
      body: JSON.stringify({ success: false, message: 'Unauthorized' }),
    };
  }

  try {
    const pool = await getPool();

    // Resolve cognito_sub → profile ID (SECURITY: cognito_sub != profiles.id)
    const profileLookup = await pool.query(
      'SELECT id, account_type FROM profiles WHERE cognito_sub = $1',
      [cognitoSub]
    );
    if (profileLookup.rows.length === 0) {
      return {
        statusCode: 404,
        headers: corsHeaders,
        body: JSON.stringify({ success: false, message: 'Profile not found' }),
      };
    }
    const userId = profileLookup.rows[0].id;

    // Verify user is a pro_creator
    const userResult = { rows: [profileLookup.rows[0]] };

    if (userResult.rows.length === 0 || userResult.rows[0].account_type !== 'pro_creator') {
      return {
        statusCode: 403,
        headers: corsHeaders,
        body: JSON.stringify({ success: false, message: 'Only pro creators can manage session settings' }),
      };
    }

    const body: UpdateSettingsBody = JSON.parse(event.body || '{}');
    const updates: string[] = [];
    const values: SqlParam[] = [];
    let paramIndex = 1;

    if (body.sessionsEnabled !== undefined) {
      updates.push(`sessions_enabled = $${paramIndex++}`);
      values.push(body.sessionsEnabled);
    }

    if (body.sessionPrice !== undefined) {
      const price = Number(body.sessionPrice);
      if (Number.isNaN(price) || price < 0 || price > MAX_SESSION_PRICE_CENTS) {
        return {
          statusCode: 400,
          headers: corsHeaders,
          body: JSON.stringify({ success: false, message: 'Price must be between 0 and 10000' }),
        };
      }
      updates.push(`session_price = $${paramIndex++}`);
      values.push(price);
    }

    if (body.sessionDuration !== undefined) {
      const duration = Math.round(Number(body.sessionDuration));
      if (Number.isNaN(duration) || duration < MIN_SESSION_DURATION_MINUTES || duration > MAX_SESSION_DURATION_MINUTES) {
        return {
          statusCode: 400,
          headers: corsHeaders,
          body: JSON.stringify({ success: false, message: 'Duration must be between 15 and 480 minutes' }),
        };
      }
      updates.push(`session_duration = $${paramIndex++}`);
      values.push(duration);
    }

    if (body.sessionAvailability !== undefined) {
      updates.push(`session_availability = $${paramIndex++}`);
      values.push(JSON.stringify(body.sessionAvailability));
    }

    if (body.timezone !== undefined) {
      updates.push(`timezone = $${paramIndex++}`);
      values.push(body.timezone);
    }

    if (updates.length === 0) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ success: false, message: 'No updates provided' }),
      };
    }

    values.push(userId);
    const result = await pool.query(
      `UPDATE profiles SET ${updates.join(', ')}, updated_at = NOW()
       WHERE id = $${paramIndex}
       RETURNING sessions_enabled, session_price, session_duration, session_availability, timezone`,
      values
    );

    const settings = result.rows[0];

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        success: true,
        settings: {
          sessionsEnabled: settings.sessions_enabled,
          sessionPrice: parseFloat(settings.session_price || 0),
          sessionDuration: settings.session_duration,
          sessionAvailability: settings.session_availability,
          timezone: settings.timezone,
        },
      }),
    };
  } catch (error) {
    log.error('Update session settings error', error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ success: false, message: 'Failed to update session settings' }),
    };
  }
};

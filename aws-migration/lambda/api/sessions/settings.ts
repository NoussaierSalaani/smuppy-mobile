/**
 * Update Creator Session Settings Handler
 * PUT /sessions/settings - Update creator's session availability and pricing
 */

import { APIGatewayProxyHandler } from 'aws-lambda';
import { getPool, corsHeaders } from '../../shared/db';

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
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders, body: '' };
  }

  const userId = event.requestContext.authorizer?.claims?.sub;
  if (!userId) {
    return {
      statusCode: 401,
      headers: corsHeaders,
      body: JSON.stringify({ success: false, message: 'Unauthorized' }),
    };
  }

  try {
    const pool = await getPool();

    // Verify user is a pro_creator
    const userResult = await pool.query(
      `SELECT account_type FROM profiles WHERE id = $1`,
      [userId]
    );

    if (userResult.rows.length === 0 || userResult.rows[0].account_type !== 'pro_creator') {
      return {
        statusCode: 403,
        headers: corsHeaders,
        body: JSON.stringify({ success: false, message: 'Only pro creators can manage session settings' }),
      };
    }

    const body: UpdateSettingsBody = JSON.parse(event.body || '{}');
    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (body.sessionsEnabled !== undefined) {
      updates.push(`sessions_enabled = $${paramIndex++}`);
      values.push(body.sessionsEnabled);
    }

    if (body.sessionPrice !== undefined) {
      updates.push(`session_price = $${paramIndex++}`);
      values.push(body.sessionPrice);
    }

    if (body.sessionDuration !== undefined) {
      updates.push(`session_duration = $${paramIndex++}`);
      values.push(body.sessionDuration);
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
    console.error('Update session settings error:', error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ success: false, message: 'Failed to update session settings' }),
    };
  }
};

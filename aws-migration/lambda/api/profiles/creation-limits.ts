/**
 * Creation Limits Lambda Handler
 * Returns event/group creation limits for the authenticated user
 */

import { APIGatewayProxyHandler } from 'aws-lambda';
import { getPool } from '../../shared/db';
import { createHeaders } from '../utils/cors';
import { createLogger } from '../utils/logger';

const log = createLogger('profiles-creation-limits');

const MAX_EVENTS_PER_MONTH_PERSONAL = 4;
const MAX_GROUPS_PER_MONTH_PERSONAL = 4;

export const handler: APIGatewayProxyHandler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: createHeaders(event), body: '' };
  }

  const headers = createHeaders(event);

  try {
    const cognitoSub = event.requestContext.authorizer?.claims?.sub;
    if (!cognitoSub) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ success: false, message: 'Unauthorized' }),
      };
    }

    const pool = await getPool();

    // Get profile and account type
    const profileResult = await pool.query(
      'SELECT id, account_type FROM profiles WHERE cognito_sub = $1',
      [cognitoSub]
    );

    if (profileResult.rows.length === 0) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ success: false, message: 'Profile not found' }),
      };
    }

    const profile = profileResult.rows[0];
    const isPro = profile.account_type === 'pro_creator' || profile.account_type === 'pro_business';

    // Pro accounts have unlimited creation
    if (isPro) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          canCreateEvent: true,
          canCreateGroup: true,
          eventsThisMonth: 0,
          groupsThisMonth: 0,
          maxEventsPerMonth: -1,
          maxGroupsPerMonth: -1,
          nextResetDate: null,
        }),
      };
    }

    // Count creations this month for personal accounts
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString();

    const [eventsResult, groupsResult] = await Promise.all([
      pool.query(
        `SELECT COUNT(*)::int AS count FROM events
         WHERE creator_id = $1 AND created_at >= $2 AND created_at < $3`,
        [profile.id, monthStart, nextMonth]
      ),
      pool.query(
        `SELECT COUNT(*)::int AS count FROM groups
         WHERE creator_id = $1 AND created_at >= $2 AND created_at < $3`,
        [profile.id, monthStart, nextMonth]
      ),
    ]);

    const eventsThisMonth = eventsResult.rows[0].count;
    const groupsThisMonth = groupsResult.rows[0].count;

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        canCreateEvent: eventsThisMonth < MAX_EVENTS_PER_MONTH_PERSONAL,
        canCreateGroup: groupsThisMonth < MAX_GROUPS_PER_MONTH_PERSONAL,
        eventsThisMonth,
        groupsThisMonth,
        maxEventsPerMonth: MAX_EVENTS_PER_MONTH_PERSONAL,
        maxGroupsPerMonth: MAX_GROUPS_PER_MONTH_PERSONAL,
        nextResetDate: nextMonth,
      }),
    };
  } catch (error: unknown) {
    log.error('Creation limits error', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ success: false, message: 'Failed to check creation limits' }),
    };
  }
};

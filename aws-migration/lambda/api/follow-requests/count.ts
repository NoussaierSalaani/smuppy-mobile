/**
 * Count Follow Requests Lambda Handler
 * Returns the count of pending follow requests for the current user
 */

import { getPool } from '../../shared/db';
import { withErrorHandler } from '../utils/error-handler';

export const handler = withErrorHandler('follow-requests-count', async (event, { headers }) => {
  const userId = event.requestContext.authorizer?.claims?.sub;
  if (!userId) {
    return {
      statusCode: 401,
      headers,
      body: JSON.stringify({ message: 'Unauthorized' }),
    };
  }

  const db = await getPool();

  // Resolve cognito_sub to profileId
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

  const countResult = await db.query(
    'SELECT COUNT(*) as count FROM follow_requests WHERE target_id = $1 AND status = $2',
    [profileId, 'pending']
  );

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({
      count: Number.parseInt(countResult.rows[0].count),
    }),
  };
});

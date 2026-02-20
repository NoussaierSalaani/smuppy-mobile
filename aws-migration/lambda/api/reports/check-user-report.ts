/**
 * Check User Report Lambda Handler
 * Checks if the current user has already reported a specific user
 */

import { getPool } from '../../shared/db';
import { withErrorHandler } from '../utils/error-handler';
import { isValidUUID } from '../utils/security';
import { resolveProfileId } from '../utils/auth';

export const handler = withErrorHandler('reports-check-user', async (event, { headers }) => {
  const cognitoSub = event.requestContext.authorizer?.claims?.sub;
  if (!cognitoSub) {
    return { statusCode: 401, headers, body: JSON.stringify({ message: 'Unauthorized' }) };
  }

  const userId = event.pathParameters?.id;
  if (!userId || !isValidUUID(userId)) {
    return { statusCode: 400, headers, body: JSON.stringify({ message: 'Invalid user ID format' }) };
  }

  const db = await getPool();

  const reporterId = await resolveProfileId(db, cognitoSub);
  if (!reporterId) {
    return { statusCode: 200, headers, body: JSON.stringify({ hasReported: false }) };
  }

  const result = await db.query(
    `SELECT EXISTS(SELECT 1 FROM user_reports WHERE reporter_id = $1 AND reported_user_id = $2) AS has_reported`,
    [reporterId, userId]
  );

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({ hasReported: result.rows[0].has_reported }),
  };
});

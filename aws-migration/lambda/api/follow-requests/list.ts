/**
 * List Follow Requests Lambda Handler
 * Returns pending follow requests for the current user
 */

import { getPool, SqlParam } from '../../shared/db';
import { withErrorHandler } from '../utils/error-handler';
import { parseLimit, applyHasMore } from '../utils/pagination';
import { parseCursor, cursorToSql, generateCursor } from '../utils/cursor';

export const handler = withErrorHandler('follow-requests-list', async (event, { headers }) => {
  const userId = event.requestContext.authorizer?.claims?.sub;
  if (!userId) {
    return {
      statusCode: 401,
      headers,
      body: JSON.stringify({ message: 'Unauthorized' }),
    };
  }

  // Pagination params
  const limit = parseLimit(event.queryStringParameters?.limit);
  const cursor = event.queryStringParameters?.cursor;

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

  // Build query - get pending follow requests with total count via window function
  let query = `
    SELECT
      fr.id,
      fr.created_at,
      p.id as requester_id,
      p.username as requester_username,
      p.full_name as requester_full_name,
      p.avatar_url as requester_avatar_url,
      p.bio as requester_bio,
      p.is_verified as requester_is_verified,
      p.account_type as requester_account_type,
      p.business_name as requester_business_name,
      COUNT(*) OVER() as total_count
    FROM follow_requests fr
    JOIN profiles p ON fr.requester_id = p.id
    WHERE fr.target_id = $1 AND fr.status = 'pending'
  `;

  const params: SqlParam[] = [profileId];
  let paramIndex = 2;

  // Cursor pagination
  const parsedCursor = parseCursor(cursor, 'timestamp-ms');
  if (parsedCursor) {
    const cursorSql = cursorToSql(parsedCursor, 'fr.created_at', paramIndex);
    query += cursorSql.condition;
    params.push(...cursorSql.params);
    paramIndex += cursorSql.params.length;
  }

  query += ` ORDER BY fr.created_at DESC LIMIT $${paramIndex}`;
  params.push(limit + 1);

  const result = await db.query(query, params);

  const { data: requests, hasMore } = applyHasMore(result.rows, limit);

  // Format response
  const formattedRequests = requests.map((request: Record<string, unknown>) => ({
    id: request.id,
    createdAt: request.created_at,
    requester: {
      id: request.requester_id,
      username: request.requester_username,
      fullName: request.requester_full_name,
      avatarUrl: request.requester_avatar_url,
      bio: request.requester_bio,
      isVerified: !!request.requester_is_verified,
      accountType: request.requester_account_type,
      businessName: request.requester_business_name,
    },
  }));

  // Generate next cursor
  const nextCursor = hasMore && requests.length > 0
    ? generateCursor('timestamp-ms', requests.at(-1)! as Record<string, unknown>)
    : null;

  // Extract total from window function (no separate COUNT query needed)
  const totalPending = result.rows.length > 0 ? Number.parseInt(result.rows[0].total_count as string, 10) : 0;

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({
      requests: formattedRequests,
      cursor: nextCursor,
      hasMore,
      totalPending,
    }),
  };
});

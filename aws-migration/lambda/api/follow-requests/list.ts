/**
 * List Follow Requests Lambda Handler
 * Returns pending follow requests for the current user
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getPool, SqlParam } from '../../shared/db';
import { createHeaders } from '../utils/cors';
import { createLogger } from '../utils/logger';

const log = createLogger('follow-requests-list');

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

    // Pagination params
    const limit = Math.min(parseInt(event.queryStringParameters?.limit || '20'), 50);
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

    // Build query - get pending follow requests where user is the target
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
        p.business_name as requester_business_name
      FROM follow_requests fr
      JOIN profiles p ON fr.requester_id = p.id
      WHERE fr.target_id = $1 AND fr.status = 'pending'
    `;

    const params: SqlParam[] = [profileId];
    let paramIndex = 2;

    // Cursor pagination
    if (cursor) {
      query += ` AND fr.created_at < $${paramIndex}`;
      params.push(new Date(parseInt(cursor)));
      paramIndex++;
    }

    query += ` ORDER BY fr.created_at DESC LIMIT $${paramIndex}`;
    params.push(limit + 1);

    const result = await db.query(query, params);

    // Check if there are more results
    const hasMore = result.rows.length > limit;
    const requests = hasMore ? result.rows.slice(0, -1) : result.rows;

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
        isVerified: request.requester_is_verified || false,
        accountType: request.requester_account_type,
        businessName: request.requester_business_name,
      },
    }));

    // Generate next cursor
    const nextCursor = hasMore && requests.length > 0
      ? new Date(requests[requests.length - 1].created_at).getTime().toString()
      : null;

    // Get total pending count
    const countResult = await db.query(
      'SELECT COUNT(*) as count FROM follow_requests WHERE target_id = $1 AND status = $2',
      [profileId, 'pending']
    );

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        requests: formattedRequests,
        cursor: nextCursor,
        hasMore,
        totalPending: parseInt(countResult.rows[0].count),
      }),
    };
  } catch (error: unknown) {
    log.error('Error listing follow requests', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ message: 'Internal server error' }),
    };
  }
}

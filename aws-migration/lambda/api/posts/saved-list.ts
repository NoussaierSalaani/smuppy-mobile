/**
 * List Saved Posts Lambda Handler
 * Returns the current user's saved/bookmarked posts with author info
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getPool } from '../../shared/db';
import { createHeaders } from '../utils/cors';
import { createLogger } from '../utils/logger';

const log = createLogger('posts-saved-list');

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const headers = createHeaders(event);
  log.initFromEvent(event);

  try {
    const userId = event.requestContext.authorizer?.claims?.sub;
    if (!userId) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ message: 'Unauthorized' }),
      };
    }

    const rawLimit = Number.parseInt(event.queryStringParameters?.limit || String(DEFAULT_LIMIT), 10);
    const limit = Math.min(Math.max(1, Number.isNaN(rawLimit) ? DEFAULT_LIMIT : rawLimit), MAX_LIMIT);
    const cursor = event.queryStringParameters?.cursor;

    const db = await getPool();

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

    // Build cursor condition
    let cursorCondition = '';
    const params: (string | number)[] = [profileId];

    if (cursor) {
      const parsedDate = new Date(cursor);
      if (Number.isNaN(parsedDate.getTime())) {
        return { statusCode: 400, headers, body: JSON.stringify({ message: 'Invalid cursor format' }) };
      }
      params.push(parsedDate.toISOString());
      cursorCondition = `AND sp.created_at < $${params.length}::timestamptz`;
    }

    params.push(limit + 1);
    const limitIdx = params.length;

    const result = await db.query(
      `SELECT
        p.id,
        p.author_id,
        p.content,
        p.media_urls,
        p.media_type,
        p.media_meta,
        p.likes_count,
        p.comments_count,
        p.is_peak,
        p.created_at,
        p.updated_at,
        sp.created_at AS saved_at,
        pr.id AS profile_id,
        pr.username AS author_username,
        pr.full_name AS author_full_name,
        pr.avatar_url AS author_avatar_url,
        pr.account_type AS author_account_type,
        pr.is_verified AS author_is_verified,
        pr.business_name AS author_business_name
      FROM saved_posts sp
      INNER JOIN posts p ON p.id = sp.post_id
      INNER JOIN profiles pr ON pr.id = p.author_id
      WHERE sp.user_id = $1
        ${cursorCondition}
      ORDER BY sp.created_at DESC, sp.id DESC
      LIMIT $${limitIdx}`,
      params
    );

    const hasMore = result.rows.length > limit;
    const rows = result.rows.slice(0, limit);

    const data = rows.map((row: Record<string, unknown>) => ({
      id: row.id,
      authorId: row.author_id,
      content: row.content,
      mediaUrls: row.media_urls || [],
      mediaType: row.media_type,
      mediaMeta: row.media_meta || {},
      likesCount: row.likes_count || 0,
      commentsCount: row.comments_count || 0,
      isPeak: row.is_peak || false,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      savedAt: row.saved_at,
      author: {
        id: row.profile_id,
        username: row.author_username,
        fullName: row.author_full_name,
        avatarUrl: row.author_avatar_url,
        accountType: row.author_account_type,
        isVerified: row.author_is_verified || false,
        businessName: row.author_business_name,
      },
    }));

    const nextCursor = hasMore && rows.length > 0
      ? new Date(rows[rows.length - 1].saved_at as string).toISOString()
      : null;

    log.info('Listed saved posts', { profileId: profileId.slice(0, 8) + '***', count: data.length });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ success: true, data, nextCursor, hasMore }),
    };
  } catch (error: unknown) {
    log.error('Error listing saved posts', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ message: 'Internal server error' }),
    };
  }
}

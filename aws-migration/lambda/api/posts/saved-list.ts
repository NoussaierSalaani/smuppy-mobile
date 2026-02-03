/**
 * List Saved Posts Lambda Handler
 * Returns the current user's saved/bookmarked posts with author info
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getReaderPool } from '../../shared/db';
import { createHeaders } from '../utils/cors';
import { createLogger } from '../utils/logger';

const log = createLogger('posts-saved-list');

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

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

    const rawLimit = parseInt(event.queryStringParameters?.limit || String(DEFAULT_LIMIT), 10);
    const rawPage = parseInt(event.queryStringParameters?.page || '1', 10);

    const limit = Math.min(Math.max(1, isNaN(rawLimit) ? DEFAULT_LIMIT : rawLimit), MAX_LIMIT);
    const page = Math.max(1, isNaN(rawPage) ? 1 : rawPage);
    const offset = (page - 1) * limit;

    const db = await getReaderPool();

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

    const result = await db.query(
      `SELECT
        p.id,
        p.author_id,
        p.content,
        p.media_urls,
        p.media_type,
        p.likes_count,
        p.comments_count,
        p.views_count,
        p.is_peak,
        p.created_at,
        p.updated_at,
        sp.created_at AS saved_at,
        pr.id AS profile_id,
        pr.username AS author_username,
        pr.full_name AS author_full_name,
        pr.avatar_url AS author_avatar_url,
        pr.account_type AS author_account_type,
        pr.is_verified AS author_is_verified
      FROM saved_posts sp
      INNER JOIN posts p ON p.id = sp.post_id
      INNER JOIN profiles pr ON pr.id = p.author_id
      WHERE sp.user_id = $1
      ORDER BY sp.created_at DESC
      LIMIT $2 OFFSET $3`,
      [profileId, limit, offset]
    );

    const data = result.rows.map((row: Record<string, unknown>) => ({
      id: row.id,
      authorId: row.author_id,
      content: row.content,
      mediaUrls: row.media_urls || [],
      mediaType: row.media_type,
      likesCount: row.likes_count || 0,
      commentsCount: row.comments_count || 0,
      viewsCount: row.views_count || 0,
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
      },
    }));

    log.info('Listed saved posts', { profileId: profileId.slice(0, 8) + '***', count: data.length });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ success: true, data }),
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

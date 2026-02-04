/**
 * Create Post Lambda Handler
 * Creates a new post with media support
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { v4 as uuidv4 } from 'uuid';
import { getPool } from '../../shared/db';
import { createHeaders } from '../utils/cors';
import { createLogger } from '../utils/logger';
import { checkRateLimit } from '../utils/rate-limit';

const log = createLogger('posts-create');

const MAX_CONTENT_LENGTH = 5000;
const MAX_MEDIA_URLS = 10;
const MAX_MEDIA_URL_LENGTH = 2048;
const MAX_TAGGED_USERS = 20;
const ALLOWED_VISIBILITIES = new Set(['public', 'followers', 'fans', 'private', 'subscribers']);
const ALLOWED_MEDIA_TYPES = new Set(['image', 'video', 'multiple']);
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface CreatePostInput {
  content?: string;
  mediaUrls?: string[];
  mediaType?: 'image' | 'video' | 'multiple';
  visibility?: 'public' | 'followers' | 'fans' | 'private' | 'subscribers';
  location?: string;
  taggedUsers?: string[];
}

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
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

    const rateLimit = await checkRateLimit({
      prefix: 'post-create',
      identifier: cognitoSub,
      windowSeconds: 60,
      maxRequests: 10,
    });
    if (!rateLimit.allowed) {
      return {
        statusCode: 429,
        headers,
        body: JSON.stringify({ success: false, message: 'Too many requests. Please try again later.' }),
      };
    }

    let body: CreatePostInput;
    try {
      body = JSON.parse(event.body || '{}');
    } catch {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ success: false, message: 'Invalid request body' }),
      };
    }

    const hasContent = typeof body.content === 'string' && body.content.trim().length > 0;
    const hasMedia = Array.isArray(body.mediaUrls) && body.mediaUrls.length > 0;
    if (!hasContent && !hasMedia) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ success: false, message: 'Content or media is required' }),
      };
    }

    if (body.visibility && !ALLOWED_VISIBILITIES.has(body.visibility)) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ success: false, message: 'Invalid visibility value' }),
      };
    }

    if (body.mediaType && !ALLOWED_MEDIA_TYPES.has(body.mediaType)) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ success: false, message: 'Invalid media type' }),
      };
    }

    if (hasMedia) {
      if (body.mediaUrls!.length > MAX_MEDIA_URLS) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ success: false, message: `Maximum ${MAX_MEDIA_URLS} media files allowed` }),
        };
      }
      const hasInvalidUrl = body.mediaUrls!.some(
        (url) => typeof url !== 'string' || url.length === 0 || url.length > MAX_MEDIA_URL_LENGTH
      );
      if (hasInvalidUrl) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ success: false, message: 'Invalid media URL' }),
        };
      }
    }

    const sanitizedContent = (body.content || '')
      .replace(/<[^>]*>/g, '')
      .replace(/[\x00-\x1F\x7F]/g, '')
      .trim()
      .slice(0, MAX_CONTENT_LENGTH);

    const sanitizedLocation = body.location
      ? body.location.replace(/<[^>]*>/g, '').replace(/[\x00-\x1F\x7F]/g, '').trim().slice(0, 200)
      : null;

    const db = await getPool();

    const userResult = await db.query(
      'SELECT id FROM profiles WHERE cognito_sub = $1',
      [cognitoSub]
    );

    if (userResult.rows.length === 0) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ success: false, message: 'Profile not found. Please complete onboarding.' }),
      };
    }

    const userId = userResult.rows[0].id;
    const postId = uuidv4();

    const validTaggedIds = (Array.isArray(body.taggedUsers) ? body.taggedUsers : [])
      .filter((tid): tid is string => typeof tid === 'string' && UUID_REGEX.test(tid) && tid !== userId)
      .slice(0, MAX_TAGGED_USERS);

    const client = await db.connect();
    let post: Record<string, unknown>;
    let existingTaggedIds = new Set<string>();

    try {
      await client.query('BEGIN');

      const result = await client.query(
        `INSERT INTO posts (id, author_id, content, media_urls, media_type, visibility, location, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
         RETURNING id, author_id, content, media_urls, media_type, visibility, location, likes_count, comments_count, created_at`,
        [
          postId,
          userId,
          sanitizedContent,
          body.mediaUrls || [],
          body.mediaType || null,
          body.visibility || 'public',
          sanitizedLocation,
        ]
      );

      post = result.rows[0];

      if (validTaggedIds.length > 0) {
        const placeholders = validTaggedIds.map((_: string, i: number) => `$${i + 1}`).join(', ');
        const existsResult = await client.query(
          `SELECT id FROM profiles WHERE id IN (${placeholders})`,
          validTaggedIds
        );
        existingTaggedIds = new Set(existsResult.rows.map((r: { id: string }) => r.id));

        const tagsToInsert = validTaggedIds.filter((tid) => existingTaggedIds.has(tid));

        if (tagsToInsert.length > 0) {
          // Batch insert post_tags: $1 = postId, $2 = userId, $3..N = tagged user IDs
          const tagValues = tagsToInsert.map((_, i) => `($1, $${i + 3}, $2, NOW())`).join(', ');
          await client.query(
            `INSERT INTO post_tags (post_id, tagged_user_id, tagged_by_user_id, created_at)
             VALUES ${tagValues}
             ON CONFLICT (post_id, tagged_user_id) DO NOTHING`,
            [postId, userId, ...tagsToInsert]
          );

          // Batch insert notifications: $1 = body text, $2 = data JSON, $3..N = user IDs
          const notifData = JSON.stringify({ actor_id: userId, post_id: postId });
          const notifValues = tagsToInsert.map((_, i) => `($${i + 3}, 'post_tag', 'You were tagged', $1, $2, NOW())`).join(', ');
          await client.query(
            `INSERT INTO notifications (user_id, type, title, body, data, created_at)
             VALUES ${notifValues}`,
            ['tagged you in a post', notifData, ...tagsToInsert]
          );
        }
      }

      await client.query('COMMIT');
    } catch (txErr) {
      await client.query('ROLLBACK');
      throw txErr;
    } finally {
      client.release();
    }

    const authorResult = await db.query(
      `SELECT id, username, full_name, avatar_url, is_verified, account_type
       FROM profiles WHERE id = $1`,
      [userId]
    );

    const authorRow = authorResult.rows[0];
    const author = authorRow
      ? {
          id: authorRow.id,
          username: authorRow.username,
          fullName: authorRow.full_name,
          avatarUrl: authorRow.avatar_url,
          isVerified: authorRow.is_verified,
          accountType: authorRow.account_type,
        }
      : null;

    const taggedUserIds = validTaggedIds.filter((tid) => existingTaggedIds.has(tid));

    return {
      statusCode: 201,
      headers,
      body: JSON.stringify({
        success: true,
        id: post.id,
        authorId: post.author_id,
        content: post.content,
        mediaUrls: post.media_urls || [],
        mediaType: post.media_type,
        visibility: post.visibility,
        location: post.location || null,
        taggedUsers: taggedUserIds,
        likesCount: 0,
        commentsCount: 0,
        createdAt: post.created_at,
        author,
      }),
    };
  } catch (error: unknown) {
    log.error('Error creating post', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ success: false, message: 'Internal server error' }),
    };
  }
}

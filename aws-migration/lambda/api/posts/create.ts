/**
 * Create Post Lambda Handler
 * Creates a new post with media support
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { v4 as uuidv4 } from 'uuid';
import { getPool } from '../../shared/db';
import { createHeaders } from '../utils/cors';
import { createLogger, getRequestId } from '../utils/logger';
import { checkRateLimit } from '../utils/rate-limit';

const log = createLogger('posts-create');

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
    // Get Cognito sub from authorizer
    const cognitoSub = event.requestContext.authorizer?.claims?.sub;

    if (!cognitoSub) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ message: 'Unauthorized' }),
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
        body: JSON.stringify({ message: 'Too many requests. Please try again later.' }),
      };
    }

    const body: CreatePostInput = JSON.parse(event.body || '{}');

    // Validate input — require meaningful content or media
    const hasContent = body.content && body.content.trim().length > 0;
    const hasMedia = body.mediaUrls && body.mediaUrls.length > 0;
    if (!hasContent && !hasMedia) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ message: 'Content or media is required' }),
      };
    }

    const db = await getPool();

    // Resolve the user's profile ID from cognito_sub
    const userResult = await db.query(
      'SELECT id FROM profiles WHERE cognito_sub = $1',
      [cognitoSub]
    );

    if (userResult.rows.length === 0) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ message: 'Profile not found. Please complete onboarding.' }),
      };
    }

    const userId = userResult.rows[0].id;
    const postId = uuidv4();

    // Insert post + update count in a single transaction
    const client = await db.connect();
    let post: Record<string, unknown>;
    let author: Record<string, unknown> | null;
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const validTaggedIds = (body.taggedUsers || []).filter(
      (tid: string) => uuidRegex.test(tid) && tid !== userId
    );
    let existingTaggedIds = new Set<string>();

    try {
      await client.query('BEGIN');

      const sanitizedLocation = body.location
        ? body.location.replace(/<[^>]*>/g, '').replace(/[\x00-\x1F\x7F]/g, '').trim().slice(0, 200)
        : null;

      const result = await client.query(
        `INSERT INTO posts (id, author_id, content, media_urls, media_type, visibility, location, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
         RETURNING id, author_id, content, media_urls, media_type, visibility, location, likes_count, comments_count, created_at`,
        [
          postId,
          userId,
          (body.content || '').replace(/<[^>]*>/g, '').replace(/[\x00-\x1F\x7F]/g, '').trim(),
          body.mediaUrls || [],
          body.mediaType || null,
          body.visibility || 'public',
          sanitizedLocation,
        ]
      );

      post = result.rows[0];

      // Save tagged users — validate existence first to avoid FK violation rolling back the post
      if (validTaggedIds.length > 0) {
        const placeholders = validTaggedIds.map((_: string, i: number) => `$${i + 1}`).join(', ');
        const existsResult = await client.query(
          `SELECT id FROM profiles WHERE id IN (${placeholders})`,
          validTaggedIds
        );
        existingTaggedIds = new Set(existsResult.rows.map((r: { id: string }) => r.id));

        for (const taggedUserId of validTaggedIds) {
          if (!existingTaggedIds.has(taggedUserId)) continue;
          await client.query(
            `INSERT INTO post_tags (post_id, tagged_user_id, tagged_by_user_id, created_at)
             VALUES ($1, $2, $3, NOW())
             ON CONFLICT (post_id, tagged_user_id) DO NOTHING`,
            [postId, taggedUserId, userId]
          );
          await client.query(
            `INSERT INTO notifications (user_id, type, title, body, data, created_at)
             VALUES ($1, 'post_tag', 'You were tagged', $2, $3, NOW())`,
            [taggedUserId, 'tagged you in a post', JSON.stringify({ actor_id: userId, post_id: postId })]
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

    // Get author data (read-only, outside transaction)
    const authorResult = await db.query(
      `SELECT id, username, full_name, avatar_url, is_verified, account_type
       FROM profiles WHERE id = $1`,
      [userId]
    );

    author = authorResult.rows[0] || null;

    // Collect tagged user IDs for the response (only those that were actually inserted)
    const taggedUserIds = validTaggedIds.filter(
      (tid: string) => existingTaggedIds.has(tid)
    );

    return {
      statusCode: 201,
      headers,
      body: JSON.stringify({
        id: post.id,
        authorId: post.author_id,
        content: post.content,
        mediaUrls: post.media_urls || [],
        mediaType: post.media_type,
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
      body: JSON.stringify({ message: 'Internal server error' }),
    };
  }
}

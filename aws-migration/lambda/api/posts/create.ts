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
import { isValidUUID } from '../utils/security';
import { requireActiveAccount, isAccountError } from '../utils/account-status';
import { filterText } from '../../shared/moderation/textFilter';
import { analyzeTextToxicity } from '../../shared/moderation/textModeration';
import { SYSTEM_MODERATOR_ID } from '../../shared/moderation/constants';

const log = createLogger('posts-create');

const MAX_CONTENT_LENGTH = 5000;
const MAX_MEDIA_URLS = 10;
const MAX_MEDIA_URL_LENGTH = 2048;
const MAX_TAGGED_USERS = 20;
const ALLOWED_VISIBILITIES = new Set(['public', 'fans', 'private', 'subscribers']);
const ALLOWED_MEDIA_TYPES = new Set(['image', 'video', 'multiple']);

interface CreatePostInput {
  content?: string;
  mediaUrls?: string[];
  mediaType?: 'image' | 'video' | 'multiple';
  visibility?: 'public' | 'fans' | 'private' | 'subscribers';
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

    const CONTROL_CHARS = /[\x00-\x1F\x7F]/g;
    const sanitizedContent = (body.content || '')
      .replace(/<[^>]*>/g, '')
      .replace(CONTROL_CHARS, '')
      .trim()
      .slice(0, MAX_CONTENT_LENGTH);

    const sanitizedLocation = body.location
      ? body.location.replace(/<[^>]*>/g, '').replace(CONTROL_CHARS, '').trim().slice(0, 200)
      : null;

    // Comprehend flag tracking
    let contentFlagged = false;
    let flagCategory: string | null = null;
    let flagScore: number | null = null;

    // Backend content moderation check
    if (sanitizedContent) {
      const filterResult = await filterText(sanitizedContent);
      if (!filterResult.clean && (filterResult.severity === 'critical' || filterResult.severity === 'high')) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ success: false, message: 'Content policy violation' }),
        };
      }

      // AI toxicity detection (AWS Comprehend)
      const toxicity = await analyzeTextToxicity(sanitizedContent);
      if (toxicity.action === 'block') {
        log.info('Post blocked by Comprehend', { topCategory: toxicity.topCategory, score: toxicity.maxScore });
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ success: false, message: 'Content policy violation' }),
        };
      }
      if (toxicity.action === 'flag') {
        contentFlagged = true;
        flagCategory = toxicity.topCategory;
        flagScore = toxicity.maxScore;
      }
    }

    // Check account moderation status
    const accountCheck = await requireActiveAccount(cognitoSub, headers);
    if (isAccountError(accountCheck)) return accountCheck;
    const userId = accountCheck.profileId;

    const db = await getPool();

    // Get account_type for visibility check
    const userResult = await db.query(
      'SELECT account_type FROM profiles WHERE id = $1',
      [userId]
    );
    const accountType = userResult.rows[0]?.account_type;

    // Only pro_creator accounts can use 'subscribers' visibility
    if (body.visibility === 'subscribers' && accountType !== 'pro_creator') {
      return {
        statusCode: 403,
        headers,
        body: JSON.stringify({ success: false, message: 'Subscribers visibility requires a creator account' }),
      };
    }

    const postId = uuidv4();

    const validTaggedIds = (Array.isArray(body.taggedUsers) ? body.taggedUsers : [])
      .filter((tid): tid is string => typeof tid === 'string' && isValidUUID(tid) && tid !== userId)
      .slice(0, MAX_TAGGED_USERS);

    const client = await db.connect();
    let post: Record<string, unknown>;
    let existingTaggedIds = new Set<string>();

    try {
      await client.query('BEGIN');

      const result = await client.query(
        `INSERT INTO posts (id, author_id, content, media_urls, media_type, visibility, location, content_status, toxicity_score, toxicity_category, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
         RETURNING id, author_id, content, media_urls, media_type, visibility, location, likes_count, comments_count, created_at`,
        [
          postId,
          userId,
          sanitizedContent,
          body.mediaUrls || [],
          body.mediaType || null,
          body.visibility || 'public',
          sanitizedLocation,
          contentFlagged ? 'flagged' : 'clean',
          flagScore,
          flagCategory,
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
          const notifData = JSON.stringify({ senderId: userId, postId });
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

    // Log flagged content for moderator review (non-blocking)
    if (contentFlagged) {
      try {
        await db.query(
          `INSERT INTO moderation_log (moderator_id, action_type, target_user_id, target_post_id, reason)
           VALUES ($1, 'flag_content', $2, $3, $4)`,
          [SYSTEM_MODERATOR_ID, userId, postId, `Comprehend toxicity: ${flagCategory} score=${flagScore} (under_review)`],
        );
      } catch (flagErr) {
        log.error('Failed to log flagged content (non-blocking)', flagErr);
      }
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

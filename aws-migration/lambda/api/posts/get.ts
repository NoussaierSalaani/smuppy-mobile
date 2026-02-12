/**
 * Get Single Post Lambda Handler
 * Retrieves a single post by ID with author data
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getReaderPool } from '../../shared/db';
import { createHeaders } from '../utils/cors';
import { createLogger } from '../utils/logger';
import { validateUUIDParam, isErrorResponse } from '../utils/validators';
import { extractCognitoSub } from '../utils/security';

const log = createLogger('posts-get');

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const headers = createHeaders(event);

  try {
    const postId = validateUUIDParam(event, headers, 'id', 'Post');
    if (isErrorResponse(postId)) return postId;
    const currentUserId = extractCognitoSub(event);

    // Use reader pool for read operations
    const db = await getReaderPool();

    // SECURITY: Include author's privacy + moderation setting in query
    const result = await db.query(
      `SELECT
        p.id, p.author_id, p.content, p.caption, p.media_urls, p.media_url,
        p.media_type, p.visibility, p.likes_count, p.comments_count,
        p.is_peak, p.peak_duration, p.peak_expires_at, p.save_to_profile,
        p.location, p.tags, p.created_at, p.updated_at,
        pr.is_private as author_is_private,
        pr.cognito_sub as author_cognito_sub,
        pr.moderation_status as author_moderation_status,
        json_build_object(
          'id', pr.id,
          'username', pr.username,
          'fullName', pr.full_name,
          'avatarUrl', pr.avatar_url,
          'isVerified', pr.is_verified,
          'accountType', pr.account_type,
          'businessName', pr.business_name
        ) as author
      FROM posts p
      LEFT JOIN profiles pr ON p.author_id = pr.id
      WHERE p.id = $1`,
      [postId]
    );

    if (result.rows.length === 0) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ message: 'Post not found' }),
      };
    }

    const post = result.rows[0];

    // SECURITY: Hide posts from banned/shadow_banned users (unless requester is the author)
    const isAuthorByModeration = currentUserId && currentUserId === post.author_cognito_sub;
    if (!isAuthorByModeration) {
      const authorStatus = post.author_moderation_status;
      if (authorStatus === 'banned' || authorStatus === 'shadow_banned') {
        return {
          statusCode: 404,
          headers,
          body: JSON.stringify({ message: 'Post not found' }),
        };
      }
      if (post.visibility === 'hidden') {
        return {
          statusCode: 404,
          headers,
          body: JSON.stringify({ message: 'Post not found' }),
        };
      }
    }

    // SECURITY: Check visibility for private profiles
    if (post.author_is_private) {
      // If author is private, check if current user can view
      const isAuthor = currentUserId && currentUserId === post.author_cognito_sub;

      if (!isAuthor) {
        // Check if current user follows the author
        let isFollowing = false;
        if (currentUserId) {
          const followCheck = await db.query(
            `SELECT 1 FROM follows f
             JOIN profiles p ON f.follower_id = p.id
             WHERE p.cognito_sub = $1 AND f.following_id = $2 AND f.status = 'accepted'
             LIMIT 1`,
            [currentUserId, post.author_id]
          );
          isFollowing = followCheck.rows.length > 0;
        }

        if (!isFollowing) {
          return {
            statusCode: 403,
            headers,
            body: JSON.stringify({ message: 'This post is from a private account' }),
          };
        }
      }
    }

    // Fetch tagged users for this post
    const taggedResult = await db.query(
      `SELECT pt.tagged_user_id as id, pr.username, pr.full_name, pr.avatar_url
       FROM post_tags pt
       JOIN profiles pr ON pt.tagged_user_id = pr.id
       WHERE pt.post_id = $1`,
      [postId]
    );
    const taggedUsers = taggedResult.rows.map((r: Record<string, unknown>) => ({
      id: r.id,
      username: r.username,
      fullName: r.full_name,
      avatarUrl: r.avatar_url,
    }));

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        id: post.id,
        authorId: post.author_id,
        content: post.content,
        mediaUrls: post.media_urls || [],
        mediaType: post.media_type,
        location: post.location || null,
        taggedUsers,
        likesCount: post.likes_count || 0,
        commentsCount: post.comments_count || 0,
        createdAt: post.created_at,
        author: post.author,
      }),
    };
  } catch (error: unknown) {
    log.error('Error getting post', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ message: 'Internal server error' }),
    };
  }
}

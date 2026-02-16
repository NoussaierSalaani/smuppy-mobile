/**
 * Delete Post Lambda Handler
 * Deletes a post, cleans up S3 media, and removes orphaned notifications
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { S3Client, DeleteObjectsCommand } from '@aws-sdk/client-s3';
import { CloudFrontClient, CreateInvalidationCommand } from '@aws-sdk/client-cloudfront';
import { getPool } from '../../shared/db';
import { createHeaders } from '../utils/cors';
import { createLogger } from '../utils/logger';
import { requireAuth, validateUUIDParam, isErrorResponse } from '../utils/validators';
import { checkRateLimit } from '../utils/rate-limit';
import { RATE_WINDOW_1_MIN } from '../utils/constants';

const log = createLogger('posts-delete');

const s3Client = new S3Client({
  requestChecksumCalculation: 'WHEN_REQUIRED',
  responseChecksumValidation: 'WHEN_REQUIRED',
});

const cfClient = new CloudFrontClient({});

const MEDIA_BUCKET = process.env.MEDIA_BUCKET || '';
const CLOUDFRONT_DISTRIBUTION_ID = process.env.CLOUDFRONT_DISTRIBUTION_ID || '';

const VARIANT_NAMES = ['large', 'medium', 'thumb'];

/**
 * Extract S3 key from a full S3/CloudFront URL.
 * Handles: https://bucket.s3.amazonaws.com/key, https://cdn.example.com/key
 */
function extractS3Key(url: string): string | null {
  try {
    const parsed = new URL(url);
    const key = parsed.pathname.startsWith('/') ? parsed.pathname.slice(1) : parsed.pathname;
    return key || null;
  } catch {
    return null;
  }
}

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const headers = createHeaders(event);

  try {
    const userId = requireAuth(event, headers);
    if (isErrorResponse(userId)) return userId;

    const { allowed } = await checkRateLimit({ prefix: 'post-delete', identifier: userId, windowSeconds: RATE_WINDOW_1_MIN, maxRequests: 10 });
    if (!allowed) {
      return { statusCode: 429, headers, body: JSON.stringify({ message: 'Too many requests. Please try again later.' }) };
    }

    const postId = validateUUIDParam(event, headers, 'id', 'Post');
    if (isErrorResponse(postId)) return postId;

    const db = await getPool();

    // Get user's profile ID
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

    // Check if post exists, get ownership and media URLs for S3 cleanup
    const postResult = await db.query(
      'SELECT id, author_id, media_urls, media_url, media_meta FROM posts WHERE id = $1',
      [postId]
    );

    if (postResult.rows.length === 0) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ message: 'Post not found' }),
      };
    }

    const post = postResult.rows[0];

    if (post.author_id !== profileId) {
      return {
        statusCode: 403,
        headers,
        body: JSON.stringify({ message: 'Not authorized to delete this post' }),
      };
    }

    // Delete post and notifications in a transaction
    // CRITICAL: Use dedicated client for transaction isolation with connection pooling
    const client = await db.connect();

    try {
      await client.query('BEGIN');

      // Clean up orphaned notifications referencing this post (no FK constraint on JSONB data)
      await client.query(
        `DELETE FROM notifications WHERE data->>'postId' = $1`,
        [postId]
      );

      // Delete the post (CASCADE handles likes, comments, saved_posts, reports, tags, views)
      // DB trigger auto-decrements post_count on profiles
      await client.query('DELETE FROM posts WHERE id = $1', [postId]);

      await client.query('COMMIT');
    } catch (error: unknown) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

    // S3 cleanup (best-effort, after successful DB delete — non-blocking)
    if (MEDIA_BUCKET) {
      const s3Keys: { Key: string }[] = [];

      // Collect all media URLs (array + single field)
      const allUrls: string[] = [
        ...(Array.isArray(post.media_urls) ? post.media_urls : []),
        post.media_url,
      ].filter(Boolean);

      for (const url of allUrls) {
        const key = extractS3Key(url);
        if (key) {
          s3Keys.push({ Key: key });
          // Also delete optimized variants (large/, medium/, thumb/)
          for (const variant of VARIANT_NAMES) {
            const parts = key.split('/');
            const filename = parts[parts.length - 1];
            const baseName = filename.substring(0, filename.lastIndexOf('.'));
            const prefix = parts.slice(0, parts.length - 1).join('/');
            s3Keys.push({ Key: `${prefix}/${variant}/${baseName}.jpg` });
            s3Keys.push({ Key: `${prefix}/${variant}/${baseName}.webp` });
          }
        }
      }

      if (s3Keys.length > 0) {
        try {
          await s3Client.send(new DeleteObjectsCommand({
            Bucket: MEDIA_BUCKET,
            Delete: { Objects: s3Keys, Quiet: true },
          }));
        } catch (s3Error: unknown) {
          // Log but don't fail — DB deletion already committed
          log.error('Failed to clean up S3 media for post', s3Error);
        }

        // CloudFront invalidation (best-effort)
        if (CLOUDFRONT_DISTRIBUTION_ID) {
          try {
            const paths = s3Keys.map(k => `/${k.Key}`);
            await cfClient.send(new CreateInvalidationCommand({
              DistributionId: CLOUDFRONT_DISTRIBUTION_ID,
              InvalidationBatch: {
                CallerReference: `post-delete-${postId}-${Date.now()}`,
                Paths: { Quantity: paths.length, Items: paths },
              },
            }));
          } catch (cfError: unknown) {
            log.error('Failed to invalidate CloudFront cache for post', cfError);
          }
        }
      }
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        message: 'Post deleted successfully',
      }),
    };
  } catch (error: unknown) {
    log.error('Error deleting post', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ message: 'Internal server error' }),
    };
  }
}

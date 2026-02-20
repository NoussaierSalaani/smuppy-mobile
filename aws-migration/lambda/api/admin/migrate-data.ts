/**
 * Data Migration Lambda Handler
 * Imports data (posts, follows, likes, comments) from external source to Aurora
 * SECURITY: Admin key stored in AWS Secrets Manager
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { timingSafeEqual } from 'node:crypto';
import { Pool } from 'pg';
import { getPool } from '../../shared/db';
import { createHeaders } from '../utils/cors';
import { createLogger } from '../utils/logger';

const log = createLogger('admin-migrate-data');
let cachedAdminKey: string | null = null;

const secretsClient = new SecretsManagerClient({});

// Data types for migration
interface PostToMigrate {
  id?: string;
  authorUsername: string; // Will be resolved to author_id
  content?: string;
  caption?: string;
  mediaUrls?: string[];
  mediaUrl?: string;
  mediaType?: 'image' | 'video' | 'multiple' | 'photo';
  visibility?: 'public' | 'private' | 'fans';
  likesCount?: number;
  commentsCount?: number;
  location?: string;
  tags?: string[];
  createdAt?: string;
}

interface FollowToMigrate {
  followerUsername: string;
  followingUsername: string;
  status?: 'pending' | 'accepted' | 'declined';
  createdAt?: string;
}

interface MigrationData {
  posts?: PostToMigrate[];
  follows?: FollowToMigrate[];
}

interface MigrationResult {
  posts: { imported: number; failed: number; errors: string[] };
  follows: { imported: number; failed: number; errors: string[] };
}

// SECURITY: Get admin key from Secrets Manager (not env variable)
async function getAdminKey(): Promise<string> {
  if (cachedAdminKey) return cachedAdminKey;

  const secretArn = process.env.ADMIN_KEY_SECRET_ARN;
  if (!secretArn) {
    throw new Error('ADMIN_KEY_SECRET_ARN not configured');
  }

  const command = new GetSecretValueCommand({ SecretId: secretArn });
  const response = await secretsClient.send(command);
  cachedAdminKey = response.SecretString || '';
  return cachedAdminKey;
}


// Cache for username -> profile ID lookups
const profileCache: Map<string, string> = new Map();

async function getProfileIdByUsername(db: Pool, username: string): Promise<string | null> {
  if (profileCache.has(username)) {
    return profileCache.get(username)!;
  }

  const result = await db.query(
    'SELECT id FROM profiles WHERE username = $1',
    [username]
  );

  if (result.rows.length > 0) {
    profileCache.set(username, result.rows[0].id);
    return result.rows[0].id;
  }

  return null;
}

async function migratePosts(db: Pool, posts: PostToMigrate[]): Promise<{ imported: number; failed: number; errors: string[] }> {
  let imported = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const post of posts) {
    try {
      const authorId = await getProfileIdByUsername(db, post.authorUsername);
      if (!authorId) {
        errors.push(`Post skipped: author "${post.authorUsername}" not found`);
        failed++;
        continue;
      }

      await db.query(
        `INSERT INTO posts (
          author_id, content, caption, media_urls, media_url, media_type,
          visibility, likes_count, comments_count, location, tags, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        ON CONFLICT DO NOTHING`,
        [
          authorId,
          post.content || null,
          post.caption || null,
          post.mediaUrls || [],
          post.mediaUrl || null,
          post.mediaType || null,
          post.visibility || 'public',
          post.likesCount || 0,
          post.commentsCount || 0,
          post.location || null,
          post.tags || [],
          post.createdAt ? new Date(post.createdAt) : new Date(),
        ]
      );
      imported++;
    } catch (_error: unknown) {
      errors.push('Post migration failed');
      failed++;
    }
  }

  // Update post counts for authors
  await db.query(`
    UPDATE profiles p
    SET post_count = (SELECT COUNT(*) FROM posts WHERE author_id = p.id)
  `);

  return { imported, failed, errors };
}

async function migrateFollows(db: Pool, follows: FollowToMigrate[]): Promise<{ imported: number; failed: number; errors: string[] }> {
  let imported = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const follow of follows) {
    try {
      const followerId = await getProfileIdByUsername(db, follow.followerUsername);
      const followingId = await getProfileIdByUsername(db, follow.followingUsername);

      if (!followerId) {
        errors.push(`Follow skipped: follower "${follow.followerUsername}" not found`);
        failed++;
        continue;
      }
      if (!followingId) {
        errors.push(`Follow skipped: following "${follow.followingUsername}" not found`);
        failed++;
        continue;
      }

      await db.query(
        `INSERT INTO follows (follower_id, following_id, status, created_at)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (follower_id, following_id) DO UPDATE SET status = $3`,
        [
          followerId,
          followingId,
          follow.status || 'accepted',
          follow.createdAt ? new Date(follow.createdAt) : new Date(),
        ]
      );
      imported++;
    } catch (_error: unknown) {
      errors.push('Follow migration failed');
      failed++;
    }
  }

  // Update follower/following counts
  await db.query(`
    UPDATE profiles p
    SET
      fan_count = (SELECT COUNT(*) FROM follows WHERE following_id = p.id AND status = 'accepted'),
      following_count = (SELECT COUNT(*) FROM follows WHERE follower_id = p.id AND status = 'accepted')
  `);

  return { imported, failed, errors };
}

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  const headers = createHeaders(event);
  log.initFromEvent(event);

  try {
    // SECURITY: Verify admin key from Secrets Manager
    const body = event.body ? JSON.parse(event.body) : {};
    const providedKey = body.adminKey || event.headers['x-admin-key'] || event.headers['X-Admin-Key'];
    const adminKey = await getAdminKey();

    if (!providedKey || providedKey.length !== adminKey.length || !timingSafeEqual(Buffer.from(providedKey), Buffer.from(adminKey))) {
      log.warn('Unauthorized admin access attempt');
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ success: false, message: 'Unauthorized' }),
      };
    }

    // Validate input
    const data: MigrationData = body.data || body;
    if (!data.posts && !data.follows) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          error: 'Invalid request',
          message: 'Please provide data to migrate (posts and/or follows)',
          example: {
            data: {
              posts: [
                {
                  authorUsername: 'johndoe',
                  content: 'My first post!',
                  mediaUrl: 'https://...',
                  mediaType: 'image',
                },
              ],
              follows: [
                {
                  followerUsername: 'johndoe',
                  followingUsername: 'janedoe',
                  status: 'accepted',
                },
              ],
            },
          },
        }),
      };
    }

    // Check batch limits
    const postCount = data.posts?.length || 0;
    const followCount = data.follows?.length || 0;

    if (postCount > 1000) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          error: 'Batch too large',
          message: 'Maximum 1000 posts per batch',
        }),
      };
    }

    if (followCount > 5000) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          error: 'Batch too large',
          message: 'Maximum 5000 follows per batch',
        }),
      };
    }

    log.info('Starting data migration', { postCount, followCount });
    const db = await getPool();

    // Clear profile cache for fresh lookups
    profileCache.clear();

    const result: MigrationResult = {
      posts: { imported: 0, failed: 0, errors: [] },
      follows: { imported: 0, failed: 0, errors: [] },
    };

    // Migrate posts
    if (data.posts && data.posts.length > 0) {
      result.posts = await migratePosts(db, data.posts);
    }

    // Migrate follows
    if (data.follows && data.follows.length > 0) {
      result.follows = await migrateFollows(db, data.follows);
    }

    log.info('Data migration completed', { result });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        message: 'Data migration completed',
        summary: {
          posts: {
            total: postCount,
            imported: result.posts.imported,
            failed: result.posts.failed,
          },
          follows: {
            total: followCount,
            imported: result.follows.imported,
            failed: result.follows.failed,
          },
        },
        errors: {
          posts: result.posts.errors.slice(0, 20), // Limit errors in response
          follows: result.follows.errors.slice(0, 20),
        },
      }),
    };
  } catch (error: unknown) {
    log.error('Migration error', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ success: false, message: 'Internal server error' }),
    };
  }
};

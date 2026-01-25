/**
 * Data Migration Lambda
 * Migrates data from Supabase to Aurora PostgreSQL
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { Pool } from 'pg';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

let pool: Pool | null = null;
const secretsClient = new SecretsManagerClient({});

// Supabase configuration
const SUPABASE_URL = 'https://wbgfaeytioxnkdsuvvlx.supabase.co';
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndiZ2ZhZXl0aW94bmtkc3V2dmx4Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NzcwNjc4NSwiZXhwIjoyMDgzMjgyNzg1fQ.9VdScdCAll_3qafbEzqtA2r_MM_BQoJKiakqgZ7zan0';

interface MigrationStats {
  profiles: number;
  posts: number;
  follows: number;
  likes: number;
  comments: number;
  spots: number;
  errors: string[];
}

async function getDbCredentials(): Promise<{ host: string; port: number; dbname: string; username: string; password: string }> {
  const command = new GetSecretValueCommand({
    SecretId: process.env.DB_SECRET_ARN,
  });
  const response = await secretsClient.send(command);
  return JSON.parse(response.SecretString || '{}');
}

async function getPool(): Promise<Pool> {
  if (!pool) {
    const credentials = await getDbCredentials();
    pool = new Pool({
      host: credentials.host,
      port: credentials.port,
      database: credentials.dbname || 'smuppy',
      user: credentials.username,
      password: credentials.password,
      ssl: { rejectUnauthorized: false },
      max: 10,
      idleTimeoutMillis: 30000,
    });
  }
  return pool;
}

async function fetchFromSupabase(table: string, select = '*', limit = 1000, offset = 0): Promise<any[]> {
  const url = `${SUPABASE_URL}/rest/v1/${table}?select=${select}&limit=${limit}&offset=${offset}`;

  const response = await fetch(url, {
    headers: {
      'apikey': SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch ${table}: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

async function fetchAllFromSupabase(table: string, select = '*'): Promise<any[]> {
  const allData: any[] = [];
  let offset = 0;
  const limit = 1000;

  while (true) {
    const batch = await fetchFromSupabase(table, select, limit, offset);
    allData.push(...batch);

    if (batch.length < limit) {
      break;
    }
    offset += limit;
  }

  return allData;
}

async function migrateProfiles(db: Pool, stats: MigrationStats): Promise<void> {
  console.log('Migrating profiles...');

  try {
    const profiles = await fetchAllFromSupabase('profiles');
    console.log(`Found ${profiles.length} profiles to migrate`);

    for (const profile of profiles) {
      try {
        await db.query(`
          INSERT INTO profiles (
            id, username, full_name, display_name, avatar_url, cover_url, bio,
            location, website, account_type, is_verified, is_premium, is_private,
            gender, date_of_birth, interests, expertise, social_links,
            business_name, business_category, business_address, business_phone,
            locations_mode, onboarding_completed, fan_count, following_count, post_count,
            is_bot, is_team, created_at, updated_at
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
            $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31
          )
          ON CONFLICT (id) DO UPDATE SET
            username = EXCLUDED.username,
            full_name = EXCLUDED.full_name,
            avatar_url = EXCLUDED.avatar_url,
            bio = EXCLUDED.bio,
            fan_count = EXCLUDED.fan_count,
            post_count = EXCLUDED.post_count,
            updated_at = NOW()
        `, [
          profile.id,
          profile.username || `user_${profile.id.slice(0, 8)}`,
          profile.full_name,
          profile.display_name,
          profile.avatar_url,
          profile.cover_url,
          profile.bio,
          profile.location,
          profile.website,
          profile.account_type || 'personal',
          profile.is_verified || false,
          profile.is_premium || false,
          profile.is_private || false,
          profile.gender,
          profile.date_of_birth,
          profile.interests || [],
          profile.expertise || [],
          profile.social_links || {},
          profile.business_name,
          profile.business_category,
          profile.business_address,
          profile.business_phone,
          profile.locations_mode || 'nearby',
          profile.onboarding_completed || false,
          profile.fan_count || 0,
          profile.following_count || 0,
          profile.post_count || 0,
          profile.is_bot || false,
          profile.is_team || false,
          profile.created_at || new Date(),
          profile.updated_at || new Date(),
        ]);
        stats.profiles++;
      } catch (error: any) {
        stats.errors.push(`Profile ${profile.id}: ${error.message}`);
      }
    }
  } catch (error: any) {
    stats.errors.push(`Profiles fetch: ${error.message}`);
  }
}

async function migratePosts(db: Pool, stats: MigrationStats): Promise<void> {
  console.log('Migrating posts...');

  try {
    const posts = await fetchAllFromSupabase('posts');
    console.log(`Found ${posts.length} posts to migrate`);

    for (const post of posts) {
      try {
        // Map user_id to author_id
        const authorId = post.author_id || post.user_id;

        await db.query(`
          INSERT INTO posts (
            id, author_id, content, caption, media_urls, media_url, media_type,
            visibility, likes_count, comments_count, views_count, location, tags,
            is_peak, peak_duration, peak_expires_at, save_to_profile, created_at, updated_at
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19
          )
          ON CONFLICT (id) DO UPDATE SET
            content = EXCLUDED.content,
            likes_count = EXCLUDED.likes_count,
            comments_count = EXCLUDED.comments_count,
            updated_at = NOW()
        `, [
          post.id,
          authorId,
          post.content || post.caption,
          post.caption,
          post.media_urls || [],
          post.media_url,
          post.media_type,
          post.visibility || 'public',
          post.likes_count || 0,
          post.comments_count || 0,
          post.views_count || 0,
          post.location,
          post.tags || [],
          post.is_peak || false,
          post.peak_duration,
          post.peak_expires_at,
          post.save_to_profile !== false,
          post.created_at || new Date(),
          post.updated_at || new Date(),
        ]);
        stats.posts++;
      } catch (error: any) {
        stats.errors.push(`Post ${post.id}: ${error.message}`);
      }
    }
  } catch (error: any) {
    stats.errors.push(`Posts fetch: ${error.message}`);
  }
}

async function migrateFollows(db: Pool, stats: MigrationStats): Promise<void> {
  console.log('Migrating follows...');

  try {
    const follows = await fetchAllFromSupabase('follows');
    console.log(`Found ${follows.length} follows to migrate`);

    for (const follow of follows) {
      try {
        // Generate UUID if id is null (Supabase may not have id column)
        await db.query(`
          INSERT INTO follows (id, follower_id, following_id, status, created_at, updated_at)
          VALUES (COALESCE($1::uuid, uuid_generate_v4()), $2, $3, $4, $5, $6)
          ON CONFLICT (follower_id, following_id) DO NOTHING
        `, [
          follow.id || null,
          follow.follower_id,
          follow.following_id,
          follow.status || 'accepted',
          follow.created_at || new Date(),
          follow.updated_at || new Date(),
        ]);
        stats.follows++;
      } catch (error: any) {
        stats.errors.push(`Follow ${follow.follower_id}->${follow.following_id}: ${error.message}`);
      }
    }
  } catch (error: any) {
    stats.errors.push(`Follows fetch: ${error.message}`);
  }
}

async function migrateLikes(db: Pool, stats: MigrationStats): Promise<void> {
  console.log('Migrating likes...');

  try {
    const likes = await fetchAllFromSupabase('likes');
    console.log(`Found ${likes.length} likes to migrate`);

    for (const like of likes) {
      try {
        await db.query(`
          INSERT INTO likes (id, user_id, post_id, created_at)
          VALUES ($1, $2, $3, $4)
          ON CONFLICT (user_id, post_id) DO NOTHING
        `, [
          like.id,
          like.user_id,
          like.post_id,
          like.created_at || new Date(),
        ]);
        stats.likes++;
      } catch (error: any) {
        stats.errors.push(`Like ${like.id}: ${error.message}`);
      }
    }
  } catch (error: any) {
    stats.errors.push(`Likes fetch: ${error.message}`);
  }
}

async function migrateComments(db: Pool, stats: MigrationStats): Promise<void> {
  console.log('Migrating comments...');

  try {
    const comments = await fetchAllFromSupabase('comments');
    console.log(`Found ${comments.length} comments to migrate`);

    for (const comment of comments) {
      try {
        await db.query(`
          INSERT INTO comments (id, user_id, post_id, text, parent_comment_id, created_at, updated_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          ON CONFLICT (id) DO NOTHING
        `, [
          comment.id,
          comment.user_id,
          comment.post_id,
          comment.text || comment.content,
          comment.parent_comment_id,
          comment.created_at || new Date(),
          comment.updated_at || new Date(),
        ]);
        stats.comments++;
      } catch (error: any) {
        stats.errors.push(`Comment ${comment.id}: ${error.message}`);
      }
    }
  } catch (error: any) {
    stats.errors.push(`Comments fetch: ${error.message}`);
  }
}

async function migrateSpots(db: Pool, stats: MigrationStats): Promise<void> {
  console.log('Migrating spots...');

  try {
    const spots = await fetchAllFromSupabase('spots');
    console.log(`Found ${spots.length} spots to migrate`);

    for (const spot of spots) {
      try {
        await db.query(`
          INSERT INTO spots (
            id, creator_id, name, description, category, sport_type,
            address, city, country, latitude, longitude, images, amenities,
            rating, review_count, is_verified, opening_hours, contact_info,
            created_at, updated_at
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20
          )
          ON CONFLICT (id) DO UPDATE SET
            name = EXCLUDED.name,
            description = EXCLUDED.description,
            rating = EXCLUDED.rating,
            review_count = EXCLUDED.review_count,
            updated_at = NOW()
        `, [
          spot.id,
          spot.creator_id,
          spot.name,
          spot.description,
          spot.category,
          spot.sport_type,
          spot.address,
          spot.city,
          spot.country,
          spot.latitude,
          spot.longitude,
          spot.images || [],
          spot.amenities || [],
          spot.rating || 0,
          spot.review_count || 0,
          spot.is_verified || false,
          spot.opening_hours || {},
          spot.contact_info || {},
          spot.created_at || new Date(),
          spot.updated_at || new Date(),
        ]);
        stats.spots++;
      } catch (error: any) {
        stats.errors.push(`Spot ${spot.id}: ${error.message}`);
      }
    }
  } catch (error: any) {
    stats.errors.push(`Spots fetch: ${error.message}`);
  }
}

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  };

  try {
    // Auth check (skip for direct Lambda invocation)
    const isDirectInvocation = !event.headers;
    if (!isDirectInvocation) {
      const authHeader = event.headers['x-admin-key'] || event.headers['X-Admin-Key'];
      if (authHeader !== process.env.ADMIN_KEY) {
        return {
          statusCode: 401,
          headers,
          body: JSON.stringify({ message: 'Unauthorized' }),
        };
      }
    }

    console.log('Starting data migration from Supabase to Aurora...');
    const startTime = Date.now();

    const db = await getPool();
    const stats: MigrationStats = {
      profiles: 0,
      posts: 0,
      follows: 0,
      likes: 0,
      comments: 0,
      spots: 0,
      errors: [],
    };

    // Migrate in order (profiles first due to foreign keys)
    await migrateProfiles(db, stats);
    await migratePosts(db, stats);
    await migrateFollows(db, stats);
    await migrateLikes(db, stats);
    await migrateComments(db, stats);
    await migrateSpots(db, stats);

    const duration = Date.now() - startTime;
    console.log(`Migration completed in ${duration}ms`);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        message: 'Migration completed',
        duration: `${duration}ms`,
        stats: {
          profiles: stats.profiles,
          posts: stats.posts,
          follows: stats.follows,
          likes: stats.likes,
          comments: stats.comments,
          spots: stats.spots,
        },
        errorCount: stats.errors.length,
        errors: stats.errors.slice(0, 20), // First 20 errors
      }),
    };
  } catch (error: any) {
    console.error('Migration error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ message: 'Migration failed', error: error.message }),
    };
  }
}

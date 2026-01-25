#!/usr/bin/env ts-node
/**
 * Supabase to Aurora PostgreSQL Migration Script
 * Handles full database migration with zero downtime approach
 */

import { createClient } from '@supabase/supabase-js';
import { Pool } from 'pg';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

// Configuration
const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY!;
const AWS_REGION = process.env.AWS_REGION || 'us-east-1';
const DB_SECRET_ARN = process.env.DB_SECRET_ARN!;
const BATCH_SIZE = 1000;

// Clients
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
const secretsManager = new SecretsManagerClient({ region: AWS_REGION });

interface MigrationStats {
  table: string;
  total: number;
  migrated: number;
  errors: number;
  duration: number;
}

/**
 * Get Aurora credentials from Secrets Manager
 */
async function getAuroraCredentials(): Promise<any> {
  const command = new GetSecretValueCommand({ SecretId: DB_SECRET_ARN });
  const response = await secretsManager.send(command);
  return JSON.parse(response.SecretString || '{}');
}

/**
 * Create Aurora connection pool
 */
async function createAuroraPool(): Promise<Pool> {
  const creds = await getAuroraCredentials();
  return new Pool({
    host: creds.host,
    port: creds.port || 5432,
    database: creds.dbname || 'smuppy',
    user: creds.username,
    password: creds.password,
    ssl: { rejectUnauthorized: false },
    max: 20,
  });
}

/**
 * Create database schema in Aurora
 */
async function createSchema(pool: Pool): Promise<void> {
  console.log('Creating database schema...');

  const schema = `
    -- Enable UUID extension
    CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
    CREATE EXTENSION IF NOT EXISTS "pg_trgm"; -- For text search

    -- Users table
    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      email VARCHAR(255) UNIQUE NOT NULL,
      username VARCHAR(50) UNIQUE NOT NULL,
      full_name VARCHAR(255),
      avatar_url TEXT,
      bio TEXT,
      website VARCHAR(255),
      phone VARCHAR(20),
      date_of_birth DATE,
      gender VARCHAR(20),
      location VARCHAR(255),
      is_verified BOOLEAN DEFAULT FALSE,
      is_private BOOLEAN DEFAULT FALSE,
      account_type VARCHAR(50) DEFAULT 'personal',
      followers_count INTEGER DEFAULT 0,
      following_count INTEGER DEFAULT 0,
      posts_count INTEGER DEFAULT 0,
      peaks_count INTEGER DEFAULT 0,
      cognito_sub VARCHAR(255) UNIQUE,
      fcm_token TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      deleted_at TIMESTAMPTZ
    );

    -- Posts table
    CREATE TABLE IF NOT EXISTS posts (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      content TEXT,
      media_urls JSONB DEFAULT '[]',
      media_type VARCHAR(20),
      visibility VARCHAR(20) DEFAULT 'public',
      likes_count INTEGER DEFAULT 0,
      comments_count INTEGER DEFAULT 0,
      shares_count INTEGER DEFAULT 0,
      views_count INTEGER DEFAULT 0,
      location JSONB,
      tags JSONB DEFAULT '[]',
      mentions JSONB DEFAULT '[]',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      deleted_at TIMESTAMPTZ
    );

    -- Peaks (short videos) table
    CREATE TABLE IF NOT EXISTS peaks (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      video_url TEXT NOT NULL,
      thumbnail_url TEXT,
      caption TEXT,
      duration INTEGER,
      likes_count INTEGER DEFAULT 0,
      comments_count INTEGER DEFAULT 0,
      shares_count INTEGER DEFAULT 0,
      views_count INTEGER DEFAULT 0,
      sound_id UUID,
      tags JSONB DEFAULT '[]',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      deleted_at TIMESTAMPTZ
    );

    -- Comments table
    CREATE TABLE IF NOT EXISTS comments (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      post_id UUID REFERENCES posts(id) ON DELETE CASCADE,
      peak_id UUID REFERENCES peaks(id) ON DELETE CASCADE,
      parent_id UUID REFERENCES comments(id) ON DELETE CASCADE,
      content TEXT NOT NULL,
      likes_count INTEGER DEFAULT 0,
      replies_count INTEGER DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      deleted_at TIMESTAMPTZ,
      CONSTRAINT comment_target CHECK (
        (post_id IS NOT NULL AND peak_id IS NULL) OR
        (post_id IS NULL AND peak_id IS NOT NULL)
      )
    );

    -- Likes table
    CREATE TABLE IF NOT EXISTS likes (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      post_id UUID REFERENCES posts(id) ON DELETE CASCADE,
      peak_id UUID REFERENCES peaks(id) ON DELETE CASCADE,
      comment_id UUID REFERENCES comments(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      CONSTRAINT like_target CHECK (
        (post_id IS NOT NULL AND peak_id IS NULL AND comment_id IS NULL) OR
        (post_id IS NULL AND peak_id IS NOT NULL AND comment_id IS NULL) OR
        (post_id IS NULL AND peak_id IS NULL AND comment_id IS NOT NULL)
      ),
      UNIQUE(user_id, post_id),
      UNIQUE(user_id, peak_id),
      UNIQUE(user_id, comment_id)
    );

    -- Follows table
    CREATE TABLE IF NOT EXISTS follows (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      follower_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      following_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      status VARCHAR(20) DEFAULT 'accepted', -- accepted, pending, blocked
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(follower_id, following_id)
    );

    -- Follow requests table (for private accounts)
    CREATE TABLE IF NOT EXISTS follow_requests (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      requester_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      target_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      status VARCHAR(20) DEFAULT 'pending', -- pending, accepted, rejected
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(requester_id, target_id)
    );

    -- Conversations table
    CREATE TABLE IF NOT EXISTS conversations (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      type VARCHAR(20) DEFAULT 'direct', -- direct, group
      name VARCHAR(255),
      last_message_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    -- Conversation participants
    CREATE TABLE IF NOT EXISTS conversation_participants (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      last_read_at TIMESTAMPTZ,
      is_admin BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(conversation_id, user_id)
    );

    -- Messages table
    CREATE TABLE IF NOT EXISTS messages (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      content TEXT,
      media_url TEXT,
      media_type VARCHAR(20),
      read_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      deleted_at TIMESTAMPTZ
    );

    -- Notifications table
    CREATE TABLE IF NOT EXISTS notifications (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type VARCHAR(50) NOT NULL,
      title VARCHAR(255) NOT NULL,
      body TEXT,
      data JSONB DEFAULT '{}',
      read BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    -- Reports table (moderation)
    CREATE TABLE IF NOT EXISTS reports (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      reporter_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      reported_user_id UUID REFERENCES users(id) ON DELETE CASCADE,
      reported_post_id UUID REFERENCES posts(id) ON DELETE CASCADE,
      reported_peak_id UUID REFERENCES peaks(id) ON DELETE CASCADE,
      reported_comment_id UUID REFERENCES comments(id) ON DELETE CASCADE,
      reason VARCHAR(100) NOT NULL,
      description TEXT,
      status VARCHAR(20) DEFAULT 'pending', -- pending, reviewed, resolved, dismissed
      reviewed_by UUID REFERENCES users(id),
      reviewed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    -- Blocks table
    CREATE TABLE IF NOT EXISTS blocks (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      blocker_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      blocked_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(blocker_id, blocked_id)
    );

    -- Create indexes for performance
    CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    CREATE INDEX IF NOT EXISTS idx_users_cognito_sub ON users(cognito_sub);
    CREATE INDEX IF NOT EXISTS idx_users_username_trgm ON users USING gin(username gin_trgm_ops);
    CREATE INDEX IF NOT EXISTS idx_users_full_name_trgm ON users USING gin(full_name gin_trgm_ops);

    CREATE INDEX IF NOT EXISTS idx_posts_user_id ON posts(user_id);
    CREATE INDEX IF NOT EXISTS idx_posts_created_at ON posts(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_posts_user_created ON posts(user_id, created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_peaks_user_id ON peaks(user_id);
    CREATE INDEX IF NOT EXISTS idx_peaks_created_at ON peaks(created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_comments_post_id ON comments(post_id);
    CREATE INDEX IF NOT EXISTS idx_comments_peak_id ON comments(peak_id);
    CREATE INDEX IF NOT EXISTS idx_comments_user_id ON comments(user_id);

    CREATE INDEX IF NOT EXISTS idx_likes_post_id ON likes(post_id);
    CREATE INDEX IF NOT EXISTS idx_likes_peak_id ON likes(peak_id);
    CREATE INDEX IF NOT EXISTS idx_likes_user_id ON likes(user_id);

    CREATE INDEX IF NOT EXISTS idx_follows_follower ON follows(follower_id);
    CREATE INDEX IF NOT EXISTS idx_follows_following ON follows(following_id);
    CREATE INDEX IF NOT EXISTS idx_follows_status ON follows(status);

    CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages(sender_id);

    CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(user_id) WHERE read = FALSE;

    -- Create updated_at trigger function
    CREATE OR REPLACE FUNCTION update_updated_at_column()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.updated_at = NOW();
      RETURN NEW;
    END;
    $$ language 'plpgsql';

    -- Apply updated_at triggers
    DROP TRIGGER IF EXISTS update_users_updated_at ON users;
    CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

    DROP TRIGGER IF EXISTS update_posts_updated_at ON posts;
    CREATE TRIGGER update_posts_updated_at BEFORE UPDATE ON posts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

    DROP TRIGGER IF EXISTS update_peaks_updated_at ON peaks;
    CREATE TRIGGER update_peaks_updated_at BEFORE UPDATE ON peaks FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

    DROP TRIGGER IF EXISTS update_comments_updated_at ON comments;
    CREATE TRIGGER update_comments_updated_at BEFORE UPDATE ON comments FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

    DROP TRIGGER IF EXISTS update_conversations_updated_at ON conversations;
    CREATE TRIGGER update_conversations_updated_at BEFORE UPDATE ON conversations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  `;

  await pool.query(schema);
  console.log('Schema created successfully!');
}

/**
 * Migrate a table from Supabase to Aurora
 */
async function migrateTable(
  tableName: string,
  pool: Pool,
  transformFn?: (row: any) => any
): Promise<MigrationStats> {
  console.log(`Migrating table: ${tableName}`);
  const startTime = Date.now();
  const stats: MigrationStats = { table: tableName, total: 0, migrated: 0, errors: 0, duration: 0 };

  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    const { data, error, count } = await supabase
      .from(tableName)
      .select('*', { count: 'exact' })
      .range(offset, offset + BATCH_SIZE - 1);

    if (error) {
      console.error(`Error fetching ${tableName}:`, error);
      stats.errors++;
      break;
    }

    if (!data || data.length === 0) {
      hasMore = false;
      continue;
    }

    if (offset === 0 && count) {
      stats.total = count;
      console.log(`  Total records: ${count}`);
    }

    // Transform and insert data
    for (const row of data) {
      try {
        const transformedRow = transformFn ? transformFn(row) : row;
        const columns = Object.keys(transformedRow);
        const values = Object.values(transformedRow);
        const placeholders = values.map((_, i) => `$${i + 1}`).join(', ');

        await pool.query(
          `INSERT INTO ${tableName} (${columns.join(', ')}) VALUES (${placeholders})
           ON CONFLICT DO NOTHING`,
          values
        );
        stats.migrated++;
      } catch (err: any) {
        console.error(`  Error inserting row in ${tableName}:`, err.message);
        stats.errors++;
      }
    }

    offset += BATCH_SIZE;
    process.stdout.write(`  Progress: ${stats.migrated}/${stats.total}\r`);

    if (data.length < BATCH_SIZE) {
      hasMore = false;
    }
  }

  stats.duration = Date.now() - startTime;
  console.log(`  Completed: ${stats.migrated}/${stats.total} (${stats.errors} errors) in ${stats.duration}ms`);
  return stats;
}

/**
 * Main migration function
 */
async function migrate(): Promise<void> {
  console.log('='.repeat(60));
  console.log('Supabase to Aurora Migration');
  console.log('='.repeat(60));

  const pool = await createAuroraPool();

  try {
    // Create schema
    await createSchema(pool);

    // Migration order (respecting foreign keys)
    const tables = [
      { name: 'users', transform: (row: any) => ({
        ...row,
        cognito_sub: null, // Will be set during user migration to Cognito
      })},
      { name: 'posts' },
      { name: 'peaks' },
      { name: 'comments' },
      { name: 'likes' },
      { name: 'follows' },
      { name: 'follow_requests' },
      { name: 'conversations' },
      { name: 'conversation_participants' },
      { name: 'messages' },
      { name: 'notifications' },
      { name: 'reports' },
      { name: 'blocks' },
    ];

    const results: MigrationStats[] = [];

    for (const table of tables) {
      try {
        const stats = await migrateTable(table.name, pool, table.transform);
        results.push(stats);
      } catch (err: any) {
        console.error(`Failed to migrate ${table.name}:`, err.message);
        results.push({ table: table.name, total: 0, migrated: 0, errors: 1, duration: 0 });
      }
    }

    // Print summary
    console.log('\n' + '='.repeat(60));
    console.log('Migration Summary');
    console.log('='.repeat(60));
    console.log('Table'.padEnd(25) + 'Total'.padEnd(10) + 'Migrated'.padEnd(10) + 'Errors'.padEnd(10) + 'Duration');
    console.log('-'.repeat(60));

    for (const stat of results) {
      console.log(
        stat.table.padEnd(25) +
        stat.total.toString().padEnd(10) +
        stat.migrated.toString().padEnd(10) +
        stat.errors.toString().padEnd(10) +
        `${stat.duration}ms`
      );
    }

    const totalMigrated = results.reduce((sum, s) => sum + s.migrated, 0);
    const totalErrors = results.reduce((sum, s) => sum + s.errors, 0);
    console.log('-'.repeat(60));
    console.log(`Total: ${totalMigrated} records migrated, ${totalErrors} errors`);

  } finally {
    await pool.end();
  }
}

// Run migration
migrate()
  .then(() => {
    console.log('\nMigration completed!');
    process.exit(0);
  })
  .catch((err) => {
    console.error('\nMigration failed:', err);
    process.exit(1);
  });

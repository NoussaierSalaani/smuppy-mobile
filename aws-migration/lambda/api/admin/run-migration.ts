/**
 * Run Database Migration Lambda
 * Executes the schema SQL on Aurora
 * SECURITY: Admin key stored in AWS Secrets Manager
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { getPool } from '../../shared/db';
import { createHeaders } from '../utils/cors';
import { createLogger, getRequestId } from '../utils/logger';

const log = createLogger('admin-run-migration');
let cachedAdminKey: string | null = null;

const secretsClient = new SecretsManagerClient({});

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

// Schema SQL
const SCHEMA_SQL = `
-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- PROFILES TABLE
CREATE TABLE IF NOT EXISTS profiles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    cognito_sub VARCHAR(255) UNIQUE,
    username VARCHAR(50) UNIQUE NOT NULL,
    full_name VARCHAR(255),
    display_name VARCHAR(255),
    avatar_url TEXT,
    cover_url TEXT,
    bio TEXT,
    location VARCHAR(255),
    website VARCHAR(255),
    account_type VARCHAR(20) DEFAULT 'personal' CHECK (account_type IN ('personal', 'pro_creator', 'pro_local')),
    is_verified BOOLEAN DEFAULT FALSE,
    is_premium BOOLEAN DEFAULT FALSE,
    is_private BOOLEAN DEFAULT FALSE,
    gender VARCHAR(20),
    date_of_birth DATE,
    interests TEXT[],
    expertise TEXT[],
    social_links JSONB DEFAULT '{}',
    business_name VARCHAR(255),
    business_category VARCHAR(100),
    business_address TEXT,
    business_phone VARCHAR(50),
    locations_mode VARCHAR(20) DEFAULT 'nearby',
    onboarding_completed BOOLEAN DEFAULT FALSE,
    fan_count INTEGER DEFAULT 0,
    following_count INTEGER DEFAULT 0,
    post_count INTEGER DEFAULT 0,
    is_bot BOOLEAN DEFAULT FALSE,
    is_team BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_profiles_username ON profiles(username);
CREATE INDEX IF NOT EXISTS idx_profiles_cognito_sub ON profiles(cognito_sub);
CREATE INDEX IF NOT EXISTS idx_profiles_account_type ON profiles(account_type);

-- POSTS TABLE
CREATE TABLE IF NOT EXISTS posts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    author_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    content TEXT,
    caption TEXT,
    media_urls TEXT[] DEFAULT '{}',
    media_url TEXT,
    media_type VARCHAR(20) CHECK (media_type IN ('image', 'video', 'multiple', 'photo')),
    visibility VARCHAR(20) DEFAULT 'public' CHECK (visibility IN ('public', 'private', 'fans')),
    likes_count INTEGER DEFAULT 0,
    comments_count INTEGER DEFAULT 0,
    views_count INTEGER DEFAULT 0,
    location VARCHAR(255),
    tags TEXT[] DEFAULT '{}',
    is_peak BOOLEAN DEFAULT FALSE,
    peak_duration INTEGER,
    peak_expires_at TIMESTAMPTZ,
    save_to_profile BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_posts_author_id ON posts(author_id);
CREATE INDEX IF NOT EXISTS idx_posts_created_at ON posts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_visibility ON posts(visibility);

-- FOLLOWS TABLE
CREATE TABLE IF NOT EXISTS follows (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    follower_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    following_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(follower_id, following_id)
);

CREATE INDEX IF NOT EXISTS idx_follows_follower_id ON follows(follower_id);
CREATE INDEX IF NOT EXISTS idx_follows_following_id ON follows(following_id);

-- LIKES TABLE
CREATE TABLE IF NOT EXISTS likes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, post_id)
);

CREATE INDEX IF NOT EXISTS idx_likes_user_id ON likes(user_id);
CREATE INDEX IF NOT EXISTS idx_likes_post_id ON likes(post_id);

-- COMMENTS TABLE
CREATE TABLE IF NOT EXISTS comments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    text TEXT NOT NULL,
    parent_comment_id UUID REFERENCES comments(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_comments_post_id ON comments(post_id);

-- SAVED POSTS TABLE
CREATE TABLE IF NOT EXISTS saved_posts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, post_id)
);

-- NOTIFICATIONS TABLE
CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL,
    title VARCHAR(255),
    body TEXT,
    data JSONB DEFAULT '{}',
    read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);

-- INTERESTS TABLE
CREATE TABLE IF NOT EXISTS interests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) UNIQUE NOT NULL,
    icon VARCHAR(50),
    category VARCHAR(100),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- EXPERTISE TABLE
CREATE TABLE IF NOT EXISTS expertise (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) UNIQUE NOT NULL,
    icon VARCHAR(50),
    category VARCHAR(100),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- SPOTS TABLE
CREATE TABLE IF NOT EXISTS spots (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    creator_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    category VARCHAR(100),
    sport_type VARCHAR(100),
    address TEXT,
    city VARCHAR(100),
    country VARCHAR(100),
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8),
    images TEXT[] DEFAULT '{}',
    amenities TEXT[] DEFAULT '{}',
    rating DECIMAL(3, 2) DEFAULT 0,
    review_count INTEGER DEFAULT 0,
    is_verified BOOLEAN DEFAULT FALSE,
    opening_hours JSONB DEFAULT '{}',
    contact_info JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- SPOT REVIEWS TABLE
CREATE TABLE IF NOT EXISTS spot_reviews (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    spot_id UUID NOT NULL REFERENCES spots(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
    comment TEXT,
    images TEXT[] DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(spot_id, user_id)
);

-- SAVED SPOTS TABLE
CREATE TABLE IF NOT EXISTS saved_spots (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    spot_id UUID NOT NULL REFERENCES spots(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, spot_id)
);

-- PUSH TOKENS TABLE
CREATE TABLE IF NOT EXISTS push_tokens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    token TEXT NOT NULL,
    platform VARCHAR(20),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, token)
);

-- MESSAGES TABLE
CREATE TABLE IF NOT EXISTS messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id UUID NOT NULL,
    sender_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    recipient_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    content TEXT,
    media_url TEXT,
    media_type VARCHAR(20),
    read BOOLEAN DEFAULT FALSE,
    read_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);

-- CONVERSATIONS TABLE
CREATE TABLE IF NOT EXISTS conversations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    participant_1_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    participant_2_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    last_message_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(participant_1_id, participant_2_id)
);

-- FOLLOW REQUESTS TABLE (for private accounts)
CREATE TABLE IF NOT EXISTS follow_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    requester_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    target_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(requester_id, target_id)
);

CREATE INDEX IF NOT EXISTS idx_follow_requests_target ON follow_requests(target_id);
CREATE INDEX IF NOT EXISTS idx_follow_requests_status ON follow_requests(status);

-- PEAKS TABLE (short videos like TikTok/Reels)
CREATE TABLE IF NOT EXISTS peaks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    author_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    video_url TEXT NOT NULL,
    thumbnail_url TEXT,
    caption TEXT,
    duration INTEGER,
    likes_count INTEGER DEFAULT 0,
    comments_count INTEGER DEFAULT 0,
    views_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_peaks_author_id ON peaks(author_id);
CREATE INDEX IF NOT EXISTS idx_peaks_created_at ON peaks(created_at DESC);

-- PEAK LIKES TABLE
CREATE TABLE IF NOT EXISTS peak_likes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    peak_id UUID NOT NULL REFERENCES peaks(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, peak_id)
);

CREATE INDEX IF NOT EXISTS idx_peak_likes_peak_id ON peak_likes(peak_id);

-- PEAK COMMENTS TABLE
CREATE TABLE IF NOT EXISTS peak_comments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    peak_id UUID NOT NULL REFERENCES peaks(id) ON DELETE CASCADE,
    text TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_peak_comments_peak_id ON peak_comments(peak_id);

-- WEBSOCKET CONNECTIONS TABLE (for real-time messaging)
CREATE TABLE IF NOT EXISTS websocket_connections (
    connection_id VARCHAR(255) PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    connected_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ws_connections_user_id ON websocket_connections(user_id);

-- Add followers_count column to profiles if missing
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS followers_count INTEGER DEFAULT 0;

-- Push Notifications Enhancement (Migration 007)
ALTER TABLE push_tokens ADD COLUMN IF NOT EXISTS device_id VARCHAR(255);
ALTER TABLE push_tokens ADD COLUMN IF NOT EXISTS sns_endpoint_arn TEXT;
ALTER TABLE push_tokens ADD COLUMN IF NOT EXISTS enabled BOOLEAN DEFAULT TRUE;
ALTER TABLE push_tokens ADD COLUMN IF NOT EXISTS last_used_at TIMESTAMPTZ;

-- Migration 008: Add FK for messages.conversation_id
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'fk_messages_conversation_id'
    ) THEN
        ALTER TABLE messages
        ADD CONSTRAINT fk_messages_conversation_id
        FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE;
    END IF;
END $$;

-- ========================================
-- UPDATED_AT TRIGGER FUNCTION
-- Automatically updates updated_at column on row modifications
-- ========================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for all tables with updated_at column
DO $$
DECLARE
    tbl_name TEXT;
    trigger_name TEXT;
BEGIN
    FOR tbl_name IN
        SELECT table_name FROM information_schema.columns
        WHERE column_name = 'updated_at'
        AND table_schema = 'public'
    LOOP
        trigger_name := 'update_' || tbl_name || '_updated_at';
        EXECUTE format('
            DROP TRIGGER IF EXISTS %I ON %I;
            CREATE TRIGGER %I
            BEFORE UPDATE ON %I
            FOR EACH ROW
            EXECUTE FUNCTION update_updated_at_column();
        ', trigger_name, tbl_name, trigger_name, tbl_name);
    END LOOP;
END $$;

-- Seed interests
INSERT INTO interests (name, icon, category) VALUES
    ('Fitness', 'fitness-outline', 'Sports'),
    ('Yoga', 'body-outline', 'Sports'),
    ('Running', 'walk-outline', 'Sports'),
    ('Cycling', 'bicycle-outline', 'Sports'),
    ('Swimming', 'water-outline', 'Sports'),
    ('Basketball', 'basketball-outline', 'Sports'),
    ('Football', 'football-outline', 'Sports'),
    ('CrossFit', 'barbell-outline', 'Sports'),
    ('Boxing', 'hand-right-outline', 'Sports'),
    ('Nutrition', 'nutrition-outline', 'Wellness'),
    ('Meditation', 'leaf-outline', 'Wellness')
ON CONFLICT (name) DO NOTHING;

-- Seed expertise
INSERT INTO expertise (name, icon, category) VALUES
    ('Personal Trainer', 'fitness-outline', 'Professional'),
    ('Yoga Instructor', 'body-outline', 'Professional'),
    ('Nutritionist', 'nutrition-outline', 'Professional'),
    ('Sports Coach', 'trophy-outline', 'Professional'),
    ('CrossFit Coach', 'barbell-outline', 'Professional')
ON CONFLICT (name) DO NOTHING;
`;

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const headers = createHeaders(event);

  try {
    // SECURITY: Verify admin key from Secrets Manager
    const authHeader = event.headers['x-admin-key'] || event.headers['X-Admin-Key'];
    const adminKey = await getAdminKey();

    if (!authHeader || authHeader !== adminKey) {
      log.warn('Unauthorized admin access attempt');
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ message: 'Unauthorized' }),
      };
    }

    log.info('Running database migration...');
    const db = await getPool();

    // Split and execute statements
    const statements = SCHEMA_SQL.split(';').filter(s => s.trim().length > 0);
    const results: string[] = [];

    for (const statement of statements) {
      try {
        await db.query(statement);
        results.push('OK');
      } catch (error: any) {
        results.push(`Error: ${error.message}`);
      }
    }

    log.info('Migration completed');

    // Verify tables created
    const tablesResult = await db.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        message: 'Migration completed',
        tables: tablesResult.rows.map(r => r.table_name),
        statementResults: results.length,
      }),
    };
  } catch (error: any) {
    log.error('Migration error', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ message: 'Migration failed', error: error.message }),
    };
  }
}

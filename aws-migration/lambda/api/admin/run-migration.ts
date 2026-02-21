/**
 * Run Database Migration Lambda
 * Executes the schema SQL on Aurora
 * SECURITY: Admin key stored in AWS Secrets Manager
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { timingSafeEqual, randomInt, createHash } from 'node:crypto';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { getPool } from '../../shared/db';
import type { Pool } from 'pg';
import { createHeaders } from '../utils/cors';
import { createLogger, getRequestId } from '../utils/logger';

const log = createLogger('admin-run-migration');
let cachedAdminKey: string | null = null;

const secretsClient = new SecretsManagerClient({});

// Escape regex metacharacters in a string, then compile word-boundary patterns once
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
function compileBlocklist(keywords: string[]): RegExp[] {
  return keywords.map(kw => new RegExp(`\\b${escapeRegex(kw)}\\b`));
}
function matchesBlocklist(text: string, patterns: RegExp[]): boolean {
  return patterns.some(re => re.test(text));
}

// Precompiled blocklists (evaluated once at cold start)
const BLOCKED_DDL = compileBlocklist([
  'DROP TABLE', 'DROP DATABASE', 'DROP SCHEMA', 'DROP FUNCTION', 'DROP TRIGGER',
  'TRUNCATE', 'DELETE FROM', 'GRANT', 'REVOKE', 'INSERT', 'UPDATE', 'COPY', 'SELECT INTO',
]);
const BLOCKED_READ_ONLY = compileBlocklist([
  'DROP', 'DELETE', 'INSERT', 'UPDATE', 'ALTER', 'TRUNCATE', 'CREATE', 'GRANT', 'REVOKE', 'INTO', 'COPY', 'SET', 'DO', 'EXECUTE',
  'PG_READ_FILE', 'PG_WRITE_FILE', 'PG_SHADOW', 'PG_AUTHID', 'PG_ROLES', 'PG_USER', 'CURRENT_SETTING', 'PG_SLEEP', 'PG_STAT_ACTIVITY',
  'PG_CATALOG', 'INFORMATION_SCHEMA', 'PG_TERMINATE_BACKEND', 'PG_CANCEL_BACKEND', 'LO_IMPORT', 'LO_EXPORT',
]);
const BLOCKED_MIGRATION = compileBlocklist([
  'DROP DATABASE', 'DROP SCHEMA', 'DROP TABLE', 'DROP FUNCTION', 'DROP TRIGGER',
  'TRUNCATE', 'ALTER ROLE', 'CREATE ROLE', 'CREATE EXTENSION',
  'GRANT', 'REVOKE',
]);

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

// SECURITY: Timing-safe key comparison
function isValidKey(provided: string, expected: string): boolean {
  try {
    const a = Buffer.from(provided);
    const b = Buffer.from(expected);
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
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
    account_type VARCHAR(20) DEFAULT 'personal' CHECK (account_type IN ('personal', 'pro_creator', 'pro_business')),
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
    business_latitude DECIMAL(10, 8),
    business_longitude DECIMAL(11, 8),
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

-- POST TAGS TABLE (user tagging in posts)
CREATE TABLE IF NOT EXISTS post_tags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    tagged_user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    tagged_by_user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(post_id, tagged_user_id)
);

CREATE INDEX IF NOT EXISTS idx_post_tags_post_id ON post_tags(post_id);
CREATE INDEX IF NOT EXISTS idx_post_tags_tagged_user_id ON post_tags(tagged_user_id);
`;

// Demo profiles for seeding - Comprehensive mix of all account types and categories
interface DemoProfile {
  username: string;
  full_name: string;
  account_type: string;
  bio: string;
  expertise: string[];
  interests: string[];
  avatar_url: string;
  location: string;
  is_verified: boolean;
  business_name?: string;
  business_category?: string;
}

const DEMO_PROFILES: DemoProfile[] = [
  // ========== PRO CREATORS - FITNESS & TRAINING ==========
  { username: 'alex_fitness_pro', full_name: 'Alex Martin', account_type: 'pro_creator', bio: 'Certified Personal Trainer | 10+ years experience | Transform your body', expertise: ['Personal Training', 'HIIT', 'Nutrition', 'Weight Loss'], interests: ['Fitness', 'Healthy Living', 'Motivation'], avatar_url: 'https://images.unsplash.com/photo-1567013127542-490d757e51fc?w=200', location: 'Los Angeles, CA', is_verified: true },
  { username: 'sarah_yoga_master', full_name: 'Sarah Johnson', account_type: 'pro_creator', bio: 'RYT-500 Yoga Instructor | Mindfulness Coach | Find your inner peace', expertise: ['Yoga', 'Meditation', 'Breathwork', 'Flexibility'], interests: ['Wellness', 'Mindfulness', 'Nature'], avatar_url: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=200', location: 'San Diego, CA', is_verified: true },
  { username: 'mike_strongman', full_name: 'Mike Thompson', account_type: 'pro_creator', bio: 'Powerlifting Champion | Strength Coach | Build unstoppable power', expertise: ['Powerlifting', 'Strength Training', 'Sports Nutrition'], interests: ['Strength Sports', 'Competition', 'Recovery'], avatar_url: 'https://images.unsplash.com/photo-1581009146145-b5ef050c149a?w=200', location: 'Austin, TX', is_verified: true },
  { username: 'emma_crossfit', full_name: 'Emma Williams', account_type: 'pro_creator', bio: 'CrossFit Level 3 Trainer | Competition Coach | Push your limits', expertise: ['CrossFit', 'Olympic Lifting', 'Conditioning'], interests: ['CrossFit Games', 'Functional Fitness', 'Community'], avatar_url: 'https://images.unsplash.com/photo-1594381898411-846e7d193883?w=200', location: 'Miami, FL', is_verified: true },
  { username: 'david_nutrition', full_name: 'David Chen', account_type: 'pro_creator', bio: 'Sports Nutritionist | Meal Prep Expert | Fuel your performance', expertise: ['Nutrition', 'Meal Planning', 'Sports Nutrition', 'Weight Management'], interests: ['Healthy Eating', 'Cooking', 'Science'], avatar_url: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=200', location: 'New York, NY', is_verified: true },

  // ========== PRO CREATORS - COMBAT SPORTS ==========
  { username: 'luis_boxing', full_name: 'Luis Rodriguez', account_type: 'pro_creator', bio: 'Former Pro Boxer | Boxing Coach | Train like a champion', expertise: ['Boxing', 'Conditioning', 'Self-Defense'], interests: ['Boxing', 'Combat Sports', 'Discipline'], avatar_url: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200', location: 'Las Vegas, NV', is_verified: true },
  { username: 'kenji_mma', full_name: 'Kenji Tanaka', account_type: 'pro_creator', bio: 'MMA Fighter | BJJ Black Belt | Master all disciplines', expertise: ['MMA', 'BJJ', 'Wrestling', 'Muay Thai'], interests: ['Martial Arts', 'Competition', 'Teaching'], avatar_url: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=200', location: 'San Jose, CA', is_verified: true },
  { username: 'maya_kickboxing', full_name: 'Maya Santos', account_type: 'pro_creator', bio: 'World Kickboxing Champion | Cardio Kickboxing Instructor', expertise: ['Kickboxing', 'Muay Thai', 'Cardio'], interests: ['Combat Sports', 'Fitness', 'Empowerment'], avatar_url: 'https://images.unsplash.com/photo-1499952127939-9bbf5af6c51c?w=200', location: 'Phoenix, AZ', is_verified: true },
  { username: 'ivan_wrestling', full_name: 'Ivan Petrov', account_type: 'pro_creator', bio: 'Olympic Wrestler | Grappling Coach | Dominate the mat', expertise: ['Wrestling', 'Grappling', 'Strength'], interests: ['Wrestling', 'Olympics', 'Coaching'], avatar_url: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=200', location: 'Colorado Springs, CO', is_verified: false },

  // ========== PRO CREATORS - CARDIO & ENDURANCE ==========
  { username: 'jessica_running', full_name: 'Jessica Moore', account_type: 'pro_creator', bio: 'Marathon Coach | Ultra Runner | Every mile matters', expertise: ['Running', 'Marathon Training', 'Endurance'], interests: ['Running', 'Trail Running', 'Ultra Marathon'], avatar_url: 'https://images.unsplash.com/photo-1489424731084-a5d8b219a5bb?w=200', location: 'Portland, OR', is_verified: true },
  { username: 'marcus_cycling', full_name: 'Marcus Johnson', account_type: 'pro_creator', bio: 'Pro Cyclist | Indoor Cycling Instructor | Ride to victory', expertise: ['Cycling', 'Indoor Cycling', 'Endurance Training'], interests: ['Cycling', 'Triathlon', 'Outdoor Sports'], avatar_url: 'https://images.unsplash.com/photo-1552058544-f2b08422138a?w=200', location: 'Boulder, CO', is_verified: true },
  { username: 'natalie_swim', full_name: 'Natalie Brooks', account_type: 'pro_creator', bio: 'Former Olympic Swimmer | Swim Coach | Dive into fitness', expertise: ['Swimming', 'Aqua Fitness', 'Triathlon'], interests: ['Swimming', 'Water Sports', 'Competition'], avatar_url: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200', location: 'San Diego, CA', is_verified: true },
  { username: 'tom_triathlon', full_name: 'Tom Richardson', account_type: 'pro_creator', bio: 'Ironman Finisher | Triathlon Coach | No limits', expertise: ['Triathlon', 'Endurance', 'Multi-Sport'], interests: ['Ironman', 'Endurance Sports', 'Mental Toughness'], avatar_url: 'https://images.unsplash.com/photo-1492562080023-ab3db95bfbce?w=200', location: 'Austin, TX', is_verified: false },

  // ========== PRO CREATORS - MIND & BODY ==========
  { username: 'elena_pilates', full_name: 'Elena Kowalski', account_type: 'pro_creator', bio: 'Master Pilates Instructor | Core Specialist | Move with grace', expertise: ['Pilates', 'Core Training', 'Rehabilitation'], interests: ['Pilates', 'Dance', 'Wellness'], avatar_url: 'https://images.unsplash.com/photo-1508214751196-bcfd4ca60f91?w=200', location: 'Chicago, IL', is_verified: true },
  { username: 'raj_meditation', full_name: 'Raj Sharma', account_type: 'pro_creator', bio: 'Meditation Master | Breathwork Expert | Find your calm', expertise: ['Meditation', 'Breathwork', 'Mindfulness', 'Stress Management'], interests: ['Meditation', 'Spirituality', 'Mental Health'], avatar_url: 'https://images.unsplash.com/photo-1507591064344-4c6ce005b128?w=200', location: 'Seattle, WA', is_verified: true },
  { username: 'anna_stretch', full_name: 'Anna Dubois', account_type: 'pro_creator', bio: 'Flexibility Coach | Mobility Expert | Unlock your body', expertise: ['Stretching', 'Mobility', 'Flexibility', 'Recovery'], interests: ['Flexibility', 'Dance', 'Yoga'], avatar_url: 'https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?w=200', location: 'Montreal, Canada', is_verified: false },

  // ========== PRO CREATORS - DANCE & MOVEMENT ==========
  { username: 'carmen_dance', full_name: 'Carmen Rivera', account_type: 'pro_creator', bio: 'Professional Dancer | Zumba Instructor | Dance your way fit', expertise: ['Zumba', 'Latin Dance', 'Dance Fitness'], interests: ['Dance', 'Music', 'Latin Culture'], avatar_url: 'https://images.unsplash.com/photo-1531746020798-e6953c6e8e04?w=200', location: 'Miami, FL', is_verified: true },
  { username: 'tyrone_hiphop', full_name: 'Tyrone Jackson', account_type: 'pro_creator', bio: 'Hip Hop Choreographer | Dance Fitness | Move with swagger', expertise: ['Hip Hop', 'Dance', 'Choreography'], interests: ['Dance', 'Music', 'Street Culture'], avatar_url: 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=200', location: 'Atlanta, GA', is_verified: true },
  { username: 'sofia_ballet', full_name: 'Sofia Petrova', account_type: 'pro_creator', bio: 'Professional Ballerina | Barre Fitness | Elegance meets strength', expertise: ['Ballet', 'Barre', 'Dance'], interests: ['Ballet', 'Classical Music', 'Art'], avatar_url: 'https://images.unsplash.com/photo-1488426862026-3ee34a7d66df?w=200', location: 'New York, NY', is_verified: true },

  // ========== PRO CREATORS - SPECIALTY ==========
  { username: 'chris_calisthenics', full_name: 'Chris Park', account_type: 'pro_creator', bio: 'Calisthenics Master | Street Workout | Bodyweight is enough', expertise: ['Calisthenics', 'Street Workout', 'Bodyweight Training'], interests: ['Calisthenics', 'Gymnastics', 'Parkour'], avatar_url: 'https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?w=200', location: 'Los Angeles, CA', is_verified: true },
  { username: 'nina_physio', full_name: 'Nina Andersson', account_type: 'pro_creator', bio: 'Sports Physiotherapist | Injury Prevention | Move pain-free', expertise: ['Physiotherapy', 'Injury Prevention', 'Rehabilitation'], interests: ['Sports Medicine', 'Recovery', 'Anatomy'], avatar_url: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=200', location: 'Stockholm, Sweden', is_verified: true },
  { username: 'jake_bodybuilding', full_name: 'Jake Morrison', account_type: 'pro_creator', bio: 'IFBB Pro Bodybuilder | Prep Coach | Sculpt your physique', expertise: ['Bodybuilding', 'Contest Prep', 'Posing'], interests: ['Bodybuilding', 'Physique', 'Competition'], avatar_url: 'https://images.unsplash.com/photo-1568602471122-7832951cc4c5?w=200', location: 'Tampa, FL', is_verified: true },
  { username: 'maria_prenatal', full_name: 'Maria Lopez', account_type: 'pro_creator', bio: 'Prenatal Fitness Expert | Postnatal Recovery | Strong moms', expertise: ['Prenatal Fitness', 'Postnatal Recovery', 'Women Health'], interests: ['Motherhood', 'Wellness', 'Family'], avatar_url: 'https://images.unsplash.com/photo-1580489944761-15a19d654956?w=200', location: 'San Antonio, TX', is_verified: false },
  { username: 'omar_hiit', full_name: 'Omar Hassan', account_type: 'pro_creator', bio: 'HIIT Specialist | Fat Loss Expert | Maximum results minimum time', expertise: ['HIIT', 'Fat Loss', 'Conditioning'], interests: ['Fitness', 'Efficiency', 'Results'], avatar_url: 'https://images.unsplash.com/photo-1564564321837-a57b7070ac4f?w=200', location: 'Dubai, UAE', is_verified: true },
  { username: 'kim_senior', full_name: 'Kim Patterson', account_type: 'pro_creator', bio: 'Senior Fitness Specialist | Active Aging | Never too late', expertise: ['Senior Fitness', 'Balance', 'Low Impact'], interests: ['Active Aging', 'Health', 'Community'], avatar_url: 'https://images.unsplash.com/photo-1559839734-2b71ea197ec2?w=200', location: 'Scottsdale, AZ', is_verified: false },

  // ========== PRO LOCAL - GYMS ==========
  { username: 'ironforge_gym', full_name: 'Iron Forge Fitness', account_type: 'pro_business', bio: 'Premium 24/7 Gym | State-of-the-art equipment | Personal training', expertise: ['Gym', 'Personal Training', 'Group Classes'], interests: ['Fitness Community', 'Training'], avatar_url: 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=200', location: 'Downtown LA', is_verified: true, business_name: 'Iron Forge Fitness Center', business_category: 'gym' },
  { username: 'titan_fitness', full_name: 'Titan Fitness Club', account_type: 'pro_business', bio: 'Full-service gym | Olympic lifting platforms | Recovery zone', expertise: ['Weightlifting', 'Cardio', 'Recovery'], interests: ['Strength', 'Community'], avatar_url: 'https://images.unsplash.com/photo-1571902943202-507ec2618e8f?w=200', location: 'Brooklyn, NY', is_verified: true, business_name: 'Titan Fitness Club', business_category: 'gym' },
  { username: 'flex_gym_miami', full_name: 'Flex Gym Miami', account_type: 'pro_business', bio: 'Beach body headquarters | Outdoor training | Cardio cinema', expertise: ['Bodybuilding', 'Cardio', 'Outdoor Training'], interests: ['Beach Fitness', 'Lifestyle'], avatar_url: 'https://images.unsplash.com/photo-1558611848-73f7eb4001a1?w=200', location: 'Miami Beach, FL', is_verified: true, business_name: 'Flex Gym Miami', business_category: 'gym' },
  { username: 'powerhouse_gym', full_name: 'Powerhouse Gym', account_type: 'pro_business', bio: 'Hardcore training facility | Strongman equipment | No excuses', expertise: ['Powerlifting', 'Strongman', 'Bodybuilding'], interests: ['Strength Sports', 'Competition'], avatar_url: 'https://images.unsplash.com/photo-1540497077202-7c8a3999166f?w=200', location: 'Detroit, MI', is_verified: false, business_name: 'Powerhouse Gym Detroit', business_category: 'gym' },

  // ========== PRO LOCAL - YOGA & PILATES STUDIOS ==========
  { username: 'zenflow_studio', full_name: 'ZenFlow Yoga Studio', account_type: 'pro_business', bio: 'Boutique yoga studio | Hot yoga, Vinyasa, Restorative', expertise: ['Yoga Classes', 'Meditation', 'Wellness'], interests: ['Yoga', 'Wellness', 'Community'], avatar_url: 'https://images.unsplash.com/photo-1545205597-3d9d02c29597?w=200', location: 'Santa Monica, CA', is_verified: true, business_name: 'ZenFlow Yoga Studio', business_category: 'studio' },
  { username: 'om_sanctuary', full_name: 'Om Sanctuary', account_type: 'pro_business', bio: 'Traditional yoga | Meditation retreats | Teacher training', expertise: ['Yoga', 'Meditation', 'Teacher Training'], interests: ['Spirituality', 'Wellness'], avatar_url: 'https://images.unsplash.com/photo-1599901860904-17e6ed7083a0?w=200', location: 'Sedona, AZ', is_verified: true, business_name: 'Om Sanctuary Retreat', business_category: 'studio' },
  { username: 'core_pilates', full_name: 'Core Pilates Studio', account_type: 'pro_business', bio: 'Reformer Pilates | Private sessions | Rehabilitation', expertise: ['Pilates', 'Reformer', 'Core Training'], interests: ['Pilates', 'Rehabilitation'], avatar_url: 'https://images.unsplash.com/photo-1518611012118-696072aa579a?w=200', location: 'San Francisco, CA', is_verified: true, business_name: 'Core Pilates Studio', business_category: 'studio' },

  // ========== PRO LOCAL - CROSSFIT & FUNCTIONAL ==========
  { username: 'crossfit_apex', full_name: 'CrossFit Apex', account_type: 'pro_business', bio: 'Affiliate CrossFit box | Competition team | All levels welcome', expertise: ['CrossFit', 'Olympic Lifting', 'Competition'], interests: ['CrossFit', 'Community', 'Competition'], avatar_url: 'https://images.unsplash.com/photo-1526506118085-60ce8714f8c5?w=200', location: 'Denver, CO', is_verified: true, business_name: 'CrossFit Apex', business_category: 'crossfit' },
  { username: 'functional_fit', full_name: 'Functional Fit Lab', account_type: 'pro_business', bio: 'Functional training | Small group classes | Personal coaching', expertise: ['Functional Training', 'HIIT', 'Mobility'], interests: ['Functional Fitness', 'Health'], avatar_url: 'https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?w=200', location: 'Austin, TX', is_verified: false, business_name: 'Functional Fit Lab', business_category: 'studio' },

  // ========== PRO LOCAL - COMBAT SPORTS ==========
  { username: 'knockout_boxing', full_name: 'Knockout Boxing Gym', account_type: 'pro_business', bio: 'Professional boxing gym | Amateur & pro fighters | Cardio boxing', expertise: ['Boxing', 'Training', 'Competition'], interests: ['Boxing', 'Combat Sports'], avatar_url: 'https://images.unsplash.com/photo-1549060279-7e168fcee0c2?w=200', location: 'Philadelphia, PA', is_verified: true, business_name: 'Knockout Boxing Gym', business_category: 'gym' },
  { username: 'warrior_mma', full_name: 'Warrior MMA Academy', account_type: 'pro_business', bio: 'Complete MMA training | BJJ, Muay Thai, Wrestling | All ages', expertise: ['MMA', 'BJJ', 'Muay Thai'], interests: ['Martial Arts', 'Self Defense'], avatar_url: 'https://images.unsplash.com/photo-1555597673-b21d5c935865?w=200', location: 'Las Vegas, NV', is_verified: true, business_name: 'Warrior MMA Academy', business_category: 'gym' },
  { username: 'gracie_bjj', full_name: 'Gracie BJJ Academy', account_type: 'pro_business', bio: 'Traditional Brazilian Jiu-Jitsu | Competition team | Kids program', expertise: ['BJJ', 'Grappling', 'Self Defense'], interests: ['BJJ', 'Martial Arts'], avatar_url: 'https://images.unsplash.com/photo-1564415315949-7a0c4c73aab4?w=200', location: 'Los Angeles, CA', is_verified: true, business_name: 'Gracie BJJ Academy', business_category: 'gym' },

  // ========== PRO LOCAL - SPECIALTY ==========
  { username: 'aqua_center', full_name: 'Aqua Fitness Center', account_type: 'pro_business', bio: 'Olympic pool | Swim lessons | Aqua aerobics | Therapy pool', expertise: ['Swimming', 'Aqua Fitness', 'Lessons'], interests: ['Swimming', 'Water Sports'], avatar_url: 'https://images.unsplash.com/photo-1576013551627-0cc20b96c2a7?w=200', location: 'San Diego, CA', is_verified: true, business_name: 'Aqua Fitness Center', business_category: 'pool' },
  { username: 'climb_zone', full_name: 'Climb Zone', account_type: 'pro_business', bio: 'Indoor climbing gym | Bouldering | Lead climbing | Youth programs', expertise: ['Climbing', 'Bouldering', 'Training'], interests: ['Climbing', 'Adventure'], avatar_url: 'https://images.unsplash.com/photo-1522163182402-834f871fd851?w=200', location: 'Boulder, CO', is_verified: true, business_name: 'Climb Zone Boulder', business_category: 'gym' },
  { username: 'dance_fusion', full_name: 'Dance Fusion Studio', account_type: 'pro_business', bio: 'All dance styles | Fitness classes | Performance teams', expertise: ['Dance', 'Zumba', 'Hip Hop'], interests: ['Dance', 'Music', 'Fitness'], avatar_url: 'https://images.unsplash.com/photo-1508700929628-666bc8bd84ea?w=200', location: 'Atlanta, GA', is_verified: false, business_name: 'Dance Fusion Studio', business_category: 'studio' },
  { username: 'recovery_lab', full_name: 'Recovery Lab', account_type: 'pro_business', bio: 'Sports recovery center | Cryotherapy | Massage | Compression', expertise: ['Recovery', 'Cryotherapy', 'Massage'], interests: ['Recovery', 'Performance'], avatar_url: 'https://images.unsplash.com/photo-1544161515-4ab6ce6db874?w=200', location: 'Los Angeles, CA', is_verified: true, business_name: 'Recovery Lab LA', business_category: 'wellness' },

  // ========== PERSONAL USERS - BEGINNERS ==========
  { username: 'fitness_newbie_john', full_name: 'John Miller', account_type: 'personal', bio: 'Starting my fitness journey | Day 1 mentality | Looking for motivation', expertise: [], interests: ['Weight Loss', 'Running', 'Healthy Eating'], avatar_url: 'https://images.unsplash.com/photo-1463453091185-61582044d556?w=200', location: 'Chicago, IL', is_verified: false },
  { username: 'newbie_sarah', full_name: 'Sarah Kim', account_type: 'personal', bio: 'New to fitness | Learning the ropes | One day at a time', expertise: [], interests: ['Yoga', 'Wellness', 'Self Care'], avatar_url: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200', location: 'Seattle, WA', is_verified: false },
  { username: 'starting_over_mike', full_name: 'Mike Brown', account_type: 'personal', bio: 'Getting back in shape | 40s fitness | Consistency is key', expertise: [], interests: ['Weight Training', 'Golf', 'Health'], avatar_url: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200', location: 'Dallas, TX', is_verified: false },

  // ========== PERSONAL USERS - INTERMEDIATE ==========
  { username: 'lisa_runner', full_name: 'Lisa Anderson', account_type: 'personal', bio: 'Marathon runner in training | 5K to 42K journey | Never give up', expertise: [], interests: ['Running', 'Cardio', 'Outdoor Activities'], avatar_url: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=200', location: 'Boston, MA', is_verified: false },
  { username: 'gym_enthusiast_mark', full_name: 'Mark Davis', account_type: 'personal', bio: 'Gym rat | Gains over everything | Always learning', expertise: [], interests: ['Bodybuilding', 'Strength Training', 'Supplements'], avatar_url: 'https://images.unsplash.com/photo-1557862921-37829c790f19?w=200', location: 'Denver, CO', is_verified: false },
  { username: 'yoga_journey_amy', full_name: 'Amy Chen', account_type: 'personal', bio: '2 years into yoga | Handstand goal | Finding balance', expertise: [], interests: ['Yoga', 'Meditation', 'Flexibility'], avatar_url: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=200', location: 'Portland, OR', is_verified: false },
  { username: 'crossfit_convert', full_name: 'Brian O Connor', account_type: 'personal', bio: 'CrossFit addict | RX or nothing | Community over everything', expertise: [], interests: ['CrossFit', 'Olympic Lifting', 'Competition'], avatar_url: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=200', location: 'Austin, TX', is_verified: false },

  // ========== PERSONAL USERS - ATHLETES ==========
  { username: 'triathlete_emma', full_name: 'Emma Thompson', account_type: 'personal', bio: 'Amateur triathlete | Ironman dreamer | Swim bike run repeat', expertise: [], interests: ['Triathlon', 'Swimming', 'Cycling', 'Running'], avatar_url: 'https://images.unsplash.com/photo-1489424731084-a5d8b219a5bb?w=200', location: 'San Diego, CA', is_verified: false },
  { username: 'bjj_purple_belt', full_name: 'Carlos Mendez', account_type: 'personal', bio: 'BJJ purple belt | Competition focused | Always learning', expertise: [], interests: ['BJJ', 'Grappling', 'MMA'], avatar_url: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=200', location: 'Houston, TX', is_verified: false },
  { username: 'weekend_warrior', full_name: 'Tom Jackson', account_type: 'personal', bio: 'Spartan racer | OCR enthusiast | Pain is temporary', expertise: [], interests: ['OCR', 'Running', 'Obstacle Course'], avatar_url: 'https://images.unsplash.com/photo-1568602471122-7832951cc4c5?w=200', location: 'Nashville, TN', is_verified: false },

  // ========== PERSONAL USERS - SPECIFIC INTERESTS ==========
  { username: 'vegan_lifter', full_name: 'Rachel Green', account_type: 'personal', bio: 'Plant-powered athlete | Proving vegans can lift | Compassion + strength', expertise: [], interests: ['Vegan Fitness', 'Strength Training', 'Nutrition'], avatar_url: 'https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?w=200', location: 'Los Angeles, CA', is_verified: false },
  { username: 'dad_bod_to_rad', full_name: 'Steve Wilson', account_type: 'personal', bio: 'Transforming the dad bod | 6 months in | Family man fitness', expertise: [], interests: ['Weight Loss', 'Family Fitness', 'Home Workouts'], avatar_url: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=200', location: 'Minneapolis, MN', is_verified: false },
  { username: 'fit_mom_life', full_name: 'Jennifer Martinez', account_type: 'personal', bio: 'Mom of 3 | Fitness is self-care | Making time for health', expertise: [], interests: ['Home Workouts', 'Yoga', 'Running'], avatar_url: 'https://images.unsplash.com/photo-1580489944761-15a19d654956?w=200', location: 'Phoenix, AZ', is_verified: false },
  { username: 'senior_strong', full_name: 'Robert Taylor', account_type: 'personal', bio: '65 and stronger than ever | Age is just a number | Keep moving', expertise: [], interests: ['Senior Fitness', 'Walking', 'Swimming'], avatar_url: 'https://images.unsplash.com/photo-1559839734-2b71ea197ec2?w=200', location: 'Florida', is_verified: false },
  { username: 'wheelchair_athlete', full_name: 'David Park', account_type: 'personal', bio: 'Adaptive athlete | Paralympic hopeful | No limits', expertise: [], interests: ['Adaptive Sports', 'Wheelchair Basketball', 'Strength'], avatar_url: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200', location: 'Chicago, IL', is_verified: false },
];

const POST_CAPTIONS = [
  'Starting the week strong! What are your fitness goals?',
  'Recovery is just as important as the workout.',
  'New personal record today!',
  'Meal prep Sunday! Nutrition is 80% of the battle.',
  'Early morning workout - best way to start the day.',
  'Form check! Proper technique prevents injuries.',
];

const POST_IMAGES = [
  'https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?w=800',
  'https://images.unsplash.com/photo-1583454110551-21f2fa2afe61?w=800',
  'https://images.unsplash.com/photo-1549060279-7e168fcee0c2?w=800',
  'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=800',
  'https://images.unsplash.com/photo-1518611012118-696072aa579a?w=800',
  'https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=800',
];

// SQL to drop all tables (for reset)
const DROP_ALL_SQL = `
DO $$ DECLARE
    r RECORD;
BEGIN
    -- Disable foreign key checks temporarily
    EXECUTE 'SET session_replication_role = replica';

    -- Drop all tables in public schema
    FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public') LOOP
        EXECUTE 'DROP TABLE IF EXISTS public.' || quote_ident(r.tablename) || ' CASCADE';
    END LOOP;

    -- Re-enable foreign key checks
    EXECUTE 'SET session_replication_role = DEFAULT';
END $$;
`;

// Clean existing demo data before re-seeding
async function cleanExistingDemoData(db: Pool): Promise<void> {
  const existingDemo = await db.query("SELECT COUNT(*) FROM profiles WHERE is_bot = true");
  if (Number.parseInt(existingDemo.rows[0].count) > 0) {
    log.info('Cleaning existing demo data...');
    await db.query("DELETE FROM follows WHERE follower_id IN (SELECT id FROM profiles WHERE is_bot = true) OR following_id IN (SELECT id FROM profiles WHERE is_bot = true)");
    await db.query("DELETE FROM posts WHERE author_id IN (SELECT id FROM profiles WHERE is_bot = true)");
    await db.query("DELETE FROM peaks WHERE author_id IN (SELECT id FROM profiles WHERE is_bot = true)");
    await db.query("DELETE FROM profiles WHERE is_bot = true");
  }
}

// Insert demo profiles and return their IDs with account types
async function insertDemoProfiles(db: Pool): Promise<{ id: string; accountType: string }[]> {
  const profileIds: { id: string; accountType: string }[] = [];
  for (const profile of DEMO_PROFILES) {
    const result = await db.query(
      `INSERT INTO profiles (username, full_name, account_type, bio, expertise, interests, avatar_url, location, is_verified, business_name, business_category, is_bot, created_at, updated_at) // NOSONAR
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, true, NOW(), NOW())
       RETURNING id`,
      [profile.username, profile.full_name, profile.account_type, profile.bio, profile.expertise, profile.interests, profile.avatar_url, profile.location, profile.is_verified, profile.business_name || null, profile.business_category || null]
    ); // NOSONAR
    profileIds.push({ id: result.rows[0].id, accountType: profile.account_type });
  }
  return profileIds;
}

// Determine number of posts per account type
function getPostCount(accountType: string): number {
  if (accountType === 'pro_creator') return 5;
  if (accountType === 'pro_business') return 3;
  return 2;
} // NOSONAR

// Insert demo posts for all profiles
async function insertDemoPosts(db: Pool, profileIds: { id: string; accountType: string }[]): Promise<number> {
  let totalPosts = 0; // NOSONAR
  for (const { id, accountType } of profileIds) {
    const numPosts = getPostCount(accountType);
    for (let i = 0; i < numPosts; i++) {
      const daysAgo = randomInt(30);
      const visibility = i === 0 && accountType === 'pro_creator' ? 'fans' : 'public';
      await db.query(
        `INSERT INTO posts (author_id, content, media_urls, media_type, visibility, likes_count, comments_count, created_at)
         VALUES ($1, $2, $3, 'image', $4, $5, $6, NOW() - make_interval(days => $7))`,
        [id, POST_CAPTIONS[i % POST_CAPTIONS.length], [POST_IMAGES[i % POST_IMAGES.length]], visibility, randomInt(50, 350), randomInt(5, 35), daysAgo]
      ); // NOSONAR
      totalPosts++;
    }
  }
  return totalPosts;
}

// Insert demo peaks for pro_creator profiles
async function insertDemoPeaks(db: Pool, profileIds: { id: string; accountType: string }[]): Promise<number> {
  let totalPeaks = 0;
  for (const { id, accountType } of profileIds) {
    if (accountType !== 'pro_creator') continue;
    for (let i = 0; i < 2; i++) {
      const peakDaysAgo = randomInt(7);
      await db.query(
        `INSERT INTO peaks (author_id, video_url, thumbnail_url, caption, duration, views_count, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW() - make_interval(days => $7))`,
        [id, 'https://sample-videos.com/video123/mp4/720/big_buck_bunny_720p_1mb.mp4', POST_IMAGES[i], ['Quick tip!', 'Behind the scenes'][i], 15, randomInt(100, 600), peakDaysAgo]
      );
      totalPeaks++;
    }
  }
  return totalPeaks;
}

// Create random follow relationships between demo profiles
async function insertDemoFollows(db: Pool, profileIds: { id: string; accountType: string }[]): Promise<number> {
  let totalFollows = 0;
  for (let i = 0; i < profileIds.length; i++) {
    for (let j = 0; j < profileIds.length; j++) {
      if (i === j || randomInt(100) < 60) continue;
      try {
        await db.query(`INSERT INTO follows (follower_id, following_id, status, created_at) VALUES ($1, $2, 'accepted', NOW()) ON CONFLICT DO NOTHING`, [profileIds[i].id, profileIds[j].id]);
        totalFollows++;
      } catch { /* Expected: duplicate follow inserts are handled by ON CONFLICT DO NOTHING */ }
    }
  }
  return totalFollows;
}

// Update follower/following counts for demo profiles
async function updateDemoFollowerCounts(db: Pool): Promise<void> {
  await db.query(`UPDATE profiles SET followers_count = (SELECT COUNT(*) FROM follows WHERE following_id = profiles.id AND status = 'accepted'), following_count = (SELECT COUNT(*) FROM follows WHERE follower_id = profiles.id AND status = 'accepted') WHERE is_bot = true`);
}

// Seed demo data function
async function seedDemoData(db: Pool): Promise<{ profiles: number; posts: number; peaks: number; follows: number }> {
  await cleanExistingDemoData(db);
  const profileIds = await insertDemoProfiles(db);
  const totalPosts = await insertDemoPosts(db, profileIds);
  const totalPeaks = await insertDemoPeaks(db, profileIds);
  const totalFollows = await insertDemoFollows(db, profileIds);
  await updateDemoFollowerCounts(db);

  return { profiles: DEMO_PROFILES.length, posts: totalPosts, peaks: totalPeaks, follows: totalFollows };
}

// Handle 'run-ddl' action: execute DDL migration SQL
async function handleRunDdl(
  db: Pool,
  body: Record<string, unknown>,
  event: APIGatewayProxyEvent,
  headers: Record<string, string>,
): Promise<APIGatewayProxyResult> {
  const sql = (body.sql as string)?.trim();
  if (!sql || typeof sql !== 'string') {
    return { statusCode: 400, headers, body: JSON.stringify({ message: 'SQL query required' }) };
  }
  // SECURITY: Block destructive and DML keywords (defense-in-depth)
  const normalizedDdl = sql.toUpperCase().replaceAll(/\s+/g, ' ').trim();
  if (matchesBlocklist(normalizedDdl, BLOCKED_DDL)) {
    return { statusCode: 400, headers, body: JSON.stringify({ message: `Blocked: DDL contains restricted keyword` }) };
  }
  log.info('Running DDL migration...');
  const requestId = getRequestId(event);
  log.info(`[${requestId}] DDL migration requested`);
  try {
    await db.query(sql);
    return { statusCode: 200, headers, body: JSON.stringify({ message: 'DDL migration executed successfully' }) };
  } catch (ddlError: unknown) {
    log.error('DDL migration failed', ddlError);
    return { statusCode: 500, headers, body: JSON.stringify({ message: 'DDL migration failed' }) };
  }
}

// Validate that a SQL query is read-only (SELECT only, no dangerous keywords)
function validateReadOnlySql(
  sql: string,
  headers: Record<string, string>,
): APIGatewayProxyResult | null {
  const normalizedSql = sql.toUpperCase().replaceAll(/\s+/g, ' ').trim();
  if (!normalizedSql.startsWith('SELECT ')) {
    return { statusCode: 400, headers, body: JSON.stringify({ message: 'Only SELECT queries are allowed via run-sql' }) };
  }
  // Block dangerous keywords even in SELECT (including system catalog/function access)
  if (matchesBlocklist(normalizedSql, BLOCKED_READ_ONLY)) {
    return { statusCode: 400, headers, body: JSON.stringify({ message: 'Query contains blocked keywords' }) };
  }
  return null;
}

// Handle 'run-sql' action: execute read-only SQL query
async function handleRunSql(
  db: Pool,
  body: Record<string, unknown>,
  headers: Record<string, string>,
): Promise<APIGatewayProxyResult> {
  const sql = (body.sql as string)?.trim();
  if (!sql || typeof sql !== 'string') {
    return { statusCode: 400, headers, body: JSON.stringify({ message: 'SQL query required' }) };
  }
  const validationError = validateReadOnlySql(sql, headers);
  if (validationError) return validationError;

  log.info('Running custom SQL...');
  // SECURITY: Execute in read-only transaction to prevent write operations
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    await client.query('SET TRANSACTION READ ONLY');
    const sqlResult = await client.query(sql);
    await client.query('COMMIT');
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        message: 'SQL executed',
        rowCount: sqlResult.rowCount,
        rows: sqlResult.rows?.slice(0, 100),
      }),
    };
  } catch (sqlError: unknown) {
    await client.query('ROLLBACK').catch(() => {});
    log.error('SQL execution failed', sqlError);
    return { statusCode: 500, headers, body: JSON.stringify({ message: 'SQL execution failed' }) };
  } finally {
    client.release();
  }
}

// Handle 'fix-constraint' action: update account_type CHECK constraint
async function handleFixConstraint(
  db: Pool,
  headers: Record<string, string>,
): Promise<APIGatewayProxyResult> {
  log.info('Fixing account_type constraint...');

  // Step 1: Drop the existing constraint first
  await db.query(`ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_account_type_check`);
  log.info('Old constraint dropped');

  // Step 2: Update any existing pro_local values to pro_business
  const updateResult = await db.query(`UPDATE profiles SET account_type = 'pro_business' WHERE account_type = 'pro_local'`);
  log.info(`Updated ${updateResult.rowCount} profiles from pro_local to pro_business`);

  // Step 3: Add the new constraint
  await db.query(`ALTER TABLE profiles ADD CONSTRAINT profiles_account_type_check CHECK (account_type IN ('personal', 'pro_creator', 'pro_business'))`);
  log.info('New constraint added');

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({
      message: 'Account type constraint updated successfully',
      updatedProfiles: updateResult.rowCount
    }),
  };
}

// Handle default 'migrate' action: run schema migration
async function handleMigrate(
  db: Pool,
  event: APIGatewayProxyEvent,
  body: Record<string, unknown>,
  headers: Record<string, string>,
): Promise<APIGatewayProxyResult> {
  const resetMode = event.queryStringParameters?.reset === 'true' || body.reset === true;

  if (resetMode) {
    if (process.env.ENVIRONMENT === 'production') {
      return { statusCode: 403, headers, body: JSON.stringify({ message: 'Reset mode is disabled in production' }) };
    }
    log.info('RESET MODE: Dropping all tables...');
    await db.query(DROP_ALL_SQL);
    log.info('All tables dropped successfully');
  }

  log.info('Running database migration...');

  // Split and execute statements
  const statements = SCHEMA_SQL.split(';').filter(s => s.trim().length > 0);
  const results: string[] = [];

  for (const statement of statements) {
    try {
      await db.query(statement);
      results.push('OK');
    } catch (_error: unknown) {
      results.push('Error: migration statement failed');
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
      tables: tablesResult.rows.map((r: Record<string, unknown>) => r.table_name),
      statementResults: results.length,
    }),
  };
}

// Validate admin auth header
async function validateAdminAuth(
  event: APIGatewayProxyEvent,
  headers: Record<string, string>,
): Promise<APIGatewayProxyResult | null> {
  const authHeader = event.headers['x-admin-key'] || event.headers['X-Admin-Key'];
  const adminKey = await getAdminKey();

  if (!authHeader || !isValidKey(authHeader, adminKey)) {
    log.warn('Unauthorized admin access attempt');
    return { statusCode: 401, headers, body: JSON.stringify({ message: 'Unauthorized' }) };
  }
  return null;
}

// Route action to appropriate handler
async function routeAction(
  action: string,
  db: Pool,
  body: Record<string, unknown>,
  event: APIGatewayProxyEvent,
  headers: Record<string, string>,
): Promise<APIGatewayProxyResult> {
  if (action === 'seed') {
    log.info('Seeding demo data...');
    const stats = await seedDemoData(db);
    return { statusCode: 200, headers, body: JSON.stringify({ message: 'Demo data seeded successfully', ...stats }) };
  }

  if (action === 'check') {
    const stats = await db.query(`SELECT COUNT(*) as total, COUNT(CASE WHEN is_bot = true THEN 1 END) as demo FROM profiles`);
    const samples = await db.query(`SELECT id, username, account_type, is_bot FROM profiles ORDER BY created_at DESC LIMIT 10`);
    return { statusCode: 200, headers, body: JSON.stringify({ stats: stats.rows[0], profiles: samples.rows }) };
  }

  if (action === 'run-ddl') {
    return handleRunDdl(db, body, event, headers);
  }

  if (action === 'run-sql') {
    return handleRunSql(db, body, headers);
  }

  if (action === 'fix-constraint') {
    return handleFixConstraint(db, headers);
  }

  if (action === 'list-migrations') {
    try {
      await db.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        filename VARCHAR(255) NOT NULL,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        checksum VARCHAR(64)
      )`);
      const result = await db.query('SELECT version, filename, applied_at, checksum FROM schema_migrations ORDER BY version ASC');
      return { statusCode: 200, headers, body: JSON.stringify({ migrations: result.rows, count: result.rowCount }) };
    } catch (listErr: unknown) {
      log.error('list-migrations failed', listErr);
      return { statusCode: 500, headers, body: JSON.stringify({ message: 'Failed to list migrations' }) };
    }
  }

  // Execute raw migration SQL — admin-key protected, non-production only
  if (action === 'execute-migration') {
    if (process.env.ENVIRONMENT === 'production') {
      return { statusCode: 403, headers, body: JSON.stringify({ message: 'execute-migration is disabled in production' }) };
    }
    const sql = (body.sql as string)?.trim();
    if (!sql || typeof sql !== 'string') {
      return { statusCode: 400, headers, body: JSON.stringify({ message: 'SQL query required' }) };
    }
    // Block destructive and privilege-escalation operations (word-boundary matching)
    const normalizedMigration = sql.toUpperCase().replaceAll(/\s+/g, ' ').trim();
    if (matchesBlocklist(normalizedMigration, BLOCKED_MIGRATION)) {
      return { statusCode: 400, headers, body: JSON.stringify({ message: 'Blocked: migration contains restricted keyword' }) };
    }
    const sqlHash = createHash('sha256').update(sql).digest('hex');
    const shortHash = sqlHash.slice(0, 16);
    const requestId = getRequestId(event);
    log.info(`[${requestId}] execute-migration requested (hash=${shortHash})`);

    // Migration tracking: if version provided, check if already applied
    const migrationVersion = typeof body.migration_version === 'number' ? body.migration_version : null;
    const migrationFilename = typeof body.migration_filename === 'string' ? body.migration_filename : null;
    if (migrationVersion !== null) {
      try {
        await db.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
          version INTEGER PRIMARY KEY,
          filename VARCHAR(255) NOT NULL,
          applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          checksum VARCHAR(64)
        )`);
        const existing = await db.query('SELECT version, checksum, filename FROM schema_migrations WHERE version = $1', [migrationVersion]);
        if (existing.rowCount && existing.rowCount > 0) {
          const prev = existing.rows[0] as { checksum: string | null; filename: string };
          if (prev.checksum && prev.checksum !== sqlHash) {
            log.warn(`[${requestId}] checksum drift for migration v${migrationVersion}: stored=${prev.checksum.slice(0, 16)} new=${shortHash}`);
            return { statusCode: 409, headers, body: JSON.stringify({
              message: 'Migration version already applied with different SQL',
              version: migrationVersion,
              existingChecksum: prev.checksum,
              newChecksum: sqlHash,
              existingFilename: prev.filename,
            }) };
          }
          return { statusCode: 200, headers, body: JSON.stringify({ message: 'Migration already applied', version: migrationVersion, skipped: true }) };
        }
      } catch (trackErr: unknown) {
        log.warn('Migration tracking check failed, proceeding with execution', { error: String(trackErr) });
      }
    }

    try {
      // Split on semicolons and execute each statement
      const statements = sql.split(';').filter(s => s.trim().length > 0);
      let okCount = 0;
      let errCount = 0;
      for (const stmt of statements) {
        try {
          await db.query(stmt);
          okCount++;
        } catch (stmtErr: unknown) {
          errCount++;
          log.warn(`[${requestId}] statement failed (hash=${shortHash})`, { error: String(stmtErr) });
        }
      }
      if (errCount > 0) {
        log.warn(`[${requestId}] execute-migration completed with errors: ${okCount} ok, ${errCount} errors (hash=${shortHash})`);
      }

      // Record migration if version was provided and execution had no errors
      if (migrationVersion !== null && errCount === 0) {
        try {
          await db.query(
            'INSERT INTO schema_migrations (version, filename, checksum) VALUES ($1, $2, $3) ON CONFLICT (version) DO NOTHING',
            [migrationVersion, migrationFilename || 'unnamed', sqlHash],
          );
        } catch (recordErr: unknown) {
          log.warn('Failed to record migration in schema_migrations', { error: String(recordErr) });
        }
      }

      return { statusCode: 200, headers, body: JSON.stringify({ message: 'Migration executed', ok: okCount, errors: errCount }) };
    } catch (execError: unknown) {
      log.error('Execute-migration failed', execError);
      return { statusCode: 500, headers, body: JSON.stringify({ message: 'Execute-migration failed' }) };
    }
  }

  // Default: migration
  return handleMigrate(db, event, body, headers);
}

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const headers = createHeaders(event);
  log.initFromEvent(event);

  try {
    const authError = await validateAdminAuth(event, headers);
    if (authError) return authError;

    const db = await getPool();
    const body = event.body ? JSON.parse(event.body) : {};
    const action = body.action || 'migrate';

    return await routeAction(action, db, body, event, headers);
  } catch (error: unknown) {
    log.error('Migration error', error);
    return { statusCode: 500, headers, body: JSON.stringify({ message: 'Migration failed' }) };
  }
}

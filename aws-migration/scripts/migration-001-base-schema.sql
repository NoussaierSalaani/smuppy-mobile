-- Migration 001: Base Schema
-- Initial schema for Smuppy: users, profiles, posts, likes, comments

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm"; -- For text search

-- =====================================================
-- PROFILES TABLE
-- =====================================================
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
    business_phone VARCHAR(50),
    locations_mode VARCHAR(20) DEFAULT 'nearby',
    onboarding_completed BOOLEAN DEFAULT FALSE,
    fan_count INTEGER DEFAULT 0,
    following_count INTEGER DEFAULT 0,
    post_count INTEGER DEFAULT 0,
    followers_count INTEGER DEFAULT 0,
    is_bot BOOLEAN DEFAULT FALSE,
    is_team BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for profiles
CREATE INDEX IF NOT EXISTS idx_profiles_username ON profiles(username);
CREATE INDEX IF NOT EXISTS idx_profiles_cognito_sub ON profiles(cognito_sub);
CREATE INDEX IF NOT EXISTS idx_profiles_account_type ON profiles(account_type);
CREATE INDEX IF NOT EXISTS idx_profiles_username_trgm ON profiles USING gin (username gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_profiles_full_name_trgm ON profiles USING gin (full_name gin_trgm_ops);

-- =====================================================
-- POSTS TABLE
-- =====================================================
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

-- Indexes for posts
CREATE INDEX IF NOT EXISTS idx_posts_author_id ON posts(author_id);
CREATE INDEX IF NOT EXISTS idx_posts_created_at ON posts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_visibility ON posts(visibility);
CREATE INDEX IF NOT EXISTS idx_posts_is_peak ON posts(is_peak);
CREATE INDEX IF NOT EXISTS idx_posts_author_created ON posts(author_id, created_at DESC);

-- =====================================================
-- LIKES TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS likes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, post_id)
);

-- Indexes for likes
CREATE INDEX IF NOT EXISTS idx_likes_user_id ON likes(user_id);
CREATE INDEX IF NOT EXISTS idx_likes_post_id ON likes(post_id);

-- =====================================================
-- COMMENTS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS comments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    text TEXT NOT NULL,
    parent_comment_id UUID REFERENCES comments(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for comments
CREATE INDEX IF NOT EXISTS idx_comments_post_id ON comments(post_id);
CREATE INDEX IF NOT EXISTS idx_comments_user_id ON comments(user_id);
CREATE INDEX IF NOT EXISTS idx_comments_parent ON comments(parent_comment_id);

-- =====================================================
-- SAVED POSTS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS saved_posts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, post_id)
);

-- Indexes for saved posts
CREATE INDEX IF NOT EXISTS idx_saved_posts_user_id ON saved_posts(user_id);

-- =====================================================
-- INTERESTS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS interests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) UNIQUE NOT NULL,
    icon VARCHAR(50),
    category VARCHAR(100),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- EXPERTISE TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS expertise (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) UNIQUE NOT NULL,
    icon VARCHAR(50),
    category VARCHAR(100),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- USER INTERESTS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS user_interests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    interest_id UUID NOT NULL REFERENCES interests(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, interest_id)
);

-- =====================================================
-- Function: Update updated_at timestamp
-- =====================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply update triggers
DROP TRIGGER IF EXISTS update_profiles_updated_at ON profiles;
CREATE TRIGGER update_profiles_updated_at
    BEFORE UPDATE ON profiles
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_posts_updated_at ON posts;
CREATE TRIGGER update_posts_updated_at
    BEFORE UPDATE ON posts
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- SEED DATA: Default Interests
-- =====================================================
INSERT INTO interests (name, icon, category) VALUES
    ('Fitness', 'fitness-outline', 'Sports'),
    ('Yoga', 'body-outline', 'Sports'),
    ('Running', 'walk-outline', 'Sports'),
    ('Cycling', 'bicycle-outline', 'Sports'),
    ('Swimming', 'water-outline', 'Sports'),
    ('Basketball', 'basketball-outline', 'Sports'),
    ('Football', 'football-outline', 'Sports'),
    ('Tennis', 'tennisball-outline', 'Sports'),
    ('CrossFit', 'barbell-outline', 'Sports'),
    ('Boxing', 'hand-right-outline', 'Sports'),
    ('MMA', 'hand-right-outline', 'Sports'),
    ('Dance', 'musical-notes-outline', 'Sports'),
    ('Climbing', 'trending-up-outline', 'Sports'),
    ('Hiking', 'trail-sign-outline', 'Sports'),
    ('Skiing', 'snow-outline', 'Sports'),
    ('Surfing', 'water-outline', 'Sports'),
    ('Nutrition', 'nutrition-outline', 'Wellness'),
    ('Meditation', 'leaf-outline', 'Wellness'),
    ('Weight Loss', 'scale-outline', 'Wellness'),
    ('Muscle Building', 'barbell-outline', 'Wellness')
ON CONFLICT (name) DO NOTHING;

-- =====================================================
-- SEED DATA: Default Expertise
-- =====================================================
INSERT INTO expertise (name, icon, category) VALUES
    ('Personal Trainer', 'fitness-outline', 'Professional'),
    ('Yoga Instructor', 'body-outline', 'Professional'),
    ('Nutritionist', 'nutrition-outline', 'Professional'),
    ('Physical Therapist', 'medical-outline', 'Professional'),
    ('Sports Coach', 'trophy-outline', 'Professional'),
    ('CrossFit Coach', 'barbell-outline', 'Professional'),
    ('Boxing Coach', 'hand-right-outline', 'Professional'),
    ('Dance Instructor', 'musical-notes-outline', 'Professional'),
    ('Gym Owner', 'business-outline', 'Business'),
    ('Fitness Influencer', 'people-outline', 'Social')
ON CONFLICT (name) DO NOTHING;

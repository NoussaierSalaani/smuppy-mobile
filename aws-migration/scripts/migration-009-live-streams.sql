-- Migration 009: Live Streams & Peak Interactions
-- Tables for live streaming and peak features

-- ========================================
-- Live Streaming Tables
-- ========================================

-- Live stream viewers tracking
CREATE TABLE IF NOT EXISTS live_stream_viewers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    channel_name VARCHAR(255) NOT NULL,
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    connection_id VARCHAR(255) NOT NULL,
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(channel_name, user_id)
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_live_stream_viewers_channel ON live_stream_viewers(channel_name);
CREATE INDEX IF NOT EXISTS idx_live_stream_viewers_user ON live_stream_viewers(user_id);
CREATE INDEX IF NOT EXISTS idx_live_stream_viewers_connection ON live_stream_viewers(connection_id);

-- Live streams table (for tracking active/past streams)
CREATE TABLE IF NOT EXISTS live_streams (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    host_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    channel_name VARCHAR(255) NOT NULL UNIQUE,
    title VARCHAR(255),
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'ended')),
    started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    ended_at TIMESTAMP WITH TIME ZONE,
    max_viewers INTEGER DEFAULT 0,
    total_comments INTEGER DEFAULT 0,
    total_reactions INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_live_streams_host ON live_streams(host_id);
CREATE INDEX IF NOT EXISTS idx_live_streams_status ON live_streams(status);
CREATE INDEX IF NOT EXISTS idx_live_streams_channel ON live_streams(channel_name);

-- ========================================
-- Peak Interactions Tables
-- ========================================

-- Peak reactions (fire, flex, heart, clap, mindblown, energy, trophy, lightning)
CREATE TABLE IF NOT EXISTS peak_reactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    peak_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    reaction_type VARCHAR(20) NOT NULL CHECK (reaction_type IN ('fire', 'flex', 'heart', 'clap', 'mindblown', 'energy', 'trophy', 'lightning')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(peak_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_peak_reactions_peak ON peak_reactions(peak_id);
CREATE INDEX IF NOT EXISTS idx_peak_reactions_user ON peak_reactions(user_id);
CREATE INDEX IF NOT EXISTS idx_peak_reactions_type ON peak_reactions(reaction_type);

-- Peak tags (tagging friends on peaks)
CREATE TABLE IF NOT EXISTS peak_tags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    peak_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    tagged_user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    tagged_by_user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(peak_id, tagged_user_id)
);

CREATE INDEX IF NOT EXISTS idx_peak_tags_peak ON peak_tags(peak_id);
CREATE INDEX IF NOT EXISTS idx_peak_tags_tagged_user ON peak_tags(tagged_user_id);
CREATE INDEX IF NOT EXISTS idx_peak_tags_tagged_by ON peak_tags(tagged_by_user_id);

-- Peak hidden (not interested)
CREATE TABLE IF NOT EXISTS peak_hidden (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    peak_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    reason VARCHAR(30) DEFAULT 'not_interested' CHECK (reason IN ('not_interested', 'seen_too_often', 'irrelevant', 'other')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, peak_id)
);

CREATE INDEX IF NOT EXISTS idx_peak_hidden_user ON peak_hidden(user_id);
CREATE INDEX IF NOT EXISTS idx_peak_hidden_peak ON peak_hidden(peak_id);

-- ========================================
-- Peak Responses (Reply with another Peak)
-- ========================================

-- Add reply_to_peak_id column to posts table for peak responses
ALTER TABLE posts ADD COLUMN IF NOT EXISTS reply_to_peak_id UUID REFERENCES posts(id) ON DELETE SET NULL;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS allow_peak_responses BOOLEAN DEFAULT TRUE;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS peak_replies_count INTEGER DEFAULT 0;

-- Index for peak replies
CREATE INDEX IF NOT EXISTS idx_posts_reply_to_peak ON posts(reply_to_peak_id) WHERE reply_to_peak_id IS NOT NULL;

-- Function to update peak replies count
CREATE OR REPLACE FUNCTION update_peak_replies_count()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        -- Increment replies count on the parent peak
        IF NEW.reply_to_peak_id IS NOT NULL AND NEW.is_peak = TRUE THEN
            UPDATE posts SET peak_replies_count = peak_replies_count + 1
            WHERE id = NEW.reply_to_peak_id;
        END IF;
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        -- Decrement replies count on the parent peak
        IF OLD.reply_to_peak_id IS NOT NULL AND OLD.is_peak = TRUE THEN
            UPDATE posts SET peak_replies_count = GREATEST(0, peak_replies_count - 1)
            WHERE id = OLD.reply_to_peak_id;
        END IF;
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Trigger for peak replies count
DROP TRIGGER IF EXISTS trigger_update_peak_replies_count ON posts;
CREATE TRIGGER trigger_update_peak_replies_count
    AFTER INSERT OR DELETE ON posts
    FOR EACH ROW
    EXECUTE FUNCTION update_peak_replies_count();

-- ========================================
-- Cleanup Notes
-- ========================================
-- Cleanup: auto-delete stale viewer records (when connection is lost)
-- This will be triggered by a scheduled Lambda or when checking connections

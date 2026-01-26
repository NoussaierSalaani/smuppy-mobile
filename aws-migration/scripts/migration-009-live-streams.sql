-- Migration 009: Live Streams
-- Tables for live streaming features

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

-- Cleanup: auto-delete stale viewer records (when connection is lost)
-- This will be triggered by a scheduled Lambda or when checking connections

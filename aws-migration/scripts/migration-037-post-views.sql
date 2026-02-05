-- Migration 037: Create post_views table for view tracking deduplication
-- Idempotent: uses IF NOT EXISTS

CREATE TABLE IF NOT EXISTS post_views (
    post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (post_id, user_id)
);

-- Index for efficient lookups by user
CREATE INDEX IF NOT EXISTS idx_post_views_user_id ON post_views (user_id);

-- Rollback:
-- DROP INDEX IF EXISTS idx_post_views_user_id;
-- DROP TABLE IF EXISTS post_views;

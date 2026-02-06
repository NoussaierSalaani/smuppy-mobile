-- Migration 039: Create peak_hashtags table for storing hashtags on peaks
-- Rollback: DROP TABLE IF EXISTS peak_hashtags;

CREATE TABLE IF NOT EXISTS peak_hashtags (
    peak_id UUID NOT NULL REFERENCES peaks(id) ON DELETE CASCADE,
    hashtag VARCHAR(100) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (peak_id, hashtag)
);

CREATE INDEX IF NOT EXISTS idx_peak_hashtags_hashtag ON peak_hashtags(hashtag);
CREATE INDEX IF NOT EXISTS idx_peak_hashtags_created_at ON peak_hashtags(created_at);

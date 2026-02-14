-- Migration 052: Add voice_duration_seconds column to messages table
-- Stores voice message duration as integer seconds for proper querying/display
-- Previously duration was only embedded in content text as "Voice message (M:SS)"

ALTER TABLE messages ADD COLUMN IF NOT EXISTS voice_duration_seconds INTEGER;

-- Only voice/audio messages should have a duration value
COMMENT ON COLUMN messages.voice_duration_seconds IS 'Duration in seconds for voice/audio messages (NULL for text messages)';

-- Rollback:
-- ALTER TABLE messages DROP COLUMN IF EXISTS voice_duration_seconds;

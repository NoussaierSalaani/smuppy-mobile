-- Migration 051: Add shared_peak_id to messages table
-- Allows sharing peaks in conversations (in-app sharing)

ALTER TABLE messages ADD COLUMN IF NOT EXISTS shared_peak_id UUID;

-- Partial index for lookups on non-null values only
CREATE INDEX IF NOT EXISTS idx_messages_shared_peak_id
  ON messages (shared_peak_id)
  WHERE shared_peak_id IS NOT NULL;

-- FK to peaks with ON DELETE SET NULL (peak deletion won't break messages)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_messages_shared_peak'
  ) THEN
    ALTER TABLE messages
      ADD CONSTRAINT fk_messages_shared_peak
      FOREIGN KEY (shared_peak_id) REFERENCES peaks(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Rollback:
-- ALTER TABLE messages DROP COLUMN IF EXISTS shared_peak_id;

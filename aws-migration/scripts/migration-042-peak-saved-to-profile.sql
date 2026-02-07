-- Migration 042: Add saved_to_profile column to peaks
-- NULL = no decision yet (peak still active OR pending decision)
-- true = user chose to save on profile (permanent)
-- false = user chose to dismiss/download (can be cleaned up)

ALTER TABLE peaks ADD COLUMN IF NOT EXISTS saved_to_profile BOOLEAN DEFAULT NULL;

-- Index for querying expired peaks needing decision
CREATE INDEX IF NOT EXISTS idx_peaks_saved_decision
  ON peaks(author_id, expires_at)
  WHERE saved_to_profile IS NULL;

-- Rollback:
-- ALTER TABLE peaks DROP COLUMN IF EXISTS saved_to_profile;
-- DROP INDEX IF EXISTS idx_peaks_saved_decision;

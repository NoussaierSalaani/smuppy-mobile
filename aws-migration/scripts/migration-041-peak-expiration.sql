-- Migration 041: Add expires_at column to peaks table
-- Allows peaks to have configurable feed duration (24h or 48h)
-- Old peaks without expires_at are treated as 48h from created_at in queries

ALTER TABLE peaks ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_peaks_expires_at ON peaks(expires_at);

-- Rollback:
-- DROP INDEX IF EXISTS idx_peaks_expires_at;
-- ALTER TABLE peaks DROP COLUMN IF EXISTS expires_at;

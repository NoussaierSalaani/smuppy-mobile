-- Migration 040: Add filter and overlay metadata columns to peaks
-- Filters and overlays are stored as metadata and rendered as UI overlays during playback.
-- No video re-encoding needed.
-- Rollback: ALTER TABLE peaks DROP COLUMN IF EXISTS filter_id, DROP COLUMN IF EXISTS filter_intensity, DROP COLUMN IF EXISTS overlays;

ALTER TABLE peaks ADD COLUMN IF NOT EXISTS filter_id VARCHAR(50);
ALTER TABLE peaks ADD COLUMN IF NOT EXISTS filter_intensity REAL DEFAULT 1.0;
ALTER TABLE peaks ADD COLUMN IF NOT EXISTS overlays JSONB;

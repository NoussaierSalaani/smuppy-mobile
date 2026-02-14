-- Migration: Add missing columns to spots table
-- These columns are sent by SuggestSpotScreen but were never persisted
-- Idempotent: uses IF NOT EXISTS

ALTER TABLE spots ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';
ALTER TABLE spots ADD COLUMN IF NOT EXISTS qualities TEXT[] DEFAULT '{}';
ALTER TABLE spots ADD COLUMN IF NOT EXISTS subcategory VARCHAR(100);
ALTER TABLE spots ADD COLUMN IF NOT EXISTS initial_rating INTEGER CHECK (initial_rating >= 1 AND initial_rating <= 5);
ALTER TABLE spots ADD COLUMN IF NOT EXISTS initial_review TEXT;

-- Rollback:
-- ALTER TABLE spots DROP COLUMN IF EXISTS tags;
-- ALTER TABLE spots DROP COLUMN IF EXISTS qualities;
-- ALTER TABLE spots DROP COLUMN IF EXISTS subcategory;
-- ALTER TABLE spots DROP COLUMN IF EXISTS initial_rating;
-- ALTER TABLE spots DROP COLUMN IF EXISTS initial_review;

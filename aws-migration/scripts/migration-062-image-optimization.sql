-- ============================================================================
-- Migration 062: Image Optimization Pipeline
-- Adds media_meta JSONB column to posts for storing image variant keys,
-- dimensions, and blurhash strings. Adds avatar/cover blurhash to profiles.
-- ============================================================================
-- Idempotent: all statements use IF NOT EXISTS / IF EXISTS guards
-- Reversible: rollback block at bottom
-- ============================================================================

-- 1. Add media_meta JSONB column to posts
-- Stores: { width, height, blurhash, variants: { large, medium, thumb } }
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'posts' AND column_name = 'media_meta'
  ) THEN
    ALTER TABLE posts ADD COLUMN media_meta JSONB DEFAULT '{}';
  END IF;
END $$;

-- 2. Add avatar_blurhash to profiles
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'avatar_blurhash'
  ) THEN
    ALTER TABLE profiles ADD COLUMN avatar_blurhash TEXT;
  END IF;
END $$;

-- 3. Add cover_blurhash to profiles
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'cover_blurhash'
  ) THEN
    ALTER TABLE profiles ADD COLUMN cover_blurhash TEXT;
  END IF;
END $$;

-- 4. Index for querying posts with/without optimization
CREATE INDEX IF NOT EXISTS idx_posts_media_meta_not_empty
  ON posts USING gin (media_meta)
  WHERE media_meta != '{}';

-- ============================================================================
-- ROLLBACK (run manually if needed):
-- ============================================================================
-- ALTER TABLE posts DROP COLUMN IF EXISTS media_meta;
-- ALTER TABLE profiles DROP COLUMN IF EXISTS avatar_blurhash;
-- ALTER TABLE profiles DROP COLUMN IF EXISTS cover_blurhash;
-- DROP INDEX IF EXISTS idx_posts_media_meta_not_empty;
-- ============================================================================

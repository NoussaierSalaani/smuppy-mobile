-- Migration 055: Account deletion support
-- Date: 2026-02-14
-- Purpose: Add soft-delete columns to profiles for account deletion with 30-day grace period
-- All changes use IF NOT EXISTS for idempotency

-- ==========================================
-- 1. Add soft-delete columns to profiles
-- ==========================================
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT FALSE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- ==========================================
-- 2. Index for finding deleted accounts (cleanup job)
-- ==========================================
CREATE INDEX IF NOT EXISTS idx_profiles_deleted
  ON profiles (is_deleted, deleted_at)
  WHERE is_deleted = TRUE;

-- ROLLBACK:
-- DROP INDEX IF EXISTS idx_profiles_deleted;
-- ALTER TABLE profiles DROP COLUMN IF EXISTS deleted_at;
-- ALTER TABLE profiles DROP COLUMN IF EXISTS is_deleted;

-- Migration 014: Add email column to profiles
-- Fixes audit issue #9: profiles.email absent but queried in create-intent.ts

-- Add email column (nullable for existing rows)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS email VARCHAR(255);

-- Index for email lookups
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_profiles_email ON profiles(email);

-- Backfill: populate email from Cognito attributes stored during signup
-- This should be done via a one-time script that reads from Cognito UserPool
-- COMMENT: Run `node scripts/backfill-emails.js` after deploying this migration

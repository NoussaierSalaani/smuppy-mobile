-- Migration 043: Add 'subscribers' to posts visibility constraint
-- The Lambda accepts 'subscribers' visibility for pro_creator accounts,
-- but the DB CHECK constraint only allows public|private|fans.
-- This causes a 500 error on insert.

-- Drop the old constraint and re-create with 'subscribers' included
ALTER TABLE posts DROP CONSTRAINT IF EXISTS posts_visibility_check;
ALTER TABLE posts ADD CONSTRAINT posts_visibility_check
  CHECK (visibility IN ('public', 'private', 'fans', 'subscribers'));

-- Rollback:
-- ALTER TABLE posts DROP CONSTRAINT IF EXISTS posts_visibility_check;
-- ALTER TABLE posts ADD CONSTRAINT posts_visibility_check
--   CHECK (visibility IN ('public', 'private', 'fans'));

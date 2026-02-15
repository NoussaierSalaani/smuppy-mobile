-- Migration 058: Add UNIQUE constraint on challenge_responses(challenge_id, user_id)
-- Prevents race condition where concurrent requests could create duplicate responses
-- Idempotent: uses IF NOT EXISTS

-- Add unique constraint to prevent duplicate challenge responses
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'uq_challenge_responses_challenge_user'
  ) THEN
    ALTER TABLE challenge_responses
      ADD CONSTRAINT uq_challenge_responses_challenge_user
      UNIQUE (challenge_id, user_id);
  END IF;
END $$;

-- Rollback:
-- ALTER TABLE challenge_responses DROP CONSTRAINT IF EXISTS uq_challenge_responses_challenge_user;

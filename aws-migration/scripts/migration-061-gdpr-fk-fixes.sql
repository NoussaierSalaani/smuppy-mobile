-- Migration 061: GDPR FK constraint fixes
-- Fixes foreign keys that block account hard-deletion or destroy audit records.
--
-- Problems fixed:
-- 1. user_consents.user_id CASCADE → SET NULL (preserve consent proof per GDPR Art. 7)
-- 2. moderation_log.moderator_id NO ACTION → SET NULL (unblock moderator deletion)
-- 3. moderation_log.target_user_id NO ACTION → SET NULL (unblock target deletion)
-- 4. disputes complainant_id/respondent_id NO ACTION → SET NULL (unblock participant deletion)
-- 5. payments.creator_id RESTRICT → SET NULL (unblock creator deletion per GDPR Art. 17)
--
-- All changes preserve audit records by anonymizing the FK (NULL) instead of
-- deleting the row (CASCADE) or blocking deletion (RESTRICT/NO ACTION).

-- ===========================================================================
-- 1. user_consents: CASCADE → SET NULL (keep consent proof after account deletion)
-- ===========================================================================
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'user_consents_user_id_fkey' AND table_name = 'user_consents'
  ) THEN
    ALTER TABLE user_consents DROP CONSTRAINT user_consents_user_id_fkey;
    ALTER TABLE user_consents
      ALTER COLUMN user_id DROP NOT NULL,
      ADD CONSTRAINT user_consents_user_id_fkey
        FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ===========================================================================
-- 2. moderation_log.moderator_id: NO ACTION → SET NULL
-- ===========================================================================
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'moderation_log_moderator_id_fkey' AND table_name = 'moderation_log'
  ) THEN
    ALTER TABLE moderation_log DROP CONSTRAINT moderation_log_moderator_id_fkey;
    ALTER TABLE moderation_log
      ALTER COLUMN moderator_id DROP NOT NULL,
      ADD CONSTRAINT moderation_log_moderator_id_fkey
        FOREIGN KEY (moderator_id) REFERENCES profiles(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ===========================================================================
-- 3. moderation_log.target_user_id: NO ACTION → SET NULL
-- ===========================================================================
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'moderation_log_target_user_id_fkey' AND table_name = 'moderation_log'
  ) THEN
    ALTER TABLE moderation_log DROP CONSTRAINT moderation_log_target_user_id_fkey;
    ALTER TABLE moderation_log
      ADD CONSTRAINT moderation_log_target_user_id_fkey
        FOREIGN KEY (target_user_id) REFERENCES profiles(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ===========================================================================
-- 4. disputes complainant_id / respondent_id: NO ACTION → SET NULL
-- ===========================================================================
-- Note: session_disputes table from migration-036
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'session_disputes_complainant_id_fkey' AND table_name = 'session_disputes'
  ) THEN
    ALTER TABLE session_disputes DROP CONSTRAINT session_disputes_complainant_id_fkey;
    ALTER TABLE session_disputes
      ALTER COLUMN complainant_id DROP NOT NULL,
      ADD CONSTRAINT session_disputes_complainant_id_fkey
        FOREIGN KEY (complainant_id) REFERENCES profiles(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'session_disputes_respondent_id_fkey' AND table_name = 'session_disputes'
  ) THEN
    ALTER TABLE session_disputes DROP CONSTRAINT session_disputes_respondent_id_fkey;
    ALTER TABLE session_disputes
      ALTER COLUMN respondent_id DROP NOT NULL,
      ADD CONSTRAINT session_disputes_respondent_id_fkey
        FOREIGN KEY (respondent_id) REFERENCES profiles(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ===========================================================================
-- 5. payments.creator_id: RESTRICT → SET NULL (GDPR Art. 17 compliance)
-- ===========================================================================
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'payments_creator_id_fkey' AND table_name = 'payments'
  ) THEN
    ALTER TABLE payments DROP CONSTRAINT payments_creator_id_fkey;
    ALTER TABLE payments
      ADD CONSTRAINT payments_creator_id_fkey
        FOREIGN KEY (creator_id) REFERENCES profiles(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ===========================================================================
-- ROLLBACK (if needed):
-- ===========================================================================
-- ALTER TABLE user_consents DROP CONSTRAINT user_consents_user_id_fkey;
-- ALTER TABLE user_consents ALTER COLUMN user_id SET NOT NULL;
-- ALTER TABLE user_consents ADD CONSTRAINT user_consents_user_id_fkey
--   FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
--
-- ALTER TABLE moderation_log DROP CONSTRAINT moderation_log_moderator_id_fkey;
-- ALTER TABLE moderation_log ALTER COLUMN moderator_id SET NOT NULL;
-- ALTER TABLE moderation_log ADD CONSTRAINT moderation_log_moderator_id_fkey
--   FOREIGN KEY (moderator_id) REFERENCES profiles(id);
--
-- ALTER TABLE moderation_log DROP CONSTRAINT moderation_log_target_user_id_fkey;
-- ALTER TABLE moderation_log ADD CONSTRAINT moderation_log_target_user_id_fkey
--   FOREIGN KEY (target_user_id) REFERENCES profiles(id);
--
-- ALTER TABLE session_disputes DROP CONSTRAINT session_disputes_complainant_id_fkey;
-- ALTER TABLE session_disputes ALTER COLUMN complainant_id SET NOT NULL;
-- ALTER TABLE session_disputes ADD CONSTRAINT session_disputes_complainant_id_fkey
--   FOREIGN KEY (complainant_id) REFERENCES profiles(id);
--
-- ALTER TABLE session_disputes DROP CONSTRAINT session_disputes_respondent_id_fkey;
-- ALTER TABLE session_disputes ALTER COLUMN respondent_id SET NOT NULL;
-- ALTER TABLE session_disputes ADD CONSTRAINT session_disputes_respondent_id_fkey
--   FOREIGN KEY (respondent_id) REFERENCES profiles(id);
--
-- ALTER TABLE payments DROP CONSTRAINT payments_creator_id_fkey;
-- ALTER TABLE payments ADD CONSTRAINT payments_creator_id_fkey
--   FOREIGN KEY (creator_id) REFERENCES profiles(id) ON DELETE RESTRICT;

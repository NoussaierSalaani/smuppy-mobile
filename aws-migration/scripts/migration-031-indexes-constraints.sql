-- Migration 031: Additional indexes, NOT NULL constraints, FK fixes
-- Improves query performance and data integrity

BEGIN;

-- ============================================
-- COMPOSITE INDEXES
-- ============================================

-- posts.tags GIN index for tag-based search
CREATE INDEX IF NOT EXISTS idx_posts_tags_gin ON posts USING GIN (tags);

-- messages: unread by recipient
CREATE INDEX IF NOT EXISTS idx_messages_recipient_read ON messages(recipient_id, read, created_at DESC);

-- tips: receiver earnings queries
CREATE INDEX IF NOT EXISTS idx_tips_receiver_status ON tips(receiver_id, payment_status, created_at DESC);

-- groups: spatial lookup (requires btree_gist or earthdistance; use btree for lat/lng pairs)
CREATE INDEX IF NOT EXISTS idx_groups_location ON groups(latitude, longitude);

-- profiles: business spatial lookup
CREATE INDEX IF NOT EXISTS idx_profiles_business_location ON profiles(business_latitude, business_longitude)
  WHERE business_latitude IS NOT NULL AND business_longitude IS NOT NULL;

-- ============================================
-- NOT NULL CONSTRAINTS (safe: only where data should already be populated)
-- ============================================

-- profiles.username — should always be set after onboarding
DO $$
BEGIN
  -- Only add NOT NULL if no rows violate it
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE username IS NULL LIMIT 1) THEN
    ALTER TABLE profiles ALTER COLUMN username SET NOT NULL;
  ELSE
    RAISE NOTICE 'Skipping NOT NULL on profiles.username: null rows exist';
  END IF;
END $$;

-- notifications.type
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM notifications WHERE type IS NULL LIMIT 1) THEN
    ALTER TABLE notifications ALTER COLUMN type SET NOT NULL;
  ELSE
    RAISE NOTICE 'Skipping NOT NULL on notifications.type: null rows exist';
  END IF;
END $$;

-- peaks.video_url
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM peaks WHERE video_url IS NULL LIMIT 1) THEN
    ALTER TABLE peaks ALTER COLUMN video_url SET NOT NULL;
  ELSE
    RAISE NOTICE 'Skipping NOT NULL on peaks.video_url: null rows exist';
  END IF;
END $$;

-- live_streams.channel_name
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM live_streams WHERE channel_name IS NULL LIMIT 1) THEN
    ALTER TABLE live_streams ALTER COLUMN channel_name SET NOT NULL;
  ELSE
    RAISE NOTICE 'Skipping NOT NULL on live_streams.channel_name: null rows exist';
  END IF;
END $$;

-- subscriptions.status (platform_subscriptions and channel_subscriptions)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM platform_subscriptions WHERE status IS NULL LIMIT 1) THEN
    ALTER TABLE platform_subscriptions ALTER COLUMN status SET NOT NULL;
  ELSE
    RAISE NOTICE 'Skipping NOT NULL on platform_subscriptions.status: null rows exist';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM channel_subscriptions WHERE status IS NULL LIMIT 1) THEN
    ALTER TABLE channel_subscriptions ALTER COLUMN status SET NOT NULL;
  ELSE
    RAISE NOTICE 'Skipping NOT NULL on channel_subscriptions.status: null rows exist';
  END IF;
END $$;

-- ============================================
-- FIX peak_views.user_id type (VARCHAR → UUID) if needed
-- ============================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'peak_views' AND column_name = 'user_id' AND data_type = 'character varying'
  ) THEN
    -- Add temp column, migrate, drop old, rename
    ALTER TABLE peak_views ADD COLUMN user_id_uuid UUID;
    UPDATE peak_views SET user_id_uuid = user_id::uuid WHERE user_id IS NOT NULL;
    ALTER TABLE peak_views DROP COLUMN user_id;
    ALTER TABLE peak_views RENAME COLUMN user_id_uuid TO user_id;
    RAISE NOTICE 'Converted peak_views.user_id from VARCHAR to UUID';
  END IF;
END $$;

COMMIT;

-- Rollback:
-- DROP INDEX IF EXISTS idx_posts_tags_gin;
-- DROP INDEX IF EXISTS idx_messages_recipient_read;
-- DROP INDEX IF EXISTS idx_tips_receiver_status;
-- DROP INDEX IF EXISTS idx_groups_location;
-- DROP INDEX IF EXISTS idx_profiles_business_location;
-- NOTE: NOT NULL constraints can be reversed with ALTER TABLE ... ALTER COLUMN ... DROP NOT NULL
-- NOTE: peak_views.user_id type change is not easily reversible

-- Migration 031: Business program tables (activities, schedule slots, tags)
-- Required for business dashboard: activity management, weekly planning, search tags

BEGIN;

-- Table business_activities (programme/planning)
CREATE TABLE IF NOT EXISTS business_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES profiles(id),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  category VARCHAR(50),
  duration_minutes INTEGER NOT NULL DEFAULT 60,
  max_participants INTEGER,
  instructor VARCHAR(255),
  color VARCHAR(7) DEFAULT '#0EBF8A',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ba_business ON business_activities(business_id);
CREATE INDEX IF NOT EXISTS idx_ba_active ON business_activities(business_id) WHERE is_active = true;

-- Table business_schedule_slots (weekly recurring slots)
CREATE TABLE IF NOT EXISTS business_schedule_slots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES profiles(id),
  activity_id UUID NOT NULL REFERENCES business_activities(id) ON DELETE CASCADE,
  day_of_week SMALLINT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  instructor VARCHAR(255),
  max_participants INTEGER,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_bss_business_day ON business_schedule_slots(business_id, day_of_week);
CREATE INDEX IF NOT EXISTS idx_bss_activity ON business_schedule_slots(activity_id);

-- Table business_tags (search/filter tags)
CREATE TABLE IF NOT EXISTS business_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES profiles(id),
  name VARCHAR(100) NOT NULL,
  category VARCHAR(50),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(business_id, name)
);
CREATE INDEX IF NOT EXISTS idx_bt_business ON business_tags(business_id);

-- Add entries_total column to business_services if missing (for packs)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'business_services' AND column_name = 'entries_total'
  ) THEN
    ALTER TABLE business_services ADD COLUMN entries_total INTEGER;
  END IF;
END $$;

-- Add image_url column to business_services if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'business_services' AND column_name = 'image_url'
  ) THEN
    ALTER TABLE business_services ADD COLUMN image_url TEXT;
  END IF;
END $$;

COMMIT;

-- Rollback:
-- DROP TABLE IF EXISTS business_tags;
-- DROP TABLE IF EXISTS business_schedule_slots;
-- DROP TABLE IF EXISTS business_activities;
-- ALTER TABLE business_services DROP COLUMN IF EXISTS entries_total;
-- ALTER TABLE business_services DROP COLUMN IF EXISTS image_url;

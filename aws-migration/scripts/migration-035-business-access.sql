-- Migration 035: Business access management
-- Adds entry logs table and extends subscription schema for access pass functionality

BEGIN;

-- Business entry logs table (for scanner check-ins)
CREATE TABLE IF NOT EXISTS business_entry_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id UUID NOT NULL REFERENCES business_subscriptions(id),
  business_id UUID NOT NULL REFERENCES profiles(id),
  scanned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  scanned_by UUID REFERENCES profiles(id),
  UNIQUE (subscription_id, scanned_at)
);

CREATE INDEX IF NOT EXISTS idx_bel_subscription ON business_entry_logs(subscription_id);
CREATE INDEX IF NOT EXISTS idx_bel_business ON business_entry_logs(business_id);
CREATE INDEX IF NOT EXISTS idx_bel_date ON business_entry_logs(business_id, scanned_at);

-- Extend business_subscriptions with additional columns for access pass
DO $$
BEGIN
  -- Add current_period_start if not exists
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'business_subscriptions' AND column_name = 'current_period_start') THEN
    ALTER TABLE business_subscriptions ADD COLUMN current_period_start TIMESTAMPTZ;
  END IF;

  -- Add trial_end if not exists
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'business_subscriptions' AND column_name = 'trial_end') THEN
    ALTER TABLE business_subscriptions ADD COLUMN trial_end TIMESTAMPTZ;
  END IF;

  -- Add cancel_at_period_end if not exists
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'business_subscriptions' AND column_name = 'cancel_at_period_end') THEN
    ALTER TABLE business_subscriptions ADD COLUMN cancel_at_period_end BOOLEAN DEFAULT FALSE;
  END IF;

  -- Add cancelled_at if not exists
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'business_subscriptions' AND column_name = 'cancelled_at') THEN
    ALTER TABLE business_subscriptions ADD COLUMN cancelled_at TIMESTAMPTZ;
  END IF;

  -- Add sessions_used if not exists
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'business_subscriptions' AND column_name = 'sessions_used') THEN
    ALTER TABLE business_subscriptions ADD COLUMN sessions_used INTEGER DEFAULT 0;
  END IF;

  -- Add sessions_limit if not exists
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'business_subscriptions' AND column_name = 'sessions_limit') THEN
    ALTER TABLE business_subscriptions ADD COLUMN sessions_limit INTEGER;
  END IF;

  -- Add updated_at if not exists
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'business_subscriptions' AND column_name = 'updated_at') THEN
    ALTER TABLE business_subscriptions ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
  END IF;
END $$;

-- Extend business_services with billing_period alias column if not exists
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'business_services' AND column_name = 'billing_period') THEN
    ALTER TABLE business_services ADD COLUMN billing_period VARCHAR(10);
    -- Copy from subscription_period if available
    UPDATE business_services SET billing_period = subscription_period WHERE billing_period IS NULL AND subscription_period IS NOT NULL;
  END IF;
END $$;

-- Add business_category_id to profiles if not exists (for business categories)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'business_category_id') THEN
    ALTER TABLE profiles ADD COLUMN business_category_id UUID;
  END IF;
END $$;

-- Business categories table
CREATE TABLE IF NOT EXISTS business_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL UNIQUE,
  icon VARCHAR(50) NOT NULL DEFAULT 'business',
  color VARCHAR(10) NOT NULL DEFAULT '#0EBF8A',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Insert default categories if not exist
INSERT INTO business_categories (name, icon, color) VALUES
  ('Fitness', 'fitness', '#FF6B6B'),
  ('Yoga', 'leaf', '#9B59B6'),
  ('Pilates', 'body', '#3498DB'),
  ('CrossFit', 'barbell', '#E67E22'),
  ('Martial Arts', 'shield', '#2C3E50'),
  ('Dance', 'musical-notes', '#E91E63'),
  ('Swimming', 'water', '#00BCD4'),
  ('Wellness', 'heart', '#4CAF50'),
  ('General', 'business', '#0EBF8A')
ON CONFLICT (name) DO NOTHING;

COMMIT;

-- Rollback:
-- ALTER TABLE profiles DROP COLUMN IF EXISTS business_category_id;
-- DROP TABLE IF EXISTS business_categories;
-- ALTER TABLE business_services DROP COLUMN IF EXISTS billing_period;
-- ALTER TABLE business_subscriptions DROP COLUMN IF EXISTS updated_at;
-- ALTER TABLE business_subscriptions DROP COLUMN IF EXISTS sessions_limit;
-- ALTER TABLE business_subscriptions DROP COLUMN IF EXISTS sessions_used;
-- ALTER TABLE business_subscriptions DROP COLUMN IF EXISTS cancelled_at;
-- ALTER TABLE business_subscriptions DROP COLUMN IF EXISTS cancel_at_period_end;
-- ALTER TABLE business_subscriptions DROP COLUMN IF EXISTS trial_end;
-- ALTER TABLE business_subscriptions DROP COLUMN IF EXISTS current_period_start;
-- DROP TABLE IF EXISTS business_entry_logs;

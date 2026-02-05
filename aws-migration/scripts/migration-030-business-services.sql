-- Migration 030: Business Services table
-- Required by business-checkout.ts — defines the services a business can offer
-- (drop_in classes, passes, subscriptions)

BEGIN;

CREATE TABLE IF NOT EXISTS business_services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES profiles(id),
  name VARCHAR(200) NOT NULL,
  description TEXT,
  category VARCHAR(50) NOT NULL,
  price_cents INTEGER NOT NULL CHECK (price_cents >= 0),
  duration_minutes INTEGER,
  is_subscription BOOLEAN NOT NULL DEFAULT FALSE,
  subscription_period VARCHAR(10), -- 'weekly', 'monthly', 'yearly'
  trial_days INTEGER DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  max_capacity INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_bsvc_business ON business_services(business_id);
CREATE INDEX IF NOT EXISTS idx_bsvc_active ON business_services(business_id) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_bsvc_category ON business_services(category);

-- FK from existing booking/pass/subscription tables to business_services
-- These use DO $$ blocks for idempotency since IF NOT EXISTS isn't supported for constraints
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_bb_service' AND table_name = 'business_bookings'
  ) THEN
    ALTER TABLE business_bookings
      ADD CONSTRAINT fk_bb_service FOREIGN KEY (service_id) REFERENCES business_services(id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_bp_service' AND table_name = 'business_passes'
  ) THEN
    ALTER TABLE business_passes
      ADD CONSTRAINT fk_bp_service FOREIGN KEY (service_id) REFERENCES business_services(id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_bsub_service' AND table_name = 'business_subscriptions'
  ) THEN
    ALTER TABLE business_subscriptions
      ADD CONSTRAINT fk_bsub_service FOREIGN KEY (service_id) REFERENCES business_services(id);
  END IF;
END $$;

COMMIT;

-- Rollback:
-- ALTER TABLE business_subscriptions DROP CONSTRAINT IF EXISTS fk_bsub_service;
-- ALTER TABLE business_passes DROP CONSTRAINT IF EXISTS fk_bp_service;
-- ALTER TABLE business_bookings DROP CONSTRAINT IF EXISTS fk_bb_service;
-- DROP INDEX IF EXISTS idx_bsvc_category;
-- DROP INDEX IF EXISTS idx_bsvc_active;
-- DROP INDEX IF EXISTS idx_bsvc_business;
-- DROP TABLE IF EXISTS business_services;

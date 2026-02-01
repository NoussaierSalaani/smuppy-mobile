-- Migration 025: Business bookings, passes, and subscriptions tables
-- For the simplified "Booking.com Fitness" payment model

-- Réservations unitaires (drop_in)
CREATE TABLE IF NOT EXISTS business_bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id),
  business_id UUID NOT NULL REFERENCES profiles(id),
  service_id UUID NOT NULL,
  stripe_checkout_session_id VARCHAR(255),
  stripe_payment_intent_id VARCHAR(255),
  amount_cents INTEGER NOT NULL,
  platform_fee_cents INTEGER NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  booking_date DATE,
  slot_time VARCHAR(10),
  qr_code VARCHAR(100) UNIQUE,
  scanned_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_bb_user ON business_bookings(user_id);
CREATE INDEX IF NOT EXISTS idx_bb_business ON business_bookings(business_id);
CREATE INDEX IF NOT EXISTS idx_bb_qr ON business_bookings(qr_code);
CREATE INDEX IF NOT EXISTS idx_bb_status ON business_bookings(status);

-- Pass multi-entrées
CREATE TABLE IF NOT EXISTS business_passes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id),
  business_id UUID NOT NULL REFERENCES profiles(id),
  service_id UUID NOT NULL,
  stripe_checkout_session_id VARCHAR(255),
  amount_cents INTEGER NOT NULL,
  platform_fee_cents INTEGER NOT NULL,
  entries_total INTEGER NOT NULL,
  entries_used INTEGER NOT NULL DEFAULT 0,
  expires_at TIMESTAMPTZ,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_bp_user ON business_passes(user_id);
CREATE INDEX IF NOT EXISTS idx_bp_business ON business_passes(business_id);

-- Abonnements business (récurrents)
CREATE TABLE IF NOT EXISTS business_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id),
  business_id UUID NOT NULL REFERENCES profiles(id),
  service_id UUID NOT NULL,
  stripe_subscription_id VARCHAR(255),
  stripe_checkout_session_id VARCHAR(255),
  amount_cents INTEGER NOT NULL,
  platform_fee_cents INTEGER NOT NULL,
  period VARCHAR(10) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  current_period_end TIMESTAMPTZ,
  cancel_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_bs_user ON business_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_bs_business ON business_subscriptions(business_id);
CREATE INDEX IF NOT EXISTS idx_bs_stripe ON business_subscriptions(stripe_subscription_id);

-- Rollback:
-- DROP TABLE IF EXISTS business_subscriptions;
-- DROP TABLE IF EXISTS business_passes;
-- DROP TABLE IF EXISTS business_bookings;

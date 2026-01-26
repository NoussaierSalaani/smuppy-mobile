-- Migration 008: Complete Payments System
-- Smuppy Revenue Model:
-- 1. Platform Subscriptions: Pro Creator ($99/mo), Pro Business ($49/mo) - 100% Smuppy
-- 2. Identity Verification: $14.90 - 100% Smuppy (minus Stripe fees)
-- 3. Channel Subscriptions: Variable price, tiered revenue share (60-80% Creator, 20-40% Smuppy)
-- 4. Sessions & Packs: Variable price, 80% Creator, 20% Smuppy

-- ============================================
-- STRIPE COLUMNS ON PROFILES
-- ============================================
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS stripe_customer_id VARCHAR(255),
ADD COLUMN IF NOT EXISTS stripe_account_id VARCHAR(255),
ADD COLUMN IF NOT EXISTS stripe_charges_enabled BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS stripe_payouts_enabled BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS channel_price_cents INTEGER,
ADD COLUMN IF NOT EXISTS channel_description TEXT,
ADD COLUMN IF NOT EXISTS verification_payment_id VARCHAR(255),
ADD COLUMN IF NOT EXISTS verification_payment_status VARCHAR(50),
ADD COLUMN IF NOT EXISTS verification_payment_date TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS identity_verification_session_id VARCHAR(255),
ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ;

-- Indexes for Stripe lookups
CREATE INDEX IF NOT EXISTS idx_profiles_stripe_customer ON profiles(stripe_customer_id) WHERE stripe_customer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_profiles_stripe_account ON profiles(stripe_account_id) WHERE stripe_account_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_profiles_identity_session ON profiles(identity_verification_session_id) WHERE identity_verification_session_id IS NOT NULL;

-- ============================================
-- PAYMENTS TABLE (Sessions & Packs)
-- ============================================
CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_payment_intent_id VARCHAR(255) UNIQUE NOT NULL,
  stripe_charge_id VARCHAR(255),
  buyer_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  creator_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  session_id UUID REFERENCES private_sessions(id) ON DELETE SET NULL,
  pack_id UUID REFERENCES monthly_packs(id) ON DELETE SET NULL,
  type VARCHAR(50) DEFAULT 'session', -- session, pack
  source VARCHAR(20) DEFAULT 'web', -- web, ios, android
  gross_amount INTEGER NOT NULL, -- Original amount in cents
  net_amount INTEGER NOT NULL, -- After app store fees
  platform_fee INTEGER DEFAULT 0, -- Smuppy's share (20%)
  creator_amount INTEGER NOT NULL, -- Creator's share (80%)
  currency VARCHAR(3) DEFAULT 'usd',
  status VARCHAR(50) DEFAULT 'pending', -- pending, succeeded, failed, refunded
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for payments
CREATE INDEX IF NOT EXISTS idx_payments_buyer ON payments(buyer_id);
CREATE INDEX IF NOT EXISTS idx_payments_creator ON payments(creator_id);
CREATE INDEX IF NOT EXISTS idx_payments_session ON payments(session_id) WHERE session_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_payments_pack ON payments(pack_id) WHERE pack_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
CREATE INDEX IF NOT EXISTS idx_payments_stripe_intent ON payments(stripe_payment_intent_id);
CREATE INDEX IF NOT EXISTS idx_payments_type ON payments(type);
CREATE INDEX IF NOT EXISTS idx_payments_created ON payments(created_at DESC);

-- ============================================
-- PRIVATE SESSIONS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS private_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  buyer_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  scheduled_at TIMESTAMPTZ NOT NULL,
  duration_minutes INTEGER DEFAULT 60,
  price_cents INTEGER NOT NULL,
  currency VARCHAR(3) DEFAULT 'usd',
  status VARCHAR(50) DEFAULT 'pending', -- pending, confirmed, completed, cancelled
  payment_status VARCHAR(50) DEFAULT 'unpaid', -- unpaid, paid, refunded
  agora_channel_name VARCHAR(255),
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sessions_creator ON private_sessions(creator_id);
CREATE INDEX IF NOT EXISTS idx_sessions_buyer ON private_sessions(buyer_id) WHERE buyer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sessions_scheduled ON private_sessions(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_sessions_status ON private_sessions(status);

-- ============================================
-- MONTHLY PACKS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS monthly_packs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  buyer_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  price_cents INTEGER NOT NULL,
  currency VARCHAR(3) DEFAULT 'usd',
  sessions_included INTEGER DEFAULT 4, -- Number of sessions in pack
  sessions_remaining INTEGER DEFAULT 4,
  status VARCHAR(50) DEFAULT 'pending', -- pending, active, expired, cancelled
  payment_status VARCHAR(50) DEFAULT 'unpaid',
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_packs_creator ON monthly_packs(creator_id);
CREATE INDEX IF NOT EXISTS idx_packs_buyer ON monthly_packs(buyer_id) WHERE buyer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_packs_status ON monthly_packs(status);

-- ============================================
-- PLATFORM SUBSCRIPTIONS (Pro Creator $99, Pro Business $49)
-- ============================================
CREATE TABLE IF NOT EXISTS platform_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  stripe_subscription_id VARCHAR(255) UNIQUE,
  plan_type VARCHAR(50) NOT NULL, -- pro_creator, pro_business
  status VARCHAR(50) DEFAULT 'active', -- active, canceling, canceled, past_due
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  cancel_at TIMESTAMPTZ,
  canceled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id)
);

CREATE INDEX IF NOT EXISTS idx_platform_subs_user ON platform_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_platform_subs_stripe ON platform_subscriptions(stripe_subscription_id);
CREATE INDEX IF NOT EXISTS idx_platform_subs_status ON platform_subscriptions(status);

-- ============================================
-- CHANNEL SUBSCRIPTIONS (Fan subscribes to Creator's channel)
-- ============================================
CREATE TABLE IF NOT EXISTS channel_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fan_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  creator_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  stripe_subscription_id VARCHAR(255) UNIQUE,
  price_cents INTEGER NOT NULL,
  currency VARCHAR(3) DEFAULT 'usd',
  status VARCHAR(50) DEFAULT 'active', -- active, canceling, canceled, past_due
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  cancel_at TIMESTAMPTZ,
  canceled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(fan_id, creator_id)
);

CREATE INDEX IF NOT EXISTS idx_channel_subs_fan ON channel_subscriptions(fan_id);
CREATE INDEX IF NOT EXISTS idx_channel_subs_creator ON channel_subscriptions(creator_id);
CREATE INDEX IF NOT EXISTS idx_channel_subs_stripe ON channel_subscriptions(stripe_subscription_id);
CREATE INDEX IF NOT EXISTS idx_channel_subs_status ON channel_subscriptions(status);

-- ============================================
-- CHANNEL SUBSCRIPTION PAYMENTS (For revenue tracking)
-- ============================================
CREATE TABLE IF NOT EXISTS channel_subscription_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_invoice_id VARCHAR(255) UNIQUE,
  creator_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  fan_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  amount_cents INTEGER NOT NULL,
  platform_fee_cents INTEGER NOT NULL,
  creator_amount_cents INTEGER NOT NULL,
  currency VARCHAR(3) DEFAULT 'usd',
  status VARCHAR(50) DEFAULT 'pending', -- pending, succeeded, failed
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_channel_payments_creator ON channel_subscription_payments(creator_id);
CREATE INDEX IF NOT EXISTS idx_channel_payments_fan ON channel_subscription_payments(fan_id);
CREATE INDEX IF NOT EXISTS idx_channel_payments_created ON channel_subscription_payments(created_at DESC);

-- ============================================
-- TRIGGERS
-- ============================================

-- Generic updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply triggers
DROP TRIGGER IF EXISTS payments_updated_at ON payments;
CREATE TRIGGER payments_updated_at
  BEFORE UPDATE ON payments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS sessions_updated_at ON private_sessions;
CREATE TRIGGER sessions_updated_at
  BEFORE UPDATE ON private_sessions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS packs_updated_at ON monthly_packs;
CREATE TRIGGER packs_updated_at
  BEFORE UPDATE ON monthly_packs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS platform_subs_updated_at ON platform_subscriptions;
CREATE TRIGGER platform_subs_updated_at
  BEFORE UPDATE ON platform_subscriptions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS channel_subs_updated_at ON channel_subscriptions;
CREATE TRIGGER channel_subs_updated_at
  BEFORE UPDATE ON channel_subscriptions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- VIEWS FOR ANALYTICS
-- ============================================

-- Creator revenue summary
CREATE OR REPLACE VIEW creator_revenue_summary AS
SELECT
  creator_id,
  -- Sessions & Packs revenue
  COUNT(*) FILTER (WHERE status = 'succeeded') as total_transactions,
  COALESCE(SUM(gross_amount) FILTER (WHERE status = 'succeeded'), 0) as gross_revenue_cents,
  COALESCE(SUM(creator_amount) FILTER (WHERE status = 'succeeded'), 0) as net_revenue_cents,
  COALESCE(SUM(platform_fee) FILTER (WHERE status = 'succeeded'), 0) as platform_fees_cents,
  -- By type
  COALESCE(SUM(creator_amount) FILTER (WHERE status = 'succeeded' AND type = 'session'), 0) as session_revenue_cents,
  COALESCE(SUM(creator_amount) FILTER (WHERE status = 'succeeded' AND type = 'pack'), 0) as pack_revenue_cents,
  MIN(created_at) as first_payment_at,
  MAX(created_at) as last_payment_at
FROM payments
GROUP BY creator_id;

-- Channel subscription revenue summary
CREATE OR REPLACE VIEW creator_channel_revenue AS
SELECT
  creator_id,
  COUNT(*) as total_payments,
  COALESCE(SUM(amount_cents), 0) as gross_revenue_cents,
  COALESCE(SUM(creator_amount_cents), 0) as net_revenue_cents,
  COALESCE(SUM(platform_fee_cents), 0) as platform_fees_cents
FROM channel_subscription_payments
WHERE status = 'succeeded'
GROUP BY creator_id;

-- Active subscribers count per creator
CREATE OR REPLACE VIEW creator_subscriber_counts AS
SELECT
  creator_id,
  COUNT(*) as active_subscribers,
  COALESCE(SUM(price_cents), 0) as monthly_recurring_revenue
FROM channel_subscriptions
WHERE status IN ('active', 'canceling')
GROUP BY creator_id;

-- Platform subscriptions overview
CREATE OR REPLACE VIEW platform_subscription_stats AS
SELECT
  plan_type,
  COUNT(*) as total_subscribers,
  COUNT(*) FILTER (WHERE status = 'active') as active_subscribers,
  COUNT(*) FILTER (WHERE status = 'canceling') as canceling_subscribers,
  COUNT(*) FILTER (WHERE status = 'canceled') as canceled_subscribers
FROM platform_subscriptions
GROUP BY plan_type;

-- Revenue tier function
CREATE OR REPLACE FUNCTION get_revenue_tier(fan_count INTEGER)
RETURNS TABLE(tier_name TEXT, creator_percent INTEGER, platform_percent INTEGER) AS $$
BEGIN
  IF fan_count >= 1000000 THEN
    RETURN QUERY SELECT 'Diamond'::TEXT, 80, 20;
  ELSIF fan_count >= 100000 THEN
    RETURN QUERY SELECT 'Platinum'::TEXT, 75, 25;
  ELSIF fan_count >= 10000 THEN
    RETURN QUERY SELECT 'Gold'::TEXT, 70, 30;
  ELSIF fan_count >= 1000 THEN
    RETURN QUERY SELECT 'Silver'::TEXT, 65, 35;
  ELSE
    RETURN QUERY SELECT 'Bronze'::TEXT, 60, 40;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Migration 065: IAP User Entitlements Table
-- Tracks all IAP (In-App Purchase) entitlements from App Store and Google Play.
-- This is the source of truth for digital product access purchased via IAP.
-- Stripe purchases are tracked separately in the payments table.

-- ============================================
-- Table: user_entitlements
-- ============================================
CREATE TABLE IF NOT EXISTS user_entitlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

  -- Product classification
  product_type VARCHAR(50) NOT NULL,
    -- 'pro_creator', 'pro_business', 'verified', 'channel_subscription', 'tip'
  platform VARCHAR(10) NOT NULL CHECK (platform IN ('ios', 'android')),

  -- Store transaction identifiers
  store_transaction_id VARCHAR(255) NOT NULL,
  original_transaction_id VARCHAR(255),
    -- Original transaction for subscription renewals (groups all renewals together)
  store_product_id VARCHAR(255) NOT NULL,

  -- Dates
  purchase_date TIMESTAMPTZ NOT NULL,
  expires_date TIMESTAMPTZ,
    -- NULL for consumables (tips), set for subscriptions

  -- Status
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_trial BOOLEAN NOT NULL DEFAULT false,
  auto_renew_status BOOLEAN DEFAULT true,

  -- Environment (sandbox vs production)
  environment VARCHAR(20) NOT NULL DEFAULT 'production'
    CHECK (environment IN ('sandbox', 'production')),

  -- Audit
  raw_receipt TEXT,
    -- Full receipt stored for dispute resolution and audit trail
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Prevent duplicate transactions
  CONSTRAINT uq_entitlements_transaction UNIQUE (platform, store_transaction_id)
);

-- ============================================
-- Indexes
-- ============================================

-- Fast lookup: active entitlements for a user
CREATE INDEX IF NOT EXISTS idx_entitlements_profile_active
  ON user_entitlements (profile_id, is_active)
  WHERE is_active = true;

-- Fast lookup: all entitlements for a user (including expired)
CREATE INDEX IF NOT EXISTS idx_entitlements_profile_id
  ON user_entitlements (profile_id);

-- Renewal tracking: find all renewals for an original transaction
CREATE INDEX IF NOT EXISTS idx_entitlements_original_txn
  ON user_entitlements (original_transaction_id)
  WHERE original_transaction_id IS NOT NULL;

-- Expiry check: find entitlements expiring soon (for grace period handling)
CREATE INDEX IF NOT EXISTS idx_entitlements_expires
  ON user_entitlements (expires_date)
  WHERE is_active = true AND expires_date IS NOT NULL;

-- Store lookup: find entitlement by store transaction ID
CREATE INDEX IF NOT EXISTS idx_entitlements_store_txn
  ON user_entitlements (platform, store_transaction_id);

-- ============================================
-- Rollback
-- ============================================
-- DROP INDEX IF EXISTS idx_entitlements_store_txn;
-- DROP INDEX IF EXISTS idx_entitlements_expires;
-- DROP INDEX IF EXISTS idx_entitlements_original_txn;
-- DROP INDEX IF EXISTS idx_entitlements_profile_id;
-- DROP INDEX IF EXISTS idx_entitlements_profile_active;
-- DROP TABLE IF EXISTS user_entitlements;

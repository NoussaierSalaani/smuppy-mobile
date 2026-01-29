-- Migration 010: Private Sessions & Session Packs
-- Creates tables for 1:1 private video sessions and monthly session packs

-- ============================================
-- SESSION PACKS (offered by creators)
-- ============================================

CREATE TABLE IF NOT EXISTS session_packs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  sessions_included INTEGER NOT NULL DEFAULT 1,
  session_duration INTEGER NOT NULL DEFAULT 30, -- minutes
  validity_days INTEGER NOT NULL DEFAULT 30,
  price DECIMAL(10,2) NOT NULL,
  savings_percent INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_session_packs_creator ON session_packs(creator_id);
CREATE INDEX idx_session_packs_active ON session_packs(is_active) WHERE is_active = true;

-- ============================================
-- USER SESSION PACKS (purchased by fans)
-- ============================================

CREATE TABLE IF NOT EXISTS user_session_packs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  creator_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  pack_id UUID NOT NULL REFERENCES session_packs(id) ON DELETE SET NULL,
  sessions_remaining INTEGER NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  payment_intent_id VARCHAR(255),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_user_session_packs_user ON user_session_packs(user_id);
CREATE INDEX idx_user_session_packs_creator ON user_session_packs(creator_id);
CREATE INDEX idx_user_session_packs_active ON user_session_packs(expires_at) WHERE sessions_remaining > 0;

-- ============================================
-- PRIVATE SESSIONS
-- ============================================

-- private_sessions already created in migration-008-payments.sql
-- Add columns that migration-008 didn't have (fan_id alias, pack_id, ratings, etc.)
ALTER TABLE private_sessions ADD COLUMN IF NOT EXISTS fan_id UUID REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE private_sessions ADD COLUMN IF NOT EXISTS pack_id UUID REFERENCES user_session_packs(id) ON DELETE SET NULL;
ALTER TABLE private_sessions ADD COLUMN IF NOT EXISTS cancellation_reason TEXT;
ALTER TABLE private_sessions ADD COLUMN IF NOT EXISTS agora_channel VARCHAR(100);
ALTER TABLE private_sessions ADD COLUMN IF NOT EXISTS recording_url TEXT;
ALTER TABLE private_sessions ADD COLUMN IF NOT EXISTS creator_rating INTEGER CHECK (creator_rating >= 1 AND creator_rating <= 5);
ALTER TABLE private_sessions ADD COLUMN IF NOT EXISTS fan_rating INTEGER CHECK (fan_rating >= 1 AND fan_rating <= 5);

-- Backfill fan_id from buyer_id for existing rows
UPDATE private_sessions SET fan_id = buyer_id WHERE fan_id IS NULL AND buyer_id IS NOT NULL;

-- Indexes (IF NOT EXISTS to avoid conflicts with migration-008)
CREATE INDEX IF NOT EXISTS idx_private_sessions_fan ON private_sessions(fan_id);
CREATE INDEX IF NOT EXISTS idx_private_sessions_upcoming ON private_sessions(scheduled_at, status)
  WHERE status IN ('pending', 'confirmed');

-- ============================================
-- PENDING PACK PURCHASES (for Stripe webhook)
-- ============================================

CREATE TABLE IF NOT EXISTS pending_pack_purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  pack_id UUID NOT NULL REFERENCES session_packs(id) ON DELETE CASCADE,
  creator_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  payment_intent_id VARCHAR(255) UNIQUE NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  status VARCHAR(20) DEFAULT 'pending',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_pending_pack_purchases_intent ON pending_pack_purchases(payment_intent_id);

-- ============================================
-- PROFILE EXTENSIONS FOR SESSIONS
-- ============================================

-- Add session-related columns to profiles if they don't exist
DO $$
BEGIN
  -- Sessions enabled flag
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'sessions_enabled') THEN
    ALTER TABLE profiles ADD COLUMN sessions_enabled BOOLEAN DEFAULT false;
  END IF;

  -- Session price
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'session_price') THEN
    ALTER TABLE profiles ADD COLUMN session_price DECIMAL(10,2);
  END IF;

  -- Session duration
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'session_duration') THEN
    ALTER TABLE profiles ADD COLUMN session_duration INTEGER DEFAULT 30;
  END IF;

  -- Session availability (JSON)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'session_availability') THEN
    ALTER TABLE profiles ADD COLUMN session_availability JSONB;
  END IF;

  -- Timezone
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'timezone') THEN
    ALTER TABLE profiles ADD COLUMN timezone VARCHAR(50) DEFAULT 'Europe/Paris';
  END IF;
END $$;

-- ============================================
-- TRIGGERS
-- ============================================

-- Update updated_at on session_packs
CREATE OR REPLACE FUNCTION update_session_packs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_session_packs_updated_at ON session_packs;
CREATE TRIGGER trigger_update_session_packs_updated_at
  BEFORE UPDATE ON session_packs
  FOR EACH ROW
  EXECUTE FUNCTION update_session_packs_updated_at();

-- Update updated_at on private_sessions
CREATE OR REPLACE FUNCTION update_private_sessions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_private_sessions_updated_at ON private_sessions;
CREATE TRIGGER trigger_update_private_sessions_updated_at
  BEFORE UPDATE ON private_sessions
  FOR EACH ROW
  EXECUTE FUNCTION update_private_sessions_updated_at();

-- ============================================
-- GRANTS
-- ============================================

GRANT SELECT, INSERT, UPDATE, DELETE ON session_packs TO smuppy_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON user_session_packs TO smuppy_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON private_sessions TO smuppy_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON pending_pack_purchases TO smuppy_app;

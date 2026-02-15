-- Migration 056: User Consents Table
-- GDPR compliance — tracks consent for ToS, privacy policy, marketing
-- Each row is an immutable audit record (append-only, never updated or deleted)

CREATE TABLE IF NOT EXISTS user_consents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  consent_type VARCHAR(30) NOT NULL CHECK (consent_type IN ('terms_of_service', 'privacy_policy', 'marketing')),
  accepted BOOLEAN NOT NULL,
  version VARCHAR(20) NOT NULL,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for looking up a user's latest consent per type
CREATE INDEX IF NOT EXISTS idx_user_consents_user_type
  ON user_consents(user_id, consent_type, created_at DESC);

-- Rollback:
-- DROP TABLE IF EXISTS user_consents;

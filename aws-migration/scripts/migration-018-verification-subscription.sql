-- Migration 018: Add verification subscription column
-- Changes verification from one-time payment to monthly subscription

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS verification_subscription_id VARCHAR(255);

CREATE INDEX IF NOT EXISTS idx_profiles_verification_sub
  ON profiles(verification_subscription_id)
  WHERE verification_subscription_id IS NOT NULL;

COMMENT ON COLUMN profiles.verification_subscription_id IS 'Stripe Subscription ID for monthly verified account';

-- Migration 007: Push Notifications Enhancement
-- Adds SNS integration columns and device tracking

-- Add device_id column for unique device identification
ALTER TABLE push_tokens ADD COLUMN IF NOT EXISTS device_id VARCHAR(255);

-- Add SNS endpoint ARN for AWS SNS Platform Endpoints
ALTER TABLE push_tokens ADD COLUMN IF NOT EXISTS sns_endpoint_arn TEXT;

-- Update the unique constraint to be on user_id + device_id instead of user_id + token
-- First, drop the old constraint if it exists
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'push_tokens_user_id_token_key'
    ) THEN
        ALTER TABLE push_tokens DROP CONSTRAINT push_tokens_user_id_token_key;
    END IF;
END $$;

-- Add new unique constraint on user_id + device_id
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'push_tokens_user_id_device_id_key'
    ) THEN
        ALTER TABLE push_tokens ADD CONSTRAINT push_tokens_user_id_device_id_key UNIQUE (user_id, device_id);
    END IF;
END $$;

-- Create index on device_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_push_tokens_device_id ON push_tokens(device_id);

-- Create index on sns_endpoint_arn for reverse lookups
CREATE INDEX IF NOT EXISTS idx_push_tokens_sns_endpoint ON push_tokens(sns_endpoint_arn) WHERE sns_endpoint_arn IS NOT NULL;

-- Add enabled column to track if the push token is active
ALTER TABLE push_tokens ADD COLUMN IF NOT EXISTS enabled BOOLEAN DEFAULT TRUE;

-- Add last_used column to track when the token was last used
ALTER TABLE push_tokens ADD COLUMN IF NOT EXISTS last_used_at TIMESTAMPTZ;

COMMENT ON TABLE push_tokens IS 'Stores push notification tokens with SNS integration';
COMMENT ON COLUMN push_tokens.device_id IS 'Unique device identifier from the mobile app';
COMMENT ON COLUMN push_tokens.sns_endpoint_arn IS 'AWS SNS Platform Endpoint ARN for this device';
COMMENT ON COLUMN push_tokens.enabled IS 'Whether this push token is currently active';
COMMENT ON COLUMN push_tokens.last_used_at IS 'Last time a notification was sent to this device';

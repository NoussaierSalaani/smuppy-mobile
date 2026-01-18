-- Soft delete system for GDPR compliance
-- Accounts are disabled for 30 days before permanent deletion

-- Table to track deleted accounts
CREATE TABLE IF NOT EXISTS deleted_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  email TEXT NOT NULL,
  full_name TEXT,
  deleted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  hard_delete_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 days'),
  reason TEXT DEFAULT 'user_requested',
  metadata JSONB DEFAULT '{}'::jsonb,

  CONSTRAINT deleted_accounts_email_key UNIQUE (email)
);

-- Index for cleanup job
CREATE INDEX idx_deleted_accounts_hard_delete_at ON deleted_accounts(hard_delete_at);

-- Index for email lookup during login
CREATE INDEX idx_deleted_accounts_email ON deleted_accounts(email);

-- RLS policies
ALTER TABLE deleted_accounts ENABLE ROW LEVEL SECURITY;

-- Only service role can access this table (for security)
CREATE POLICY "Service role only" ON deleted_accounts
  FOR ALL
  USING (auth.role() = 'service_role');

-- Function to check if email is in deleted accounts (for login check)
CREATE OR REPLACE FUNCTION check_deleted_account(p_email TEXT)
RETURNS TABLE (
  is_deleted BOOLEAN,
  deleted_at TIMESTAMPTZ,
  days_remaining INTEGER,
  can_reactivate BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    TRUE as is_deleted,
    da.deleted_at,
    GREATEST(0, EXTRACT(DAY FROM (da.hard_delete_at - NOW()))::INTEGER) as days_remaining,
    (da.hard_delete_at > NOW()) as can_reactivate
  FROM deleted_accounts da
  WHERE LOWER(da.email) = LOWER(p_email);

  -- If no rows returned, return false
  IF NOT FOUND THEN
    RETURN QUERY SELECT FALSE, NULL::TIMESTAMPTZ, 0, FALSE;
  END IF;
END;
$$;

-- Function to permanently delete accounts past 30 days (for scheduled cleanup)
CREATE OR REPLACE FUNCTION cleanup_deleted_accounts()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  -- Delete accounts past their hard_delete_at date
  WITH deleted AS (
    DELETE FROM deleted_accounts
    WHERE hard_delete_at <= NOW()
    RETURNING id
  )
  SELECT COUNT(*) INTO deleted_count FROM deleted;

  RETURN deleted_count;
END;
$$;

-- Grant execute permission to authenticated users for check function
GRANT EXECUTE ON FUNCTION check_deleted_account(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION check_deleted_account(TEXT) TO anon;

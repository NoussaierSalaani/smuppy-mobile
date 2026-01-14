-- =============================================
-- SMUPPY Server-Side Rate Limiting
-- =============================================
-- Run this in Supabase SQL Editor
-- =============================================

-- =============================================
-- 1. Create rate_limits table for tracking requests
-- =============================================
CREATE TABLE IF NOT EXISTS rate_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  request_count INTEGER DEFAULT 1,
  window_start TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Unique constraint for user + endpoint + time window
  CONSTRAINT unique_user_endpoint_window UNIQUE (user_id, endpoint, window_start)
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_rate_limits_user_endpoint ON rate_limits(user_id, endpoint);
CREATE INDEX IF NOT EXISTS idx_rate_limits_window ON rate_limits(window_start);

-- RLS Policy - only service role can access
ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;

-- No public access - only service role
CREATE POLICY "Service role only" ON rate_limits
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- =============================================
-- 2. Function to check and increment rate limit
-- =============================================
CREATE OR REPLACE FUNCTION check_rate_limit(
  p_user_id UUID,
  p_endpoint TEXT,
  p_max_requests INTEGER,
  p_window_minutes INTEGER DEFAULT 1
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_window_start TIMESTAMPTZ;
  v_current_count INTEGER;
  v_result JSONB;
BEGIN
  -- Calculate window start (truncate to minute)
  v_window_start := date_trunc('minute', NOW());

  -- Try to insert or update the rate limit record
  INSERT INTO rate_limits (user_id, endpoint, request_count, window_start, updated_at)
  VALUES (p_user_id, p_endpoint, 1, v_window_start, NOW())
  ON CONFLICT (user_id, endpoint, window_start)
  DO UPDATE SET
    request_count = rate_limits.request_count + 1,
    updated_at = NOW()
  RETURNING request_count INTO v_current_count;

  -- Check if limit exceeded
  IF v_current_count > p_max_requests THEN
    v_result := jsonb_build_object(
      'allowed', false,
      'current_count', v_current_count,
      'max_requests', p_max_requests,
      'retry_after', p_window_minutes * 60,
      'message', 'Rate limit exceeded'
    );
  ELSE
    v_result := jsonb_build_object(
      'allowed', true,
      'current_count', v_current_count,
      'max_requests', p_max_requests,
      'remaining', p_max_requests - v_current_count
    );
  END IF;

  RETURN v_result;
END;
$$;

-- =============================================
-- 3. Cleanup function for old rate limit records
-- =============================================
CREATE OR REPLACE FUNCTION cleanup_old_rate_limits()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Delete records older than 1 hour
  DELETE FROM rate_limits
  WHERE window_start < NOW() - INTERVAL '1 hour';
END;
$$;

-- =============================================
-- 4. Schedule cleanup (run every hour via pg_cron)
-- =============================================
-- To enable automatic cleanup, run this in SQL Editor after enabling pg_cron extension:
-- SELECT cron.schedule('cleanup-rate-limits', '0 * * * *', 'SELECT cleanup_old_rate_limits()');

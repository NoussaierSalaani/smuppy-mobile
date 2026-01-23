-- ============================================
-- SECURITY FIX: Enable RLS on all tables
-- Date: 2026-01-23
-- ============================================
-- This fixes Supabase security warnings about
-- tables without Row Level Security enabled.
-- ============================================

-- ============================================
-- 1. NOTIFICATION_LOGS - Enable RLS
-- ============================================

ALTER TABLE IF EXISTS notification_logs ENABLE ROW LEVEL SECURITY;

-- Users can only see their own notification logs
DROP POLICY IF EXISTS "Users can view own notification logs" ON notification_logs;
CREATE POLICY "Users can view own notification logs"
  ON notification_logs FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own notification logs
DROP POLICY IF EXISTS "Users can insert own notification logs" ON notification_logs;
CREATE POLICY "Users can insert own notification logs"
  ON notification_logs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- ============================================
-- 2. PUSH_TOKENS - Enable RLS (SENSITIVE!)
-- ============================================

ALTER TABLE IF EXISTS push_tokens ENABLE ROW LEVEL SECURITY;

-- Users can only see their own push tokens
DROP POLICY IF EXISTS "Users can view own push tokens" ON push_tokens;
CREATE POLICY "Users can view own push tokens"
  ON push_tokens FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own push tokens
DROP POLICY IF EXISTS "Users can insert own push tokens" ON push_tokens;
CREATE POLICY "Users can insert own push tokens"
  ON push_tokens FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own push tokens
DROP POLICY IF EXISTS "Users can update own push tokens" ON push_tokens;
CREATE POLICY "Users can update own push tokens"
  ON push_tokens FOR UPDATE
  USING (auth.uid() = user_id);

-- Users can delete their own push tokens
DROP POLICY IF EXISTS "Users can delete own push tokens" ON push_tokens;
CREATE POLICY "Users can delete own push tokens"
  ON push_tokens FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================
-- 3. DEVICE_SESSIONS - Verify RLS is enabled
-- ============================================

ALTER TABLE IF EXISTS device_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own device sessions" ON device_sessions;
CREATE POLICY "Users can view own device sessions"
  ON device_sessions FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can manage own device sessions" ON device_sessions;
CREATE POLICY "Users can manage own device sessions"
  ON device_sessions FOR ALL
  USING (auth.uid() = user_id);

-- ============================================
-- 4. DELETED_ACCOUNTS - Verify RLS is enabled
-- ============================================

ALTER TABLE IF EXISTS deleted_accounts ENABLE ROW LEVEL SECURITY;

-- Only service role can access deleted_accounts (for cleanup)
-- No user policies needed - this table is managed by Edge Functions

-- ============================================
-- 5. RATE_LIMITS - Verify RLS is enabled
-- ============================================

ALTER TABLE IF EXISTS rate_limits ENABLE ROW LEVEL SECURITY;

-- Rate limits are managed by Edge Functions only
-- No direct user access needed

-- ============================================
-- 6. USER_CONTACTS - Verify RLS is enabled
-- ============================================

ALTER TABLE IF EXISTS user_contacts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own contacts" ON user_contacts;
CREATE POLICY "Users can view own contacts"
  ON user_contacts FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can manage own contacts" ON user_contacts;
CREATE POLICY "Users can manage own contacts"
  ON user_contacts FOR ALL
  USING (auth.uid() = user_id);

-- ============================================
-- 7. SPOTS - Verify RLS is enabled
-- ============================================

ALTER TABLE IF EXISTS spots ENABLE ROW LEVEL SECURITY;

-- Public spots are viewable by everyone
DROP POLICY IF EXISTS "Public spots are viewable" ON spots;
CREATE POLICY "Public spots are viewable"
  ON spots FOR SELECT
  USING (is_public = true OR auth.uid() = created_by);

-- Users can create spots
DROP POLICY IF EXISTS "Users can create spots" ON spots;
CREATE POLICY "Users can create spots"
  ON spots FOR INSERT
  WITH CHECK (auth.uid() = created_by);

-- Users can update own spots
DROP POLICY IF EXISTS "Users can update own spots" ON spots;
CREATE POLICY "Users can update own spots"
  ON spots FOR UPDATE
  USING (auth.uid() = created_by);

-- ============================================
-- VERIFICATION
-- ============================================

SELECT
  schemaname,
  tablename,
  rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;

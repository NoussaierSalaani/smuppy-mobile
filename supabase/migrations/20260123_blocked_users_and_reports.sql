-- Migration: Blocked Users and Reports Tables
-- Date: 2026-01-23
-- Description: Add tables for persisting blocked users and content reports

-- ============================================
-- 1. BLOCKED USERS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS blocked_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  blocked_user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, blocked_user_id)
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_blocked_users_user_id ON blocked_users(user_id);
CREATE INDEX IF NOT EXISTS idx_blocked_users_blocked_user_id ON blocked_users(blocked_user_id);

-- RLS Policies for blocked_users
ALTER TABLE blocked_users ENABLE ROW LEVEL SECURITY;

-- Users can view their own blocked list
CREATE POLICY "Users can view own blocked users"
  ON blocked_users FOR SELECT
  USING (auth.uid() = user_id);

-- Users can block others
CREATE POLICY "Users can block others"
  ON blocked_users FOR INSERT
  WITH CHECK (auth.uid() = user_id AND auth.uid() != blocked_user_id);

-- Users can unblock
CREATE POLICY "Users can unblock"
  ON blocked_users FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================
-- 2. MUTED USERS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS muted_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  muted_user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, muted_user_id)
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_muted_users_user_id ON muted_users(user_id);

-- RLS Policies for muted_users
ALTER TABLE muted_users ENABLE ROW LEVEL SECURITY;

-- Users can view their own muted list
CREATE POLICY "Users can view own muted users"
  ON muted_users FOR SELECT
  USING (auth.uid() = user_id);

-- Users can mute others
CREATE POLICY "Users can mute others"
  ON muted_users FOR INSERT
  WITH CHECK (auth.uid() = user_id AND auth.uid() != muted_user_id);

-- Users can unmute
CREATE POLICY "Users can unmute"
  ON muted_users FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================
-- 3. REPORTS TABLE
-- ============================================
CREATE TYPE report_type AS ENUM ('post', 'user', 'comment', 'message');
CREATE TYPE report_status AS ENUM ('pending', 'under_review', 'resolved', 'dismissed');

CREATE TABLE IF NOT EXISTS reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  reported_content_id UUID, -- Can be post_id, comment_id, etc.
  reported_user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  report_type report_type NOT NULL,
  reason TEXT NOT NULL,
  details TEXT,
  status report_status DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES profiles(id),
  resolution_notes TEXT
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_reports_reporter_id ON reports(reporter_id);
CREATE INDEX IF NOT EXISTS idx_reports_reported_user_id ON reports(reported_user_id);
CREATE INDEX IF NOT EXISTS idx_reports_content_id ON reports(reported_content_id);
CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status);

-- Anti-spam: Unique constraint to prevent duplicate reports
CREATE UNIQUE INDEX IF NOT EXISTS idx_reports_unique_user_content
  ON reports(reporter_id, reported_content_id)
  WHERE reported_content_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_reports_unique_user_user
  ON reports(reporter_id, reported_user_id)
  WHERE reported_user_id IS NOT NULL AND reported_content_id IS NULL;

-- RLS Policies for reports
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;

-- Users can view their own reports
CREATE POLICY "Users can view own reports"
  ON reports FOR SELECT
  USING (auth.uid() = reporter_id);

-- Users can submit reports
CREATE POLICY "Users can submit reports"
  ON reports FOR INSERT
  WITH CHECK (auth.uid() = reporter_id);

-- Users cannot update or delete reports (admin only)

-- ============================================
-- 4. HELPER FUNCTIONS
-- ============================================

-- Function to check if user is blocked
CREATE OR REPLACE FUNCTION is_user_blocked(blocker_id UUID, target_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM blocked_users
    WHERE user_id = blocker_id AND blocked_user_id = target_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check if user is muted
CREATE OR REPLACE FUNCTION is_user_muted(muter_id UUID, target_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM muted_users
    WHERE user_id = muter_id AND muted_user_id = target_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get blocked user IDs for filtering feeds
CREATE OR REPLACE FUNCTION get_blocked_user_ids(for_user_id UUID)
RETURNS UUID[] AS $$
BEGIN
  RETURN ARRAY(
    SELECT blocked_user_id FROM blocked_users WHERE user_id = for_user_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get hidden user IDs (blocked + muted)
CREATE OR REPLACE FUNCTION get_hidden_user_ids(for_user_id UUID)
RETURNS UUID[] AS $$
BEGIN
  RETURN ARRAY(
    SELECT DISTINCT blocked_user_id FROM blocked_users WHERE user_id = for_user_id
    UNION
    SELECT DISTINCT muted_user_id FROM muted_users WHERE user_id = for_user_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 5. UPDATE TIMESTAMP TRIGGER
-- ============================================
CREATE OR REPLACE FUNCTION update_reports_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_reports_updated_at
  BEFORE UPDATE ON reports
  FOR EACH ROW
  EXECUTE FUNCTION update_reports_updated_at();

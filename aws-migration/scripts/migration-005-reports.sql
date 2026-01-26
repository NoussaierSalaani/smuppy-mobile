-- Migration 005: Content Moderation & Reports
-- Tables for reporting users, posts, and comments

-- =====================================================
-- USER REPORTS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS user_reports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    reporter_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    reported_user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    reason VARCHAR(100) NOT NULL,
    description TEXT,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed', 'resolved', 'dismissed')),
    reviewed_by UUID REFERENCES profiles(id),
    reviewed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for user reports
CREATE INDEX IF NOT EXISTS idx_user_reports_reporter ON user_reports(reporter_id);
CREATE INDEX IF NOT EXISTS idx_user_reports_reported ON user_reports(reported_user_id);
CREATE INDEX IF NOT EXISTS idx_user_reports_status ON user_reports(status);

-- =====================================================
-- POST REPORTS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS post_reports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    reporter_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    reason VARCHAR(100) NOT NULL,
    description TEXT,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed', 'resolved', 'dismissed')),
    reviewed_by UUID REFERENCES profiles(id),
    reviewed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for post reports
CREATE INDEX IF NOT EXISTS idx_post_reports_reporter ON post_reports(reporter_id);
CREATE INDEX IF NOT EXISTS idx_post_reports_post ON post_reports(post_id);
CREATE INDEX IF NOT EXISTS idx_post_reports_status ON post_reports(status);

-- =====================================================
-- COMMENT REPORTS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS comment_reports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    reporter_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    comment_id UUID NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
    reason VARCHAR(100) NOT NULL,
    description TEXT,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed', 'resolved', 'dismissed')),
    reviewed_by UUID REFERENCES profiles(id),
    reviewed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for comment reports
CREATE INDEX IF NOT EXISTS idx_comment_reports_reporter ON comment_reports(reporter_id);
CREATE INDEX IF NOT EXISTS idx_comment_reports_comment ON comment_reports(comment_id);
CREATE INDEX IF NOT EXISTS idx_comment_reports_status ON comment_reports(status);

-- =====================================================
-- MODERATION ACTIONS LOG
-- =====================================================
CREATE TABLE IF NOT EXISTS moderation_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    moderator_id UUID NOT NULL REFERENCES profiles(id),
    action_type VARCHAR(50) NOT NULL, -- 'warn', 'suspend', 'ban', 'delete_post', 'delete_comment'
    target_user_id UUID REFERENCES profiles(id),
    target_post_id UUID REFERENCES posts(id),
    target_comment_id UUID REFERENCES comments(id),
    reason TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for moderation log
CREATE INDEX IF NOT EXISTS idx_moderation_log_moderator ON moderation_log(moderator_id);
CREATE INDEX IF NOT EXISTS idx_moderation_log_target_user ON moderation_log(target_user_id);
CREATE INDEX IF NOT EXISTS idx_moderation_log_created ON moderation_log(created_at DESC);

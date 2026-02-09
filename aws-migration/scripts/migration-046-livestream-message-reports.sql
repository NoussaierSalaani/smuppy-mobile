-- Migration 046: Add live stream and message report tables
-- Phase 2C of content moderation plan

-- Live stream reports
CREATE TABLE IF NOT EXISTS live_stream_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reporter_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    live_stream_id UUID NOT NULL REFERENCES live_streams(id) ON DELETE CASCADE,
    reason VARCHAR(100) NOT NULL,
    description TEXT,
    status VARCHAR(20) DEFAULT 'pending'
      CHECK (status IN ('pending', 'reviewed', 'resolved', 'dismissed')),
    reviewed_by UUID REFERENCES profiles(id),
    reviewed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(reporter_id, live_stream_id)
);

CREATE INDEX IF NOT EXISTS idx_live_stream_reports_reporter ON live_stream_reports(reporter_id);
CREATE INDEX IF NOT EXISTS idx_live_stream_reports_stream ON live_stream_reports(live_stream_id);
CREATE INDEX IF NOT EXISTS idx_live_stream_reports_status ON live_stream_reports(status);

-- Message reports
CREATE TABLE IF NOT EXISTS message_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reporter_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    conversation_id UUID NOT NULL,
    reason VARCHAR(100) NOT NULL,
    description TEXT,
    status VARCHAR(20) DEFAULT 'pending'
      CHECK (status IN ('pending', 'reviewed', 'resolved', 'dismissed')),
    reviewed_by UUID REFERENCES profiles(id),
    reviewed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(reporter_id, message_id)
);

CREATE INDEX IF NOT EXISTS idx_message_reports_reporter ON message_reports(reporter_id);
CREATE INDEX IF NOT EXISTS idx_message_reports_message ON message_reports(message_id);
CREATE INDEX IF NOT EXISTS idx_message_reports_conversation ON message_reports(conversation_id);
CREATE INDEX IF NOT EXISTS idx_message_reports_status ON message_reports(status);

-- Rollback:
-- DROP TABLE IF EXISTS live_stream_reports;
-- DROP TABLE IF EXISTS message_reports;

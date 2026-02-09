-- ============================================
-- MIGRATION 036: Dispute & Resolution System
-- Date: 2025-02-08
-- Description: Tables for session disputes, verification, and resolution
-- ============================================

BEGIN;

-- ============================================
-- SESSION DISPUTES
-- ============================================
CREATE TABLE IF NOT EXISTS session_disputes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dispute_number VARCHAR(20) UNIQUE NOT NULL,
  
  -- Relations
  session_id UUID NOT NULL REFERENCES private_sessions(id) ON DELETE CASCADE,
  payment_id UUID REFERENCES payments(id) ON DELETE SET NULL,
  refund_id UUID REFERENCES refunds(id) ON DELETE SET NULL,
  
  -- Parties
  complainant_id UUID NOT NULL REFERENCES profiles(id),
  respondent_id UUID NOT NULL REFERENCES profiles(id),
  
  -- Dispute details
  type VARCHAR(50) NOT NULL CHECK (type IN ('no_show', 'incomplete', 'quality', 'technical', 'other')),
  status VARCHAR(50) DEFAULT 'open' CHECK (status IN ('open', 'under_review', 'evidence_requested', 'resolved', 'appealed', 'closed')),
  priority VARCHAR(20) DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  
  -- Descriptions
  complainant_description TEXT NOT NULL,
  respondent_response TEXT,
  admin_notes TEXT,
  
  -- Financial
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  refund_amount_cents INTEGER CHECK (refund_amount_cents IS NULL OR refund_amount_cents >= 0),
  currency VARCHAR(3) DEFAULT 'eur',
  
  -- Resolution
  resolution VARCHAR(50) CHECK (resolution IN ('full_refund', 'partial_refund', 'no_refund', 'rescheduled')),
  resolution_reason TEXT,
  resolved_by UUID REFERENCES profiles(id),
  resolved_at TIMESTAMPTZ,
  
  -- Auto-verification (populated automatically)
  auto_verification JSONB DEFAULT '{}',
  
  -- Timestamps
  evidence_deadline TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for disputes
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_disputes_complainant 
  ON session_disputes(complainant_id, status);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_disputes_respondent 
  ON session_disputes(respondent_id, status);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_disputes_session 
  ON session_disputes(session_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_disputes_status_created 
  ON session_disputes(status, created_at DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_disputes_number 
  ON session_disputes(dispute_number);

-- Trigger for auto-generating dispute number
CREATE OR REPLACE FUNCTION generate_dispute_number()
RETURNS TRIGGER AS $$
BEGIN
  NEW.dispute_number := 'DIS-' || TO_CHAR(NOW(), 'YYYY') || '-' || LPAD(NEXTVAL('dispute_number_seq')::TEXT, 5, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create sequence for dispute numbers
DO $$
BEGIN
  CREATE SEQUENCE IF NOT EXISTS dispute_number_seq START 1;
EXCEPTION
  WHEN duplicate_table THEN
    NULL;
END $$;

DROP TRIGGER IF EXISTS set_dispute_number ON session_disputes;
CREATE TRIGGER set_dispute_number
  BEFORE INSERT ON session_disputes
  FOR EACH ROW
  EXECUTE FUNCTION generate_dispute_number();

-- ============================================
-- DISPUTE EVIDENCE
-- ============================================
CREATE TABLE IF NOT EXISTS dispute_evidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dispute_id UUID NOT NULL REFERENCES session_disputes(id) ON DELETE CASCADE,

  type VARCHAR(50) NOT NULL CHECK (type IN ('screenshot', 'recording', 'document', 'text')),
  url TEXT,
  filename VARCHAR(255),
  description TEXT,
  text_content TEXT,

  uploaded_by UUID NOT NULL REFERENCES profiles(id),
  uploaded_at TIMESTAMPTZ DEFAULT NOW(),

  -- For admin review
  reviewed_by UUID REFERENCES profiles(id),
  reviewed_at TIMESTAMPTZ,
  review_notes TEXT
);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_evidence_dispute ON dispute_evidence(dispute_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_evidence_uploader ON dispute_evidence(uploaded_by);

-- ============================================
-- SESSION ATTENDANCE (Agora + App tracking)
-- ============================================
CREATE TABLE IF NOT EXISTS session_attendance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES private_sessions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  
  -- Timing
  joined_at TIMESTAMPTZ,
  left_at TIMESTAMPTZ,
  duration_seconds INTEGER CHECK (duration_seconds IS NULL OR duration_seconds >= 0),
  
  -- Connection quality (Agora data)
  agora_uid VARCHAR(50),
  network_quality_avg INTEGER CHECK (network_quality_avg IS NULL OR (network_quality_avg >= 0 AND network_quality_avg <= 6)),
  reconnect_count INTEGER DEFAULT 0 CHECK (reconnect_count >= 0),
  
  -- Device/App info
  device_type VARCHAR(50), -- 'ios', 'android', 'web'
  app_version VARCHAR(50),
  
  -- Events log (JSON array of events)
  events JSONB DEFAULT '[]',
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(session_id, user_id)
);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_attendance_session ON session_attendance(session_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_attendance_user ON session_attendance(user_id, joined_at DESC);

-- ============================================
-- SESSION VERIFICATION LOGS
-- ============================================
CREATE TABLE IF NOT EXISTS session_verification_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES private_sessions(id) ON DELETE CASCADE,
  
  event_type VARCHAR(50) NOT NULL CHECK (event_type IN (
    'session_created', 'session_started', 'session_ended', 'session_cancelled',
    'user_joined', 'user_left', 'user_reconnected',
    'creator_joined', 'creator_left', 'creator_reconnected',
    'network_quality_changed', 'recording_started', 'recording_ended',
    'dispute_opened', 'dispute_resolved'
  )),
  recorded_at TIMESTAMPTZ DEFAULT NOW(),

  metadata JSONB DEFAULT '{}',

  source VARCHAR(50) DEFAULT 'app' CHECK (source IN ('app', 'agora_webhook', 'stripe_webhook', 'admin'))
);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_verification_logs_session
  ON session_verification_logs(session_id, recorded_at DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_verification_logs_event
  ON session_verification_logs(event_type, recorded_at);

-- ============================================
-- DISPUTE TIMELINE
-- ============================================
CREATE TABLE IF NOT EXISTS dispute_timeline (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dispute_id UUID NOT NULL REFERENCES session_disputes(id) ON DELETE CASCADE,

  event_type VARCHAR(50) NOT NULL CHECK (event_type IN (
    'dispute_opened', 'evidence_submitted', 'status_changed',
    'under_review', 'resolved', 'accepted', 'appealed', 'closed',
    'refund_initiated', 'refund_completed', 'refund_failed',
    'admin_note'
  )),
  event_data JSONB DEFAULT '{}',
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_timeline_dispute
  ON dispute_timeline(dispute_id, created_at ASC);

-- ============================================
-- DISPUTE NOTIFICATIONS
-- ============================================
CREATE TABLE IF NOT EXISTS dispute_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dispute_id UUID NOT NULL REFERENCES session_disputes(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  
  notification_type VARCHAR(50) NOT NULL CHECK (notification_type IN (
    'dispute_opened', 'evidence_requested', 'evidence_submitted', 
    'under_review', 'resolved', 'appealed', 'closed'
  )),
  title VARCHAR(255) NOT NULL,
  body TEXT NOT NULL,
  
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_dispute_notifs_user 
  ON dispute_notifications(user_id, read_at NULLS FIRST);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_dispute_notifs_dispute 
  ON dispute_notifications(dispute_id);

-- ============================================
-- UPDATE TRIGGER for disputes
-- ============================================
CREATE OR REPLACE FUNCTION update_dispute_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_dispute_timestamp ON session_disputes;
CREATE TRIGGER update_dispute_timestamp
  BEFORE UPDATE ON session_disputes
  FOR EACH ROW
  EXECUTE FUNCTION update_dispute_timestamp();

-- ============================================
-- VIEWS FOR REPORTING
-- ============================================

-- Dispute summary view
CREATE OR REPLACE VIEW dispute_summary AS
SELECT 
  d.id,
  d.dispute_number,
  d.status,
  d.type,
  d.resolution,
  d.amount_cents,
  d.refund_amount_cents,
  d.created_at,
  d.resolved_at,
  EXTRACT(EPOCH FROM (d.resolved_at - d.created_at))/3600 as resolution_hours,
  c.username as complainant_username,
  r.username as respondent_username,
  ps.scheduled_at as session_scheduled_at,
  ps.duration_minutes as session_duration
FROM session_disputes d
JOIN profiles c ON d.complainant_id = c.id
JOIN profiles r ON d.respondent_id = r.id
LEFT JOIN private_sessions ps ON d.session_id = ps.id;

-- Creator dispute stats view
CREATE OR REPLACE VIEW creator_dispute_stats AS
SELECT 
  respondent_id as creator_id,
  COUNT(*) as total_disputes,
  COUNT(*) FILTER (WHERE status = 'open') as open_disputes,
  COUNT(*) FILTER (WHERE resolution = 'full_refund') as full_refunds,
  COUNT(*) FILTER (WHERE resolution = 'partial_refund') as partial_refunds,
  SUM(refund_amount_cents) as total_refunded_cents,
  AVG(EXTRACT(EPOCH FROM (resolved_at - created_at))/3600) FILTER (WHERE resolved_at IS NOT NULL) as avg_resolution_hours
FROM session_disputes
WHERE created_at > NOW() - INTERVAL '90 days'
GROUP BY respondent_id;

COMMIT;

-- Rollback commands (for reference):
-- DROP TABLE IF EXISTS dispute_notifications CASCADE;
-- DROP TABLE IF EXISTS session_verification_logs CASCADE;
-- DROP TABLE IF EXISTS session_attendance CASCADE;
-- DROP TABLE IF EXISTS dispute_evidence CASCADE;
-- DROP TABLE IF EXISTS session_disputes CASCADE;
-- DROP SEQUENCE IF EXISTS dispute_number_seq CASCADE;
-- DROP VIEW IF EXISTS dispute_summary CASCADE;
-- DROP VIEW IF EXISTS creator_dispute_stats CASCADE;

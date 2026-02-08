-- Migration 044: Peak Reports Table
-- Separate report table for peaks (peaks are in their own table, not posts)
-- Rollback: DROP TABLE IF EXISTS peak_reports;

CREATE TABLE IF NOT EXISTS peak_reports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    reporter_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    peak_id UUID NOT NULL REFERENCES peaks(id) ON DELETE CASCADE,
    reason VARCHAR(100) NOT NULL,
    description TEXT,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed', 'resolved', 'dismissed')),
    reviewed_by UUID REFERENCES profiles(id),
    reviewed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for peak reports
CREATE INDEX IF NOT EXISTS idx_peak_reports_reporter ON peak_reports(reporter_id);
CREATE INDEX IF NOT EXISTS idx_peak_reports_peak ON peak_reports(peak_id);
CREATE INDEX IF NOT EXISTS idx_peak_reports_status ON peak_reports(status);

-- Unique constraint: one report per user per peak
CREATE UNIQUE INDEX IF NOT EXISTS idx_peak_reports_unique ON peak_reports(reporter_id, peak_id);

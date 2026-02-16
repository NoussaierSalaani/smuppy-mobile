-- ============================================================================
-- Migration 061: Video Pipeline
-- Adds video processing status, HLS URLs, and video variants to posts & peaks
-- ============================================================================
-- Idempotent: all statements use IF NOT EXISTS / IF EXISTS guards
-- Reversible: rollback block at bottom
-- ============================================================================

-- ── Posts: video processing columns ─────────────────────────────────────────
ALTER TABLE posts ADD COLUMN IF NOT EXISTS video_status VARCHAR(20) DEFAULT NULL;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS hls_url TEXT DEFAULT NULL;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS thumbnail_url TEXT DEFAULT NULL;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS video_variants JSONB DEFAULT NULL;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS video_duration INTEGER DEFAULT NULL;

-- Constraint: video_status must be one of the pipeline states
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_posts_video_status'
  ) THEN
    ALTER TABLE posts ADD CONSTRAINT chk_posts_video_status
      CHECK (video_status IS NULL OR video_status IN ('uploaded', 'processing', 'ready', 'failed'));
  END IF;
END $$;

-- ── Peaks: video processing columns ────────────────────────────────────────
-- peaks.thumbnail_url and peaks.duration already exist from migration-006
ALTER TABLE peaks ADD COLUMN IF NOT EXISTS video_status VARCHAR(20) DEFAULT NULL;
ALTER TABLE peaks ADD COLUMN IF NOT EXISTS hls_url TEXT DEFAULT NULL;
ALTER TABLE peaks ADD COLUMN IF NOT EXISTS video_variants JSONB DEFAULT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_peaks_video_status'
  ) THEN
    ALTER TABLE peaks ADD CONSTRAINT chk_peaks_video_status
      CHECK (video_status IS NULL OR video_status IN ('uploaded', 'processing', 'ready', 'failed'));
  END IF;
END $$;

-- ── Video Processing Jobs table ────────────────────────────────────────────
-- Tracks MediaConvert jobs for status callbacks
CREATE TABLE IF NOT EXISTS video_processing_jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  media_convert_job_id VARCHAR(100) UNIQUE NOT NULL,
  source_key TEXT NOT NULL,
  output_prefix TEXT NOT NULL,
  entity_type VARCHAR(10) NOT NULL CHECK (entity_type IN ('post', 'peak')),
  entity_id UUID NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'submitted'
    CHECK (status IN ('submitted', 'processing', 'complete', 'error', 'canceled')),
  error_message TEXT,
  input_file_size BIGINT,
  output_variants JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for MediaConvert job ID lookups (used by completion callback)
CREATE INDEX IF NOT EXISTS idx_video_jobs_mc_job_id
  ON video_processing_jobs (media_convert_job_id);

-- Index for entity lookups (find job by post/peak)
CREATE INDEX IF NOT EXISTS idx_video_jobs_entity
  ON video_processing_jobs (entity_type, entity_id);

-- Index for finding stale jobs (cleanup)
CREATE INDEX IF NOT EXISTS idx_video_jobs_status_created
  ON video_processing_jobs (status, created_at)
  WHERE status IN ('submitted', 'processing');

-- ── Performance indexes for video queries ──────────────────────────────────
-- Posts with video content that need processing
CREATE INDEX IF NOT EXISTS idx_posts_video_status
  ON posts (video_status)
  WHERE video_status IS NOT NULL;

-- Peaks with video content that need processing
CREATE INDEX IF NOT EXISTS idx_peaks_video_status
  ON peaks (video_status)
  WHERE video_status IS NOT NULL;

-- ============================================================================
-- ROLLBACK (run manually if needed):
-- ============================================================================
-- ALTER TABLE posts DROP CONSTRAINT IF EXISTS chk_posts_video_status;
-- ALTER TABLE posts DROP COLUMN IF EXISTS video_status;
-- ALTER TABLE posts DROP COLUMN IF EXISTS hls_url;
-- ALTER TABLE posts DROP COLUMN IF EXISTS thumbnail_url;
-- ALTER TABLE posts DROP COLUMN IF EXISTS video_variants;
-- ALTER TABLE posts DROP COLUMN IF EXISTS video_duration;
-- ALTER TABLE peaks DROP CONSTRAINT IF EXISTS chk_peaks_video_status;
-- ALTER TABLE peaks DROP COLUMN IF EXISTS video_status;
-- ALTER TABLE peaks DROP COLUMN IF EXISTS hls_url;
-- ALTER TABLE peaks DROP COLUMN IF EXISTS video_variants;
-- DROP TABLE IF EXISTS video_processing_jobs;
-- ============================================================================

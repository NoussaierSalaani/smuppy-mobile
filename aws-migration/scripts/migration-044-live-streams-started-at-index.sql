-- =====================================================
-- Migration 044: Add missing started_at index on live_streams
-- Problem: active.ts orders by started_at DESC but no index exists
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_live_streams_started_at ON live_streams(started_at DESC);

-- =====================================================
-- ROLLBACK:
-- DROP INDEX IF EXISTS idx_live_streams_started_at;
-- =====================================================

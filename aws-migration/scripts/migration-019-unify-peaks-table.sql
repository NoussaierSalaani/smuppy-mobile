-- =====================================================
-- MIGRATION 019: Unify Peaks Data Model
-- =====================================================
-- Problem: peaks/create.ts + comment.ts use the `peaks` table,
-- but react.ts, tag.ts, hide.ts, replies.ts use `posts WHERE is_peak = true`.
-- peak_reactions, peak_tags, peak_hidden FK → posts(id) but should → peaks(id).
--
-- This migration:
-- 1. Adds missing columns to `peaks` table (for replies, visibility, reactions)
-- 2. Migrates existing peak data from `posts` to `peaks` (if any)
-- 3. Changes FK on peak_reactions, peak_tags, peak_hidden from posts(id) to peaks(id)
-- =====================================================

-- Step 1: Add missing columns to peaks table
ALTER TABLE peaks ADD COLUMN IF NOT EXISTS visibility VARCHAR(20) DEFAULT 'public';
ALTER TABLE peaks ADD COLUMN IF NOT EXISTS media_type VARCHAR(20) DEFAULT 'video';
ALTER TABLE peaks ADD COLUMN IF NOT EXISTS reply_to_peak_id UUID REFERENCES peaks(id) ON DELETE SET NULL;
ALTER TABLE peaks ADD COLUMN IF NOT EXISTS allow_peak_responses BOOLEAN DEFAULT true;
ALTER TABLE peaks ADD COLUMN IF NOT EXISTS peak_replies_count INTEGER DEFAULT 0;

-- Step 2: Migrate any existing peaks from posts table into peaks table
-- Only migrate rows that don't already exist in peaks (by id)
INSERT INTO peaks (id, author_id, video_url, thumbnail_url, caption, duration,
                   likes_count, comments_count, views_count, visibility,
                   reply_to_peak_id, allow_peak_responses, created_at, updated_at)
SELECT p.id, p.author_id, COALESCE(p.media_url, (p.media_urls::text[])[1], ''),
       COALESCE((p.media_urls::text[])[2], p.media_url),
       COALESCE(p.caption, p.content), p.peak_duration,
       p.likes_count, p.comments_count, p.views_count, COALESCE(p.visibility, 'public'),
       p.reply_to_peak_id, COALESCE(p.allow_peak_responses, true),
       p.created_at, COALESCE(p.updated_at, p.created_at)
FROM posts p
WHERE p.is_peak = true
  AND NOT EXISTS (SELECT 1 FROM peaks pk WHERE pk.id = p.id)
ON CONFLICT (id) DO NOTHING;

-- Step 3: Drop old FK constraints on peak_reactions, peak_tags, peak_hidden
-- and recreate pointing to peaks(id)

-- peak_reactions: drop FK to posts, add FK to peaks
ALTER TABLE peak_reactions DROP CONSTRAINT IF EXISTS peak_reactions_peak_id_fkey;
ALTER TABLE peak_reactions ADD CONSTRAINT peak_reactions_peak_id_fkey
    FOREIGN KEY (peak_id) REFERENCES peaks(id) ON DELETE CASCADE;

-- peak_tags: drop FK to posts, add FK to peaks
ALTER TABLE peak_tags DROP CONSTRAINT IF EXISTS peak_tags_peak_id_fkey;
ALTER TABLE peak_tags ADD CONSTRAINT peak_tags_peak_id_fkey
    FOREIGN KEY (peak_id) REFERENCES peaks(id) ON DELETE CASCADE;

-- peak_hidden: drop FK to posts, add FK to peaks
ALTER TABLE peak_hidden DROP CONSTRAINT IF EXISTS peak_hidden_peak_id_fkey;
ALTER TABLE peak_hidden ADD CONSTRAINT peak_hidden_peak_id_fkey
    FOREIGN KEY (peak_id) REFERENCES peaks(id) ON DELETE CASCADE;

-- Step 4: Add indexes for new columns
CREATE INDEX IF NOT EXISTS idx_peaks_reply_to ON peaks(reply_to_peak_id) WHERE reply_to_peak_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_peaks_visibility ON peaks(visibility);

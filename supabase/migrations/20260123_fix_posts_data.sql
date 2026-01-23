-- ===========================================
-- FIX POSTS DATA
-- Migrate legacy media_url/caption to media_urls/content
-- Date: 2026-01-23
-- ===========================================

-- First, add the legacy columns if they don't exist (for backward compatibility)
ALTER TABLE posts ADD COLUMN IF NOT EXISTS media_url TEXT;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS caption TEXT;

-- Migrate media_url to media_urls where media_urls is empty
UPDATE posts
SET media_urls = ARRAY[media_url]
WHERE media_url IS NOT NULL
  AND media_url != ''
  AND (media_urls IS NULL OR media_urls = '{}' OR array_length(media_urls, 1) IS NULL);

-- Copy caption to content where content is empty
UPDATE posts
SET content = caption
WHERE caption IS NOT NULL
  AND caption != ''
  AND (content IS NULL OR content = '');

-- Verify the migration
SELECT
  COUNT(*) as total_posts,
  COUNT(CASE WHEN media_urls IS NOT NULL AND array_length(media_urls, 1) > 0 THEN 1 END) as posts_with_media_urls,
  COUNT(CASE WHEN media_url IS NOT NULL AND media_url != '' THEN 1 END) as posts_with_media_url,
  COUNT(CASE WHEN content IS NOT NULL AND content != '' THEN 1 END) as posts_with_content,
  COUNT(CASE WHEN caption IS NOT NULL AND caption != '' THEN 1 END) as posts_with_caption
FROM posts;

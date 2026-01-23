-- ===========================================
-- ADD VIEWS COUNT TO POSTS
-- Track view counts for posts and peaks
-- ===========================================

-- Add views_count column to posts table
ALTER TABLE posts ADD COLUMN IF NOT EXISTS views_count INTEGER DEFAULT 0;

-- Create index for sorting by views
CREATE INDEX IF NOT EXISTS idx_posts_views_count ON posts(views_count DESC);

-- Initialize with random views for existing posts (for demo purposes)
UPDATE posts
SET views_count = FLOOR(RANDOM() * 500 + likes_count * 2)
WHERE views_count = 0 OR views_count IS NULL;

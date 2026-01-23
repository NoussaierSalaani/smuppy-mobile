-- ===========================================
-- POSTS TABLE IMPROVEMENTS
-- Add support for multiple media, tags, and better naming
-- ===========================================

-- Add media_urls column for multiple images/videos support
ALTER TABLE posts ADD COLUMN IF NOT EXISTS media_urls text[] DEFAULT ARRAY[]::text[];

-- Add content column as alias for caption (for consistency)
ALTER TABLE posts ADD COLUMN IF NOT EXISTS content text;

-- Add tags column for interest-based filtering
ALTER TABLE posts ADD COLUMN IF NOT EXISTS tags text[] DEFAULT ARRAY[]::text[];

-- Migrate existing data
UPDATE posts
SET media_urls = ARRAY[media_url]
WHERE media_url IS NOT NULL AND (media_urls IS NULL OR array_length(media_urls, 1) IS NULL);

-- Copy caption to content where content is null
UPDATE posts
SET content = caption
WHERE caption IS NOT NULL AND content IS NULL;

-- Create index on tags for faster filtering
CREATE INDEX IF NOT EXISTS idx_posts_tags ON posts USING gin(tags);

-- Create index on author_id for faster user post lookups
CREATE INDEX IF NOT EXISTS idx_posts_author_id ON posts(author_id);

-- Create index on visibility for feed queries
CREATE INDEX IF NOT EXISTS idx_posts_visibility ON posts(visibility);

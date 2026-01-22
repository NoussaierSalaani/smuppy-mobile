-- ===========================================
-- SEED DATA: 20 Posts for Testing
-- Run this in Supabase SQL Editor
-- ===========================================

-- Get user IDs (replace with actual UUIDs from your profiles table)
-- User 1: d147cffd-e8e5-40a4-b680-c44261cd363a (noussaiersalaani)
-- User 2: 2c127b24-c7d8-4d5f-9da8-f2a8de9373b1 (noussaiersalaani_1619)

-- Post 1
INSERT INTO posts (author_id, content, media_urls, media_type, visibility, likes_count, comments_count)
VALUES (
  'd147cffd-e8e5-40a4-b680-c44261cd363a',
  'Morning workout done! 💪 Nothing beats starting the day with a good sweat session',
  ARRAY['https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=800'],
  'image',
  'public',
  127,
  12
);

-- Post 2
INSERT INTO posts (author_id, content, media_urls, media_type, visibility, likes_count, comments_count)
VALUES (
  '2c127b24-c7d8-4d5f-9da8-f2a8de9373b1',
  'New personal record today! Hard work pays off 🔥',
  ARRAY['https://images.unsplash.com/photo-1517836357463-d25dfeac3438?w=800'],
  'image',
  'public',
  234,
  28
);

-- Post 3
INSERT INTO posts (author_id, content, media_urls, media_type, visibility, likes_count, comments_count)
VALUES (
  'd147cffd-e8e5-40a4-b680-c44261cd363a',
  'Gym vibes only 🏋️ Who else is grinding today?',
  ARRAY['https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?w=800'],
  'image',
  'public',
  89,
  7
);

-- Post 4
INSERT INTO posts (author_id, content, media_urls, media_type, visibility, likes_count, comments_count)
VALUES (
  '2c127b24-c7d8-4d5f-9da8-f2a8de9373b1',
  'Consistency is key! Day 30 of my fitness journey',
  ARRAY['https://images.unsplash.com/photo-1549060279-7e168fcee0c2?w=800'],
  'image',
  'public',
  456,
  45
);

-- Post 5
INSERT INTO posts (author_id, content, media_urls, media_type, visibility, likes_count, comments_count)
VALUES (
  'd147cffd-e8e5-40a4-b680-c44261cd363a',
  'Post-workout selfie because I earned it 😤',
  ARRAY['https://images.unsplash.com/photo-1583454110551-21f2fa2afe61?w=800'],
  'image',
  'public',
  312,
  19
);

-- Post 6
INSERT INTO posts (author_id, content, media_urls, media_type, visibility, likes_count, comments_count)
VALUES (
  '2c127b24-c7d8-4d5f-9da8-f2a8de9373b1',
  'No excuses, just results. Lets go! 🚀',
  ARRAY['https://images.unsplash.com/photo-1581009146145-b5ef050c149a?w=800'],
  'image',
  'public',
  198,
  14
);

-- Post 7
INSERT INTO posts (author_id, content, media_urls, media_type, visibility, likes_count, comments_count)
VALUES (
  'd147cffd-e8e5-40a4-b680-c44261cd363a',
  'Early bird gets the gains 🌅 5am club!',
  ARRAY['https://images.unsplash.com/photo-1518611012118-696072aa579a?w=800'],
  'image',
  'public',
  267,
  22
);

-- Post 8
INSERT INTO posts (author_id, content, media_urls, media_type, visibility, likes_count, comments_count)
VALUES (
  '2c127b24-c7d8-4d5f-9da8-f2a8de9373b1',
  'Rest day is important too. Recovery mode activated 🧘',
  ARRAY['https://images.unsplash.com/photo-1540497077202-7c8a3999166f?w=800'],
  'image',
  'public',
  145,
  8
);

-- Post 9
INSERT INTO posts (author_id, content, media_urls, media_type, visibility, likes_count, comments_count)
VALUES (
  'd147cffd-e8e5-40a4-b680-c44261cd363a',
  'Partner workout with my bestie! Double the motivation 👯',
  ARRAY['https://images.unsplash.com/photo-1526506118085-60ce8714f8c5?w=800'],
  'image',
  'public',
  389,
  31
);

-- Post 10
INSERT INTO posts (author_id, content, media_urls, media_type, visibility, likes_count, comments_count)
VALUES (
  '2c127b24-c7d8-4d5f-9da8-f2a8de9373b1',
  'Leg day complete. Walking funny tomorrow for sure 😅',
  ARRAY['https://images.unsplash.com/photo-1594737625785-a6cbdabd333c?w=800'],
  'image',
  'public',
  178,
  15
);

-- Post 11
INSERT INTO posts (author_id, content, media_urls, media_type, visibility, likes_count, comments_count)
VALUES (
  'd147cffd-e8e5-40a4-b680-c44261cd363a',
  'Sunday meal prep done! Fueling for the week ahead 🥗',
  ARRAY['https://images.unsplash.com/photo-1490645935967-10de6ba17061?w=800'],
  'image',
  'public',
  423,
  37
);

-- Post 12
INSERT INTO posts (author_id, content, media_urls, media_type, visibility, likes_count, comments_count)
VALUES (
  '2c127b24-c7d8-4d5f-9da8-f2a8de9373b1',
  'Outdoor training hits different 🌳 Nature is the best gym',
  ARRAY['https://images.unsplash.com/photo-1552674605-db6ffd4facb5?w=800'],
  'image',
  'public',
  567,
  42
);

-- Post 13
INSERT INTO posts (author_id, content, media_urls, media_type, visibility, likes_count, comments_count)
VALUES (
  'd147cffd-e8e5-40a4-b680-c44261cd363a',
  'Form check! Making sure every rep counts 📐',
  ARRAY['https://images.unsplash.com/photo-1581009137042-c552e485697a?w=800'],
  'image',
  'public',
  234,
  18
);

-- Post 14
INSERT INTO posts (author_id, content, media_urls, media_type, visibility, likes_count, comments_count)
VALUES (
  '2c127b24-c7d8-4d5f-9da8-f2a8de9373b1',
  'New shoes, new motivation! Ready to crush it 👟',
  ARRAY['https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=800'],
  'image',
  'public',
  345,
  26
);

-- Post 15
INSERT INTO posts (author_id, content, media_urls, media_type, visibility, likes_count, comments_count)
VALUES (
  'd147cffd-e8e5-40a4-b680-c44261cd363a',
  'Progress pic! 3 months of dedication 📸',
  ARRAY['https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=800'],
  'image',
  'public',
  678,
  56
);

-- Post 16
INSERT INTO posts (author_id, content, media_urls, media_type, visibility, likes_count, comments_count)
VALUES (
  '2c127b24-c7d8-4d5f-9da8-f2a8de9373b1',
  'Stretching is underrated! Flexibility goals 🤸',
  ARRAY['https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=800'],
  'image',
  'public',
  189,
  11
);

-- Post 17
INSERT INTO posts (author_id, content, media_urls, media_type, visibility, likes_count, comments_count)
VALUES (
  'd147cffd-e8e5-40a4-b680-c44261cd363a',
  'Beach workout! Sand makes everything harder 🏖️',
  ARRAY['https://images.unsplash.com/photo-1476480862126-209bfaa8edc8?w=800'],
  'image',
  'public',
  512,
  39
);

-- Post 18
INSERT INTO posts (author_id, content, media_urls, media_type, visibility, likes_count, comments_count)
VALUES (
  '2c127b24-c7d8-4d5f-9da8-f2a8de9373b1',
  'Hydration check! Dont forget to drink water 💧',
  ARRAY['https://images.unsplash.com/photo-1559839734-2b71ea197ec2?w=800'],
  'image',
  'public',
  156,
  9
);

-- Post 19
INSERT INTO posts (author_id, content, media_urls, media_type, visibility, likes_count, comments_count)
VALUES (
  'd147cffd-e8e5-40a4-b680-c44261cd363a',
  'Group class energy is unmatched! 🔥',
  ARRAY['https://images.unsplash.com/photo-1518310383802-640c2de311b2?w=800'],
  'image',
  'public',
  445,
  33
);

-- Post 20
INSERT INTO posts (author_id, content, media_urls, media_type, visibility, likes_count, comments_count)
VALUES (
  '2c127b24-c7d8-4d5f-9da8-f2a8de9373b1',
  'Weekend warrior mode activated! 💪',
  ARRAY['https://images.unsplash.com/photo-1534367899885-b3d727b7b86c?w=800'],
  'image',
  'public',
  298,
  21
);

-- Verify the posts were created
SELECT COUNT(*) as total_posts FROM posts;

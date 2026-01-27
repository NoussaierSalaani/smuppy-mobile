/**
 * Post Transformers Tests
 */

import {
  getTimeAgo,
  normalizeMediaType,
  getMediaUrl,
  getContentText,
  transformToFanPost,
  transformToVibePost,
  transformPostsBatch,
} from '../../utils/postTransformers';
import { Post } from '../../services/database';

// Helper to create a mock Date class
const createMockDate = (nowTimestamp: number) => {
  const RealDate = Date;
  return function MockDate(this: Date, ...args: unknown[]) {
    if (args.length === 0) {
      return new RealDate(nowTimestamp);
    }
    // @ts-expect-error - Date constructor accepts various argument types
    return new RealDate(...args);
  } as unknown as DateConstructor;
};

describe('Time Utilities', () => {
  const RealDate = Date;

  afterEach(() => {
    global.Date = RealDate;
  });

  describe('getTimeAgo', () => {
    const NOW = new RealDate('2024-01-15T12:00:00Z').getTime();

    beforeEach(() => {
      global.Date = createMockDate(NOW);
      global.Date.now = () => NOW;
      global.Date.parse = RealDate.parse;
      global.Date.UTC = RealDate.UTC;
    });

    it('should return "now" for very recent dates', () => {
      const result = getTimeAgo(new RealDate(NOW - 30000).toISOString()); // 30 seconds ago
      expect(result).toBe('now');
    });

    it('should return minutes for dates under an hour', () => {
      const result = getTimeAgo(new RealDate(NOW - 30 * 60000).toISOString()); // 30 minutes ago
      expect(result).toBe('30m ago');
    });

    it('should return hours for dates under a day', () => {
      const result = getTimeAgo(new RealDate(NOW - 5 * 3600000).toISOString()); // 5 hours ago
      expect(result).toBe('5h ago');
    });

    it('should return days for dates under a week', () => {
      const result = getTimeAgo(new RealDate(NOW - 3 * 86400000).toISOString()); // 3 days ago
      expect(result).toBe('3d ago');
    });

    it('should return weeks for dates under 4 weeks', () => {
      const result = getTimeAgo(new RealDate(NOW - 14 * 86400000).toISOString()); // 2 weeks ago
      expect(result).toBe('2w ago');
    });
  });
});

describe('Media Utilities', () => {
  describe('normalizeMediaType', () => {
    it('should return "video" for video type', () => {
      expect(normalizeMediaType('video')).toBe('video');
    });

    it('should return "carousel" for multiple type', () => {
      expect(normalizeMediaType('multiple')).toBe('carousel');
    });

    it('should return "carousel" for carousel type', () => {
      expect(normalizeMediaType('carousel')).toBe('carousel');
    });

    it('should return "image" for photo type', () => {
      expect(normalizeMediaType('photo')).toBe('image');
    });

    it('should return "image" for image type', () => {
      expect(normalizeMediaType('image')).toBe('image');
    });

    it('should return "image" for undefined', () => {
      expect(normalizeMediaType(undefined)).toBe('image');
    });

    it('should return "image" for unknown types', () => {
      expect(normalizeMediaType('unknown')).toBe('image');
    });
  });

  describe('getMediaUrl', () => {
    const basePost: Post = {
      id: 'test-id',
      author_id: 'author-id',
      visibility: 'public',
      created_at: '2024-01-15T10:00:00Z',
    };

    it('should return first url from media_urls array', () => {
      const post: Post = {
        ...basePost,
        media_urls: ['https://example.com/1.jpg', 'https://example.com/2.jpg'],
      };
      expect(getMediaUrl(post)).toBe('https://example.com/1.jpg');
    });

    it('should return media_url if media_urls is empty', () => {
      const post: Post = {
        ...basePost,
        media_urls: [],
        media_url: 'https://example.com/single.jpg',
      };
      expect(getMediaUrl(post)).toBe('https://example.com/single.jpg');
    });

    it('should return media_url if media_urls is undefined', () => {
      const post: Post = {
        ...basePost,
        media_url: 'https://example.com/single.jpg',
      };
      expect(getMediaUrl(post)).toBe('https://example.com/single.jpg');
    });

    it('should return fallback if no media URL exists', () => {
      const post: Post = { ...basePost };
      expect(getMediaUrl(post)).toBe('https://via.placeholder.com/400x500');
    });

    it('should use custom fallback when provided', () => {
      const post: Post = { ...basePost };
      const customFallback = 'https://custom.placeholder.com/image.jpg';
      expect(getMediaUrl(post, customFallback)).toBe(customFallback);
    });
  });

  describe('getContentText', () => {
    const basePost: Post = {
      id: 'test-id',
      author_id: 'author-id',
      visibility: 'public',
      created_at: '2024-01-15T10:00:00Z',
    };

    it('should return content when available', () => {
      const post: Post = { ...basePost, content: 'This is content' };
      expect(getContentText(post)).toBe('This is content');
    });

    it('should return caption when content is not available', () => {
      const post: Post = { ...basePost, caption: 'This is caption' };
      expect(getContentText(post)).toBe('This is caption');
    });

    it('should return empty string when neither is available', () => {
      const post: Post = { ...basePost };
      expect(getContentText(post)).toBe('');
    });

    it('should prefer content over caption', () => {
      const post: Post = { ...basePost, content: 'Content', caption: 'Caption' };
      expect(getContentText(post)).toBe('Content');
    });
  });
});

describe('Transform Functions', () => {
  const createMockPost = (overrides: Partial<Post> = {}): Post => ({
    id: 'post-123',
    author_id: 'user-456',
    content: 'Test post content',
    media_url: 'https://example.com/image.jpg',
    media_type: 'image',
    created_at: '2024-01-15T10:00:00Z',
    likes_count: 42,
    comments_count: 10,
    author: {
      id: 'user-456',
      full_name: 'John Doe',
      username: 'johndoe',
      avatar_url: 'https://example.com/avatar.jpg',
      is_verified: true,
      is_bot: false,
      account_type: 'personal',
    },
    tags: ['fitness', 'motivation'],
    location: 'Paris, France',
    ...overrides,
  } as Post);

  describe('transformToFanPost', () => {
    it('should transform a post to FanFeed format', () => {
      const post = createMockPost();
      const likedPostIds = new Set<string>();

      const result = transformToFanPost(post, likedPostIds);

      expect(result.id).toBe('post-123');
      expect(result.type).toBe('image');
      expect(result.media).toBe('https://example.com/image.jpg');
      expect(result.user.id).toBe('user-456');
      expect(result.user.name).toBe('John Doe');
      expect(result.user.username).toBe('@johndoe');
      expect(result.user.isVerified).toBe(true);
      expect(result.likes).toBe(42);
      expect(result.comments).toBe(10);
      expect(result.isLiked).toBe(false);
      expect(result.location).toBe('Paris, France');
    });

    it('should mark post as liked when in likedPostIds', () => {
      const post = createMockPost();
      const likedPostIds = new Set(['post-123']);

      const result = transformToFanPost(post, likedPostIds);

      expect(result.isLiked).toBe(true);
    });

    it('should set slideCount for carousel posts', () => {
      const post = createMockPost({
        media_type: 'multiple',
        media_urls: ['url1', 'url2', 'url3'],
      });
      const likedPostIds = new Set<string>();

      const result = transformToFanPost(post, likedPostIds);

      expect(result.type).toBe('carousel');
      expect(result.slideCount).toBe(3);
    });

    it('should handle missing author data', () => {
      const post = createMockPost({ author: undefined });
      const likedPostIds = new Set<string>();

      const result = transformToFanPost(post, likedPostIds);

      expect(result.user.id).toBe('user-456'); // Falls back to author_id
      expect(result.user.name).toBe('User');
      expect(result.user.username).toBe('@user');
    });
  });

  describe('transformToVibePost', () => {
    it('should transform a post to VibesFeed format', () => {
      const post = createMockPost();
      const likedPostIds = new Set<string>();

      const result = transformToVibePost(post, likedPostIds);

      expect(result.id).toBe('post-123');
      expect(result.type).toBe('image');
      expect(result.title).toBe('Test post content');
      expect(result.category).toBe('fitness');
      expect(result.height).toBeGreaterThanOrEqual(180);
      expect(result.height).toBeLessThanOrEqual(280);
    });

    it('should use first tag as category', () => {
      const post = createMockPost({ tags: ['health', 'wellness'] });
      const likedPostIds = new Set<string>();

      const result = transformToVibePost(post, likedPostIds);

      expect(result.category).toBe('health');
    });

    it('should default to "Fitness" when no tags', () => {
      const post = createMockPost({ tags: undefined });
      const likedPostIds = new Set<string>();

      const result = transformToVibePost(post, likedPostIds);

      expect(result.category).toBe('Fitness');
    });

    it('should generate consistent height based on post ID', () => {
      const post = createMockPost();
      const likedPostIds = new Set<string>();

      const result1 = transformToVibePost(post, likedPostIds);
      const result2 = transformToVibePost(post, likedPostIds);

      expect(result1.height).toBe(result2.height);
    });
  });

  describe('transformPostsBatch', () => {
    it('should transform multiple posts', () => {
      const posts = [
        createMockPost({ id: 'post-1' }),
        createMockPost({ id: 'post-2' }),
        createMockPost({ id: 'post-3' }),
      ];
      const likedPostIds = new Set(['post-2']);

      const results = transformPostsBatch(posts, likedPostIds, transformToFanPost);

      expect(results).toHaveLength(3);
      expect(results[0].id).toBe('post-1');
      expect(results[0].isLiked).toBe(false);
      expect(results[1].id).toBe('post-2');
      expect(results[1].isLiked).toBe(true);
      expect(results[2].id).toBe('post-3');
      expect(results[2].isLiked).toBe(false);
    });

    it('should handle empty array', () => {
      const results = transformPostsBatch([], new Set(), transformToFanPost);
      expect(results).toHaveLength(0);
    });
  });
});

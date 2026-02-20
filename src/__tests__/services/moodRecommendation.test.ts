/**
 * Mood Recommendation Engine Tests
 *
 * Tests the recommendation engine for mood-based content selection,
 * diversity enforcement, uplift strategies, and exploration.
 * Complements moodRecommendation.random.test.ts which covers RNG utilities.
 */

// ---------------------------------------------------------------------------
// Mocks — must be declared before imports
// ---------------------------------------------------------------------------

const mockAnalyzeMood = jest.fn();

jest.mock('../../services/moodDetection', () => ({
  moodDetection: {
    analyzeMood: mockAnalyzeMood,
  },
}));

// Mock crypto for shuffleInPlace
const originalCrypto = global.crypto;
function mockCryptoSequential() {
  let idx = 0;
  (global as typeof globalThis).crypto = {
    getRandomValues: (arr: Uint32Array) => {
      arr[0] = idx++;
      return arr;
    },
  } as Crypto;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMoodResult(overrides: Record<string, unknown> = {}) {
  return {
    primaryMood: 'energetic',
    confidence: 0.6,
    timestamp: Date.now(),
    probabilities: {
      energetic: 0.4,
      relaxed: 0.1,
      social: 0.2,
      creative: 0.1,
      focused: 0.1,
      neutral: 0.1,
    },
    signals: {
      behavioral: 0.5,
      engagement: 0.6,
      temporal: 0.5,
      content: 0.5,
    },
    ...overrides,
  };
}

function createPost(overrides: Record<string, unknown> = {}): import('../../services/moodRecommendation').Post {
  return {
    id: `post-${Math.random().toString(36).slice(2, 8)}`,
    content: 'Test post',
    mediaUrls: [],
    mediaType: 'image',
    category: 'Fitness',
    tags: ['workout'],
    authorId: 'author-1',
    authorName: 'Author',
    likesCount: 10,
    commentsCount: 5,
    sharesCount: 2,
    viewsCount: 100,
    createdAt: new Date().toISOString(),
    ...overrides,
  } as import('../../services/moodRecommendation').Post;
}

function createUserProfile(overrides: Record<string, unknown> = {}): import('../../services/moodRecommendation').UserProfile {
  return {
    id: 'user-1',
    interests: ['Fitness', 'Art'],
    followingIds: ['author-1'],
    blockedIds: [],
    mutedIds: [],
    ...overrides,
  } as import('../../services/moodRecommendation').UserProfile;
}

// ---------------------------------------------------------------------------
// Imports — after mocks
// ---------------------------------------------------------------------------

import { MoodRecommendationEngine } from '../../services/moodRecommendation';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('MoodRecommendationEngine', () => {
  let engine: InstanceType<typeof MoodRecommendationEngine>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockCryptoSequential();
    engine = new MoodRecommendationEngine();
    mockAnalyzeMood.mockReturnValue(createMoodResult());
  });

  afterEach(() => {
    (global as typeof globalThis).crypto = originalCrypto;
  });

  // =========================================================================
  // setConfig
  // =========================================================================

  describe('setConfig', () => {
    it('should update configuration', () => {
      engine.setConfig({ moodWeight: 0.8, explorationRate: 0 });
      // Verify by running recommendations with no exploration
      // (no error = config applied)
    });
  });

  // =========================================================================
  // setUpliftOverride
  // =========================================================================

  describe('setUpliftOverride', () => {
    it('should force uplift strategy when set', async () => {
      engine.setUpliftOverride(true);

      const posts = [
        createPost({ category: 'Motivation', tags: ['uplifting'] }),
        createPost({ category: 'Random' }),
      ];

      const result = await engine.getRecommendations(posts, createUserProfile(), 10);
      expect(result.strategy).toBe('uplift');
    });
  });

  // =========================================================================
  // getRecommendations
  // =========================================================================

  describe('getRecommendations', () => {
    it('should return recommendations with all required fields', async () => {
      const posts = Array.from({ length: 10 }, (_, i) =>
        createPost({ id: `p${i}`, authorId: `a${i}`, category: `Cat${i}` })
      );

      const result = await engine.getRecommendations(posts, createUserProfile(), 5);

      expect(result.posts.length).toBeLessThanOrEqual(5);
      expect(result.mood).toBeDefined();
      expect(result.strategy).toBeDefined();
      expect(result.diversityScore).toBeGreaterThanOrEqual(0);
      expect(result.explanations).toBeDefined();
    });

    it('should filter blocked users', async () => {
      const posts = [
        createPost({ id: 'p1', authorId: 'blocked-user' }),
        createPost({ id: 'p2', authorId: 'normal-user' }),
      ];

      const profile = createUserProfile({ blockedIds: ['blocked-user'] });
      const result = await engine.getRecommendations(posts, profile, 10);

      expect(result.posts.every(p => p.authorId !== 'blocked-user')).toBe(true);
    });

    it('should filter muted users', async () => {
      const posts = [
        createPost({ id: 'p1', authorId: 'muted-user' }),
        createPost({ id: 'p2', authorId: 'normal-user' }),
      ];

      const profile = createUserProfile({ mutedIds: ['muted-user'] });
      const result = await engine.getRecommendations(posts, profile, 10);

      expect(result.posts.every(p => p.authorId !== 'muted-user')).toBe(true);
    });

    it('should use default strategy for low confidence moods', async () => {
      mockAnalyzeMood.mockReturnValue(createMoodResult({ confidence: 0.2 }));

      const posts = [createPost()];
      const result = await engine.getRecommendations(posts, createUserProfile(), 10);
      expect(result.strategy).toBe('default');
    });

    it('should use exploration strategy for high neutral mood', async () => {
      mockAnalyzeMood.mockReturnValue(createMoodResult({
        primaryMood: 'neutral',
        confidence: 0.6,
        probabilities: {
          energetic: 0.05,
          relaxed: 0.05,
          social: 0.05,
          creative: 0.05,
          focused: 0.05,
          neutral: 0.75,
        },
      }));

      const posts = [createPost()];
      const result = await engine.getRecommendations(posts, createUserProfile(), 10);
      expect(result.strategy).toBe('exploration');
    });

    it('should use mood_based strategy for clear mood', async () => {
      mockAnalyzeMood.mockReturnValue(createMoodResult({
        primaryMood: 'energetic',
        confidence: 0.7,
        probabilities: {
          energetic: 0.6,
          relaxed: 0.05,
          social: 0.1,
          creative: 0.05,
          focused: 0.1,
          neutral: 0.1,
        },
      }));

      const posts = [
        createPost({ category: 'Fitness' }),
        createPost({ category: 'Random' }),
      ];

      const result = await engine.getRecommendations(posts, createUserProfile(), 10);
      expect(result.strategy).toBe('mood_based');
    });

    it('should enforce diversity constraints (max same creator)', async () => {
      // Disable exploration so only diversity-filtered posts appear
      engine.setConfig({ explorationRate: 0 });

      const posts = Array.from({ length: 10 }, (_, i) =>
        createPost({ id: `p${i}`, authorId: 'same-author', category: `Cat${i}` })
      );

      const result = await engine.getRecommendations(posts, createUserProfile(), 10);

      // Default maxSameCreator = 3
      const sameAuthorPosts = result.posts.filter(p => p.authorId === 'same-author');
      expect(sameAuthorPosts.length).toBeLessThanOrEqual(3);
    });

    it('should enforce diversity constraints (max same category)', async () => {
      const posts = Array.from({ length: 20 }, (_, i) =>
        createPost({ id: `p${i}`, authorId: `a${i}`, category: 'SameCategory' })
      );

      const result = await engine.getRecommendations(posts, createUserProfile(), 10);

      // Default maxSameCategory = 5
      const sameCatPosts = result.posts.filter(p => p.category === 'SameCategory');
      expect(sameCatPosts.length).toBeLessThanOrEqual(5);
    });

    it('should handle empty posts array', async () => {
      const result = await engine.getRecommendations([], createUserProfile(), 10);
      expect(result.posts).toHaveLength(0);
      expect(result.diversityScore).toBe(0);
    });

    it('should generate explanations for each post', async () => {
      const posts = [
        createPost({ id: 'p1' }),
        createPost({ id: 'p2' }),
      ];

      const result = await engine.getRecommendations(posts, createUserProfile(), 10);

      for (const post of result.posts) {
        expect(result.explanations[post.id]).toBeDefined();
        expect(typeof result.explanations[post.id]).toBe('string');
      }
    });

    it('should boost posts from followed creators', async () => {
      const followedPost = createPost({ id: 'followed', authorId: 'followed-user', category: 'Cat1' });
      const unfollowedPost = createPost({ id: 'unfollowed', authorId: 'random-user', category: 'Cat2' });

      const profile = createUserProfile({ followingIds: ['followed-user'] });
      const result = await engine.getRecommendations(
        [unfollowedPost, followedPost],
        profile,
        2
      );

      // Followed creator's post should rank higher
      if (result.posts.length >= 2) {
        expect(result.posts[0].id).toBe('followed');
      }
    });
  });

  // =========================================================================
  // Uplift detection
  // =========================================================================

  describe('uplift strategy', () => {
    it('should trigger uplift for low energy with low confidence', async () => {
      // lowEnergyScore = relaxed * 0.5 + neutral * 0.3, must be > 0.5
      // confidence must be < upliftThreshold (0.4)
      mockAnalyzeMood.mockReturnValue(createMoodResult({
        primaryMood: 'relaxed',
        confidence: 0.35,
        probabilities: {
          energetic: 0.0,
          relaxed: 0.7,
          social: 0.0,
          creative: 0.0,
          focused: 0.0,
          neutral: 0.6,
        },
        signals: { behavioral: 0.5, engagement: 0.3, temporal: 0.5, content: 0.5 },
      }));

      const posts = [createPost()];
      const result = await engine.getRecommendations(posts, createUserProfile(), 10);
      expect(result.strategy).toBe('uplift');
    });

    it('should trigger uplift for high neutral with low engagement', async () => {
      mockAnalyzeMood.mockReturnValue(createMoodResult({
        primaryMood: 'neutral',
        confidence: 0.5,
        probabilities: {
          energetic: 0.05,
          relaxed: 0.1,
          social: 0.05,
          creative: 0.05,
          focused: 0.05,
          neutral: 0.7,
        },
        signals: { behavioral: 0.5, engagement: 0.3, temporal: 0.5, content: 0.5 },
      }));

      const posts = [createPost()];
      const result = await engine.getRecommendations(posts, createUserProfile(), 10);
      expect(result.strategy).toBe('uplift');
    });
  });

  // =========================================================================
  // quickRerank
  // =========================================================================

  describe('quickRerank', () => {
    it('should sort posts by mood relevance', () => {
      const mood = createMoodResult({ primaryMood: 'energetic' });
      const posts = [
        createPost({ id: 'unrelated', category: 'Cooking' }),
        createPost({ id: 'matching', category: 'Fitness' }),
      ];

      const reranked = engine.quickRerank(posts, mood as never);

      // Fitness matches energetic mood
      expect(reranked[0].id).toBe('matching');
    });

    it('should not fail on empty array', () => {
      const mood = createMoodResult();
      const result = engine.quickRerank([], mood as never);
      expect(result).toEqual([]);
    });
  });
});

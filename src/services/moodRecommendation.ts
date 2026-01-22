/**
 * Mood-Aware Recommendation Service - Smuppy AI
 *
 * Two-tower inspired architecture for personalized recommendations:
 * - User tower: Profile, mood, engagement history, context
 * - Content tower: Post metadata, category, creator, engagement stats
 *
 * Features:
 * - Mood-based content selection
 * - Emotional uplift strategy (Smuppy mission: bring joy)
 * - Diversity enforcement
 * - Exploration vs exploitation balance
 */

import { moodDetection, MoodType, MoodAnalysisResult } from './moodDetection';

// ============================================================================
// TYPES
// ============================================================================

export interface Post {
  id: string;
  content: string;
  mediaUrls: string[];
  mediaType: 'image' | 'video' | 'carousel';
  category: string;
  tags: string[];
  authorId: string;
  authorName: string;
  likesCount: number;
  commentsCount: number;
  sharesCount: number;
  viewsCount: number;
  createdAt: string;
  engagementScore?: number;
}

export interface UserProfile {
  id: string;
  interests: string[];
  followingIds: string[];
  blockedIds: string[];
  mutedIds: string[];
}

export interface RecommendationConfig {
  // Content selection
  moodWeight: number;           // 0-1: How much mood affects selection
  diversityWeight: number;      // 0-1: How much diversity matters
  freshnessWeight: number;      // 0-1: How much recency matters
  explorationRate: number;      // 0-1: % of unexpected content

  // Constraints
  maxSameCreator: number;       // Max posts from same creator
  maxSameCategory: number;      // Max posts from same category
  minEngagementScore: number;   // Minimum quality threshold

  // Uplift strategy
  enableUplift: boolean;        // Enable emotional uplift
  upliftThreshold: number;      // Mood confidence below this triggers uplift
}

export interface RecommendationResult {
  posts: Post[];
  mood: MoodAnalysisResult;
  strategy: 'mood_based' | 'uplift' | 'exploration' | 'default';
  diversityScore: number;
  explanations: Record<string, string>; // postId -> reason
}

// ============================================================================
// CONTENT MAPPING
// ============================================================================

// Mood to content category mapping
const MOOD_CONTENT_MAP: Record<MoodType, { categories: string[]; contentTypes: string[] }> = {
  energetic: {
    categories: ['Fitness', 'Workout', 'Running', 'Sports', 'Challenges', 'Dance', 'Motivation'],
    contentTypes: ['video', 'carousel'],
  },
  relaxed: {
    categories: ['Nature', 'Meditation', 'Yoga', 'ASMR', 'Wellness', 'Travel', 'Photography'],
    contentTypes: ['image', 'video'],
  },
  social: {
    categories: ['Trending', 'Viral', 'Community', 'Collabs', 'Challenges', 'Comedy', 'Lifestyle'],
    contentTypes: ['video', 'carousel'],
  },
  creative: {
    categories: ['Art', 'Design', 'Photography', 'Music', 'DIY', 'Crafts', 'Fashion'],
    contentTypes: ['image', 'carousel'],
  },
  focused: {
    categories: ['Education', 'Tutorial', 'HowTo', 'Productivity', 'Tips', 'Tech', 'Science'],
    contentTypes: ['video', 'carousel'],
  },
  neutral: {
    categories: [], // Any category
    contentTypes: ['image', 'video', 'carousel'],
  },
};

// Uplift strategy: When mood is negative, boost these
const UPLIFT_CONTENT: Record<string, { boost: number; categories: string[] }> = {
  lowEnergy: {
    boost: 1.5,
    categories: ['Motivation', 'Fitness', 'Challenges', 'Comedy', 'Uplifting'],
  },
  stressed: {
    boost: 1.4,
    categories: ['Nature', 'ASMR', 'Meditation', 'Cute', 'Animals', 'Relaxation'],
  },
  lonely: {
    boost: 1.6,
    categories: ['Community', 'Social', 'Collabs', 'Challenges', 'Friends'],
  },
  bored: {
    boost: 1.3,
    categories: ['Trending', 'Viral', 'New', 'Surprising', 'Creative'],
  },
};

// ============================================================================
// RECOMMENDATION ENGINE
// ============================================================================

class MoodRecommendationEngine {
  private readonly defaultConfig: RecommendationConfig = {
    moodWeight: 0.4,
    diversityWeight: 0.25,
    freshnessWeight: 0.2,
    explorationRate: 0.15,
    maxSameCreator: 3,
    maxSameCategory: 5,
    minEngagementScore: 0.1,
    enableUplift: true,
    upliftThreshold: 0.4,
  };

  private config: RecommendationConfig;

  constructor(config?: Partial<RecommendationConfig>) {
    this.config = { ...this.defaultConfig, ...config };
  }

  /**
   * Update configuration
   */
  setConfig(config: Partial<RecommendationConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Main recommendation function
   */
  async getRecommendations(
    candidatePosts: Post[],
    userProfile: UserProfile,
    limit: number = 20
  ): Promise<RecommendationResult> {
    // 1. Analyze current mood
    const moodAnalysis = moodDetection.analyzeMood();

    // 2. Determine strategy
    const strategy = this.determineStrategy(moodAnalysis);

    // 3. Filter blocked/muted
    let filteredPosts = this.filterBlockedContent(candidatePosts, userProfile);

    // 4. Score posts based on strategy
    const scoredPosts = this.scorePosts(filteredPosts, moodAnalysis, userProfile, strategy);

    // 5. Apply diversity constraints
    const diversifiedPosts = this.applyDiversity(scoredPosts, limit);

    // 6. Add exploration posts
    const finalPosts = this.addExploration(diversifiedPosts, filteredPosts, limit);

    // 7. Generate explanations
    const explanations = this.generateExplanations(finalPosts, moodAnalysis, strategy);

    // 8. Calculate diversity score
    const diversityScore = this.calculateDiversityScore(finalPosts);

    return {
      posts: finalPosts,
      mood: moodAnalysis,
      strategy,
      diversityScore,
      explanations,
    };
  }

  /**
   * Determine recommendation strategy based on mood
   */
  private determineStrategy(mood: MoodAnalysisResult): RecommendationResult['strategy'] {
    // Low confidence = default strategy
    if (mood.confidence < 0.3) {
      return 'default';
    }

    // Check if uplift is needed
    if (this.config.enableUplift) {
      const needsUplift = this.checkUpliftNeeded(mood);
      if (needsUplift) {
        return 'uplift';
      }
    }

    // High neutral = exploration mode
    if (mood.primaryMood === 'neutral' && mood.probabilities.neutral > 0.4) {
      return 'exploration';
    }

    // Normal mood-based recommendation
    return 'mood_based';
  }

  /**
   * Check if emotional uplift is needed
   */
  private checkUpliftNeeded(mood: MoodAnalysisResult): boolean {
    // Low energy indicators
    const lowEnergyScore = mood.probabilities.relaxed * 0.5 + mood.probabilities.neutral * 0.3;

    // If relaxed mood with low confidence, might be tired/bored
    if (lowEnergyScore > 0.5 && mood.confidence < this.config.upliftThreshold) {
      return true;
    }

    // High neutral with low engagement suggests boredom
    if (mood.probabilities.neutral > 0.5 && mood.signals.engagement < 0.4) {
      return true;
    }

    return false;
  }

  /**
   * Filter out blocked and muted content
   */
  private filterBlockedContent(posts: Post[], userProfile: UserProfile): Post[] {
    const blockedSet = new Set([...userProfile.blockedIds, ...userProfile.mutedIds]);

    return posts.filter(post => !blockedSet.has(post.authorId));
  }

  /**
   * Score posts based on mood and strategy
   */
  private scorePosts(
    posts: Post[],
    mood: MoodAnalysisResult,
    userProfile: UserProfile,
    strategy: RecommendationResult['strategy']
  ): Array<Post & { score: number; scoreBreakdown: Record<string, number> }> {
    return posts.map(post => {
      const breakdown: Record<string, number> = {};

      // 1. Mood relevance score
      const moodScore = this.calculateMoodScore(post, mood, strategy);
      breakdown.mood = moodScore;

      // 2. User interest score
      const interestScore = this.calculateInterestScore(post, userProfile);
      breakdown.interest = interestScore;

      // 3. Engagement quality score
      const engagementScore = this.calculateEngagementScore(post);
      breakdown.engagement = engagementScore;

      // 4. Freshness score
      const freshnessScore = this.calculateFreshnessScore(post);
      breakdown.freshness = freshnessScore;

      // 5. Following boost
      const followingBoost = userProfile.followingIds.includes(post.authorId) ? 0.2 : 0;
      breakdown.following = followingBoost;

      // Weighted combination
      const totalScore =
        moodScore * this.config.moodWeight +
        interestScore * 0.25 +
        engagementScore * 0.15 +
        freshnessScore * this.config.freshnessWeight +
        followingBoost;

      return {
        ...post,
        score: totalScore,
        scoreBreakdown: breakdown,
      };
    }).sort((a, b) => b.score - a.score);
  }

  /**
   * Calculate mood relevance score
   */
  private calculateMoodScore(
    post: Post,
    mood: MoodAnalysisResult,
    strategy: RecommendationResult['strategy']
  ): number {
    let score = 0.5; // Base score

    if (strategy === 'uplift') {
      // Boost uplifting content
      const upliftCategories = [
        ...UPLIFT_CONTENT.lowEnergy.categories,
        ...UPLIFT_CONTENT.stressed.categories,
        ...UPLIFT_CONTENT.bored.categories,
      ];

      if (upliftCategories.some(cat =>
        post.category.toLowerCase().includes(cat.toLowerCase()) ||
        post.tags.some(tag => tag.toLowerCase().includes(cat.toLowerCase()))
      )) {
        score += 0.4;
      }
    } else if (strategy === 'mood_based') {
      // Match content to current mood
      const moodContent = MOOD_CONTENT_MAP[mood.primaryMood];

      // Category match
      if (moodContent.categories.some(cat =>
        post.category.toLowerCase().includes(cat.toLowerCase())
      )) {
        score += 0.3;
      }

      // Content type match
      if (moodContent.contentTypes.includes(post.mediaType)) {
        score += 0.1;
      }
    }

    // Boost based on mood probability
    const moodProb = mood.probabilities[mood.primaryMood];
    score *= (0.5 + moodProb * 0.5);

    return Math.min(1, score);
  }

  /**
   * Calculate user interest score
   */
  private calculateInterestScore(post: Post, userProfile: UserProfile): number {
    let score = 0;

    // Check if post category matches user interests
    for (const interest of userProfile.interests) {
      if (post.category.toLowerCase().includes(interest.toLowerCase()) ||
          post.tags.some(tag => tag.toLowerCase().includes(interest.toLowerCase()))) {
        score += 0.3;
        break;
      }
    }

    return Math.min(1, score + 0.3); // Base score of 0.3
  }

  /**
   * Calculate engagement quality score
   */
  private calculateEngagementScore(post: Post): number {
    // Engagement rate (likes + comments) / views
    const views = Math.max(post.viewsCount, 1);
    const engagementRate = (post.likesCount + post.commentsCount * 2) / views;

    // Normalize to 0-1 (assume good engagement rate is 5-10%)
    return Math.min(1, engagementRate * 10);
  }

  /**
   * Calculate freshness score
   */
  private calculateFreshnessScore(post: Post): number {
    const now = Date.now();
    const postTime = new Date(post.createdAt).getTime();
    const ageHours = (now - postTime) / (1000 * 60 * 60);

    // Full score for last 24 hours, decays over 7 days
    if (ageHours < 24) return 1;
    if (ageHours < 48) return 0.9;
    if (ageHours < 72) return 0.8;
    if (ageHours < 168) return 0.6; // 7 days
    return 0.3;
  }

  /**
   * Apply diversity constraints
   */
  private applyDiversity(
    scoredPosts: Array<Post & { score: number }>,
    limit: number
  ): Post[] {
    const result: Post[] = [];
    const creatorCounts: Record<string, number> = {};
    const categoryCounts: Record<string, number> = {};

    for (const post of scoredPosts) {
      if (result.length >= limit) break;

      // Check creator limit
      const creatorCount = creatorCounts[post.authorId] || 0;
      if (creatorCount >= this.config.maxSameCreator) continue;

      // Check category limit
      const categoryCount = categoryCounts[post.category] || 0;
      if (categoryCount >= this.config.maxSameCategory) continue;

      // Add post
      result.push(post);
      creatorCounts[post.authorId] = creatorCount + 1;
      categoryCounts[post.category] = categoryCount + 1;
    }

    return result;
  }

  /**
   * Add exploration posts (serendipity)
   */
  private addExploration(
    currentPosts: Post[],
    allPosts: Post[],
    limit: number
  ): Post[] {
    const explorationCount = Math.floor(limit * this.config.explorationRate);
    if (explorationCount === 0) return currentPosts;

    const currentIds = new Set(currentPosts.map(p => p.id));
    const currentCategories = new Set(currentPosts.map(p => p.category));

    // Find posts from different categories
    const explorationPosts = allPosts
      .filter(p => !currentIds.has(p.id) && !currentCategories.has(p.category))
      .sort(() => Math.random() - 0.5) // Shuffle
      .slice(0, explorationCount);

    // Interleave exploration posts
    const result = [...currentPosts];
    for (let i = 0; i < explorationPosts.length && result.length < limit; i++) {
      const insertIndex = Math.floor(Math.random() * (result.length - 3)) + 3; // After first 3
      result.splice(insertIndex, 0, explorationPosts[i]);
    }

    return result.slice(0, limit);
  }

  /**
   * Generate explanations for recommendations
   */
  private generateExplanations(
    posts: Post[],
    mood: MoodAnalysisResult,
    strategy: RecommendationResult['strategy']
  ): Record<string, string> {
    const explanations: Record<string, string> = {};

    for (const post of posts) {
      const reasons: string[] = [];

      // Strategy-based explanation
      if (strategy === 'uplift') {
        reasons.push('Picked to brighten your day');
      } else if (strategy === 'mood_based') {
        const moodEmoji = {
          energetic: '⚡',
          relaxed: '🌿',
          social: '👋',
          creative: '🎨',
          focused: '💡',
          neutral: '✨',
        }[mood.primaryMood];
        reasons.push(`Matches your ${moodEmoji} mood`);
      } else if (strategy === 'exploration') {
        reasons.push('Something new to discover');
      }

      // Category match
      const moodContent = MOOD_CONTENT_MAP[mood.primaryMood];
      if (moodContent.categories.some(cat =>
        post.category.toLowerCase().includes(cat.toLowerCase())
      )) {
        reasons.push(`Great for ${mood.primaryMood} vibes`);
      }

      explanations[post.id] = reasons[0] || 'Recommended for you';
    }

    return explanations;
  }

  /**
   * Calculate diversity score of final recommendations
   */
  private calculateDiversityScore(posts: Post[]): number {
    if (posts.length === 0) return 0;

    const uniqueCategories = new Set(posts.map(p => p.category)).size;
    const uniqueCreators = new Set(posts.map(p => p.authorId)).size;

    const categoryDiversity = uniqueCategories / posts.length;
    const creatorDiversity = uniqueCreators / posts.length;

    return (categoryDiversity + creatorDiversity) / 2;
  }

  /**
   * Get quick recommendations without full analysis (for scroll-based updates)
   */
  quickRerank(posts: Post[], mood: MoodAnalysisResult): Post[] {
    const moodContent = MOOD_CONTENT_MAP[mood.primaryMood];

    return posts.sort((a, b) => {
      const aMatch = moodContent.categories.some(cat =>
        a.category.toLowerCase().includes(cat.toLowerCase())
      ) ? 1 : 0;
      const bMatch = moodContent.categories.some(cat =>
        b.category.toLowerCase().includes(cat.toLowerCase())
      ) ? 1 : 0;

      return bMatch - aMatch;
    });
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

export const moodRecommendation = new MoodRecommendationEngine();

// Export class for custom instances
export { MoodRecommendationEngine };

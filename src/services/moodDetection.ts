/**
 * Advanced Mood Detection Service - Smuppy AI
 *
 * Multi-signal fusion system that analyzes:
 * - Scroll behavior (velocity, pauses, reverse scrolls)
 * - Engagement patterns (likes, comments, shares, time spent)
 * - Temporal context (time of day, day of week, session patterns)
 * - Content preferences (categories, creators, content types)
 *
 * Outputs a probability vector for 6 mood states with confidence score.
 */

// ============================================================================
// TYPES
// ============================================================================

export type MoodType = 'energetic' | 'relaxed' | 'social' | 'creative' | 'focused' | 'neutral';

export interface MoodProbabilityVector {
  energetic: number;
  relaxed: number;
  social: number;
  creative: number;
  focused: number;
  neutral: number;
}

export interface MoodAnalysisResult {
  primaryMood: MoodType;
  probabilities: MoodProbabilityVector;
  confidence: number;
  signals: SignalContributions;
  timestamp: number;
}

export interface SignalContributions {
  behavioral: number;   // 0-1 contribution from scroll behavior
  engagement: number;   // 0-1 contribution from engagement patterns
  temporal: number;     // 0-1 contribution from time context
  content: number;      // 0-1 contribution from content preferences
}

// Scroll behavior signals
export interface ScrollBehavior {
  avgVelocity: number;          // pixels per second
  maxVelocity: number;
  pauseCount: number;           // number of pauses > 500ms
  avgPauseDuration: number;     // ms
  reverseScrollCount: number;   // scrolls back up
  totalScrollDistance: number;  // total pixels scrolled
  sessionDuration: number;      // ms
}

// Engagement signals
export interface EngagementSignals {
  likeRate: number;             // likes / posts viewed
  commentRate: number;          // comments / posts viewed
  shareRate: number;            // shares / posts viewed
  saveRate: number;             // saves / posts viewed
  avgTimePerPost: number;       // seconds
  skipRate: number;             // quick scrolls past / total
  rewatchRate: number;          // re-viewed posts / total
}

// Temporal context
export interface TemporalContext {
  hourOfDay: number;            // 0-23
  dayOfWeek: number;            // 0-6 (Sunday = 0)
  isWeekend: boolean;
  timeSinceLastSession: number; // minutes
  sessionNumber: number;        // nth session today
  localTime: Date;
}

// Content preferences
export interface ContentPreferences {
  topCategories: string[];
  categoryDistribution: Record<string, number>;
  creatorDiversity: number;     // unique creators / total posts viewed
  avgContentLength: number;     // for videos: seconds
  preferredContentType: 'image' | 'video' | 'carousel' | 'mixed';
}

// ============================================================================
// CONSTANTS — Thresholds, limits, and buffer sizes
// ============================================================================

// Scroll tracking buffers
const MAX_VELOCITY_BUFFER_SIZE = 1000;
const VELOCITY_BUFFER_TRIM_SIZE = 500;
const MAX_PAUSE_BUFFER_SIZE = 500;
const PAUSE_BUFFER_TRIM_SIZE = 250;
const MAX_TIME_PER_POST_BUFFER_SIZE = 200;
const TIME_PER_POST_TRIM_SIZE = 100;

// Scroll behavior thresholds
const SCROLL_DELTA_THRESHOLD = -50;
const LOW_VELOCITY_THRESHOLD = 10;
const MIN_PAUSE_DURATION_MS = 500;
const SKIP_TIME_THRESHOLD_SECONDS = 1;

// Behavioral mood thresholds
const HIGH_VELOCITY_THRESHOLD = 500;
const LOW_VELOCITY_MOOD_THRESHOLD = 200;
const MIN_PAUSE_COUNT_ENERGETIC = 3;
const HIGH_PAUSE_COUNT_FOCUSED = 5;
const MIN_REVERSE_SCROLL_COUNT = 3;
const LONG_SESSION_DURATION_MS = 600000; // 10 minutes

// Engagement mood thresholds
const HIGH_LIKE_RATE = 0.3;
const HIGH_COMMENT_RATE = 0.1;
const HIGH_SHARE_RATE = 0.05;
const HIGH_SAVE_RATE = 0.1;
const LONG_TIME_PER_POST_SECONDS = 10;
const HIGH_SKIP_RATE = 0.5;
const HIGH_REWATCH_RATE = 0.1;

// Temporal mood thresholds
const LONG_SESSION_GAP_MINUTES = 480; // 8 hours

// Content mood thresholds
const TOP_CATEGORIES_LIMIT = 3;
const HIGH_CREATOR_DIVERSITY = 0.7;
const LOW_CREATOR_DIVERSITY = 0.3;
const DOMINANT_CONTENT_TYPE_RATIO = 0.5;

// Signal strength thresholds
const SHORT_SESSION_THRESHOLD_MS = 30000;  // 30 seconds
const MEDIUM_SESSION_THRESHOLD_MS = 120000; // 2 minutes
const MIN_POSTS_FOR_CONTENT_SIGNAL = 5;
const MIN_ACTIONS_LOW_STRENGTH = 2;
const MIN_ACTIONS_MEDIUM_STRENGTH = 5;

// Mood history & analysis
const MAX_MOOD_HISTORY_SIZE = 20;
const MAX_SCROLL_HISTORY_SIZE = 10;
const MAX_CONFIDENCE = 0.95;
const CONFIDENCE_BOOST = 0.3;

// Signal strength values
const LOW_SIGNAL_STRENGTH = 0.3;
const MEDIUM_SIGNAL_STRENGTH = 0.6;
const HIGH_SIGNAL_STRENGTH = 0.9;

// ============================================================================
// MOOD DETECTION ENGINE
// ============================================================================

class MoodDetectionEngine {
  private moodHistory: MoodAnalysisResult[] = [];
  private scrollHistory: ScrollBehavior[] = [];
  private currentScrollSession: Partial<ScrollBehavior> = {};
  private lastScrollY: number = 0;
  private lastScrollTime: number = 0;
  private scrollVelocities: number[] = [];
  private pauseStartTime: number | null = null;
  private pauseDurations: number[] = [];
  private reverseScrolls: number = 0;

  // Engagement tracking
  private postsViewed: number = 0;
  private postsLiked: number = 0;
  private postsCommented: number = 0;
  private postsShared: number = 0;
  private postsSaved: number = 0;
  private postsSkipped: number = 0;
  private postsRewatched: Set<string> = new Set();
  private timePerPost: number[] = [];
  private viewedPostIds: Set<string> = new Set();

  // Content tracking
  private categoryViews: Record<string, number> = {};
  private creatorsViewed: Set<string> = new Set();
  private contentTypeCounts: Record<string, number> = { image: 0, video: 0, carousel: 0 };

  // Session tracking
  private sessionStartTime: number = Date.now();
  private lastSessionEnd: number | null = null;
  private sessionsToday: number = 1;

  // Weights for signal fusion
  private readonly SIGNAL_WEIGHTS = {
    behavioral: 0.25,
    engagement: 0.30,
    temporal: 0.20,
    content: 0.25,
  };

  // ============================================================================
  // SCROLL BEHAVIOR TRACKING
  // ============================================================================

  /**
   * Track scroll event for velocity and behavior analysis
   */
  trackScroll(scrollY: number, timestamp: number = Date.now()): void {
    if (this.lastScrollTime === 0) {
      this.lastScrollY = scrollY;
      this.lastScrollTime = timestamp;
      return;
    }

    const deltaY = scrollY - this.lastScrollY;
    const deltaTime = timestamp - this.lastScrollTime;

    if (deltaTime > 0) {
      const velocity = Math.abs(deltaY) / (deltaTime / 1000); // pixels per second
      this.scrollVelocities.push(velocity);

      // Prevent memory leak: limit array size
      if (this.scrollVelocities.length > MAX_VELOCITY_BUFFER_SIZE) {
        this.scrollVelocities = this.scrollVelocities.slice(-VELOCITY_BUFFER_TRIM_SIZE);
      }

      // Detect reverse scroll (scrolling back up)
      if (deltaY < SCROLL_DELTA_THRESHOLD) {
        this.reverseScrolls++;
      }

      // Detect pause (very low velocity or no scroll for 500ms+)
      if (velocity < LOW_VELOCITY_THRESHOLD && !this.pauseStartTime) {
        this.pauseStartTime = timestamp;
      } else if (velocity >= LOW_VELOCITY_THRESHOLD && this.pauseStartTime) {
        const pauseDuration = timestamp - this.pauseStartTime;
        if (pauseDuration >= MIN_PAUSE_DURATION_MS) {
          this.pauseDurations.push(pauseDuration);
          // Prevent memory leak: limit array size
          if (this.pauseDurations.length > MAX_PAUSE_BUFFER_SIZE) {
            this.pauseDurations = this.pauseDurations.slice(-PAUSE_BUFFER_TRIM_SIZE);
          }
        }
        this.pauseStartTime = null;
      }
    }

    this.lastScrollY = scrollY;
    this.lastScrollTime = timestamp;

    // Update current session stats
    this.currentScrollSession.totalScrollDistance =
      (this.currentScrollSession.totalScrollDistance || 0) + Math.abs(deltaY);
  }

  /**
   * Get computed scroll behavior for current session
   */
  getScrollBehavior(): ScrollBehavior {
    const velocities = this.scrollVelocities.length > 0 ? this.scrollVelocities : [0];

    return {
      avgVelocity: velocities.reduce((a, b) => a + b, 0) / velocities.length,
      maxVelocity: Math.max(...velocities),
      pauseCount: this.pauseDurations.length,
      avgPauseDuration: this.pauseDurations.length > 0
        ? this.pauseDurations.reduce((a, b) => a + b, 0) / this.pauseDurations.length
        : 0,
      reverseScrollCount: this.reverseScrolls,
      totalScrollDistance: this.currentScrollSession.totalScrollDistance || 0,
      sessionDuration: Date.now() - this.sessionStartTime,
    };
  }

  // ============================================================================
  // ENGAGEMENT TRACKING
  // ============================================================================

  /**
   * Track when user views a post
   */
  trackPostView(postId: string, category: string, creatorId: string, contentType: 'image' | 'video' | 'carousel'): void {
    const isRewatch = this.viewedPostIds.has(postId);

    if (isRewatch) {
      this.postsRewatched.add(postId);
    } else {
      this.viewedPostIds.add(postId);
      this.postsViewed++;
    }

    // Track category
    this.categoryViews[category] = (this.categoryViews[category] || 0) + 1;

    // Track creator
    this.creatorsViewed.add(creatorId);

    // Track content type
    this.contentTypeCounts[contentType]++;
  }

  /**
   * Track time spent on a post
   */
  trackTimeOnPost(postId: string, timeSeconds: number): void {
    this.timePerPost.push(timeSeconds);

    // Prevent memory leak: limit array size
    if (this.timePerPost.length > MAX_TIME_PER_POST_BUFFER_SIZE) {
      this.timePerPost = this.timePerPost.slice(-TIME_PER_POST_TRIM_SIZE);
    }

    // If less than threshold, consider it a skip
    if (timeSeconds < SKIP_TIME_THRESHOLD_SECONDS) {
      this.postsSkipped++;
    }
  }

  /**
   * Track engagement action
   */
  trackEngagement(action: 'like' | 'comment' | 'share' | 'save'): void {
    switch (action) {
      case 'like':
        this.postsLiked++;
        break;
      case 'comment':
        this.postsCommented++;
        break;
      case 'share':
        this.postsShared++;
        break;
      case 'save':
        this.postsSaved++;
        break;
    }
  }

  /**
   * Get computed engagement signals
   */
  getEngagementSignals(): EngagementSignals {
    const viewed = Math.max(this.postsViewed, 1);

    return {
      likeRate: this.postsLiked / viewed,
      commentRate: this.postsCommented / viewed,
      shareRate: this.postsShared / viewed,
      saveRate: this.postsSaved / viewed,
      avgTimePerPost: this.timePerPost.length > 0
        ? this.timePerPost.reduce((a, b) => a + b, 0) / this.timePerPost.length
        : 0,
      skipRate: this.postsSkipped / viewed,
      rewatchRate: this.postsRewatched.size / viewed,
    };
  }

  // ============================================================================
  // TEMPORAL CONTEXT
  // ============================================================================

  /**
   * Get current temporal context
   */
  getTemporalContext(): TemporalContext {
    const now = new Date();
    const dayOfWeek = now.getDay();

    return {
      hourOfDay: now.getHours(),
      dayOfWeek,
      isWeekend: dayOfWeek === 0 || dayOfWeek === 6,
      timeSinceLastSession: this.lastSessionEnd
        ? (Date.now() - this.lastSessionEnd) / 60000
        : 0,
      sessionNumber: this.sessionsToday,
      localTime: now,
    };
  }

  // ============================================================================
  // CONTENT PREFERENCES
  // ============================================================================

  /**
   * Get computed content preferences
   */
  getContentPreferences(): ContentPreferences {
    // Sort categories by view count
    const sortedCategories = Object.entries(this.categoryViews)
      .sort(([, a], [, b]) => b - a)
      .map(([cat]) => cat);

    // Calculate distribution
    const totalCategoryViews = Object.values(this.categoryViews).reduce((a, b) => a + b, 0) || 1;
    const categoryDistribution: Record<string, number> = {};
    for (const [cat, count] of Object.entries(this.categoryViews)) {
      categoryDistribution[cat] = count / totalCategoryViews;
    }

    // Determine preferred content type
    const contentTypes = this.contentTypeCounts;
    const maxType = Object.entries(contentTypes).reduce(
      (max, [type, count]) => (count > max.count ? { type, count } : max),
      { type: 'mixed', count: 0 }
    );

    return {
      topCategories: sortedCategories.slice(0, 5),
      categoryDistribution,
      creatorDiversity: this.creatorsViewed.size / Math.max(this.postsViewed, 1),
      avgContentLength: 0, // Would need video duration tracking
      preferredContentType: maxType.count > this.postsViewed * DOMINANT_CONTENT_TYPE_RATIO
        ? maxType.type as 'image' | 'video' | 'carousel'
        : 'mixed',
    };
  }

  // ============================================================================
  // MOOD ANALYSIS - MULTI-SIGNAL FUSION
  // ============================================================================

  /**
   * Analyze mood from behavioral signals
   */
  private analyzeBehavioralMood(scroll: ScrollBehavior): MoodProbabilityVector {
    const probs: MoodProbabilityVector = {
      energetic: 0,
      relaxed: 0,
      social: 0,
      creative: 0,
      focused: 0,
      neutral: 0.2,
    };

    // High velocity + few pauses = energetic browsing
    if (scroll.avgVelocity > HIGH_VELOCITY_THRESHOLD && scroll.pauseCount < MIN_PAUSE_COUNT_ENERGETIC) {
      probs.energetic += 0.3;
      probs.neutral -= 0.1;
    }

    // Low velocity + many pauses = focused/engaged
    if (scroll.avgVelocity < LOW_VELOCITY_MOOD_THRESHOLD && scroll.pauseCount > HIGH_PAUSE_COUNT_FOCUSED) {
      probs.focused += 0.3;
      probs.relaxed += 0.2;
    }

    // Moderate velocity + some pauses = relaxed browsing
    if (scroll.avgVelocity >= LOW_VELOCITY_MOOD_THRESHOLD && scroll.avgVelocity <= HIGH_VELOCITY_THRESHOLD) {
      probs.relaxed += 0.25;
    }

    // Many reverse scrolls = re-engaging, interested
    if (scroll.reverseScrollCount > MIN_REVERSE_SCROLL_COUNT) {
      probs.focused += 0.15;
      probs.creative += 0.1;
    }

    // Long session = engaged (could be any mood)
    if (scroll.sessionDuration > LONG_SESSION_DURATION_MS) {
      probs.relaxed += 0.1;
      probs.social += 0.1;
    }

    return this.normalizeProbabilities(probs);
  }

  /**
   * Analyze mood from engagement signals
   */
  private analyzeEngagementMood(engagement: EngagementSignals): MoodProbabilityVector {
    const probs: MoodProbabilityVector = {
      energetic: 0,
      relaxed: 0,
      social: 0,
      creative: 0,
      focused: 0,
      neutral: 0.2,
    };

    // High like rate = positive mood
    if (engagement.likeRate > HIGH_LIKE_RATE) {
      probs.energetic += 0.2;
      probs.social += 0.15;
    }

    // Comments = social engagement
    if (engagement.commentRate > HIGH_COMMENT_RATE) {
      probs.social += 0.35;
    }

    // Shares = wants to connect
    if (engagement.shareRate > HIGH_SHARE_RATE) {
      probs.social += 0.25;
      probs.energetic += 0.1;
    }

    // Saves = thoughtful, focused
    if (engagement.saveRate > HIGH_SAVE_RATE) {
      probs.focused += 0.2;
      probs.creative += 0.15;
    }

    // Long time per post = focused/relaxed
    if (engagement.avgTimePerPost > LONG_TIME_PER_POST_SECONDS) {
      probs.focused += 0.2;
      probs.relaxed += 0.15;
    }

    // High skip rate = distracted or bored
    if (engagement.skipRate > HIGH_SKIP_RATE) {
      probs.neutral += 0.3;
      probs.energetic += 0.1;
    }

    // Re-watching = engaged
    if (engagement.rewatchRate > HIGH_REWATCH_RATE) {
      probs.focused += 0.15;
      probs.creative += 0.1;
    }

    return this.normalizeProbabilities(probs);
  }

  /**
   * Analyze mood from temporal context
   */
  private analyzeTemporalMood(temporal: TemporalContext): MoodProbabilityVector {
    const probs: MoodProbabilityVector = {
      energetic: 0,
      relaxed: 0,
      social: 0,
      creative: 0,
      focused: 0,
      neutral: 0.15,
    };

    const hour = temporal.hourOfDay;

    // Morning (6-11): energetic, focused
    if (hour >= 6 && hour < 12) {
      probs.energetic += 0.25;
      probs.focused += 0.2;
    }

    // Afternoon (12-17): mixed, social
    if (hour >= 12 && hour < 17) {
      probs.social += 0.2;
      probs.focused += 0.15;
      probs.creative += 0.1;
    }

    // Evening (17-21): social, relaxed
    if (hour >= 17 && hour < 21) {
      probs.social += 0.25;
      probs.relaxed += 0.2;
    }

    // Night (21-6): relaxed, creative
    if (hour >= 21 || hour < 6) {
      probs.relaxed += 0.35;
      probs.creative += 0.15;
    }

    // Weekend boost to relaxed and social
    if (temporal.isWeekend) {
      probs.relaxed += 0.1;
      probs.social += 0.1;
      probs.focused -= 0.1;
    }

    // First session of day = fresh
    if (temporal.sessionNumber === 1) {
      probs.energetic += 0.1;
    }

    // Long time since last session = eager
    if (temporal.timeSinceLastSession > LONG_SESSION_GAP_MINUTES) {
      probs.social += 0.1;
      probs.energetic += 0.1;
    }

    return this.normalizeProbabilities(probs);
  }

  /**
   * Analyze mood from content preferences
   */
  private analyzeContentMood(content: ContentPreferences): MoodProbabilityVector {
    const probs: MoodProbabilityVector = {
      energetic: 0,
      relaxed: 0,
      social: 0,
      creative: 0,
      focused: 0,
      neutral: 0.2,
    };

    // Category-based mood inference
    const creativeCategories = ['Art', 'Design', 'Photography', 'Music', 'Dance', 'DIY'];
    const fitnessCategories = ['Fitness', 'Workout', 'Running', 'Gym', 'Sports'];
    const relaxCategories = ['Nature', 'Meditation', 'Yoga', 'ASMR', 'Wellness'];
    const socialCategories = ['Trending', 'Viral', 'Community', 'Challenges'];
    const focusedCategories = ['Education', 'Tutorial', 'HowTo', 'Productivity', 'Tips'];

    for (const cat of content.topCategories.slice(0, TOP_CATEGORIES_LIMIT)) {
      if (creativeCategories.some(c => cat.toLowerCase().includes(c.toLowerCase()))) {
        probs.creative += 0.2;
      }
      if (fitnessCategories.some(c => cat.toLowerCase().includes(c.toLowerCase()))) {
        probs.energetic += 0.2;
      }
      if (relaxCategories.some(c => cat.toLowerCase().includes(c.toLowerCase()))) {
        probs.relaxed += 0.2;
      }
      if (socialCategories.some(c => cat.toLowerCase().includes(c.toLowerCase()))) {
        probs.social += 0.2;
      }
      if (focusedCategories.some(c => cat.toLowerCase().includes(c.toLowerCase()))) {
        probs.focused += 0.2;
      }
    }

    // High creator diversity = exploring, social
    if (content.creatorDiversity > HIGH_CREATOR_DIVERSITY) {
      probs.social += 0.1;
      probs.neutral += 0.05;
    }

    // Low diversity = focused on specific content
    if (content.creatorDiversity < LOW_CREATOR_DIVERSITY) {
      probs.focused += 0.15;
    }

    return this.normalizeProbabilities(probs);
  }

  /**
   * Normalize probability vector to sum to 1
   */
  private normalizeProbabilities(probs: MoodProbabilityVector): MoodProbabilityVector {
    const sum = Object.values(probs).reduce((a, b) => a + Math.max(0, b), 0);
    if (sum === 0) return { ...probs, neutral: 1 };

    return {
      energetic: Math.max(0, probs.energetic) / sum,
      relaxed: Math.max(0, probs.relaxed) / sum,
      social: Math.max(0, probs.social) / sum,
      creative: Math.max(0, probs.creative) / sum,
      focused: Math.max(0, probs.focused) / sum,
      neutral: Math.max(0, probs.neutral) / sum,
    };
  }

  /**
   * Fuse all signals into final mood analysis
   */
  analyzeMood(): MoodAnalysisResult {
    const scroll = this.getScrollBehavior();
    const engagement = this.getEngagementSignals();
    const temporal = this.getTemporalContext();
    const content = this.getContentPreferences();

    // Get mood probabilities from each signal
    const behavioralProbs = this.analyzeBehavioralMood(scroll);
    const engagementProbs = this.analyzeEngagementMood(engagement);
    const temporalProbs = this.analyzeTemporalMood(temporal);
    const contentProbs = this.analyzeContentMood(content);

    // Weighted fusion
    const fusedProbs: MoodProbabilityVector = {
      energetic: 0,
      relaxed: 0,
      social: 0,
      creative: 0,
      focused: 0,
      neutral: 0,
    };

    const moods: MoodType[] = ['energetic', 'relaxed', 'social', 'creative', 'focused', 'neutral'];

    for (const mood of moods) {
      fusedProbs[mood] =
        behavioralProbs[mood] * this.SIGNAL_WEIGHTS.behavioral +
        engagementProbs[mood] * this.SIGNAL_WEIGHTS.engagement +
        temporalProbs[mood] * this.SIGNAL_WEIGHTS.temporal +
        contentProbs[mood] * this.SIGNAL_WEIGHTS.content;
    }

    // Normalize final probabilities
    const normalizedProbs = this.normalizeProbabilities(fusedProbs);

    // Find primary mood
    let primaryMood: MoodType = 'neutral';
    let maxProb = 0;
    for (const mood of moods) {
      if (normalizedProbs[mood] > maxProb) {
        maxProb = normalizedProbs[mood];
        primaryMood = mood;
      }
    }

    // Calculate confidence based on how dominant the primary mood is
    const sortedProbs = Object.values(normalizedProbs).sort((a, b) => b - a);
    const confidence = sortedProbs[0] - sortedProbs[1]; // Difference between top 2

    // Calculate signal contributions
    const signals: SignalContributions = {
      behavioral: this.calculateSignalStrength(scroll),
      engagement: this.calculateEngagementStrength(engagement),
      temporal: 0.8, // Always available
      content: this.postsViewed > MIN_POSTS_FOR_CONTENT_SIGNAL ? HIGH_SIGNAL_STRENGTH : 0.4, // More data = more reliable
    };

    const result: MoodAnalysisResult = {
      primaryMood,
      probabilities: normalizedProbs,
      confidence: Math.min(MAX_CONFIDENCE, confidence + CONFIDENCE_BOOST), // Boost confidence a bit
      signals,
      timestamp: Date.now(),
    };

    // Store in mood history
    this.moodHistory.push(result);
    if (this.moodHistory.length > MAX_MOOD_HISTORY_SIZE) {
      this.moodHistory.shift();
    }

    return result;
  }

  /**
   * Get mood history (last N snapshots, max 20)
   */
  getMoodHistory(): MoodAnalysisResult[] {
    return [...this.moodHistory];
  }

  /**
   * Calculate behavioral signal strength (data quality)
   */
  private calculateSignalStrength(scroll: ScrollBehavior): number {
    // More scroll data = stronger signal
    if (scroll.sessionDuration < SHORT_SESSION_THRESHOLD_MS) return LOW_SIGNAL_STRENGTH;
    if (scroll.sessionDuration < MEDIUM_SESSION_THRESHOLD_MS) return MEDIUM_SIGNAL_STRENGTH;
    return HIGH_SIGNAL_STRENGTH;
  }

  /**
   * Calculate engagement signal strength
   */
  private calculateEngagementStrength(_engagement: EngagementSignals): number {
    const totalActions = this.postsLiked + this.postsCommented + this.postsShared + this.postsSaved;
    if (totalActions < MIN_ACTIONS_LOW_STRENGTH) return LOW_SIGNAL_STRENGTH;
    if (totalActions < MIN_ACTIONS_MEDIUM_STRENGTH) return MEDIUM_SIGNAL_STRENGTH;
    return HIGH_SIGNAL_STRENGTH;
  }

  // ============================================================================
  // SESSION MANAGEMENT
  // ============================================================================

  /**
   * Start a new session
   */
  startSession(): void {
    this.sessionStartTime = Date.now();

    // Check if it's a new day
    const lastDate = this.lastSessionEnd ? new Date(this.lastSessionEnd).toDateString() : '';
    const today = new Date().toDateString();
    if (lastDate !== today) {
      this.sessionsToday = 1;
    } else {
      this.sessionsToday++;
    }
  }

  /**
   * End current session
   */
  endSession(): void {
    this.lastSessionEnd = Date.now();

    // Store scroll behavior for history
    this.scrollHistory.push(this.getScrollBehavior());

    // Keep only last N sessions
    if (this.scrollHistory.length > MAX_SCROLL_HISTORY_SIZE) {
      this.scrollHistory.shift();
    }
  }

  /**
   * Reset all tracking data (for new session or testing)
   */
  reset(): void {
    this.scrollVelocities = [];
    this.pauseDurations = [];
    this.reverseScrolls = 0;
    this.lastScrollY = 0;
    this.lastScrollTime = 0;
    this.pauseStartTime = null;
    this.currentScrollSession = {};

    this.postsViewed = 0;
    this.postsLiked = 0;
    this.postsCommented = 0;
    this.postsShared = 0;
    this.postsSaved = 0;
    this.postsSkipped = 0;
    this.postsRewatched = new Set();
    this.timePerPost = [];
    this.viewedPostIds = new Set();

    this.categoryViews = {};
    this.creatorsViewed = new Set();
    this.contentTypeCounts = { image: 0, video: 0, carousel: 0 };

    this.moodHistory = [];
    this.sessionStartTime = Date.now();
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

export const moodDetection = new MoodDetectionEngine();

// Note: Types (ScrollBehavior, EngagementSignals, TemporalContext, ContentPreferences)
// are already exported with their interface declarations above

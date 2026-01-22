/**
 * useMoodAI Hook - Smuppy AI Integration
 *
 * React hook for integrating mood detection and recommendations
 * into feed components.
 *
 * Features:
 * - Automatic scroll tracking
 * - Real-time mood updates
 * - Engagement tracking helpers
 * - Recommendation fetching
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { NativeScrollEvent } from 'react-native';
import { moodDetection, MoodAnalysisResult, MoodType } from '../services/moodDetection';
import { moodRecommendation, Post, UserProfile, RecommendationResult } from '../services/moodRecommendation';

// ============================================================================
// TYPES
// ============================================================================

export interface UseMoodAIOptions {
  enableScrollTracking?: boolean;
  moodUpdateInterval?: number; // ms
  onMoodChange?: (mood: MoodAnalysisResult) => void;
}

export interface UseMoodAIReturn {
  // Current mood state
  mood: MoodAnalysisResult | null;
  isAnalyzing: boolean;

  // Scroll tracking
  handleScroll: (event: { nativeEvent: NativeScrollEvent }) => void;

  // Engagement tracking
  trackPostView: (postId: string, category: string, creatorId: string, contentType: 'image' | 'video' | 'carousel') => void;
  trackPostExit: (postId: string, timeSpentSeconds: number) => void;
  trackLike: (postId: string, category: string) => void;
  trackComment: (postId: string, category: string) => void;
  trackShare: (postId: string, category: string) => void;
  trackSave: (postId: string, category: string) => void;

  // Recommendations
  getRecommendations: (posts: Post[], userProfile: UserProfile, limit?: number) => Promise<RecommendationResult>;
  quickRerank: (posts: Post[]) => Post[];

  // Manual controls
  refreshMood: () => void;
  startSession: () => void;
  endSession: () => void;
}

// ============================================================================
// HOOK IMPLEMENTATION
// ============================================================================

export function useMoodAI(options: UseMoodAIOptions = {}): UseMoodAIReturn {
  const {
    enableScrollTracking = true,
    moodUpdateInterval = 30000, // Update mood every 30 seconds
    onMoodChange,
  } = options;

  // State
  const [mood, setMood] = useState<MoodAnalysisResult | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // Refs for tracking
  const lastMoodRef = useRef<MoodType | null>(null);
  const currentPostRef = useRef<{ postId: string; startTime: number } | null>(null);
  const moodIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const onMoodChangeRef = useRef(onMoodChange);

  // Keep callback ref updated
  useEffect(() => {
    onMoodChangeRef.current = onMoodChange;
  }, [onMoodChange]);

  // ============================================================================
  // SESSION MANAGEMENT
  // ============================================================================

  const startSession = useCallback(() => {
    moodDetection.startSession();

    // Start periodic mood updates
    if (moodIntervalRef.current) {
      clearInterval(moodIntervalRef.current);
    }

    moodIntervalRef.current = setInterval(() => {
      const newMood = moodDetection.analyzeMood();
      setMood(newMood);

      // Notify if mood changed
      if (lastMoodRef.current !== newMood.primaryMood) {
        lastMoodRef.current = newMood.primaryMood;
        onMoodChangeRef.current?.(newMood);
      }
    }, moodUpdateInterval);

    // Initial mood analysis
    const initialMood = moodDetection.analyzeMood();
    setMood(initialMood);
    lastMoodRef.current = initialMood.primaryMood;
  }, [moodUpdateInterval]);

  const endSession = useCallback(() => {
    moodDetection.endSession();

    if (moodIntervalRef.current) {
      clearInterval(moodIntervalRef.current);
      moodIntervalRef.current = null;
    }
  }, []);

  // Start session on mount only
  useEffect(() => {
    startSession();

    return () => {
      endSession();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ============================================================================
  // SCROLL TRACKING
  // ============================================================================

  const handleScroll = useCallback((event: { nativeEvent: NativeScrollEvent }) => {
    if (!enableScrollTracking) return;

    const { contentOffset } = event.nativeEvent;
    moodDetection.trackScroll(contentOffset.y);
  }, [enableScrollTracking]);

  // ============================================================================
  // ENGAGEMENT TRACKING
  // ============================================================================

  const trackPostView = useCallback((
    postId: string,
    category: string,
    creatorId: string,
    contentType: 'image' | 'video' | 'carousel'
  ) => {
    // End previous post tracking if any
    if (currentPostRef.current) {
      const timeSpent = (Date.now() - currentPostRef.current.startTime) / 1000;
      moodDetection.trackTimeOnPost(currentPostRef.current.postId, timeSpent);
    }

    // Start tracking new post
    currentPostRef.current = { postId, startTime: Date.now() };
    moodDetection.trackPostView(postId, category, creatorId, contentType);
  }, []);

  const trackPostExit = useCallback((postId: string, timeSpentSeconds: number) => {
    moodDetection.trackTimeOnPost(postId, timeSpentSeconds);

    if (currentPostRef.current?.postId === postId) {
      currentPostRef.current = null;
    }
  }, []);

  const trackLike = useCallback((postId: string, category: string) => {
    moodDetection.trackEngagement('like');
  }, []);

  const trackComment = useCallback((postId: string, category: string) => {
    moodDetection.trackEngagement('comment');
  }, []);

  const trackShare = useCallback((postId: string, category: string) => {
    moodDetection.trackEngagement('share');
  }, []);

  const trackSave = useCallback((postId: string, category: string) => {
    moodDetection.trackEngagement('save');
  }, []);

  // ============================================================================
  // RECOMMENDATIONS
  // ============================================================================

  const getRecommendations = useCallback(async (
    posts: Post[],
    userProfile: UserProfile,
    limit: number = 20
  ): Promise<RecommendationResult> => {
    setIsAnalyzing(true);

    try {
      const result = await moodRecommendation.getRecommendations(posts, userProfile, limit);
      setMood(result.mood);
      return result;
    } finally {
      setIsAnalyzing(false);
    }
  }, []);

  const quickRerank = useCallback((posts: Post[]): Post[] => {
    if (!mood) return posts;
    return moodRecommendation.quickRerank(posts, mood);
  }, [mood]);

  // ============================================================================
  // MANUAL CONTROLS
  // ============================================================================

  const refreshMood = useCallback(() => {
    const newMood = moodDetection.analyzeMood();
    setMood(newMood);

    if (lastMoodRef.current !== newMood.primaryMood) {
      lastMoodRef.current = newMood.primaryMood;
      onMoodChangeRef.current?.(newMood);
    }
  }, []);

  // ============================================================================
  // RETURN
  // ============================================================================

  return {
    mood,
    isAnalyzing,
    handleScroll,
    trackPostView,
    trackPostExit,
    trackLike,
    trackComment,
    trackShare,
    trackSave,
    getRecommendations,
    quickRerank,
    refreshMood,
    startSession,
    endSession,
  };
}

// ============================================================================
// MOOD DISPLAY HELPERS
// ============================================================================

export const MOOD_DISPLAY = {
  energetic: {
    emoji: '⚡',
    label: 'Energetic',
    color: '#FF6B6B',
    description: 'Ready to conquer the day',
    gradient: ['#FF6B6B', '#FF8E53'],
  },
  relaxed: {
    emoji: '🌿',
    label: 'Relaxed',
    color: '#4CAF50',
    description: 'Taking it easy',
    gradient: ['#4CAF50', '#8BC34A'],
  },
  social: {
    emoji: '👋',
    label: 'Social',
    color: '#2196F3',
    description: 'Feeling connected',
    gradient: ['#2196F3', '#03A9F4'],
  },
  creative: {
    emoji: '🎨',
    label: 'Creative',
    color: '#9C27B0',
    description: 'Inspired and imaginative',
    gradient: ['#9C27B0', '#E040FB'],
  },
  focused: {
    emoji: '💡',
    label: 'Focused',
    color: '#FF9800',
    description: 'Deep in concentration',
    gradient: ['#FF9800', '#FFC107'],
  },
  neutral: {
    emoji: '✨',
    label: 'Exploring',
    color: '#607D8B',
    description: 'Open to discovery',
    gradient: ['#607D8B', '#90A4AE'],
  },
} as const;

export function getMoodDisplay(moodType: MoodType) {
  return MOOD_DISPLAY[moodType];
}

// ============================================================================
// METRICS HELPERS
// ============================================================================

export interface MoodMetrics {
  sessionJoyScore: number;      // -1 to 1: mood improvement during session
  engagementQuality: number;    // 0 to 1: quality of engagement
  discoveryRate: number;        // 0 to 1: % new content explored
}

export function calculateSessionMetrics(
  startMood: MoodAnalysisResult | null,
  endMood: MoodAnalysisResult | null
): MoodMetrics {
  // Default metrics
  const metrics: MoodMetrics = {
    sessionJoyScore: 0,
    engagementQuality: 0,
    discoveryRate: 0,
  };

  if (!startMood || !endMood) return metrics;

  // Calculate joy score (positive mood increase)
  const positiveStart = startMood.probabilities.energetic + startMood.probabilities.social + startMood.probabilities.creative;
  const positiveEnd = endMood.probabilities.energetic + endMood.probabilities.social + endMood.probabilities.creative;
  metrics.sessionJoyScore = positiveEnd - positiveStart;

  // Engagement quality from signals
  metrics.engagementQuality = endMood.signals.engagement;

  return metrics;
}

/**
 * useMoodAI Hook - Smuppy AI Integration
 *
 * React hook for integrating mood detection and recommendations
 * into feed components.
 *
 * Features:
 * - Automatic scroll tracking
 * - Real-time mood updates with ADAPTIVE refresh rates
 * - Engagement tracking helpers
 * - Recommendation fetching
 * - Background state awareness
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { NativeScrollEvent, AppState, AppStateStatus } from 'react-native';
import { moodDetection, MoodAnalysisResult, MoodType } from '../services/moodDetection';
import { moodRecommendation, Post, UserProfile, RecommendationResult } from '../services/moodRecommendation';
import { addPositiveAction } from '../services/rippleTracker';
import { isFeatureEnabled } from '../config/featureFlags';
import { useVibeStore } from '../stores/vibeStore';

// ============================================================================
// ADAPTIVE REFRESH CONFIGURATION
// ============================================================================

const REFRESH_INTERVALS = {
  ACTIVE: 20000,      // 20s when actively scrolling
  IDLE: 60000,        // 60s when inactive
  INTERACTION: 0,     // Immediate on interaction
} as const;

const ACTIVITY_TIMEOUT = 5000; // Consider idle after 5s of no activity

// ============================================================================
// TYPES
// ============================================================================

export interface UseMoodAIOptions {
  /** Set to false to disable all mood tracking (e.g. for business accounts) */
  enabled?: boolean;
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

  // History
  getMoodHistory: () => MoodAnalysisResult[];
}

// ============================================================================
// HOOK IMPLEMENTATION
// ============================================================================

export function useMoodAI(options: UseMoodAIOptions = {}): UseMoodAIReturn {
  const {
    enabled = true,
    enableScrollTracking = true,
    onMoodChange,
  } = options;

  // State
  const [mood, setMood] = useState<MoodAnalysisResult | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isActive, setIsActive] = useState(false);

  // Refs for tracking
  const lastMoodRef = useRef<MoodType | null>(null);
  const currentPostRef = useRef<{ postId: string; startTime: number } | null>(null);
  const moodIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const activityTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const onMoodChangeRef = useRef(onMoodChange);

  // Keep callback ref updated
  useEffect(() => {
    onMoodChangeRef.current = onMoodChange;
  }, [onMoodChange]);

  // ============================================================================
  // MOOD ANALYSIS HELPER
  // ============================================================================

  const analyzeMoodAndUpdate = useCallback(() => {
    const newMood = moodDetection.analyzeMood();
    setMood(newMood);

    // Notify if mood changed
    if (lastMoodRef.current !== newMood.primaryMood) {
      lastMoodRef.current = newMood.primaryMood;
      onMoodChangeRef.current?.(newMood);
      if (__DEV__) console.log('[MoodAI] Mood changed to:', newMood.primaryMood);
    }

    return newMood;
  }, []);

  // ============================================================================
  // ADAPTIVE REFRESH SYSTEM
  // ============================================================================

  const setRefreshInterval = useCallback((intervalMs: number) => {
    if (moodIntervalRef.current) {
      clearInterval(moodIntervalRef.current);
    }

    if (intervalMs > 0 && appStateRef.current === 'active') {
      moodIntervalRef.current = setInterval(analyzeMoodAndUpdate, intervalMs);
      if (__DEV__) console.log('[MoodAI] Refresh interval set to:', intervalMs / 1000, 's');
    }
  }, [analyzeMoodAndUpdate]);

  const markActive = useCallback(() => {
    // Clear existing activity timeout
    if (activityTimeoutRef.current) {
      clearTimeout(activityTimeoutRef.current);
    }

    // If not already active, switch to active mode
    if (!isActive) {
      setIsActive(true);
      setRefreshInterval(REFRESH_INTERVALS.ACTIVE);
    }

    // Set timeout to switch back to idle
    activityTimeoutRef.current = setTimeout(() => {
      setIsActive(false);
      setRefreshInterval(REFRESH_INTERVALS.IDLE);
      if (__DEV__) console.log('[MoodAI] Switched to idle mode');
    }, ACTIVITY_TIMEOUT);
  }, [isActive, setRefreshInterval]);

  // ============================================================================
  // APP STATE HANDLING (Background/Foreground)
  // ============================================================================

  useEffect(() => {
    if (!enabled) return;
    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      if (appStateRef.current.match(/inactive|background/) && nextAppState === 'active') {
        // App came to foreground - resume refresh
        if (__DEV__) console.log('[MoodAI] App foregrounded - resuming');
        setRefreshInterval(isActive ? REFRESH_INTERVALS.ACTIVE : REFRESH_INTERVALS.IDLE);
        analyzeMoodAndUpdate(); // Immediate refresh on foreground
      } else if (nextAppState.match(/inactive|background/)) {
        // App went to background - pause refresh
        if (__DEV__) console.log('[MoodAI] App backgrounded - pausing');
        if (moodIntervalRef.current) {
          clearInterval(moodIntervalRef.current);
          moodIntervalRef.current = null;
        }
      }
      appStateRef.current = nextAppState;
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => subscription?.remove();
  }, [isActive, setRefreshInterval, analyzeMoodAndUpdate]);

  // ============================================================================
  // SESSION MANAGEMENT
  // ============================================================================

  const startSession = useCallback(() => {
    moodDetection.startSession();

    // Start with idle interval
    setRefreshInterval(REFRESH_INTERVALS.IDLE);

    // Initial mood analysis
    const initialMood = analyzeMoodAndUpdate();
    if (__DEV__) console.log('[MoodAI] Session started with mood:', initialMood.primaryMood);
  }, [setRefreshInterval, analyzeMoodAndUpdate]);

  const endSession = useCallback(() => {
    moodDetection.endSession();

    if (moodIntervalRef.current) {
      clearInterval(moodIntervalRef.current);
      moodIntervalRef.current = null;
    }

    if (activityTimeoutRef.current) {
      clearTimeout(activityTimeoutRef.current);
      activityTimeoutRef.current = null;
    }

    if (__DEV__) console.log('[MoodAI] Session ended');
  }, []);

  // Start session on mount only (skip if disabled)
  useEffect(() => {
    if (!enabled) return;
    startSession();

    return () => {
      endSession();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  // ============================================================================
  // SCROLL TRACKING (marks activity for adaptive refresh)
  // ============================================================================

  const handleScroll = useCallback((event: { nativeEvent: NativeScrollEvent }) => {
    if (!enabled || !enableScrollTracking) return;

    const { contentOffset } = event.nativeEvent;
    moodDetection.trackScroll(contentOffset.y);

    // Mark user as active (switches to faster refresh rate)
    markActive();
  }, [enabled, enableScrollTracking, markActive]);

  // ============================================================================
  // ENGAGEMENT TRACKING (triggers immediate mood refresh)
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

    // Mark active
    markActive();
  }, [markActive]);

  const trackPostExit = useCallback((postId: string, timeSpentSeconds: number) => {
    moodDetection.trackTimeOnPost(postId, timeSpentSeconds);

    if (currentPostRef.current?.postId === postId) {
      currentPostRef.current = null;
    }
  }, []);

  const trackLike = useCallback((_postId: string, _category: string) => {
    moodDetection.trackEngagement('like');
    if (isFeatureEnabled('EMOTIONAL_RIPPLE')) addPositiveAction('like');
    useVibeStore.getState().addVibeAction('like');
    analyzeMoodAndUpdate();
    markActive();
  }, [analyzeMoodAndUpdate, markActive]);

  const trackComment = useCallback((_postId: string, _category: string) => {
    moodDetection.trackEngagement('comment');
    // Immediate mood refresh on interaction
    analyzeMoodAndUpdate();
    markActive();
  }, [analyzeMoodAndUpdate, markActive]);

  const trackShare = useCallback((_postId: string, _category: string) => {
    moodDetection.trackEngagement('share');
    if (isFeatureEnabled('EMOTIONAL_RIPPLE')) addPositiveAction('share');
    useVibeStore.getState().addVibeAction('share');
    analyzeMoodAndUpdate();
    markActive();
  }, [analyzeMoodAndUpdate, markActive]);

  const trackSave = useCallback((_postId: string, _category: string) => {
    moodDetection.trackEngagement('save');
    if (isFeatureEnabled('EMOTIONAL_RIPPLE')) addPositiveAction('save');
    useVibeStore.getState().addVibeAction('save');
    analyzeMoodAndUpdate();
    markActive();
  }, [analyzeMoodAndUpdate, markActive]);

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

  const getMoodHistory = useCallback(() => {
    return moodDetection.getMoodHistory();
  }, []);

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
    getMoodHistory,
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

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Types for engagement tracking
interface PostEngagement {
  postId: string;
  timeSpent: number; // seconds
  liked: boolean;
  saved: boolean;
  commented: boolean;
  shared: boolean;
  category: string;
  timestamp: number;
}

interface SessionData {
  startTime: number;
  endTime?: number;
  postsViewed: number;
  totalTimeSpent: number;
  hourOfDay: number;
  dayOfWeek: number;
}

type MoodType = 'energetic' | 'relaxed' | 'social' | 'creative' | 'focused' | 'neutral';

interface MoodAnalysis {
  currentMood: MoodType;
  confidence: number;
  preferredCategories: string[];
  suggestedContentTypes: ('motivational' | 'calming' | 'social' | 'educational' | 'entertaining')[];
}

interface EngagementState {
  // Engagement history
  recentEngagements: PostEngagement[];
  sessions: SessionData[];

  // Current session
  currentSession: SessionData | null;
  activePostId: string | null;
  activePostStartTime: number | null;

  // Mood analysis
  moodHistory: { mood: MoodType; timestamp: number }[];
  lastMoodAnalysis: MoodAnalysis | null;

  // Category preferences (learned over time)
  categoryPreferences: Record<string, number>;

  // Actions
  startSession: () => void;
  endSession: () => void;
  startViewingPost: (postId: string, category: string) => void;
  endViewingPost: (liked?: boolean, saved?: boolean, commented?: boolean, shared?: boolean) => void;
  recordLike: (postId: string, category: string) => void;
  recordSave: (postId: string, category: string) => void;
  recordComment: (postId: string, category: string) => void;
  recordShare: (postId: string, category: string) => void;
  analyzeMood: () => MoodAnalysis;
  getContentRecommendations: () => {
    categories: string[];
    contentTypes: string[];
    mood: MoodType;
  };
}

// Helper: Get time of day category
const getTimeCategory = (hour: number): 'morning' | 'afternoon' | 'evening' | 'night' => {
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 21) return 'evening';
  return 'night';
};

// Helper: Analyze mood based on engagement patterns
const calculateMood = (
  engagements: PostEngagement[],
  _sessions: SessionData[],
  currentHour: number
): MoodAnalysis => {
  const recentEngagements = engagements.slice(-50); // Last 50 interactions

  // Calculate average time spent
  const avgTimeSpent = recentEngagements.length > 0
    ? recentEngagements.reduce((sum, e) => sum + e.timeSpent, 0) / recentEngagements.length
    : 0;

  // Calculate engagement rate (likes + comments + shares)
  const engagementActions = recentEngagements.filter(e => e.liked || e.commented || e.shared).length;
  const engagementRate = recentEngagements.length > 0 ? engagementActions / recentEngagements.length : 0;

  // Calculate category preferences
  const categoryCount: Record<string, number> = {};
  recentEngagements.forEach(e => {
    if (e.liked || e.saved) {
      categoryCount[e.category] = (categoryCount[e.category] || 0) + (e.liked ? 2 : 1);
    }
  });

  const preferredCategories = Object.entries(categoryCount)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([cat]) => cat);

  // Time-based mood analysis
  const timeCategory = getTimeCategory(currentHour);

  let mood: MoodType = 'neutral';
  let suggestedContentTypes: MoodAnalysis['suggestedContentTypes'] = ['entertaining'];
  let confidence = 0.5;

  // Determine mood based on patterns
  if (timeCategory === 'morning') {
    if (engagementRate > 0.5) {
      mood = 'energetic';
      suggestedContentTypes = ['motivational', 'educational'];
      confidence = 0.7;
    } else {
      mood = 'relaxed';
      suggestedContentTypes = ['calming', 'entertaining'];
      confidence = 0.6;
    }
  } else if (timeCategory === 'afternoon') {
    if (avgTimeSpent > 30) {
      mood = 'focused';
      suggestedContentTypes = ['educational', 'entertaining'];
      confidence = 0.65;
    } else {
      mood = 'social';
      suggestedContentTypes = ['social', 'entertaining'];
      confidence = 0.6;
    }
  } else if (timeCategory === 'evening') {
    if (engagementRate > 0.4) {
      mood = 'social';
      suggestedContentTypes = ['social', 'entertaining'];
      confidence = 0.7;
    } else {
      mood = 'relaxed';
      suggestedContentTypes = ['calming', 'entertaining'];
      confidence = 0.65;
    }
  } else {
    // Night
    mood = 'relaxed';
    suggestedContentTypes = ['calming', 'entertaining'];
    confidence = 0.6;
  }

  // Adjust based on recent activity patterns
  if (recentEngagements.length >= 10) {
    const creativePosts = recentEngagements.filter(e =>
      ['Art', 'Design', 'Photography', 'Music', 'Dance'].includes(e.category)
    ).length;
    if (creativePosts / recentEngagements.length > 0.3) {
      mood = 'creative';
      suggestedContentTypes = ['entertaining', 'educational'];
      confidence = Math.min(confidence + 0.1, 0.9);
    }
  }

  return {
    currentMood: mood,
    confidence,
    preferredCategories,
    suggestedContentTypes,
  };
};

export const useEngagementStore = create<EngagementState>()(
  persist(
    (set, get) => ({
      recentEngagements: [],
      sessions: [],
      currentSession: null,
      activePostId: null,
      activePostStartTime: null,
      moodHistory: [],
      lastMoodAnalysis: null,
      categoryPreferences: {},

      startSession: () => {
        const now = Date.now();
        const date = new Date(now);
        set({
          currentSession: {
            startTime: now,
            postsViewed: 0,
            totalTimeSpent: 0,
            hourOfDay: date.getHours(),
            dayOfWeek: date.getDay(),
          },
        });
      },

      endSession: () => {
        const { currentSession, sessions } = get();
        if (currentSession) {
          const completedSession = {
            ...currentSession,
            endTime: Date.now(),
          };
          set({
            sessions: [...sessions.slice(-50), completedSession], // Keep last 50 sessions
            currentSession: null,
          });
        }
      },

      startViewingPost: (postId: string, _category: string) => {
        set({
          activePostId: postId,
          activePostStartTime: Date.now(),
        });

        // Update session
        const { currentSession } = get();
        if (currentSession) {
          set({
            currentSession: {
              ...currentSession,
              postsViewed: currentSession.postsViewed + 1,
            },
          });
        }
      },

      endViewingPost: (liked = false, saved = false, commented = false, shared = false) => {
        const { activePostId, activePostStartTime, recentEngagements, categoryPreferences, currentSession } = get();

        if (activePostId && activePostStartTime) {
          const timeSpent = Math.floor((Date.now() - activePostStartTime) / 1000);

          // Find category from recent engagement or default
          const category = 'General'; // Would be passed from the post data

          const engagement: PostEngagement = {
            postId: activePostId,
            timeSpent,
            liked,
            saved,
            commented,
            shared,
            category,
            timestamp: Date.now(),
          };

          // Update category preferences
          const newPreferences = { ...categoryPreferences };
          if (liked) {
            newPreferences[category] = (newPreferences[category] || 0) + 3;
          }
          if (saved) {
            newPreferences[category] = (newPreferences[category] || 0) + 5;
          }
          if (timeSpent > 10) {
            newPreferences[category] = (newPreferences[category] || 0) + 1;
          }

          // Update session
          let updatedSession = currentSession;
          if (currentSession) {
            updatedSession = {
              ...currentSession,
              totalTimeSpent: currentSession.totalTimeSpent + timeSpent,
            };
          }

          set({
            recentEngagements: [...recentEngagements.slice(-200), engagement], // Keep last 200
            activePostId: null,
            activePostStartTime: null,
            categoryPreferences: newPreferences,
            currentSession: updatedSession,
          });
        }
      },

      recordLike: (postId: string, category: string) => {
        const { categoryPreferences } = get();
        set({
          categoryPreferences: {
            ...categoryPreferences,
            [category]: (categoryPreferences[category] || 0) + 3,
          },
        });
      },

      recordSave: (postId: string, category: string) => {
        const { categoryPreferences } = get();
        set({
          categoryPreferences: {
            ...categoryPreferences,
            [category]: (categoryPreferences[category] || 0) + 5,
          },
        });
      },

      recordComment: (postId: string, category: string) => {
        const { categoryPreferences } = get();
        set({
          categoryPreferences: {
            ...categoryPreferences,
            [category]: (categoryPreferences[category] || 0) + 4,
          },
        });
      },

      recordShare: (postId: string, category: string) => {
        const { categoryPreferences } = get();
        set({
          categoryPreferences: {
            ...categoryPreferences,
            [category]: (categoryPreferences[category] || 0) + 6,
          },
        });
      },

      analyzeMood: () => {
        const { recentEngagements, sessions, moodHistory } = get();
        const currentHour = new Date().getHours();

        const analysis = calculateMood(recentEngagements, sessions, currentHour);

        // Update mood history
        set({
          moodHistory: [...moodHistory.slice(-100), { mood: analysis.currentMood, timestamp: Date.now() }],
          lastMoodAnalysis: analysis,
        });

        return analysis;
      },

      getContentRecommendations: () => {
        const { categoryPreferences, lastMoodAnalysis } = get();
        const analysis = lastMoodAnalysis || get().analyzeMood();

        // Get top categories from preferences
        const sortedCategories = Object.entries(categoryPreferences)
          .sort(([, a], [, b]) => b - a)
          .slice(0, 10)
          .map(([cat]) => cat);

        // Combine with mood-based preferences
        const categories = [...new Set([...analysis.preferredCategories, ...sortedCategories])].slice(0, 8);

        // Map content types to boost positivity
        const contentTypes = analysis.suggestedContentTypes.map(type => {
          // Smuppy's mission: bring joy and positive impact
          if (type === 'calming') return 'wellness';
          if (type === 'motivational') return 'inspiration';
          if (type === 'social') return 'community';
          return type;
        });

        return {
          categories,
          contentTypes,
          mood: analysis.currentMood,
        };
      },
    }),
    {
      name: 'smuppy-engagement-store',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        recentEngagements: state.recentEngagements.slice(-100), // Only persist last 100
        sessions: state.sessions.slice(-20), // Only persist last 20 sessions
        categoryPreferences: state.categoryPreferences,
        moodHistory: state.moodHistory.slice(-50), // Only persist last 50 mood entries
      }),
    }
  )
);

// Export types for use in other files
export type { MoodType, MoodAnalysis, PostEngagement, SessionData };

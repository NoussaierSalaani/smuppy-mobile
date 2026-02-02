/**
 * Vibe Store — Central Zustand store for the Vibe Ecosystem
 *
 * Manages: vibe score, levels, badges, ripple score, prescription history.
 * Persisted to AsyncStorage.
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ============================================================================
// TYPES
// ============================================================================

export interface RippleEntry {
  action: string;
  timestamp: number;
}

export interface PrescriptionPreferences {
  enabledCategories: string[];
  excludedTypes: string[];
  activityLevel: 'low' | 'medium' | 'high';
  outdoorPreference: 'always' | 'weather_permitting' | 'never';
  frequency: 'hourly' | 'few_times_daily' | 'daily';
}

export type VibeActionType =
  | 'post'
  | 'like'
  | 'share'
  | 'save'
  | 'daily_login'
  | 'streak_bonus'
  | 'prescription_complete'
  | 'explore_spot'
  | 'join_event'
  | 'follow_user';

export interface VibeAction {
  type: VibeActionType;
  timestamp: number;
}

export type VibeLevel = 'newcomer' | 'explorer' | 'contributor' | 'influencer' | 'legend';

export interface BadgeDefinition {
  id: string;
  name: string;
  description: string;
  icon: string;
  earnedAt?: number;
}

export interface VibeState {
  // ── Score & Level ──
  vibeScore: number;
  vibeLevel: VibeLevel;
  actionHistory: VibeAction[];
  addVibeAction: (type: VibeActionType) => void;

  // ── Streaks ──
  currentStreak: number;
  longestStreak: number;
  lastLoginDate: string | null;
  checkDailyLogin: () => void;

  // ── Badges ──
  earnedBadges: string[];
  checkBadges: () => void;

  // ── Ripple ──
  rippleScore: number;
  rippleHistory: RippleEntry[];
  addRipple: (action: string) => void;

  // ── Prescriptions ──
  prescriptionPreferences: PrescriptionPreferences;
  completedToday: string[];
  completedTodayDate: string | null;
  prescriptionStartedAt: number | null;
  rushedToday: number;
  updatePreferences: (prefs: Partial<PrescriptionPreferences>) => void;
  startPrescription: () => void;
  completePrescription: (id: string, reward: number, durationMinutes: number) => void;
  checkDailyReset: () => void;

  // ── Reset ──
  reset: () => void;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const ACTION_POINTS: Record<VibeActionType, number> = {
  post: 10,
  like: 1,
  share: 3,
  save: 2,
  daily_login: 5,
  streak_bonus: 10,
  prescription_complete: 15,
  explore_spot: 8,
  join_event: 12,
  follow_user: 2,
};

const LEVEL_THRESHOLDS: Array<{ min: number; level: VibeLevel }> = [
  { min: 500, level: 'legend' },
  { min: 200, level: 'influencer' },
  { min: 80, level: 'contributor' },
  { min: 20, level: 'explorer' },
  { min: 0, level: 'newcomer' },
];

const MAX_ACTION_HISTORY = 200;
const MAX_RIPPLE_HISTORY = 100;

const INITIAL_PREFERENCES: PrescriptionPreferences = {
  enabledCategories: ['movement', 'mindfulness', 'social', 'creative', 'nutrition'],
  excludedTypes: [],
  activityLevel: 'medium',
  outdoorPreference: 'weather_permitting',
  frequency: 'few_times_daily',
};

// ============================================================================
// HELPERS
// ============================================================================

function resolveLevel(score: number): VibeLevel {
  for (const { min, level } of LEVEL_THRESHOLDS) {
    if (score >= min) return level;
  }
  return 'newcomer';
}

function getTodayKey(): string {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

// ============================================================================
// STORE
// ============================================================================

export const useVibeStore = create<VibeState>()(
  persist(
    immer((set, get) => ({
      // ── Score & Level ──
      vibeScore: 0,
      vibeLevel: 'newcomer' as VibeLevel,
      actionHistory: [],

      addVibeAction: (type: VibeActionType) =>
        set((state) => {
          const points = ACTION_POINTS[type] || 0;
          state.vibeScore += points;
          state.vibeLevel = resolveLevel(state.vibeScore);

          state.actionHistory.push({ type, timestamp: Date.now() });
          if (state.actionHistory.length > MAX_ACTION_HISTORY) {
            state.actionHistory.splice(0, state.actionHistory.length - MAX_ACTION_HISTORY);
          }
        }),

      // ── Streaks ──
      currentStreak: 0,
      longestStreak: 0,
      lastLoginDate: null,

      checkDailyLogin: () =>
        set((state) => {
          const today = getTodayKey();
          if (state.lastLoginDate === today) return; // Already logged today

          const yesterday = new Date();
          yesterday.setDate(yesterday.getDate() - 1);
          const yesterdayKey = yesterday.toISOString().slice(0, 10);

          if (state.lastLoginDate === yesterdayKey) {
            // Consecutive day
            state.currentStreak += 1;
          } else {
            // Streak broken
            state.currentStreak = 1;
          }

          if (state.currentStreak > state.longestStreak) {
            state.longestStreak = state.currentStreak;
          }

          state.lastLoginDate = today;

          // Award points
          state.vibeScore += ACTION_POINTS.daily_login;
          if (state.currentStreak >= 7) {
            state.vibeScore += ACTION_POINTS.streak_bonus;
          }
          state.vibeLevel = resolveLevel(state.vibeScore);
        }),

      // ── Badges ──
      earnedBadges: [],

      checkBadges: () =>
        set((state) => {
          const earned = new Set(state.earnedBadges);
          const actions = state.actionHistory;

          // First Post
          if (!earned.has('first_post') && actions.some(a => a.type === 'post')) {
            earned.add('first_post');
          }

          // Social Butterfly — 10 follows
          if (!earned.has('social_butterfly') && actions.filter(a => a.type === 'follow_user').length >= 10) {
            earned.add('social_butterfly');
          }

          // Explorer — visited 5 spots
          if (!earned.has('explorer') && actions.filter(a => a.type === 'explore_spot').length >= 5) {
            earned.add('explorer');
          }

          // Streak Master — 7-day streak
          if (!earned.has('streak_master') && state.currentStreak >= 7) {
            earned.add('streak_master');
          }

          // Wellness Warrior — 10 prescriptions
          if (!earned.has('wellness_warrior') && actions.filter(a => a.type === 'prescription_complete').length >= 10) {
            earned.add('wellness_warrior');
          }

          // Generous Soul — 50 likes
          if (!earned.has('generous_soul') && actions.filter(a => a.type === 'like').length >= 50) {
            earned.add('generous_soul');
          }

          // Early Bird — post before 8am (check latest post)
          if (!earned.has('early_bird')) {
            const posts = actions.filter(a => a.type === 'post');
            const hasEarlyPost = posts.some(a => new Date(a.timestamp).getHours() < 8);
            if (hasEarlyPost) earned.add('early_bird');
          }

          // Night Owl — post after 11pm
          if (!earned.has('night_owl')) {
            const posts = actions.filter(a => a.type === 'post');
            const hasLatePost = posts.some(a => new Date(a.timestamp).getHours() >= 23);
            if (hasLatePost) earned.add('night_owl');
          }

          // Event Lover — joined 3 events
          if (!earned.has('event_lover') && actions.filter(a => a.type === 'join_event').length >= 3) {
            earned.add('event_lover');
          }

          // Content Sharer — 10 shares
          if (!earned.has('content_sharer') && actions.filter(a => a.type === 'share').length >= 10) {
            earned.add('content_sharer');
          }

          state.earnedBadges = Array.from(earned);
        }),

      // ── Ripple ──
      rippleScore: 0,
      rippleHistory: [],

      addRipple: (action: string) =>
        set((state) => {
          state.rippleScore = Math.min(200, state.rippleScore + 1);
          state.rippleHistory.push({ action, timestamp: Date.now() });

          if (state.rippleHistory.length > MAX_RIPPLE_HISTORY) {
            state.rippleHistory.splice(0, state.rippleHistory.length - MAX_RIPPLE_HISTORY);
          }
        }),

      // ── Prescriptions ──
      prescriptionPreferences: { ...INITIAL_PREFERENCES },
      completedToday: [],
      completedTodayDate: null,
      prescriptionStartedAt: null,
      rushedToday: 0,

      updatePreferences: (prefs: Partial<PrescriptionPreferences>) =>
        set((state) => {
          state.prescriptionPreferences = { ...state.prescriptionPreferences, ...prefs };
        }),

      startPrescription: () =>
        set((state) => {
          state.prescriptionStartedAt = Date.now();
        }),

      completePrescription: (id: string, reward: number, durationMinutes: number) =>
        set((state) => {
          if (!state.completedToday.includes(id)) {
            state.completedToday.push(id);
          }
          state.completedTodayDate = getTodayKey();

          let finalReward = reward;
          if (state.prescriptionStartedAt !== null) {
            const elapsed = Date.now() - state.prescriptionStartedAt;
            const minRequired = durationMinutes * 60 * 1000 * 0.3;
            if (elapsed < minRequired) {
              finalReward = Math.ceil(reward * 0.5);
              state.rushedToday += 1;
            }
          }

          state.vibeScore += finalReward;
          state.vibeLevel = resolveLevel(state.vibeScore);
          state.prescriptionStartedAt = null;
        }),

      checkDailyReset: () =>
        set((state) => {
          const today = getTodayKey();
          if (state.completedTodayDate !== today) {
            state.completedToday = [];
            state.rushedToday = 0;
            state.completedTodayDate = today;
          }
        }),

      // ── Reset ──
      reset: () =>
        set((state) => {
          state.vibeScore = 0;
          state.vibeLevel = 'newcomer';
          state.actionHistory = [];
          state.currentStreak = 0;
          state.longestStreak = 0;
          state.lastLoginDate = null;
          state.earnedBadges = [];
          state.rippleScore = 0;
          state.rippleHistory = [];
          state.prescriptionPreferences = { ...INITIAL_PREFERENCES };
          state.completedToday = [];
          state.completedTodayDate = null;
          state.prescriptionStartedAt = null;
          state.rushedToday = 0;
        }),
    })),
    {
      name: '@smuppy_vibe_store',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        vibeScore: state.vibeScore,
        vibeLevel: state.vibeLevel,
        actionHistory: state.actionHistory,
        currentStreak: state.currentStreak,
        longestStreak: state.longestStreak,
        lastLoginDate: state.lastLoginDate,
        earnedBadges: state.earnedBadges,
        rippleScore: state.rippleScore,
        rippleHistory: state.rippleHistory,
        prescriptionPreferences: state.prescriptionPreferences,
        completedToday: state.completedToday,
        completedTodayDate: state.completedTodayDate,
        prescriptionStartedAt: state.prescriptionStartedAt,
        rushedToday: state.rushedToday,
      }),
    },
  ),
);

// Direct access for resetAllStores
export const vibeStore = {
  reset: () => useVibeStore.getState().reset(),
};

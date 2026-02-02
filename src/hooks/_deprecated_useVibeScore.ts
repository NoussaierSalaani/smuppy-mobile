/**
 * useVibeScore — Passive vibe score, level, streaks, and badges
 *
 * Reads from vibeStore. No popups, no timers.
 * Everything is earned silently through normal app usage.
 */

import { useMemo } from 'react';
import { useVibeStore, VibeLevel } from '../stores/vibeStore';
import { isFeatureEnabled } from '../config/featureFlags';

type IoniconsName = 'ribbon' | 'star' | 'trophy' | 'flash' | 'people' | 'compass' |
  'flame' | 'heart' | 'moon' | 'sunny' | 'calendar' | 'share-social';

export interface BadgeInfo {
  id: string;
  name: string;
  description: string;
  icon: IoniconsName;
}

const BADGE_CATALOG: BadgeInfo[] = [
  { id: 'first_post', name: 'First Post', description: 'Published your first post', icon: 'star' },
  { id: 'social_butterfly', name: 'Social Butterfly', description: 'Followed 10 people', icon: 'people' },
  { id: 'explorer', name: 'Explorer', description: 'Visited 5 spots', icon: 'compass' },
  { id: 'streak_master', name: 'Streak Master', description: '7-day login streak', icon: 'flame' },
  { id: 'wellness_warrior', name: 'Wellness Warrior', description: 'Completed 10 prescriptions', icon: 'heart' },
  { id: 'generous_soul', name: 'Generous Soul', description: 'Liked 50 posts', icon: 'heart' },
  { id: 'early_bird', name: 'Early Bird', description: 'Posted before 8am', icon: 'sunny' },
  { id: 'night_owl', name: 'Night Owl', description: 'Posted after 11pm', icon: 'moon' },
  { id: 'event_lover', name: 'Event Lover', description: 'Joined 3 events', icon: 'calendar' },
  { id: 'content_sharer', name: 'Content Sharer', description: 'Shared 10 posts', icon: 'share-social' },
];

const LEVEL_CONFIG: Record<VibeLevel, { label: string; color: string; icon: IoniconsName; nextAt: number | null }> = {
  newcomer: { label: 'Newcomer', color: '#9E9E9E', icon: 'ribbon', nextAt: 20 },
  explorer: { label: 'Explorer', color: '#4CAF50', icon: 'compass', nextAt: 80 },
  contributor: { label: 'Contributor', color: '#2196F3', icon: 'star', nextAt: 200 },
  influencer: { label: 'Influencer', color: '#9C27B0', icon: 'flash', nextAt: 500 },
  legend: { label: 'Legend', color: '#FF9800', icon: 'trophy', nextAt: null },
};

export interface UseVibeScoreReturn {
  enabled: boolean;
  vibeScore: number;
  vibeLevel: VibeLevel;
  levelConfig: typeof LEVEL_CONFIG[VibeLevel];
  progressToNext: number; // 0-1
  currentStreak: number;
  longestStreak: number;
  earnedBadges: BadgeInfo[];
  allBadges: BadgeInfo[];
}

export function useVibeScore(): UseVibeScoreReturn {
  const enabled = isFeatureEnabled('VIBE_SCORE');
  const vibeScore = useVibeStore((s) => s.vibeScore);
  const vibeLevel = useVibeStore((s) => s.vibeLevel);
  const currentStreak = useVibeStore((s) => s.currentStreak);
  const longestStreak = useVibeStore((s) => s.longestStreak);
  const earnedBadgeIds = useVibeStore((s) => s.earnedBadges);

  const levelConfig = LEVEL_CONFIG[vibeLevel];

  const progressToNext = useMemo(() => {
    if (!levelConfig.nextAt) return 1; // Legend = maxed
    const currentMin = LEVEL_THRESHOLDS_MAP[vibeLevel];
    const range = levelConfig.nextAt - currentMin;
    if (range <= 0) return 1;
    return Math.min(1, (vibeScore - currentMin) / range);
  }, [vibeScore, vibeLevel, levelConfig.nextAt]);

  const earnedBadges = useMemo(
    () => BADGE_CATALOG.filter((b) => earnedBadgeIds.includes(b.id)),
    [earnedBadgeIds],
  );

  return {
    enabled,
    vibeScore,
    vibeLevel,
    levelConfig,
    progressToNext,
    currentStreak,
    longestStreak,
    earnedBadges,
    allBadges: BADGE_CATALOG,
  };
}

const LEVEL_THRESHOLDS_MAP: Record<VibeLevel, number> = {
  newcomer: 0,
  explorer: 20,
  contributor: 80,
  influencer: 200,
  legend: 500,
};

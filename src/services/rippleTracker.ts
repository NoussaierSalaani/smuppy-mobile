/**
 * Ripple Tracker — Tracks positive interactions given by the user
 *
 * Counts likes, shares, encouraging actions.
 * Persists via vibeStore (Zustand + AsyncStorage).
 */

import { useVibeStore } from '../stores/vibeStore';

// ============================================================================
// TYPES
// ============================================================================

export type RippleActionType = 'like' | 'share' | 'save' | 'follow' | 'encourage';

// ============================================================================
// RIPPLE LEVEL THRESHOLDS
// ============================================================================

export interface RippleLevel {
  name: string;
  minScore: number;
  maxRings: number; // Visual: number of concentric rings on profile
  color: string;
}

export const RIPPLE_LEVELS: RippleLevel[] = [
  { name: 'Spark', minScore: 0, maxRings: 1, color: '#607D8B' },
  { name: 'Glow', minScore: 10, maxRings: 2, color: '#4CAF50' },
  { name: 'Shine', minScore: 30, maxRings: 3, color: '#2196F3' },
  { name: 'Radiance', minScore: 60, maxRings: 4, color: '#9C27B0' },
  { name: 'Aura', minScore: 100, maxRings: 5, color: '#FF9800' },
];

// ============================================================================
// SERVICE
// ============================================================================

/**
 * Add a positive action to the ripple tracker.
 * Also awards vibe score points.
 */
export function addPositiveAction(action: RippleActionType): void {
  const store = useVibeStore.getState();
  store.addRipple(action);
  store.addVibeAction(action === 'follow' ? 'follow_user' : action as 'like' | 'share' | 'save');
}

/**
 * Get current ripple score from store.
 */
export function getRippleScore(): number {
  return useVibeStore.getState().rippleScore;
}

/**
 * Get current ripple level based on score.
 */
export function getRippleLevel(score?: number): RippleLevel {
  const s = score ?? getRippleScore();
  // Find highest matching level
  for (let i = RIPPLE_LEVELS.length - 1; i >= 0; i--) {
    if (s >= RIPPLE_LEVELS[i].minScore) {
      return RIPPLE_LEVELS[i];
    }
  }
  return RIPPLE_LEVELS[0];
}

/**
 * Get animation intensity (0-1) for ripple visualization.
 */
export function getRippleAnimationIntensity(score?: number): number {
  const s = score ?? getRippleScore();
  // Normalize to 0-1, cap at 200
  return Math.min(1, s / 200);
}

/**
 * Vibe Profile — Adapts Vibe Ecosystem behavior per user type & interests
 *
 * - Personal: interests drive guardian thresholds
 * - Pro Creator: expertise adjusts session tolerance
 * - Pro Business: ALL vibe features disabled (commercial accounts)
 */

import { MoodType } from './moodDetection';

// ============================================================================
// TYPES
// ============================================================================

export type AccountType = 'personal' | 'pro_creator' | 'pro_business';

export interface VibeProfileConfig {
  /** Whether vibe features are available for this account */
  vibeEnabled: boolean;

  /** Guardian: session duration (minutes) before first alert can trigger */
  guardianMinSessionMinutes: number;
  /** Guardian: degradation threshold (0-1) to trigger alert */
  guardianAlertThreshold: number;
  /** Guardian: passive consumption timeout (ms) before counting as passive */
  guardianPassiveTimeoutMs: number;

  /** Moods that are considered "positive" for this user's context */
  positiveMoods: MoodType[];
}

// ============================================================================
// INTEREST-BASED ADJUSTMENTS
// ============================================================================

/** Interests/expertise that imply longer natural session times */
const HIGH_SESSION_INTERESTS = new Set([
  'fitness', 'workout', 'gaming', 'education', 'tutorial',
  'photography', 'art', 'design', 'music', 'dance',
]);

/** Interests/expertise that imply calmer browsing (lower passive timeout) */
const CALM_INTERESTS = new Set([
  'meditation', 'yoga', 'wellness', 'nature', 'asmr', 'relaxation',
  'mindfulness', 'sleep',
]);

// ============================================================================
// CONFIG BUILDER
// ============================================================================

/**
 * Build a VibeProfileConfig from user data.
 *
 * @param accountType - personal | pro_creator | pro_business
 * @param tags - interests (personal) or expertise (pro_creator)
 */
export function buildVibeProfile(
  accountType: AccountType | undefined,
  tags: string[] = [],
): VibeProfileConfig {
  // Pro business → disable everything
  if (accountType === 'pro_business') {
    return {
      vibeEnabled: false,
      guardianMinSessionMinutes: 0,
      guardianAlertThreshold: 1,
      guardianPassiveTimeoutMs: 0,
      positiveMoods: [],
    };
  }

  const normalizedTags = tags.map(t => t.toLowerCase().trim());

  // --- Guardian thresholds ---
  const hasHighSession = normalizedTags.some(t => HIGH_SESSION_INTERESTS.has(t));
  const hasCalm = normalizedTags.some(t => CALM_INTERESTS.has(t));

  // Users with fitness/gaming/education interests naturally spend more time
  const guardianMinSessionMinutes = hasHighSession ? 3 : 2;

  // Calm interests → shorter passive timeout (they should pause more)
  // High-session interests → longer passive timeout
  let guardianPassiveTimeoutMs = 90_000; // default 90s
  if (hasCalm) {
    guardianPassiveTimeoutMs = 60_000; // 60s for calm users
  } else if (hasHighSession) {
    guardianPassiveTimeoutMs = 120_000; // 120s for active users
  }

  // Alert threshold: calm users get alerted earlier
  const guardianAlertThreshold = hasCalm ? 0.6 : 0.7;

  // --- Positive moods ---
  const isCreator = accountType === 'pro_creator';
  const positiveMoods: MoodType[] = ['energetic', 'social', 'creative'];
  if (isCreator) {
    positiveMoods.push('focused');
  }

  return {
    vibeEnabled: true,
    guardianMinSessionMinutes,
    guardianAlertThreshold,
    guardianPassiveTimeoutMs,
    positiveMoods,
  };
}

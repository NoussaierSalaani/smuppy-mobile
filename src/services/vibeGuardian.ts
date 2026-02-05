/**
 * Vibe Guardian Service — Anti-doom-scroll protection
 *
 * Singleton that monitors session health by comparing mood snapshots
 * on a sliding window. Detects: rapid scrolling + zero engagement > 90s
 * → mood degradation alert.
 */

import { MoodAnalysisResult, MoodType, moodDetection } from './moodDetection';
import { VibeProfileConfig } from './vibeProfile';

// ============================================================================
// TYPES
// ============================================================================

export interface VibeHealthStatus {
  level: 'thriving' | 'stable' | 'declining' | 'alert';
  degradationScore: number;        // 0-1, higher = worse
  passiveConsumptionRatio: number;  // 0-1, ratio of passive vs active time
  sessionDurationMinutes: number;
}

export interface SessionRecap {
  durationMinutes: number;
  vibeTrajectory: 'improved' | 'stable' | 'declined';
  positiveInteractions: number;
  startMood: MoodType;
  endMood: MoodType;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const SNAPSHOT_INTERVAL_MS = 30_000;        // Take mood snapshot every 30s
const MAX_SNAPSHOTS = 20;                    // Keep last 20 snapshots (10 min window)
const ENGAGEMENT_WEIGHT = 0.25;              // Weight of engagement factor in degradation

// Defaults (overridden by VibeProfileConfig)
const DEFAULT_PASSIVE_THRESHOLD_MS = 90_000;
const DEFAULT_ALERT_THRESHOLD = 0.7;
const DEFAULT_MIN_SESSION_MINUTES = 2;
const DEFAULT_POSITIVE_MOODS: MoodType[] = ['energetic', 'social', 'creative'];

// ============================================================================
// VIBE GUARDIAN ENGINE
// ============================================================================

class VibeGuardianEngine {
  private moodSnapshots: MoodAnalysisResult[] = [];
  private sessionStartTime: number = 0;
  private lastEngagementTime: number = 0;
  private positiveInteractionCount: number = 0;
  private startMood: MoodType = 'neutral';
  private snapshotIntervalId: ReturnType<typeof setInterval> | null = null;
  private isRunning: boolean = false;

  // Configurable thresholds (set via applyProfile)
  private passiveThresholdMs: number = DEFAULT_PASSIVE_THRESHOLD_MS;
  private alertThreshold: number = DEFAULT_ALERT_THRESHOLD;
  private minSessionMinutes: number = DEFAULT_MIN_SESSION_MINUTES;
  private positiveMoods: MoodType[] = DEFAULT_POSITIVE_MOODS;

  /**
   * Apply a VibeProfileConfig to tune guardian thresholds
   */
  applyProfile(config: VibeProfileConfig): void {
    this.passiveThresholdMs = config.guardianPassiveTimeoutMs;
    this.alertThreshold = config.guardianAlertThreshold;
    this.minSessionMinutes = config.guardianMinSessionMinutes;
    this.positiveMoods = config.positiveMoods;
  }

  // ──────────────────────────────────────────────
  // SESSION LIFECYCLE
  // ──────────────────────────────────────────────

  startMonitoring(): void {
    if (this.isRunning) return;

    this.isRunning = true;
    this.sessionStartTime = Date.now();
    this.lastEngagementTime = Date.now();
    this.positiveInteractionCount = 0;
    this.moodSnapshots = [];

    // Take initial snapshot
    const initial = moodDetection.analyzeMood();
    this.startMood = initial.primaryMood;
    this.moodSnapshots.push(initial);

    // Periodic snapshots
    this.snapshotIntervalId = setInterval(() => {
      this.takeSnapshot();
    }, SNAPSHOT_INTERVAL_MS);
  }

  stopMonitoring(): void {
    this.isRunning = false;
    if (this.snapshotIntervalId) {
      clearInterval(this.snapshotIntervalId);
      this.snapshotIntervalId = null;
    }
  }

  // ──────────────────────────────────────────────
  // TRACKING
  // ──────────────────────────────────────────────

  /** Call when user performs any active engagement (like, share, save, post view > 3s) */
  trackEngagement(): void {
    this.lastEngagementTime = Date.now();
  }

  /** Call when user performs a positive interaction (like, share, encouraging action) */
  trackPositiveInteraction(): void {
    this.positiveInteractionCount++;
    this.lastEngagementTime = Date.now();
  }

  // ──────────────────────────────────────────────
  // HEALTH CHECK
  // ──────────────────────────────────────────────

  checkHealth(): VibeHealthStatus {
    const now = Date.now();
    const sessionMinutes = (now - this.sessionStartTime) / 60_000;

    // Don't alert before minimum session time
    if (sessionMinutes < this.minSessionMinutes) {
      return {
        level: 'thriving',
        degradationScore: 0,
        passiveConsumptionRatio: 0,
        sessionDurationMinutes: sessionMinutes,
      };
    }

    const passiveRatio = this.calculatePassiveRatio(now);
    const degradation = this.calculateDegradation();

    let level: VibeHealthStatus['level'];
    if (degradation >= this.alertThreshold) {
      level = 'alert';
    } else if (degradation >= 0.4) {
      level = 'declining';
    } else if (degradation >= 0.2) {
      level = 'stable';
    } else {
      level = 'thriving';
    }

    return {
      level,
      degradationScore: degradation,
      passiveConsumptionRatio: passiveRatio,
      sessionDurationMinutes: sessionMinutes,
    };
  }

  getSessionRecap(): SessionRecap {
    const now = Date.now();
    const durationMinutes = Math.round((now - this.sessionStartTime) / 60_000);
    const endMood = this.moodSnapshots.length > 0
      ? this.moodSnapshots[this.moodSnapshots.length - 1].primaryMood
      : 'neutral';

    const trajectory = this.calculateTrajectory();

    return {
      durationMinutes,
      vibeTrajectory: trajectory,
      positiveInteractions: this.positiveInteractionCount,
      startMood: this.startMood,
      endMood,
    };
  }

  // ──────────────────────────────────────────────
  // INTERNAL
  // ──────────────────────────────────────────────

  private takeSnapshot(): void {
    const snapshot = moodDetection.analyzeMood();
    this.moodSnapshots.push(snapshot);

    // Cap at MAX_SNAPSHOTS
    if (this.moodSnapshots.length > MAX_SNAPSHOTS) {
      this.moodSnapshots.shift();
    }
  }

  private calculatePassiveRatio(now: number): number {
    const timeSinceEngagement = now - this.lastEngagementTime;
    return Math.min(1, timeSinceEngagement / this.passiveThresholdMs);
  }

  private calculateDegradation(): number {
    if (this.moodSnapshots.length < 2) return 0;

    const now = Date.now();
    const timeSinceEngagement = now - this.lastEngagementTime;
    const isPassive = timeSinceEngagement > this.passiveThresholdMs;

    // Factor 1: Mood trend (are positive mood probabilities declining?)
    const moodTrendScore = this.calculateMoodTrend();

    // Factor 2: Passive consumption
    const passiveScore = isPassive
      ? Math.min(1, (timeSinceEngagement - this.passiveThresholdMs) / this.passiveThresholdMs)
      : 0;

    // Factor 3: Low engagement over time
    const sessionMinutes = (now - this.sessionStartTime) / 60_000;
    const engagementRate = sessionMinutes > 0
      ? this.positiveInteractionCount / sessionMinutes
      : 0;
    // Expect at least 1 positive interaction per 2 minutes
    const engagementScore = Math.max(0, 1 - engagementRate * 2);

    // Weighted combination
    const degradation =
      moodTrendScore * 0.4 +
      passiveScore * 0.35 +
      engagementScore * ENGAGEMENT_WEIGHT;

    return Math.min(1, Math.max(0, degradation));
  }

  private calculateMoodTrend(): number {
    if (this.moodSnapshots.length < 3) return 0;

    // Compare average positive mood probability in first half vs second half
    const mid = Math.floor(this.moodSnapshots.length / 2);
    const firstHalf = this.moodSnapshots.slice(0, mid);
    const secondHalf = this.moodSnapshots.slice(mid);

    const positiveMoods = this.positiveMoods;
    const avgPositive = (snapshots: MoodAnalysisResult[]): number => {
      if (snapshots.length === 0) return 0;
      return snapshots.reduce((sum, s) => {
        return sum + positiveMoods.reduce((acc, mood) => acc + s.probabilities[mood], 0);
      }, 0) / snapshots.length;
    };

    const firstAvg = avgPositive(firstHalf);
    const secondAvg = avgPositive(secondHalf);

    // If second half is lower, that's degradation
    const decline = firstAvg - secondAvg;
    return Math.max(0, Math.min(1, decline * 3)); // Scale up: 0.33 decline = full score
  }

  private calculateTrajectory(): SessionRecap['vibeTrajectory'] {
    if (this.moodSnapshots.length < 2) return 'stable';

    const first = this.moodSnapshots[0];
    const last = this.moodSnapshots[this.moodSnapshots.length - 1];

    const positiveScore = (s: MoodAnalysisResult) =>
      this.positiveMoods.reduce((acc, mood) => acc + s.probabilities[mood], 0);

    const startScore = positiveScore(first);
    const endScore = positiveScore(last);
    const diff = endScore - startScore;

    if (diff > 0.1) return 'improved';
    if (diff < -0.1) return 'declined';
    return 'stable';
  }

  /** Reset all state (for testing or new session) */
  reset(): void {
    this.stopMonitoring();
    this.moodSnapshots = [];
    this.sessionStartTime = 0;
    this.lastEngagementTime = 0;
    this.positiveInteractionCount = 0;
    this.startMood = 'neutral';
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

export const vibeGuardian = new VibeGuardianEngine();

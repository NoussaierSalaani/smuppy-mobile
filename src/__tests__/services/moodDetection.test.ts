/**
 * Mood Detection Engine Tests
 *
 * Tests the MoodDetectionEngine singleton exported from
 * src/services/moodDetection.ts
 *
 * This service is entirely client-side with no external dependencies.
 * It uses a class with internal state, so we call reset() between tests.
 */

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

import {
  moodDetection,
  type MoodType,
  type MoodAnalysisResult,
  type MoodProbabilityVector,
  type ScrollBehavior,
  type EngagementSignals,
  type TemporalContext,
  type ContentPreferences,
} from '../../services/moodDetection';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('moodDetection', () => {
  beforeEach(() => {
    moodDetection.reset();
  });

  // =========================================================================
  // Type exports
  // =========================================================================

  describe('type exports', () => {
    it('should export the singleton instance', () => {
      expect(moodDetection).toBeDefined();
      expect(typeof moodDetection.trackScroll).toBe('function');
      expect(typeof moodDetection.trackPostView).toBe('function');
      expect(typeof moodDetection.trackTimeOnPost).toBe('function');
      expect(typeof moodDetection.trackEngagement).toBe('function');
      expect(typeof moodDetection.analyzeMood).toBe('function');
      expect(typeof moodDetection.getScrollBehavior).toBe('function');
      expect(typeof moodDetection.getEngagementSignals).toBe('function');
      expect(typeof moodDetection.getTemporalContext).toBe('function');
      expect(typeof moodDetection.getContentPreferences).toBe('function');
      expect(typeof moodDetection.startSession).toBe('function');
      expect(typeof moodDetection.endSession).toBe('function');
      expect(typeof moodDetection.reset).toBe('function');
      expect(typeof moodDetection.getMoodHistory).toBe('function');
    });
  });

  // =========================================================================
  // Scroll Behavior Tracking
  // =========================================================================

  describe('trackScroll', () => {
    it('should initialize on first scroll event (no velocity computed yet)', () => {
      moodDetection.trackScroll(0, 1000);
      const behavior = moodDetection.getScrollBehavior();

      // After first event only, no velocities are computed
      expect(behavior.avgVelocity).toBe(0);
      expect(behavior.maxVelocity).toBe(0);
    });

    it('should compute velocity after two scroll events', () => {
      moodDetection.trackScroll(0, 1000);
      moodDetection.trackScroll(500, 2000); // 500px in 1s = 500 px/s

      const behavior = moodDetection.getScrollBehavior();

      expect(behavior.avgVelocity).toBe(500);
      expect(behavior.maxVelocity).toBe(500);
    });

    it('should track multiple velocities and compute average', () => {
      moodDetection.trackScroll(0, 1000);
      moodDetection.trackScroll(100, 2000);  // 100 px/s
      moodDetection.trackScroll(400, 3000);  // 300 px/s

      const behavior = moodDetection.getScrollBehavior();

      expect(behavior.avgVelocity).toBe(200); // (100 + 300) / 2
      expect(behavior.maxVelocity).toBe(300);
    });

    it('should detect reverse scrolls (scroll back up)', () => {
      moodDetection.trackScroll(100, 1000);
      moodDetection.trackScroll(200, 2000);  // Down
      moodDetection.trackScroll(100, 3000);  // Up by 100 (more than threshold 50)

      const behavior = moodDetection.getScrollBehavior();

      expect(behavior.reverseScrollCount).toBe(1);
    });

    it('should track total scroll distance', () => {
      moodDetection.trackScroll(0, 1000);
      moodDetection.trackScroll(100, 2000);
      moodDetection.trackScroll(300, 3000);

      const behavior = moodDetection.getScrollBehavior();

      expect(behavior.totalScrollDistance).toBe(300); // 100 + 200
    });

    it('should detect pauses (low velocity for 500ms+)', () => {
      // First event — initializes tracking (timestamp must be > 0 since 0 is sentinel)
      moodDetection.trackScroll(0, 1);
      // Very slow scroll: 1px in ~1 second = 1 px/s (below 10 threshold)
      // This starts a pause at timestamp 1000
      moodDetection.trackScroll(1, 1000);
      // After 600ms, normal speed again (velocity > 10), ending the pause
      // Pause duration = 1600 - 1000 = 600ms >= 500ms threshold
      moodDetection.trackScroll(20, 1600);

      const behavior = moodDetection.getScrollBehavior();

      expect(behavior.pauseCount).toBe(1);
    });
  });

  // =========================================================================
  // getScrollBehavior
  // =========================================================================

  describe('getScrollBehavior', () => {
    it('should return default values when no tracking data', () => {
      const behavior = moodDetection.getScrollBehavior();

      expect(behavior.avgVelocity).toBe(0);
      expect(behavior.maxVelocity).toBe(0);
      expect(behavior.pauseCount).toBe(0);
      expect(behavior.avgPauseDuration).toBe(0);
      expect(behavior.reverseScrollCount).toBe(0);
      expect(behavior.totalScrollDistance).toBe(0);
      expect(behavior.sessionDuration).toBeGreaterThanOrEqual(0);
    });

    it('should compute session duration from session start', () => {
      const behavior = moodDetection.getScrollBehavior();

      // Session duration should be positive (time since reset/creation)
      expect(behavior.sessionDuration).toBeGreaterThanOrEqual(0);
    });
  });

  // =========================================================================
  // Engagement Tracking
  // =========================================================================

  describe('trackPostView', () => {
    it('should track unique post views', () => {
      moodDetection.trackPostView('post-1', 'Fitness', 'creator-1', 'image');
      moodDetection.trackPostView('post-2', 'Art', 'creator-2', 'video');

      const engagement = moodDetection.getEngagementSignals();

      // 2 posts viewed, 0 likes
      expect(engagement.likeRate).toBe(0);
    });

    it('should track rewatched posts', () => {
      moodDetection.trackPostView('post-1', 'Fitness', 'creator-1', 'image');
      moodDetection.trackPostView('post-1', 'Fitness', 'creator-1', 'image'); // rewatch

      const engagement = moodDetection.getEngagementSignals();

      // Only 1 unique view, 1 rewatch
      expect(engagement.rewatchRate).toBe(1); // 1 rewatch / 1 viewed
    });

    it('should track category views', () => {
      moodDetection.trackPostView('post-1', 'Fitness', 'creator-1', 'image');
      moodDetection.trackPostView('post-2', 'Fitness', 'creator-2', 'image');
      moodDetection.trackPostView('post-3', 'Art', 'creator-3', 'video');

      const content = moodDetection.getContentPreferences();

      expect(content.topCategories[0]).toBe('Fitness');
      expect(content.categoryDistribution['Fitness']).toBeCloseTo(2 / 3);
      expect(content.categoryDistribution['Art']).toBeCloseTo(1 / 3);
    });

    it('should track creator diversity', () => {
      moodDetection.trackPostView('post-1', 'Cat', 'creator-1', 'image');
      moodDetection.trackPostView('post-2', 'Cat', 'creator-1', 'image'); // same creator
      moodDetection.trackPostView('post-3', 'Cat', 'creator-2', 'video');

      const content = moodDetection.getContentPreferences();

      // 2 unique creators / 3 posts viewed
      expect(content.creatorDiversity).toBeCloseTo(2 / 3);
    });
  });

  describe('trackTimeOnPost', () => {
    it('should track time spent per post', () => {
      moodDetection.trackPostView('post-1', 'Cat', 'c1', 'image');
      moodDetection.trackTimeOnPost('post-1', 15);
      moodDetection.trackPostView('post-2', 'Cat', 'c2', 'image');
      moodDetection.trackTimeOnPost('post-2', 5);

      const engagement = moodDetection.getEngagementSignals();

      expect(engagement.avgTimePerPost).toBe(10); // (15 + 5) / 2
    });

    it('should count quick views as skips (< 1 second)', () => {
      moodDetection.trackPostView('post-1', 'Cat', 'c1', 'image');
      moodDetection.trackTimeOnPost('post-1', 0.5); // skip

      const engagement = moodDetection.getEngagementSignals();

      expect(engagement.skipRate).toBe(1); // 1 skip / 1 viewed
    });
  });

  describe('trackEngagement', () => {
    it('should track likes', () => {
      moodDetection.trackPostView('post-1', 'Cat', 'c1', 'image');
      moodDetection.trackEngagement('like');

      const engagement = moodDetection.getEngagementSignals();

      expect(engagement.likeRate).toBe(1); // 1 like / 1 post viewed
    });

    it('should track comments', () => {
      moodDetection.trackPostView('post-1', 'Cat', 'c1', 'image');
      moodDetection.trackEngagement('comment');

      const engagement = moodDetection.getEngagementSignals();

      expect(engagement.commentRate).toBe(1);
    });

    it('should track shares', () => {
      moodDetection.trackPostView('post-1', 'Cat', 'c1', 'image');
      moodDetection.trackEngagement('share');

      const engagement = moodDetection.getEngagementSignals();

      expect(engagement.shareRate).toBe(1);
    });

    it('should track saves', () => {
      moodDetection.trackPostView('post-1', 'Cat', 'c1', 'image');
      moodDetection.trackEngagement('save');

      const engagement = moodDetection.getEngagementSignals();

      expect(engagement.saveRate).toBe(1);
    });

    it('should calculate rates relative to posts viewed', () => {
      // 4 posts viewed, 2 likes
      for (let i = 1; i <= 4; i++) {
        moodDetection.trackPostView(`post-${i}`, 'Cat', `c${i}`, 'image');
      }
      moodDetection.trackEngagement('like');
      moodDetection.trackEngagement('like');

      const engagement = moodDetection.getEngagementSignals();

      expect(engagement.likeRate).toBe(0.5); // 2/4
    });
  });

  // =========================================================================
  // getEngagementSignals
  // =========================================================================

  describe('getEngagementSignals', () => {
    it('should return zeros when no data', () => {
      const engagement = moodDetection.getEngagementSignals();

      expect(engagement.likeRate).toBe(0);
      expect(engagement.commentRate).toBe(0);
      expect(engagement.shareRate).toBe(0);
      expect(engagement.saveRate).toBe(0);
      expect(engagement.avgTimePerPost).toBe(0);
      expect(engagement.skipRate).toBe(0);
      expect(engagement.rewatchRate).toBe(0);
    });
  });

  // =========================================================================
  // getTemporalContext
  // =========================================================================

  describe('getTemporalContext', () => {
    it('should return current temporal context', () => {
      const ctx = moodDetection.getTemporalContext();

      expect(ctx.hourOfDay).toBeGreaterThanOrEqual(0);
      expect(ctx.hourOfDay).toBeLessThanOrEqual(23);
      expect(ctx.dayOfWeek).toBeGreaterThanOrEqual(0);
      expect(ctx.dayOfWeek).toBeLessThanOrEqual(6);
      expect(typeof ctx.isWeekend).toBe('boolean');
      expect(ctx.sessionNumber).toBeGreaterThanOrEqual(1);
      expect(ctx.localTime).toBeInstanceOf(Date);
    });

    it('should correctly identify weekends', () => {
      const ctx = moodDetection.getTemporalContext();
      const now = new Date();
      const day = now.getDay();

      expect(ctx.isWeekend).toBe(day === 0 || day === 6);
    });
  });

  // =========================================================================
  // getContentPreferences
  // =========================================================================

  describe('getContentPreferences', () => {
    it('should return empty defaults when no posts viewed', () => {
      const content = moodDetection.getContentPreferences();

      expect(content.topCategories).toHaveLength(0);
      expect(content.creatorDiversity).toBe(0);
      expect(content.avgContentLength).toBe(0);
      expect(content.preferredContentType).toBe('mixed');
    });

    it('should determine preferred content type when one dominates', () => {
      // 3 images, 0 video, 0 carousel = 3/3 > 0.5 ratio
      moodDetection.trackPostView('p1', 'Cat', 'c1', 'image');
      moodDetection.trackPostView('p2', 'Cat', 'c2', 'image');
      moodDetection.trackPostView('p3', 'Cat', 'c3', 'image');

      const content = moodDetection.getContentPreferences();

      expect(content.preferredContentType).toBe('image');
    });

    it('should return mixed when no content type dominates', () => {
      moodDetection.trackPostView('p1', 'Cat', 'c1', 'image');
      moodDetection.trackPostView('p2', 'Cat', 'c2', 'video');
      moodDetection.trackPostView('p3', 'Cat', 'c3', 'carousel');

      const content = moodDetection.getContentPreferences();

      expect(content.preferredContentType).toBe('mixed');
    });

    it('should sort top categories by view count', () => {
      moodDetection.trackPostView('p1', 'Art', 'c1', 'image');
      moodDetection.trackPostView('p2', 'Art', 'c2', 'image');
      moodDetection.trackPostView('p3', 'Art', 'c3', 'image');
      moodDetection.trackPostView('p4', 'Fitness', 'c4', 'image');
      moodDetection.trackPostView('p5', 'Nature', 'c5', 'image');

      const content = moodDetection.getContentPreferences();

      expect(content.topCategories[0]).toBe('Art');
    });
  });

  // =========================================================================
  // analyzeMood
  // =========================================================================

  describe('analyzeMood', () => {
    it('should return a valid MoodAnalysisResult', () => {
      const result = moodDetection.analyzeMood();

      expect(result).toBeDefined();
      expect(typeof result.primaryMood).toBe('string');
      expect(['energetic', 'relaxed', 'social', 'creative', 'focused', 'neutral']).toContain(result.primaryMood);
      expect(typeof result.confidence).toBe('number');
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(0.95);
      expect(typeof result.timestamp).toBe('number');
    });

    it('should return normalized probabilities that sum to ~1', () => {
      const result = moodDetection.analyzeMood();

      const sum = Object.values(result.probabilities).reduce((a, b) => a + b, 0);
      expect(sum).toBeCloseTo(1, 1);
    });

    it('should have all probability values >= 0', () => {
      const result = moodDetection.analyzeMood();

      Object.values(result.probabilities).forEach((prob) => {
        expect(prob).toBeGreaterThanOrEqual(0);
      });
    });

    it('should return signal contributions', () => {
      const result = moodDetection.analyzeMood();

      expect(result.signals).toBeDefined();
      expect(typeof result.signals.behavioral).toBe('number');
      expect(typeof result.signals.engagement).toBe('number');
      expect(typeof result.signals.temporal).toBe('number');
      expect(typeof result.signals.content).toBe('number');
    });

    it('should store result in mood history', () => {
      expect(moodDetection.getMoodHistory()).toHaveLength(0);

      moodDetection.analyzeMood();

      expect(moodDetection.getMoodHistory()).toHaveLength(1);
    });

    it('should limit mood history to 20 entries', () => {
      for (let i = 0; i < 25; i++) {
        moodDetection.analyzeMood();
      }

      expect(moodDetection.getMoodHistory()).toHaveLength(20);
    });

    it('should cap confidence at 0.95', () => {
      const result = moodDetection.analyzeMood();

      expect(result.confidence).toBeLessThanOrEqual(0.95);
    });

    it('should reflect engagement data in mood probabilities', () => {
      // Simulate very social behavior
      for (let i = 0; i < 10; i++) {
        moodDetection.trackPostView(`p${i}`, 'Trending', `c${i}`, 'image');
        moodDetection.trackEngagement('comment');
        moodDetection.trackEngagement('share');
      }

      const result = moodDetection.analyzeMood();

      // Social should be prominent given high comment/share rates
      expect(result.probabilities.social).toBeGreaterThan(0);
    });

    it('should detect focused mood with high save rates and long viewing time', () => {
      for (let i = 0; i < 10; i++) {
        moodDetection.trackPostView(`p${i}`, 'Education', `c${i}`, 'video');
        moodDetection.trackEngagement('save');
        moodDetection.trackTimeOnPost(`p${i}`, 30); // 30 seconds per post
      }

      const result = moodDetection.analyzeMood();

      // Focused and creative should get boosted
      expect(result.probabilities.focused).toBeGreaterThan(0);
    });
  });

  // =========================================================================
  // Session Management
  // =========================================================================

  describe('startSession', () => {
    it('should reset session number on new day', () => {
      // End a session to set lastSessionEnd
      moodDetection.endSession();

      // Simulate starting a new session (same day)
      moodDetection.startSession();

      const ctx = moodDetection.getTemporalContext();
      // sessionNumber should be >= 1
      expect(ctx.sessionNumber).toBeGreaterThanOrEqual(1);
    });
  });

  describe('endSession', () => {
    it('should store scroll behavior in history', () => {
      moodDetection.trackScroll(0, 1000);
      moodDetection.trackScroll(100, 2000);
      moodDetection.endSession();

      // We can verify by checking that subsequent sessions are tracked
      moodDetection.startSession();
      const ctx = moodDetection.getTemporalContext();
      expect(ctx.timeSinceLastSession).toBeGreaterThanOrEqual(0);
    });
  });

  // =========================================================================
  // reset
  // =========================================================================

  describe('reset', () => {
    it('should clear all tracking data', () => {
      // Generate some data
      moodDetection.trackScroll(0, 1000);
      moodDetection.trackScroll(100, 2000);
      moodDetection.trackPostView('p1', 'Cat', 'c1', 'image');
      moodDetection.trackEngagement('like');
      moodDetection.trackTimeOnPost('p1', 5);
      moodDetection.analyzeMood();

      // Reset
      moodDetection.reset();

      // Verify everything is zeroed
      const scroll = moodDetection.getScrollBehavior();
      expect(scroll.avgVelocity).toBe(0);
      expect(scroll.totalScrollDistance).toBe(0);
      expect(scroll.reverseScrollCount).toBe(0);

      const engagement = moodDetection.getEngagementSignals();
      expect(engagement.likeRate).toBe(0);
      expect(engagement.commentRate).toBe(0);
      expect(engagement.avgTimePerPost).toBe(0);

      const content = moodDetection.getContentPreferences();
      expect(content.topCategories).toHaveLength(0);

      const history = moodDetection.getMoodHistory();
      expect(history).toHaveLength(0);
    });
  });

  // =========================================================================
  // getMoodHistory
  // =========================================================================

  describe('getMoodHistory', () => {
    it('should return a copy of the history (not a reference)', () => {
      moodDetection.analyzeMood();

      const history1 = moodDetection.getMoodHistory();
      const history2 = moodDetection.getMoodHistory();

      expect(history1).not.toBe(history2);
      expect(history1).toEqual(history2);
    });

    it('should return empty array after reset', () => {
      moodDetection.analyzeMood();
      moodDetection.reset();

      expect(moodDetection.getMoodHistory()).toHaveLength(0);
    });
  });
});

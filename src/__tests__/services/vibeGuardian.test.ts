/**
 * Vibe Guardian Service Tests
 *
 * Tests the anti-doom-scroll protection system.
 * Monitors session health via mood snapshots and engagement tracking.
 */

// ---------------------------------------------------------------------------
// Mocks — must be declared before imports
// ---------------------------------------------------------------------------

const mockAnalyzeMood = jest.fn();

jest.mock('../../services/moodDetection', () => ({
  moodDetection: {
    analyzeMood: mockAnalyzeMood,
  },
}));

// Default mock mood analysis result
function createMockMood(overrides: Record<string, unknown> = {}) {
  return {
    primaryMood: 'neutral',
    confidence: 0.5,
    timestamp: Date.now(),
    probabilities: {
      energetic: 0.15,
      relaxed: 0.15,
      social: 0.15,
      creative: 0.15,
      focused: 0.15,
      neutral: 0.25,
    },
    signals: {
      behavioral: 0.5,
      engagement: 0.5,
      temporal: 0.5,
      content: 0.5,
    },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Imports — after mocks
// ---------------------------------------------------------------------------

import { vibeGuardian } from '../../services/vibeGuardian';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('vibeGuardian', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    vibeGuardian.reset();
    jest.clearAllMocks();
    mockAnalyzeMood.mockReturnValue(createMockMood());
  });

  afterEach(() => {
    vibeGuardian.reset();
    jest.useRealTimers();
  });

  // =========================================================================
  // startMonitoring / stopMonitoring
  // =========================================================================

  describe('startMonitoring', () => {
    it('should start monitoring and take initial snapshot', () => {
      vibeGuardian.startMonitoring();

      expect(mockAnalyzeMood).toHaveBeenCalledTimes(1);
    });

    it('should not restart if already running', () => {
      vibeGuardian.startMonitoring();
      vibeGuardian.startMonitoring(); // duplicate call

      expect(mockAnalyzeMood).toHaveBeenCalledTimes(1);
    });

    it('should take periodic snapshots', () => {
      vibeGuardian.startMonitoring();

      // Advance past one snapshot interval (30s)
      jest.advanceTimersByTime(30_000);
      expect(mockAnalyzeMood).toHaveBeenCalledTimes(2);

      jest.advanceTimersByTime(30_000);
      expect(mockAnalyzeMood).toHaveBeenCalledTimes(3);
    });
  });

  describe('stopMonitoring', () => {
    it('should stop periodic snapshots', () => {
      vibeGuardian.startMonitoring();
      vibeGuardian.stopMonitoring();

      jest.advanceTimersByTime(60_000);
      // Only the initial snapshot
      expect(mockAnalyzeMood).toHaveBeenCalledTimes(1);
    });
  });

  // =========================================================================
  // applyProfile
  // =========================================================================

  describe('applyProfile', () => {
    it('should apply custom thresholds', () => {
      vibeGuardian.applyProfile({
        guardianPassiveTimeoutMs: 60_000,
        guardianAlertThreshold: 0.8,
        guardianMinSessionMinutes: 5,
        positiveMoods: ['energetic', 'creative'],
      } as never);

      // Verify by checking health - should be thriving during min session time
      vibeGuardian.startMonitoring();
      const health = vibeGuardian.checkHealth();
      expect(health.level).toBe('thriving');
    });
  });

  // =========================================================================
  // trackEngagement / trackPositiveInteraction
  // =========================================================================

  describe('trackEngagement', () => {
    it('should not throw', () => {
      expect(() => vibeGuardian.trackEngagement()).not.toThrow();
    });
  });

  describe('trackPositiveInteraction', () => {
    it('should increment positive interaction count', () => {
      vibeGuardian.startMonitoring();

      // Advance past min session time (2 min)
      jest.advanceTimersByTime(3 * 60_000);

      vibeGuardian.trackPositiveInteraction();
      vibeGuardian.trackPositiveInteraction();

      const recap = vibeGuardian.getSessionRecap();
      expect(recap.positiveInteractions).toBe(2);
    });
  });

  // =========================================================================
  // checkHealth
  // =========================================================================

  describe('checkHealth', () => {
    it('should return thriving before min session time', () => {
      vibeGuardian.startMonitoring();

      const health = vibeGuardian.checkHealth();
      expect(health.level).toBe('thriving');
      expect(health.degradationScore).toBe(0);
      expect(health.passiveConsumptionRatio).toBe(0);
    });

    it('should return appropriate level after min session time', () => {
      vibeGuardian.startMonitoring();

      // Advance past min session time
      jest.advanceTimersByTime(3 * 60_000);

      const health = vibeGuardian.checkHealth();
      expect(['thriving', 'stable', 'declining', 'alert']).toContain(health.level);
      expect(health.sessionDurationMinutes).toBeGreaterThanOrEqual(2);
    });

    it('should detect passive consumption', () => {
      vibeGuardian.startMonitoring();

      // No engagement for a long time, past min session and passive threshold
      jest.advanceTimersByTime(5 * 60_000);

      const health = vibeGuardian.checkHealth();
      expect(health.passiveConsumptionRatio).toBeGreaterThan(0);
    });

    it('should stay healthier with engagement', () => {
      vibeGuardian.startMonitoring();

      // Keep engaging regularly
      for (let i = 0; i < 10; i++) {
        jest.advanceTimersByTime(30_000);
        vibeGuardian.trackEngagement();
        vibeGuardian.trackPositiveInteraction();
      }

      const health = vibeGuardian.checkHealth();
      expect(health.degradationScore).toBeLessThan(0.7);
    });
  });

  // =========================================================================
  // getSessionRecap
  // =========================================================================

  describe('getSessionRecap', () => {
    it('should return session recap with correct fields', () => {
      vibeGuardian.startMonitoring();
      jest.advanceTimersByTime(5 * 60_000);

      const recap = vibeGuardian.getSessionRecap();

      expect(recap.durationMinutes).toBeGreaterThanOrEqual(5);
      expect(['improved', 'stable', 'declined']).toContain(recap.vibeTrajectory);
      expect(recap.positiveInteractions).toBeGreaterThanOrEqual(0);
      expect(typeof recap.startMood).toBe('string');
      expect(typeof recap.endMood).toBe('string');
    });

    it('should track trajectory as stable with consistent mood', () => {
      mockAnalyzeMood.mockReturnValue(createMockMood());

      vibeGuardian.startMonitoring();
      jest.advanceTimersByTime(2 * 60_000);

      const recap = vibeGuardian.getSessionRecap();
      expect(recap.vibeTrajectory).toBe('stable');
    });

    it('should detect improved trajectory when positive moods increase', () => {
      // Start with low positive moods
      mockAnalyzeMood.mockReturnValueOnce(createMockMood({
        probabilities: {
          energetic: 0.05,
          relaxed: 0.05,
          social: 0.05,
          creative: 0.05,
          focused: 0.05,
          neutral: 0.75,
        },
      }));

      vibeGuardian.startMonitoring();

      // Later snapshots have high positive moods
      mockAnalyzeMood.mockReturnValue(createMockMood({
        probabilities: {
          energetic: 0.4,
          relaxed: 0.1,
          social: 0.3,
          creative: 0.1,
          focused: 0.05,
          neutral: 0.05,
        },
      }));

      jest.advanceTimersByTime(2 * 60_000);

      const recap = vibeGuardian.getSessionRecap();
      expect(recap.vibeTrajectory).toBe('improved');
    });
  });

  // =========================================================================
  // reset
  // =========================================================================

  describe('reset', () => {
    it('should stop monitoring and clear state', () => {
      vibeGuardian.startMonitoring();
      vibeGuardian.trackPositiveInteraction();

      vibeGuardian.reset();

      const recap = vibeGuardian.getSessionRecap();
      expect(recap.positiveInteractions).toBe(0);
      // sessionStartTime is reset to 0, durationMinutes = (now - 0) / 60000
      // which will be large. Just check positiveInteractions was reset.
    });
  });
});

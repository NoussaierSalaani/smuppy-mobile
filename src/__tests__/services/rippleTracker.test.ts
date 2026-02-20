/**
 * Ripple Tracker Service Tests
 *
 * Tests the ripple tracking system for content virality scoring.
 */

// ---------------------------------------------------------------------------
// Mocks — must be declared before imports
// ---------------------------------------------------------------------------

const mockAddRipple = jest.fn();
const mockAddVibeAction = jest.fn();
let mockRippleScore = 0;

jest.mock('../../stores/vibeStore', () => ({
  useVibeStore: {
    getState: () => ({
      addRipple: mockAddRipple,
      addVibeAction: mockAddVibeAction,
      rippleScore: mockRippleScore,
    }),
  },
}));

// ---------------------------------------------------------------------------
// Imports — after mocks
// ---------------------------------------------------------------------------

import {
  addPositiveAction,
  getRippleScore,
  getRippleLevel,
  getRippleAnimationIntensity,
  RIPPLE_LEVELS,
  RippleActionType,
} from '../../services/rippleTracker';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('rippleTracker', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRippleScore = 0;
  });

  // =========================================================================
  // RIPPLE_LEVELS
  // =========================================================================

  describe('RIPPLE_LEVELS', () => {
    it('should define 5 levels in ascending order', () => {
      expect(RIPPLE_LEVELS).toHaveLength(5);
      expect(RIPPLE_LEVELS[0].name).toBe('Spark');
      expect(RIPPLE_LEVELS[1].name).toBe('Glow');
      expect(RIPPLE_LEVELS[2].name).toBe('Shine');
      expect(RIPPLE_LEVELS[3].name).toBe('Radiance');
      expect(RIPPLE_LEVELS[4].name).toBe('Aura');
    });

    it('should have increasing minScore thresholds', () => {
      for (let i = 1; i < RIPPLE_LEVELS.length; i++) {
        expect(RIPPLE_LEVELS[i].minScore).toBeGreaterThan(RIPPLE_LEVELS[i - 1].minScore);
      }
    });
  });

  // =========================================================================
  // addPositiveAction
  // =========================================================================

  describe('addPositiveAction', () => {
    it('should add ripple and vibe action for like', () => {
      addPositiveAction('like');
      expect(mockAddRipple).toHaveBeenCalledWith('like');
      expect(mockAddVibeAction).toHaveBeenCalledWith('like');
    });

    it('should add ripple and vibe action for share', () => {
      addPositiveAction('share');
      expect(mockAddRipple).toHaveBeenCalledWith('share');
      expect(mockAddVibeAction).toHaveBeenCalledWith('share');
    });

    it('should add ripple and vibe action for save', () => {
      addPositiveAction('save');
      expect(mockAddRipple).toHaveBeenCalledWith('save');
      expect(mockAddVibeAction).toHaveBeenCalledWith('save');
    });

    it('should map follow action to follow_user for vibe action', () => {
      addPositiveAction('follow');
      expect(mockAddRipple).toHaveBeenCalledWith('follow');
      expect(mockAddVibeAction).toHaveBeenCalledWith('follow_user');
    });

    it('should add ripple and vibe action for encourage', () => {
      addPositiveAction('encourage');
      expect(mockAddRipple).toHaveBeenCalledWith('encourage');
      expect(mockAddVibeAction).toHaveBeenCalledWith('encourage');
    });
  });

  // =========================================================================
  // getRippleScore
  // =========================================================================

  describe('getRippleScore', () => {
    it('should return current ripple score from store', () => {
      mockRippleScore = 42;
      expect(getRippleScore()).toBe(42);
    });
  });

  // =========================================================================
  // getRippleLevel
  // =========================================================================

  describe('getRippleLevel', () => {
    it('should return Spark for score 0', () => {
      expect(getRippleLevel(0)).toEqual(RIPPLE_LEVELS[0]);
    });

    it('should return Glow for score 10', () => {
      expect(getRippleLevel(10)).toEqual(RIPPLE_LEVELS[1]);
    });

    it('should return Shine for score 30', () => {
      expect(getRippleLevel(30)).toEqual(RIPPLE_LEVELS[2]);
    });

    it('should return Radiance for score 60', () => {
      expect(getRippleLevel(60)).toEqual(RIPPLE_LEVELS[3]);
    });

    it('should return Aura for score 100+', () => {
      expect(getRippleLevel(100)).toEqual(RIPPLE_LEVELS[4]);
      expect(getRippleLevel(999)).toEqual(RIPPLE_LEVELS[4]);
    });

    it('should use store score when no argument provided', () => {
      mockRippleScore = 50;
      const level = getRippleLevel();
      expect(level.name).toBe('Shine');
    });
  });

  // =========================================================================
  // getRippleAnimationIntensity
  // =========================================================================

  describe('getRippleAnimationIntensity', () => {
    it('should return 0 for score 0', () => {
      expect(getRippleAnimationIntensity(0)).toBe(0);
    });

    it('should return 0.5 for score 100', () => {
      expect(getRippleAnimationIntensity(100)).toBe(0.5);
    });

    it('should cap at 1 for score >= 200', () => {
      expect(getRippleAnimationIntensity(200)).toBe(1);
      expect(getRippleAnimationIntensity(300)).toBe(1);
    });

    it('should use store score when no argument provided', () => {
      mockRippleScore = 100;
      expect(getRippleAnimationIntensity()).toBe(0.5);
    });
  });
});

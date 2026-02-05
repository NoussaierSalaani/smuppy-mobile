/**
 * Vibe Store Tests
 * Tests for vibe score, levels, streaks, and prescriptions
 */

// Mock AsyncStorage before any imports
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

import { useVibeStore } from '../../stores/vibeStore';

// Helper to get today's date key (same as store)
const getTodayKey = (): string => new Date().toISOString().slice(0, 10);

// Helper to get yesterday's date key
const getYesterdayKey = (): string => {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  return yesterday.toISOString().slice(0, 10);
};

describe('VibeStore', () => {
  beforeEach(() => {
    useVibeStore.getState().reset();
  });

  describe('Initial State', () => {
    it('should have correct initial state', () => {
      const state = useVibeStore.getState();
      expect(state.vibeScore).toBe(0);
      expect(state.vibeLevel).toBe('newcomer');
      expect(state.actionHistory).toEqual([]);
      expect(state.currentStreak).toBe(0);
      expect(state.longestStreak).toBe(0);
      expect(state.earnedBadges).toEqual([]);
      expect(state.rippleScore).toBe(0);
      expect(state.completedToday).toEqual([]);
    });
  });

  describe('addVibeAction', () => {
    it('should add points for a post action', () => {
      useVibeStore.getState().addVibeAction('post');
      const state = useVibeStore.getState();

      expect(state.vibeScore).toBe(10); // post = 10 points
      expect(state.actionHistory).toHaveLength(1);
      expect(state.actionHistory[0].type).toBe('post');
    });

    it('should add points for a like action', () => {
      useVibeStore.getState().addVibeAction('like');
      const state = useVibeStore.getState();

      expect(state.vibeScore).toBe(1); // like = 1 point
    });

    it('should update level when reaching thresholds', () => {
      // Add enough points to reach 'explorer' level (20+ points)
      for (let i = 0; i < 3; i++) {
        useVibeStore.getState().addVibeAction('post'); // 30 points total
      }

      expect(useVibeStore.getState().vibeLevel).toBe('explorer');
    });

    it('should limit action history to MAX_ACTION_HISTORY', () => {
      // Add 250 actions (more than MAX_ACTION_HISTORY = 200)
      for (let i = 0; i < 250; i++) {
        useVibeStore.getState().addVibeAction('like');
      }

      expect(useVibeStore.getState().actionHistory.length).toBeLessThanOrEqual(200);
    });
  });

  describe('Level Calculations', () => {
    it('should be newcomer with 0-19 points', () => {
      useVibeStore.getState().addVibeAction('like'); // 1 point
      expect(useVibeStore.getState().vibeLevel).toBe('newcomer');
    });

    it('should be explorer with 20-79 points', () => {
      // Get to 20 points
      for (let i = 0; i < 2; i++) {
        useVibeStore.getState().addVibeAction('post'); // 20 points
      }
      expect(useVibeStore.getState().vibeLevel).toBe('explorer');
    });

    it('should be contributor with 80-199 points', () => {
      // Get to 80 points
      for (let i = 0; i < 8; i++) {
        useVibeStore.getState().addVibeAction('post'); // 80 points
      }
      expect(useVibeStore.getState().vibeLevel).toBe('contributor');
    });

    it('should be influencer with 200-499 points', () => {
      // Get to 200 points
      for (let i = 0; i < 20; i++) {
        useVibeStore.getState().addVibeAction('post'); // 200 points
      }
      expect(useVibeStore.getState().vibeLevel).toBe('influencer');
    });

    it('should be legend with 500+ points', () => {
      // Get to 500 points
      for (let i = 0; i < 50; i++) {
        useVibeStore.getState().addVibeAction('post'); // 500 points
      }
      expect(useVibeStore.getState().vibeLevel).toBe('legend');
    });
  });

  describe('checkDailyLogin', () => {
    it('should start streak on first login', () => {
      useVibeStore.getState().checkDailyLogin();
      const state = useVibeStore.getState();

      expect(state.currentStreak).toBe(1);
      expect(state.lastLoginDate).toBe(getTodayKey());
      expect(state.vibeScore).toBe(5); // daily_login = 5 points
    });

    it('should not increment if already logged today', () => {
      useVibeStore.getState().checkDailyLogin();
      const scoreBefore = useVibeStore.getState().vibeScore;

      useVibeStore.getState().checkDailyLogin();

      expect(useVibeStore.getState().vibeScore).toBe(scoreBefore);
      expect(useVibeStore.getState().currentStreak).toBe(1);
    });

    it('should increment streak for consecutive days', () => {
      // Simulate yesterday login
      useVibeStore.setState({
        lastLoginDate: getYesterdayKey(),
        currentStreak: 1,
      });

      useVibeStore.getState().checkDailyLogin();

      expect(useVibeStore.getState().currentStreak).toBe(2);
    });

    it('should reset streak if more than one day missed', () => {
      // Simulate login 3 days ago
      const threeDaysAgo = new Date();
      threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
      useVibeStore.setState({
        lastLoginDate: threeDaysAgo.toISOString().slice(0, 10),
        currentStreak: 5,
      });

      useVibeStore.getState().checkDailyLogin();

      expect(useVibeStore.getState().currentStreak).toBe(1);
    });

    it('should award streak bonus at 7+ day streak', () => {
      // Simulate 6-day streak from yesterday
      useVibeStore.setState({
        lastLoginDate: getYesterdayKey(),
        currentStreak: 6,
        vibeScore: 0,
      });

      useVibeStore.getState().checkDailyLogin();

      // Should get daily_login (5) + streak_bonus (10) = 15 points
      expect(useVibeStore.getState().vibeScore).toBe(15);
      expect(useVibeStore.getState().currentStreak).toBe(7);
    });

    it('should update longest streak when current exceeds it', () => {
      useVibeStore.setState({
        lastLoginDate: getYesterdayKey(),
        currentStreak: 5,
        longestStreak: 5,
      });

      useVibeStore.getState().checkDailyLogin();

      expect(useVibeStore.getState().longestStreak).toBe(6);
    });
  });

  describe('Prescriptions', () => {
    it('should track started prescription', () => {
      useVibeStore.getState().startPrescription();

      expect(useVibeStore.getState().prescriptionStartedAt).not.toBeNull();
    });

    it('should complete prescription and add reward', () => {
      useVibeStore.getState().startPrescription();

      // Wait a bit to simulate time passing
      const startedAt = useVibeStore.getState().prescriptionStartedAt!;
      // Manually set a time that passes the rush check
      useVibeStore.setState({ prescriptionStartedAt: startedAt - 60000 }); // 1 minute ago

      useVibeStore.getState().completePrescription('rx-123', 15, 2); // 2 min prescription, 1 min elapsed (30% = 0.6 min needed)

      const state = useVibeStore.getState();
      expect(state.completedToday).toContain('rx-123');
      expect(state.vibeScore).toBe(15); // Full reward
      expect(state.prescriptionStartedAt).toBeNull();
    });

    it('should give reduced reward if rushed', () => {
      useVibeStore.getState().startPrescription();
      // Complete immediately (less than 30% of duration)

      useVibeStore.getState().completePrescription('rx-123', 20, 10); // 10 min prescription

      const state = useVibeStore.getState();
      expect(state.vibeScore).toBe(10); // Half reward (rushed)
      expect(state.rushedToday).toBe(1);
    });

    it('should not add duplicate prescription to completedToday', () => {
      useVibeStore.setState({ completedToday: ['rx-123'] });

      useVibeStore.getState().completePrescription('rx-123', 15, 5);

      const completedCount = useVibeStore.getState().completedToday.filter(id => id === 'rx-123').length;
      expect(completedCount).toBe(1);
    });
  });

  describe('checkDailyReset', () => {
    it('should reset daily counters on new day', () => {
      useVibeStore.setState({
        completedToday: ['rx-1', 'rx-2'],
        rushedToday: 2,
        completedTodayDate: getYesterdayKey(),
      });

      useVibeStore.getState().checkDailyReset();

      const state = useVibeStore.getState();
      expect(state.completedToday).toEqual([]);
      expect(state.rushedToday).toBe(0);
      expect(state.completedTodayDate).toBe(getTodayKey());
    });

    it('should not reset if same day', () => {
      useVibeStore.setState({
        completedToday: ['rx-1'],
        completedTodayDate: getTodayKey(),
      });

      useVibeStore.getState().checkDailyReset();

      expect(useVibeStore.getState().completedToday).toContain('rx-1');
    });
  });

  describe('Ripple Score', () => {
    it('should add ripple score', () => {
      useVibeStore.getState().addRipple('shared_post');

      expect(useVibeStore.getState().rippleScore).toBe(1);
      expect(useVibeStore.getState().rippleHistory).toHaveLength(1);
    });

    it('should cap ripple score at 200', () => {
      useVibeStore.setState({ rippleScore: 200 });

      useVibeStore.getState().addRipple('action');

      expect(useVibeStore.getState().rippleScore).toBe(200);
    });

    it('should limit ripple history', () => {
      for (let i = 0; i < 150; i++) {
        useVibeStore.getState().addRipple(`action-${i}`);
      }

      expect(useVibeStore.getState().rippleHistory.length).toBeLessThanOrEqual(100);
    });
  });

  describe('reset', () => {
    it('should reset all state to initial values', () => {
      // Set various state
      useVibeStore.setState({
        vibeScore: 100,
        vibeLevel: 'contributor',
        currentStreak: 5,
        earnedBadges: ['badge1'],
        rippleScore: 50,
        completedToday: ['rx-1'],
      });

      useVibeStore.getState().reset();

      const state = useVibeStore.getState();
      expect(state.vibeScore).toBe(0);
      expect(state.vibeLevel).toBe('newcomer');
      expect(state.currentStreak).toBe(0);
      expect(state.earnedBadges).toEqual([]);
      expect(state.rippleScore).toBe(0);
      expect(state.completedToday).toEqual([]);
    });
  });
});

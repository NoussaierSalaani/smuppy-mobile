/**
 * Vibe Store Tests
 * Tests for vibe score, levels, streaks, badges, prescriptions,
 * ripple, preferences, selectors, and edge cases.
 */

// Mock AsyncStorage before any imports
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

import {
  useVibeStore,
  vibeStore,
  selectVibeScore,
  selectVibeLevel,
  selectCurrentStreak,
  selectLongestStreak,
  selectEarnedBadges,
  selectRippleScore,
  selectCompletedToday,
  selectPrescriptionPreferences,
} from '../../stores/vibeStore';

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

  // ==========================================================================
  // checkBadges
  // ==========================================================================
  describe('checkBadges', () => {
    it('should earn first_post badge after one post action', () => {
      useVibeStore.getState().addVibeAction('post');
      useVibeStore.getState().checkBadges();

      expect(useVibeStore.getState().earnedBadges).toContain('first_post');
    });

    it('should not earn first_post badge with no post actions', () => {
      useVibeStore.getState().addVibeAction('like');
      useVibeStore.getState().checkBadges();

      expect(useVibeStore.getState().earnedBadges).not.toContain('first_post');
    });

    it('should earn social_butterfly badge after 10 follow_user actions', () => {
      for (let i = 0; i < 10; i++) {
        useVibeStore.getState().addVibeAction('follow_user');
      }
      useVibeStore.getState().checkBadges();

      expect(useVibeStore.getState().earnedBadges).toContain('social_butterfly');
    });

    it('should not earn social_butterfly badge with fewer than 10 follow_user actions', () => {
      for (let i = 0; i < 9; i++) {
        useVibeStore.getState().addVibeAction('follow_user');
      }
      useVibeStore.getState().checkBadges();

      expect(useVibeStore.getState().earnedBadges).not.toContain('social_butterfly');
    });

    it('should earn explorer badge after 5 explore_spot actions', () => {
      for (let i = 0; i < 5; i++) {
        useVibeStore.getState().addVibeAction('explore_spot');
      }
      useVibeStore.getState().checkBadges();

      expect(useVibeStore.getState().earnedBadges).toContain('explorer');
    });

    it('should earn streak_master badge when currentStreak >= 7', () => {
      useVibeStore.setState({ currentStreak: 7 });
      // Need at least one action for checkBadges to read from
      useVibeStore.getState().checkBadges();

      expect(useVibeStore.getState().earnedBadges).toContain('streak_master');
    });

    it('should not earn streak_master badge when currentStreak < 7', () => {
      useVibeStore.setState({ currentStreak: 6 });
      useVibeStore.getState().checkBadges();

      expect(useVibeStore.getState().earnedBadges).not.toContain('streak_master');
    });

    it('should earn wellness_warrior badge after 10 prescription_complete actions', () => {
      for (let i = 0; i < 10; i++) {
        useVibeStore.getState().addVibeAction('prescription_complete');
      }
      useVibeStore.getState().checkBadges();

      expect(useVibeStore.getState().earnedBadges).toContain('wellness_warrior');
    });

    it('should earn generous_soul badge after 50 like actions', () => {
      for (let i = 0; i < 50; i++) {
        useVibeStore.getState().addVibeAction('like');
      }
      useVibeStore.getState().checkBadges();

      expect(useVibeStore.getState().earnedBadges).toContain('generous_soul');
    });

    it('should earn event_lover badge after 3 join_event actions', () => {
      for (let i = 0; i < 3; i++) {
        useVibeStore.getState().addVibeAction('join_event');
      }
      useVibeStore.getState().checkBadges();

      expect(useVibeStore.getState().earnedBadges).toContain('event_lover');
    });

    it('should earn content_sharer badge after 10 share actions', () => {
      for (let i = 0; i < 10; i++) {
        useVibeStore.getState().addVibeAction('share');
      }
      useVibeStore.getState().checkBadges();

      expect(useVibeStore.getState().earnedBadges).toContain('content_sharer');
    });

    it('should not duplicate badges when checkBadges is called multiple times', () => {
      useVibeStore.getState().addVibeAction('post');
      useVibeStore.getState().checkBadges();
      useVibeStore.getState().checkBadges();
      useVibeStore.getState().checkBadges();

      const firstPostCount = useVibeStore.getState().earnedBadges.filter(b => b === 'first_post').length;
      expect(firstPostCount).toBe(1);
    });

    it('should earn multiple badges in a single check', () => {
      // Add enough actions for both first_post and generous_soul
      useVibeStore.getState().addVibeAction('post');
      for (let i = 0; i < 50; i++) {
        useVibeStore.getState().addVibeAction('like');
      }
      useVibeStore.getState().checkBadges();

      const badges = useVibeStore.getState().earnedBadges;
      expect(badges).toContain('first_post');
      expect(badges).toContain('generous_soul');
    });

    it('should handle empty action history without errors', () => {
      useVibeStore.getState().checkBadges();

      expect(useVibeStore.getState().earnedBadges).toEqual([]);
    });

    it('should preserve previously earned badges', () => {
      useVibeStore.setState({ earnedBadges: ['first_post'] });
      useVibeStore.getState().addVibeAction('like');
      useVibeStore.getState().checkBadges();

      expect(useVibeStore.getState().earnedBadges).toContain('first_post');
    });
  });

  // ==========================================================================
  // updatePreferences
  // ==========================================================================
  describe('updatePreferences', () => {
    it('should update partial preferences', () => {
      useVibeStore.getState().updatePreferences({ activityLevel: 'high' });

      const prefs = useVibeStore.getState().prescriptionPreferences;
      expect(prefs.activityLevel).toBe('high');
      // Other fields should remain at defaults
      expect(prefs.frequency).toBe('few_times_daily');
      expect(prefs.outdoorPreference).toBe('weather_permitting');
    });

    it('should update multiple preferences at once', () => {
      useVibeStore.getState().updatePreferences({
        activityLevel: 'low',
        outdoorPreference: 'never',
        frequency: 'daily',
      });

      const prefs = useVibeStore.getState().prescriptionPreferences;
      expect(prefs.activityLevel).toBe('low');
      expect(prefs.outdoorPreference).toBe('never');
      expect(prefs.frequency).toBe('daily');
    });

    it('should update enabledCategories', () => {
      useVibeStore.getState().updatePreferences({
        enabledCategories: ['movement', 'creative'],
      });

      expect(useVibeStore.getState().prescriptionPreferences.enabledCategories).toEqual([
        'movement',
        'creative',
      ]);
    });

    it('should update excludedTypes', () => {
      useVibeStore.getState().updatePreferences({
        excludedTypes: ['heavy_exercise'],
      });

      expect(useVibeStore.getState().prescriptionPreferences.excludedTypes).toEqual([
        'heavy_exercise',
      ]);
    });

    it('should preserve existing preferences when updating a single field', () => {
      const originalPrefs = { ...useVibeStore.getState().prescriptionPreferences };
      useVibeStore.getState().updatePreferences({ frequency: 'hourly' });

      const prefs = useVibeStore.getState().prescriptionPreferences;
      expect(prefs.frequency).toBe('hourly');
      expect(prefs.enabledCategories).toEqual(originalPrefs.enabledCategories);
      expect(prefs.excludedTypes).toEqual(originalPrefs.excludedTypes);
      expect(prefs.activityLevel).toBe(originalPrefs.activityLevel);
      expect(prefs.outdoorPreference).toBe(originalPrefs.outdoorPreference);
    });
  });

  // ==========================================================================
  // Max Vibe Score Cap
  // ==========================================================================
  describe('Max Vibe Score Cap', () => {
    it('should cap vibeScore at 9999', () => {
      useVibeStore.setState({ vibeScore: 9995 });

      useVibeStore.getState().addVibeAction('post'); // +10 = would be 10005

      expect(useVibeStore.getState().vibeScore).toBe(9999);
    });

    it('should not exceed 9999 via checkDailyLogin', () => {
      useVibeStore.setState({
        vibeScore: 9998,
        lastLoginDate: getYesterdayKey(),
        currentStreak: 1,
      });

      useVibeStore.getState().checkDailyLogin(); // +5 daily_login

      expect(useVibeStore.getState().vibeScore).toBe(9999);
    });

    it('should not exceed 9999 via completePrescription', () => {
      useVibeStore.setState({ vibeScore: 9990 });

      useVibeStore.getState().completePrescription('rx-1', 20, 0);

      expect(useVibeStore.getState().vibeScore).toBe(9999);
    });
  });

  // ==========================================================================
  // Selectors
  // ==========================================================================
  describe('Selectors', () => {
    it('selectVibeScore should return vibeScore', () => {
      useVibeStore.setState({ vibeScore: 42 });
      expect(selectVibeScore(useVibeStore.getState())).toBe(42);
    });

    it('selectVibeLevel should return vibeLevel', () => {
      useVibeStore.setState({ vibeLevel: 'influencer' });
      expect(selectVibeLevel(useVibeStore.getState())).toBe('influencer');
    });

    it('selectCurrentStreak should return currentStreak', () => {
      useVibeStore.setState({ currentStreak: 7 });
      expect(selectCurrentStreak(useVibeStore.getState())).toBe(7);
    });

    it('selectLongestStreak should return longestStreak', () => {
      useVibeStore.setState({ longestStreak: 14 });
      expect(selectLongestStreak(useVibeStore.getState())).toBe(14);
    });

    it('selectEarnedBadges should return earnedBadges', () => {
      useVibeStore.setState({ earnedBadges: ['first_post', 'explorer'] });
      expect(selectEarnedBadges(useVibeStore.getState())).toEqual(['first_post', 'explorer']);
    });

    it('selectRippleScore should return rippleScore', () => {
      useVibeStore.setState({ rippleScore: 55 });
      expect(selectRippleScore(useVibeStore.getState())).toBe(55);
    });

    it('selectCompletedToday should return completedToday', () => {
      useVibeStore.setState({ completedToday: ['rx-1', 'rx-2'] });
      expect(selectCompletedToday(useVibeStore.getState())).toEqual(['rx-1', 'rx-2']);
    });

    it('selectPrescriptionPreferences should return prescriptionPreferences', () => {
      const prefs = useVibeStore.getState().prescriptionPreferences;
      expect(selectPrescriptionPreferences(useVibeStore.getState())).toBe(prefs);
    });

    it('selectors should return initial state values', () => {
      const state = useVibeStore.getState();
      expect(selectVibeScore(state)).toBe(0);
      expect(selectVibeLevel(state)).toBe('newcomer');
      expect(selectCurrentStreak(state)).toBe(0);
      expect(selectLongestStreak(state)).toBe(0);
      expect(selectEarnedBadges(state)).toEqual([]);
      expect(selectRippleScore(state)).toBe(0);
      expect(selectCompletedToday(state)).toEqual([]);
    });
  });

  // ==========================================================================
  // vibeStore singleton
  // ==========================================================================
  describe('vibeStore singleton', () => {
    it('should reset all state via vibeStore.reset()', () => {
      useVibeStore.setState({
        vibeScore: 300,
        vibeLevel: 'influencer',
        currentStreak: 10,
        earnedBadges: ['first_post'],
        rippleScore: 80,
        completedToday: ['rx-1'],
      });

      vibeStore.reset();

      const state = useVibeStore.getState();
      expect(state.vibeScore).toBe(0);
      expect(state.vibeLevel).toBe('newcomer');
      expect(state.currentStreak).toBe(0);
      expect(state.earnedBadges).toEqual([]);
      expect(state.rippleScore).toBe(0);
      expect(state.completedToday).toEqual([]);
    });
  });

  // ==========================================================================
  // Action Points Coverage
  // ==========================================================================
  describe('Action Points', () => {
    it('should award 3 points for share action', () => {
      useVibeStore.getState().addVibeAction('share');
      expect(useVibeStore.getState().vibeScore).toBe(3);
    });

    it('should award 2 points for save action', () => {
      useVibeStore.getState().addVibeAction('save');
      expect(useVibeStore.getState().vibeScore).toBe(2);
    });

    it('should award 15 points for prescription_complete action', () => {
      useVibeStore.getState().addVibeAction('prescription_complete');
      expect(useVibeStore.getState().vibeScore).toBe(15);
    });

    it('should award 8 points for explore_spot action', () => {
      useVibeStore.getState().addVibeAction('explore_spot');
      expect(useVibeStore.getState().vibeScore).toBe(8);
    });

    it('should award 12 points for join_event action', () => {
      useVibeStore.getState().addVibeAction('join_event');
      expect(useVibeStore.getState().vibeScore).toBe(12);
    });

    it('should award 2 points for follow_user action', () => {
      useVibeStore.getState().addVibeAction('follow_user');
      expect(useVibeStore.getState().vibeScore).toBe(2);
    });

    it('should accumulate points from multiple different actions', () => {
      useVibeStore.getState().addVibeAction('post');      // 10
      useVibeStore.getState().addVibeAction('like');       // 1
      useVibeStore.getState().addVibeAction('share');      // 3
      useVibeStore.getState().addVibeAction('save');       // 2

      expect(useVibeStore.getState().vibeScore).toBe(16);
    });
  });

  // ==========================================================================
  // reset
  // ==========================================================================
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

    it('should reset prescription-related state', () => {
      useVibeStore.setState({
        prescriptionStartedAt: Date.now(),
        rushedToday: 3,
        completedTodayDate: getTodayKey(),
      });

      useVibeStore.getState().reset();

      const state = useVibeStore.getState();
      expect(state.prescriptionStartedAt).toBeNull();
      expect(state.rushedToday).toBe(0);
      expect(state.completedTodayDate).toBeNull();
    });

    it('should reset prescription preferences to defaults', () => {
      useVibeStore.getState().updatePreferences({
        activityLevel: 'high',
        frequency: 'hourly',
      });

      useVibeStore.getState().reset();

      const prefs = useVibeStore.getState().prescriptionPreferences;
      expect(prefs.activityLevel).toBe('medium');
      expect(prefs.frequency).toBe('few_times_daily');
      expect(prefs.outdoorPreference).toBe('weather_permitting');
      expect(prefs.enabledCategories).toEqual([
        'movement', 'mindfulness', 'social', 'creative', 'nutrition',
      ]);
    });

    it('should reset ripple history', () => {
      for (let i = 0; i < 5; i++) {
        useVibeStore.getState().addRipple(`action-${i}`);
      }
      expect(useVibeStore.getState().rippleHistory.length).toBe(5);

      useVibeStore.getState().reset();

      expect(useVibeStore.getState().rippleHistory).toEqual([]);
    });

    it('should reset lastLoginDate', () => {
      useVibeStore.getState().checkDailyLogin();
      expect(useVibeStore.getState().lastLoginDate).not.toBeNull();

      useVibeStore.getState().reset();

      expect(useVibeStore.getState().lastLoginDate).toBeNull();
    });

    it('should reset longestStreak', () => {
      useVibeStore.setState({ longestStreak: 30 });

      useVibeStore.getState().reset();

      expect(useVibeStore.getState().longestStreak).toBe(0);
    });
  });

  // ==========================================================================
  // Edge Cases
  // ==========================================================================
  describe('Edge Cases', () => {
    it('should handle completePrescription when prescriptionStartedAt is null (no rush detection)', () => {
      // Do NOT call startPrescription — prescriptionStartedAt stays null
      useVibeStore.getState().completePrescription('rx-1', 15, 10);

      // Should get full reward since rush check is skipped when startedAt is null
      expect(useVibeStore.getState().vibeScore).toBe(15);
      expect(useVibeStore.getState().rushedToday).toBe(0);
    });

    it('should set completedTodayDate on completePrescription', () => {
      useVibeStore.getState().completePrescription('rx-1', 10, 5);

      expect(useVibeStore.getState().completedTodayDate).toBe(getTodayKey());
    });

    it('should track action history timestamps', () => {
      const before = Date.now();
      useVibeStore.getState().addVibeAction('post');
      const after = Date.now();

      const history = useVibeStore.getState().actionHistory;
      expect(history[0].timestamp).toBeGreaterThanOrEqual(before);
      expect(history[0].timestamp).toBeLessThanOrEqual(after);
    });

    it('should track ripple history timestamps', () => {
      const before = Date.now();
      useVibeStore.getState().addRipple('some_action');
      const after = Date.now();

      const history = useVibeStore.getState().rippleHistory;
      expect(history[0].timestamp).toBeGreaterThanOrEqual(before);
      expect(history[0].timestamp).toBeLessThanOrEqual(after);
      expect(history[0].action).toBe('some_action');
    });

    it('should handle checkDailyReset when completedTodayDate is null', () => {
      useVibeStore.getState().checkDailyReset();

      const state = useVibeStore.getState();
      expect(state.completedToday).toEqual([]);
      expect(state.rushedToday).toBe(0);
      expect(state.completedTodayDate).toBe(getTodayKey());
    });
  });
});

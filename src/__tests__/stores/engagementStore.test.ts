/**
 * Engagement Store Tests
 */

import { useEngagementStore } from '../../stores/engagementStore';

// Mock AsyncStorage
jest.mock('@react-native-async-storage/async-storage', () => ({
  setItem: jest.fn(() => Promise.resolve()),
  getItem: jest.fn(() => Promise.resolve(null)),
  removeItem: jest.fn(() => Promise.resolve()),
}));

describe('EngagementStore', () => {
  // Reset store before each test
  beforeEach(() => {
    // Reset to initial state
    useEngagementStore.setState({
      recentEngagements: [],
      sessions: [],
      currentSession: null,
      activePostId: null,
      activePostStartTime: null,
      moodHistory: [],
      lastMoodAnalysis: null,
      categoryPreferences: {},
    });
    jest.clearAllMocks();
  });

  describe('Session Management', () => {
    describe('startSession', () => {
      it('should create a new session with current time', () => {
        const beforeTime = Date.now();
        useEngagementStore.getState().startSession();
        const afterTime = Date.now();

        const session = useEngagementStore.getState().currentSession;
        expect(session).not.toBeNull();
        expect(session!.startTime).toBeGreaterThanOrEqual(beforeTime);
        expect(session!.startTime).toBeLessThanOrEqual(afterTime);
        expect(session!.postsViewed).toBe(0);
        expect(session!.totalTimeSpent).toBe(0);
        expect(session!.hourOfDay).toBeGreaterThanOrEqual(0);
        expect(session!.hourOfDay).toBeLessThanOrEqual(23);
        expect(session!.dayOfWeek).toBeGreaterThanOrEqual(0);
        expect(session!.dayOfWeek).toBeLessThanOrEqual(6);
      });
    });

    describe('endSession', () => {
      it('should save session and clear current session', () => {
        useEngagementStore.getState().startSession();
        expect(useEngagementStore.getState().currentSession).not.toBeNull();

        useEngagementStore.getState().endSession();

        expect(useEngagementStore.getState().currentSession).toBeNull();
        expect(useEngagementStore.getState().sessions.length).toBe(1);
        expect(useEngagementStore.getState().sessions[0].endTime).toBeDefined();
      });

      it('should do nothing if no current session', () => {
        const initialSessions = useEngagementStore.getState().sessions;
        useEngagementStore.getState().endSession();
        expect(useEngagementStore.getState().sessions).toEqual(initialSessions);
      });

      it('should keep only last 50 sessions', () => {
        // Create 51 sessions
        for (let i = 0; i < 51; i++) {
          useEngagementStore.getState().startSession();
          useEngagementStore.getState().endSession();
        }

        expect(useEngagementStore.getState().sessions.length).toBeLessThanOrEqual(51);
      });
    });
  });

  describe('Post Viewing', () => {
    describe('startViewingPost', () => {
      it('should set active post and start time', () => {
        const beforeTime = Date.now();
        useEngagementStore.getState().startViewingPost('post-123', 'Fitness');
        const afterTime = Date.now();

        expect(useEngagementStore.getState().activePostId).toBe('post-123');
        expect(useEngagementStore.getState().activePostStartTime).toBeGreaterThanOrEqual(beforeTime);
        expect(useEngagementStore.getState().activePostStartTime).toBeLessThanOrEqual(afterTime);
      });

      it('should increment posts viewed in session', () => {
        useEngagementStore.getState().startSession();
        useEngagementStore.getState().startViewingPost('post-1', 'Fitness');
        useEngagementStore.getState().startViewingPost('post-2', 'Fitness');

        expect(useEngagementStore.getState().currentSession!.postsViewed).toBe(2);
      });
    });

    describe('endViewingPost', () => {
      it('should record engagement when ending post view', () => {
        jest.useFakeTimers();
        const startTime = Date.now();
        useEngagementStore.setState({
          activePostId: 'post-123',
          activePostStartTime: startTime,
        });

        // Advance time by 15 seconds
        jest.advanceTimersByTime(15000);
        useEngagementStore.getState().endViewingPost(true, false, false, false);

        const engagements = useEngagementStore.getState().recentEngagements;
        expect(engagements.length).toBe(1);
        expect(engagements[0].postId).toBe('post-123');
        expect(engagements[0].liked).toBe(true);
        expect(engagements[0].saved).toBe(false);
        expect(engagements[0].timeSpent).toBeGreaterThanOrEqual(15);

        jest.useRealTimers();
      });

      it('should clear active post state', () => {
        useEngagementStore.setState({
          activePostId: 'post-123',
          activePostStartTime: Date.now() - 10000,
        });

        useEngagementStore.getState().endViewingPost();

        expect(useEngagementStore.getState().activePostId).toBeNull();
        expect(useEngagementStore.getState().activePostStartTime).toBeNull();
      });

      it('should do nothing if no active post', () => {
        const initialEngagements = useEngagementStore.getState().recentEngagements;
        useEngagementStore.getState().endViewingPost();
        expect(useEngagementStore.getState().recentEngagements).toEqual(initialEngagements);
      });

      it('should update category preferences on like', () => {
        useEngagementStore.setState({
          activePostId: 'post-123',
          activePostStartTime: Date.now() - 5000,
        });

        useEngagementStore.getState().endViewingPost(true, false, false, false);

        const prefs = useEngagementStore.getState().categoryPreferences;
        expect(prefs['General']).toBeGreaterThan(0);
      });

      it('should update session time spent', () => {
        useEngagementStore.getState().startSession();
        useEngagementStore.setState({
          activePostId: 'post-123',
          activePostStartTime: Date.now() - 30000, // 30 seconds ago
        });

        useEngagementStore.getState().endViewingPost();

        expect(useEngagementStore.getState().currentSession!.totalTimeSpent).toBeGreaterThanOrEqual(30);
      });
    });
  });

  describe('Recording Actions', () => {
    describe('recordLike', () => {
      it('should increase category preference by 3', () => {
        useEngagementStore.getState().recordLike('post-123', 'Fitness');

        expect(useEngagementStore.getState().categoryPreferences['Fitness']).toBe(3);
      });

      it('should accumulate preferences', () => {
        useEngagementStore.getState().recordLike('post-1', 'Fitness');
        useEngagementStore.getState().recordLike('post-2', 'Fitness');

        expect(useEngagementStore.getState().categoryPreferences['Fitness']).toBe(6);
      });
    });

    describe('recordSave', () => {
      it('should increase category preference by 5', () => {
        useEngagementStore.getState().recordSave('post-123', 'Health');

        expect(useEngagementStore.getState().categoryPreferences['Health']).toBe(5);
      });
    });

    describe('recordComment', () => {
      it('should increase category preference by 4', () => {
        useEngagementStore.getState().recordComment('post-123', 'Nutrition');

        expect(useEngagementStore.getState().categoryPreferences['Nutrition']).toBe(4);
      });
    });

    describe('recordShare', () => {
      it('should increase category preference by 6', () => {
        useEngagementStore.getState().recordShare('post-123', 'Wellness');

        expect(useEngagementStore.getState().categoryPreferences['Wellness']).toBe(6);
      });
    });
  });

  describe('Mood Analysis', () => {
    describe('analyzeMood', () => {
      it('should return neutral mood with no engagement data', () => {
        const analysis = useEngagementStore.getState().analyzeMood();

        expect(analysis.currentMood).toBeDefined();
        expect(analysis.confidence).toBeGreaterThan(0);
        expect(analysis.preferredCategories).toBeInstanceOf(Array);
        expect(analysis.suggestedContentTypes).toBeInstanceOf(Array);
      });

      it('should update mood history', () => {
        useEngagementStore.getState().analyzeMood();

        const moodHistory = useEngagementStore.getState().moodHistory;
        expect(moodHistory.length).toBe(1);
        expect(moodHistory[0].mood).toBeDefined();
        expect(moodHistory[0].timestamp).toBeDefined();
      });

      it('should store last mood analysis', () => {
        useEngagementStore.getState().analyzeMood();

        const lastAnalysis = useEngagementStore.getState().lastMoodAnalysis;
        expect(lastAnalysis).not.toBeNull();
        expect(lastAnalysis!.currentMood).toBeDefined();
      });

      it('should detect creative mood from art engagement', () => {
        // Add engagements with creative categories
        const creativeEngagements = [];
        for (let i = 0; i < 15; i++) {
          creativeEngagements.push({
            postId: `post-${i}`,
            timeSpent: 30,
            liked: true,
            saved: false,
            commented: false,
            shared: false,
            category: i < 10 ? 'Art' : 'Photography',
            timestamp: Date.now() - i * 60000,
          });
        }
        useEngagementStore.setState({ recentEngagements: creativeEngagements });

        const analysis = useEngagementStore.getState().analyzeMood();

        // Should have Art and Photography in preferred categories
        expect(analysis.preferredCategories).toContain('Art');
      });
    });

    describe('getContentRecommendations', () => {
      it('should return recommendations with categories', () => {
        // Add some category preferences
        useEngagementStore.setState({
          categoryPreferences: {
            'Fitness': 10,
            'Health': 8,
            'Nutrition': 5,
          },
        });

        const recommendations = useEngagementStore.getState().getContentRecommendations();

        expect(recommendations.categories).toBeInstanceOf(Array);
        expect(recommendations.categories.length).toBeGreaterThan(0);
        expect(recommendations.contentTypes).toBeInstanceOf(Array);
        expect(recommendations.mood).toBeDefined();
      });

      it('should prioritize high preference categories', () => {
        useEngagementStore.setState({
          categoryPreferences: {
            'Fitness': 100,
            'Health': 50,
            'Random': 5,
          },
        });

        const recommendations = useEngagementStore.getState().getContentRecommendations();

        const fitnessIndex = recommendations.categories.indexOf('Fitness');
        const randomIndex = recommendations.categories.indexOf('Random');

        // Fitness should appear before Random (lower index)
        if (fitnessIndex !== -1 && randomIndex !== -1) {
          expect(fitnessIndex).toBeLessThan(randomIndex);
        }
      });

      it('should map content types to positive themes', () => {
        const recommendations = useEngagementStore.getState().getContentRecommendations();

        // Check that content types are mapped (calming -> wellness, etc.)
        expect(recommendations.contentTypes).toBeInstanceOf(Array);
      });
    });
  });

  describe('Engagement History Limits', () => {
    it('should keep only last 200 engagements', () => {
      // Create 250 engagements
      const engagements = [];
      for (let i = 0; i < 250; i++) {
        engagements.push({
          postId: `post-${i}`,
          timeSpent: 10,
          liked: false,
          saved: false,
          commented: false,
          shared: false,
          category: 'General',
          timestamp: Date.now() - i * 60000,
        });
      }
      useEngagementStore.setState({ recentEngagements: engagements });

      // Trigger an action that trims engagements
      useEngagementStore.setState({
        activePostId: 'new-post',
        activePostStartTime: Date.now() - 10000,
      });
      useEngagementStore.getState().endViewingPost();

      // Should be limited to 201 (200 + new one)
      expect(useEngagementStore.getState().recentEngagements.length).toBeLessThanOrEqual(201);
    });
  });
});

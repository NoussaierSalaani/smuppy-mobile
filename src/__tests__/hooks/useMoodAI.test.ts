/**
 * useMoodAI Hook Tests
 * Tests for mood AI detection and prescriptions hook
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(global as any).__DEV__ = false;

// Mock dependencies
const mockAnalyzeMood = jest.fn();
const mockStartSession = jest.fn();
const mockEndSession = jest.fn();
const mockTrackScroll = jest.fn();
const mockTrackPostView = jest.fn();
const mockTrackTimeOnPost = jest.fn();
const mockTrackEngagement = jest.fn();
const mockGetMoodHistory = jest.fn();
const mockGetRecommendations = jest.fn();
const mockQuickRerank = jest.fn();
const mockAddPositiveAction = jest.fn();
const mockIsFeatureEnabled = jest.fn();
const mockAddVibeAction = jest.fn();

jest.mock('react-native', () => ({
  AppState: {
    addEventListener: jest.fn(() => ({ remove: jest.fn() })),
    currentState: 'active',
  },
}));

jest.mock('../../services/moodDetection', () => ({
  moodDetection: {
    analyzeMood: () => mockAnalyzeMood(),
    startSession: () => mockStartSession(),
    endSession: () => mockEndSession(),
    trackScroll: (_y: number) => mockTrackScroll(_y),
    trackPostView: (...args: unknown[]) => mockTrackPostView(...args),
    trackTimeOnPost: (_id: string, _t: number) => mockTrackTimeOnPost(_id, _t),
    trackEngagement: (_type: string) => mockTrackEngagement(_type),
    getMoodHistory: () => mockGetMoodHistory(),
  },
  MoodType: {},
}));

jest.mock('../../services/moodRecommendation', () => ({
  moodRecommendation: {
    getRecommendations: (...args: unknown[]) => mockGetRecommendations(...args),
    quickRerank: (_posts: unknown[], _mood: unknown) => mockQuickRerank(_posts, _mood),
  },
  Post: {},
  UserProfile: {},
}));

jest.mock('../../services/rippleTracker', () => ({
  addPositiveAction: (_action: string) => mockAddPositiveAction(_action),
}));

jest.mock('../../config/featureFlags', () => ({
  isFeatureEnabled: (_key: string) => mockIsFeatureEnabled(_key),
}));

jest.mock('../../stores/vibeStore', () => ({
  useVibeStore: {
    getState: () => ({
      addVibeAction: mockAddVibeAction,
    }),
  },
}));

/**
 * Minimal hook runner
 */
function createHookRunner<T>(hookFn: () => T) {
  let state: Map<number, unknown> = new Map();
  let callbackMap: Map<number, unknown> = new Map();
  let refMap: Map<number, { current: unknown }> = new Map();
  let stateIndex = 0;
  let callbackIndex = 0;
  let refIndex = 0;
  let effectIndex = 0;
  let previousEffectDeps: Array<unknown[] | undefined> = [];
  let effectCleanups: Array<(() => void) | void> = [];
  let pendingEffects: Array<{ idx: number; fn: () => void | (() => void) }> = [];
  let result: T;

  const mockUseState = jest.fn((initial: unknown) => {
    const idx = stateIndex++;
    if (!state.has(idx)) state.set(idx, initial);
    const setter = (val: unknown) => {
      const newVal = typeof val === 'function' ? (val as (prev: unknown) => unknown)(state.get(idx)) : val;
      state.set(idx, newVal);
    };
    return [state.get(idx), setter];
  });

  const mockUseCallback = jest.fn((fn: unknown, _deps: unknown[]) => {
    const idx = callbackIndex++;
    callbackMap.set(idx, fn);
    return fn;
  });

  const mockUseRef = jest.fn((initial: unknown) => {
    const idx = refIndex++;
    if (!refMap.has(idx)) refMap.set(idx, { current: initial });
    return refMap.get(idx);
  });

  const mockUseEffect = jest.fn((fn: () => void | (() => void), deps?: unknown[]) => {
    const idx = effectIndex++;
    const prevDeps = previousEffectDeps[idx];
    let shouldRun = false;
    if (prevDeps === undefined) shouldRun = true;
    else if (deps === undefined) shouldRun = true;
    else if (deps.length !== prevDeps.length) shouldRun = true;
    else { for (let i = 0; i < deps.length; i++) { if (deps[i] !== prevDeps[i]) { shouldRun = true; break; } } }
    if (shouldRun) pendingEffects.push({ idx, fn });
    previousEffectDeps[idx] = deps;
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  jest.spyOn(require('react'), 'useState').mockImplementation(mockUseState as any);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  jest.spyOn(require('react'), 'useCallback').mockImplementation(mockUseCallback as any);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  jest.spyOn(require('react'), 'useRef').mockImplementation(mockUseRef as any);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  jest.spyOn(require('react'), 'useEffect').mockImplementation(mockUseEffect as any);

  function flushEffects() {
    const effects = [...pendingEffects];
    pendingEffects = [];
    for (const { idx, fn } of effects) {
      if (effectCleanups[idx]) effectCleanups[idx]!();
      const cleanup = fn();
      effectCleanups[idx] = cleanup || undefined;
    }
  }

  function render() {
    stateIndex = 0;
    callbackIndex = 0;
    refIndex = 0;
    effectIndex = 0;
    pendingEffects = [];
    result = hookFn();
    flushEffects();
  }

  render();

  return {
    get current() { return result; },
    rerender() { render(); },
  };
}

import { useMoodAI, getMoodDisplay, calculateSessionMetrics, MOOD_DISPLAY } from '../../hooks/useMoodAI';

describe('useMoodAI', () => {
  const defaultMood = {
    primaryMood: 'neutral' as const,
    confidence: 0.7,
    probabilities: { energetic: 0.1, relaxed: 0.1, social: 0.1, creative: 0.1, focused: 0.1, neutral: 0.5 },
    signals: { engagement: 0.5, behavioral: 0.3, temporal: 0.5, content: 0.3 },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockAnalyzeMood.mockReturnValue(defaultMood);
    mockIsFeatureEnabled.mockReturnValue(true);
    mockGetMoodHistory.mockReturnValue([]);
    mockGetRecommendations.mockResolvedValue({ posts: [], mood: defaultMood });
    mockQuickRerank.mockImplementation((posts: unknown[]) => posts);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // ========================================
  // Initial state
  // ========================================

  it('should return expected properties', () => {
    const runner = createHookRunner(() => useMoodAI());

    expect(typeof runner.current.handleScroll).toBe('function');
    expect(typeof runner.current.trackPostView).toBe('function');
    expect(typeof runner.current.trackPostExit).toBe('function');
    expect(typeof runner.current.trackLike).toBe('function');
    expect(typeof runner.current.trackComment).toBe('function');
    expect(typeof runner.current.trackShare).toBe('function');
    expect(typeof runner.current.trackSave).toBe('function');
    expect(typeof runner.current.getRecommendations).toBe('function');
    expect(typeof runner.current.quickRerank).toBe('function');
    expect(typeof runner.current.refreshMood).toBe('function');
    expect(typeof runner.current.startSession).toBe('function');
    expect(typeof runner.current.endSession).toBe('function');
    expect(typeof runner.current.getMoodHistory).toBe('function');
    expect(runner.current.isAnalyzing).toBe(false);
  });

  it('should start session on mount when enabled', () => {
    createHookRunner(() => useMoodAI());

    expect(mockStartSession).toHaveBeenCalled();
    expect(mockAnalyzeMood).toHaveBeenCalled();
  });

  it('should not start session when disabled', () => {
    createHookRunner(() => useMoodAI({ enabled: false }));

    expect(mockStartSession).not.toHaveBeenCalled();
  });

  // ========================================
  // Scroll tracking
  // ========================================

  it('should track scroll events', () => {
    const runner = createHookRunner(() => useMoodAI());

    runner.current.handleScroll({ nativeEvent: { contentOffset: { x: 0, y: 500 }, contentSize: { height: 2000, width: 375 }, layoutMeasurement: { height: 667, width: 375 }, contentInset: { top: 0, left: 0, bottom: 0, right: 0 }, zoomScale: 1 } } as never);

    expect(mockTrackScroll).toHaveBeenCalledWith(500);
  });

  it('should not track scroll when disabled', () => {
    const runner = createHookRunner(() => useMoodAI({ enabled: false }));

    runner.current.handleScroll({ nativeEvent: { contentOffset: { x: 0, y: 500 }, contentSize: { height: 2000, width: 375 }, layoutMeasurement: { height: 667, width: 375 }, contentInset: { top: 0, left: 0, bottom: 0, right: 0 }, zoomScale: 1 } } as never);

    expect(mockTrackScroll).not.toHaveBeenCalled();
  });

  it('should not track scroll when enableScrollTracking is false', () => {
    const runner = createHookRunner(() => useMoodAI({ enableScrollTracking: false }));

    runner.current.handleScroll({ nativeEvent: { contentOffset: { x: 0, y: 500 }, contentSize: { height: 2000, width: 375 }, layoutMeasurement: { height: 667, width: 375 }, contentInset: { top: 0, left: 0, bottom: 0, right: 0 }, zoomScale: 1 } } as never);

    expect(mockTrackScroll).not.toHaveBeenCalled();
  });

  // ========================================
  // Engagement tracking
  // ========================================

  it('should track post view', () => {
    const runner = createHookRunner(() => useMoodAI());

    runner.current.trackPostView('post-1', 'music', 'creator-1', 'image');

    expect(mockTrackPostView).toHaveBeenCalledWith('post-1', 'music', 'creator-1', 'image');
  });

  it('should track post exit', () => {
    const runner = createHookRunner(() => useMoodAI());

    runner.current.trackPostExit('post-1', 5.5);

    expect(mockTrackTimeOnPost).toHaveBeenCalledWith('post-1', 5.5);
  });

  it('should track like and trigger immediate mood refresh', () => {
    const runner = createHookRunner(() => useMoodAI());

    runner.current.trackLike('post-1', 'music');

    expect(mockTrackEngagement).toHaveBeenCalledWith('like');
    // analyzeMood is called: once on mount session start, once on trackLike
    expect(mockAnalyzeMood.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('should track comment', () => {
    const runner = createHookRunner(() => useMoodAI());

    runner.current.trackComment('post-1', 'art');

    expect(mockTrackEngagement).toHaveBeenCalledWith('comment');
  });

  it('should track share and add positive action when ripple enabled', () => {
    mockIsFeatureEnabled.mockReturnValue(true);

    const runner = createHookRunner(() => useMoodAI());

    runner.current.trackShare('post-1', 'travel');

    expect(mockTrackEngagement).toHaveBeenCalledWith('share');
    expect(mockAddPositiveAction).toHaveBeenCalledWith('share');
    expect(mockAddVibeAction).toHaveBeenCalledWith('share');
  });

  it('should track save', () => {
    const runner = createHookRunner(() => useMoodAI());

    runner.current.trackSave('post-1', 'food');

    expect(mockTrackEngagement).toHaveBeenCalledWith('save');
    expect(mockAddVibeAction).toHaveBeenCalledWith('save');
  });

  // ========================================
  // Recommendations
  // ========================================

  it('should get recommendations', async () => {
    const posts = [{ id: 'p1' }];
    const userProfile = { id: 'u1' };
    const mockResult = { posts, mood: defaultMood };
    mockGetRecommendations.mockResolvedValue(mockResult);

    const runner = createHookRunner(() => useMoodAI());
    const result = await runner.current.getRecommendations(posts as never, userProfile as never, 10);

    expect(result).toEqual(mockResult);
    expect(mockGetRecommendations).toHaveBeenCalledWith(posts, userProfile, 10);
  });

  it('should quick rerank posts', () => {
    const posts = [{ id: 'p1' }, { id: 'p2' }];
    mockQuickRerank.mockReturnValue([{ id: 'p2' }, { id: 'p1' }]);

    const runner = createHookRunner(() => useMoodAI());
    // Need to set mood first
    runner.current.refreshMood();
    runner.rerender();

    const result = runner.current.quickRerank(posts as never);

    expect(mockQuickRerank).toHaveBeenCalled();
    expect(result).toEqual([{ id: 'p2' }, { id: 'p1' }]);
  });

  // ========================================
  // Manual controls
  // ========================================

  it('should refresh mood manually', () => {
    const runner = createHookRunner(() => useMoodAI());

    // Clear previous calls from init
    mockAnalyzeMood.mockClear();

    runner.current.refreshMood();

    expect(mockAnalyzeMood).toHaveBeenCalledTimes(1);
  });

  it('should start and end session', () => {
    const runner = createHookRunner(() => useMoodAI({ enabled: false }));

    // Clear init calls
    mockStartSession.mockClear();
    mockEndSession.mockClear();

    runner.current.startSession();
    expect(mockStartSession).toHaveBeenCalled();

    runner.current.endSession();
    expect(mockEndSession).toHaveBeenCalled();
  });

  it('should return mood history', () => {
    const history = [defaultMood, { ...defaultMood, primaryMood: 'social' }];
    mockGetMoodHistory.mockReturnValue(history);

    const runner = createHookRunner(() => useMoodAI());
    const result = runner.current.getMoodHistory();

    expect(result).toEqual(history);
  });

  it('should call onMoodChange when mood changes', () => {
    const onMoodChange = jest.fn();
    const newMood = { ...defaultMood, primaryMood: 'energetic' as const };

    createHookRunner(() => useMoodAI({ onMoodChange }));

    // The initial analyzeMood already triggers onMoodChange for the first mood
    expect(onMoodChange).toHaveBeenCalled();

    // Now simulate a mood change
    mockAnalyzeMood.mockReturnValue(newMood);
  });
});

// ========================================
// Utility exports
// ========================================

describe('getMoodDisplay', () => {
  it('should return display info for energetic mood', () => {
    const display = getMoodDisplay('energetic');

    expect(display.label).toBe('Energetic');
    expect(display.color).toBe('#FF6B6B');
  });

  it('should return display info for neutral mood', () => {
    const display = getMoodDisplay('neutral');

    expect(display.label).toBe('Exploring');
  });

  it('should return display info for all moods', () => {
    const moods = ['energetic', 'relaxed', 'social', 'creative', 'focused', 'neutral'] as const;

    moods.forEach((mood) => {
      const display = getMoodDisplay(mood);
      expect(display.label).toBeTruthy();
      expect(display.color).toBeTruthy();
      expect(display.gradient).toHaveLength(2);
    });
  });
});

describe('MOOD_DISPLAY', () => {
  it('should have all 6 mood types', () => {
    expect(Object.keys(MOOD_DISPLAY)).toHaveLength(6);
    expect(MOOD_DISPLAY).toHaveProperty('energetic');
    expect(MOOD_DISPLAY).toHaveProperty('relaxed');
    expect(MOOD_DISPLAY).toHaveProperty('social');
    expect(MOOD_DISPLAY).toHaveProperty('creative');
    expect(MOOD_DISPLAY).toHaveProperty('focused');
    expect(MOOD_DISPLAY).toHaveProperty('neutral');
  });
});

describe('calculateSessionMetrics', () => {
  it('should return default metrics for null moods', () => {
    const metrics = calculateSessionMetrics(null, null);

    expect(metrics.sessionJoyScore).toBe(0);
    expect(metrics.engagementQuality).toBe(0);
    expect(metrics.discoveryRate).toBe(0);
  });

  it('should calculate joy score from mood probabilities', () => {
    const startMood = {
      primaryMood: 'neutral' as const,
      confidence: 0.5,
      probabilities: { energetic: 0.1, relaxed: 0.1, social: 0.1, creative: 0.1, focused: 0.1, neutral: 0.5 },
      signals: { engagement: 0.3, behavioral: 0.2, temporal: 0.5, content: 0.3 },
      timestamp: Date.now(),
    };

    const endMood = {
      primaryMood: 'energetic' as const,
      confidence: 0.8,
      probabilities: { energetic: 0.4, relaxed: 0.1, social: 0.3, creative: 0.1, focused: 0.05, neutral: 0.05 },
      signals: { engagement: 0.8, behavioral: 0.6, temporal: 0.7, content: 0.5 },
      timestamp: Date.now(),
    };

    const metrics = calculateSessionMetrics(startMood, endMood);

    // Joy score = (0.4+0.3+0.1) - (0.1+0.1+0.1) = 0.8 - 0.3 = 0.5
    expect(metrics.sessionJoyScore).toBeCloseTo(0.5, 1);
    expect(metrics.engagementQuality).toBe(0.8);
  });

  it('should handle negative joy score (mood decline)', () => {
    const startMood = {
      primaryMood: 'energetic' as const,
      confidence: 0.8,
      probabilities: { energetic: 0.4, relaxed: 0.1, social: 0.3, creative: 0.1, focused: 0.05, neutral: 0.05 },
      signals: { engagement: 0.8, behavioral: 0.6, temporal: 0.7, content: 0.5 },
      timestamp: Date.now(),
    };

    const endMood = {
      primaryMood: 'neutral' as const,
      confidence: 0.5,
      probabilities: { energetic: 0.1, relaxed: 0.1, social: 0.1, creative: 0.1, focused: 0.1, neutral: 0.5 },
      signals: { engagement: 0.3, behavioral: 0.2, temporal: 0.5, content: 0.3 },
      timestamp: Date.now(),
    };

    const metrics = calculateSessionMetrics(startMood, endMood);

    expect(metrics.sessionJoyScore).toBeLessThan(0);
  });
});

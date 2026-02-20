/**
 * useAnalytics Hook Tests
 * Tests for analytics tracking hook
 *
 * Uses a lightweight manual hook runner since the Jest config uses ts-jest/node
 * (not jest-expo) and cannot load @testing-library/react-native.
 */

// Define __DEV__ global
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(global as any).__DEV__ = false;

// Mock dependencies BEFORE imports
const mockTrack = jest.fn();
const mockTrackScreen = jest.fn();
const mockTrackPostInteraction = jest.fn();
const mockTrackFollow = jest.fn();
const mockTrackError = jest.fn();
const mockEVENTS = {
  SIGN_UP: 'sign_up',
  POST_LIKE: 'post_like',
  FOLLOW: 'follow',
};

jest.mock('../../services/analytics', () => ({
  __esModule: true,
  default: {
    track: (...args: unknown[]) => mockTrack(...args),
    trackScreen: (...args: unknown[]) => mockTrackScreen(...args),
    trackPostInteraction: (...args: unknown[]) => mockTrackPostInteraction(...args),
    trackFollow: (...args: unknown[]) => mockTrackFollow(...args),
    trackError: (...args: unknown[]) => mockTrackError(...args),
  },
  EVENTS: mockEVENTS,
}));

const mockRouteName = 'HomeScreen';
jest.mock('@react-navigation/native', () => ({
  useRoute: jest.fn(() => ({ name: mockRouteName, params: {} })),
}));

/**
 * Minimal hook runner with deferred useEffect execution.
 */
function createHookRunner<T>(hookFn: () => T) {
  let callbackMap: Map<number, unknown> = new Map();
  let refMap: Map<number, { current: unknown }> = new Map();
  let callbackIndex = 0;
  let refIndex = 0;
  let effectIndex = 0;
  let previousEffectDeps: Array<unknown[] | undefined> = [];
  let effectCleanups: Array<(() => void) | void> = [];
  let pendingEffects: Array<{ idx: number; fn: () => void | (() => void) }> = [];
  let result: T;

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
    if (prevDeps === undefined) {
      shouldRun = true;
    } else if (deps === undefined) {
      shouldRun = true;
    } else if (deps.length !== prevDeps.length) {
      shouldRun = true;
    } else {
      for (let i = 0; i < deps.length; i++) {
        if (deps[i] !== prevDeps[i]) {
          shouldRun = true;
          break;
        }
      }
    }

    if (shouldRun) {
      pendingEffects.push({ idx, fn });
    }

    previousEffectDeps[idx] = deps;
  });

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
    callbackIndex = 0;
    refIndex = 0;
    effectIndex = 0;
    pendingEffects = [];
    result = hookFn();
    flushEffects();
  }

  render();

  return {
    get current() {
      return result;
    },
    rerender() {
      render();
    },
  };
}

import { useAnalytics } from '../../hooks/useAnalytics';

describe('useAnalytics', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // ========================================
  // Initial state
  // ========================================

  it('should return all expected functions', () => {
    const runner = createHookRunner(() => useAnalytics());

    expect(typeof runner.current.track).toBe('function');
    expect(typeof runner.current.trackScreen).toBe('function');
    expect(typeof runner.current.trackPostInteraction).toBe('function');
    expect(typeof runner.current.trackFollow).toBe('function');
    expect(typeof runner.current.trackError).toBe('function');
    expect(runner.current.EVENTS).toBe(mockEVENTS);
  });

  // ========================================
  // Screen tracking
  // ========================================

  it('should track screen on mount when trackScreenOnMount is true (default)', () => {
    createHookRunner(() => useAnalytics());

    expect(mockTrackScreen).toHaveBeenCalledWith(mockRouteName);
    expect(mockTrackScreen).toHaveBeenCalledTimes(1);
  });

  it('should NOT track screen on mount when trackScreenOnMount is false', () => {
    createHookRunner(() => useAnalytics({ trackScreenOnMount: false }));

    expect(mockTrackScreen).not.toHaveBeenCalled();
  });

  it('should only track screen once on re-renders', () => {
    const runner = createHookRunner(() => useAnalytics());

    runner.rerender();
    runner.rerender();

    // Only called once since hasTrackedScreen ref prevents further calls
    expect(mockTrackScreen).toHaveBeenCalledTimes(1);
  });

  // ========================================
  // track
  // ========================================

  it('should call analytics.track with event name and properties', () => {
    const runner = createHookRunner(() => useAnalytics());

    runner.current.track('sign_up', { method: 'email' });

    expect(mockTrack).toHaveBeenCalledWith('sign_up', { method: 'email' });
  });

  it('should call analytics.track without properties', () => {
    const runner = createHookRunner(() => useAnalytics());

    runner.current.track('page_view');

    expect(mockTrack).toHaveBeenCalledWith('page_view', undefined);
  });

  // ========================================
  // trackScreen
  // ========================================

  it('should call analytics.trackScreen with provided name', () => {
    const runner = createHookRunner(() => useAnalytics());

    runner.current.trackScreen('ProfileScreen', { userId: 'u1' });

    expect(mockTrackScreen).toHaveBeenCalledWith('ProfileScreen', { userId: 'u1' });
  });

  it('should use route name when no screen name provided', () => {
    const runner = createHookRunner(() => useAnalytics());

    runner.current.trackScreen();

    // Called once on mount + once manually
    expect(mockTrackScreen).toHaveBeenCalledWith(mockRouteName, undefined);
  });

  // ========================================
  // trackPostInteraction
  // ========================================

  it('should call analytics.trackPostInteraction with action and postId', () => {
    const runner = createHookRunner(() => useAnalytics());

    runner.current.trackPostInteraction('like', 'post-123');

    expect(mockTrackPostInteraction).toHaveBeenCalledWith('like', 'post-123');
  });

  it('should handle all interaction types', () => {
    const runner = createHookRunner(() => useAnalytics());

    const actions = ['like', 'unlike', 'comment', 'share', 'save', 'unsave'] as const;
    actions.forEach((action) => {
      runner.current.trackPostInteraction(action, 'post-1');
    });

    expect(mockTrackPostInteraction).toHaveBeenCalledTimes(6);
  });

  // ========================================
  // trackFollow
  // ========================================

  it('should call analytics.trackFollow with userId and isFollow=true', () => {
    const runner = createHookRunner(() => useAnalytics());

    runner.current.trackFollow('user-456', true);

    expect(mockTrackFollow).toHaveBeenCalledWith('user-456', true);
  });

  it('should call analytics.trackFollow with isFollow=false for unfollow', () => {
    const runner = createHookRunner(() => useAnalytics());

    runner.current.trackFollow('user-456', false);

    expect(mockTrackFollow).toHaveBeenCalledWith('user-456', false);
  });

  // ========================================
  // trackError
  // ========================================

  it('should call analytics.trackError with name, message, and context', () => {
    const runner = createHookRunner(() => useAnalytics());

    runner.current.trackError('NetworkError', 'Timeout after 30s', 'fetchPosts');

    expect(mockTrackError).toHaveBeenCalledWith('NetworkError', 'Timeout after 30s', 'fetchPosts');
  });

  it('should call analytics.trackError without context', () => {
    const runner = createHookRunner(() => useAnalytics());

    runner.current.trackError('ParseError', 'Invalid JSON');

    expect(mockTrackError).toHaveBeenCalledWith('ParseError', 'Invalid JSON', undefined);
  });
});

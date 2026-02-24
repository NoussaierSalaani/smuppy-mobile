/**
 * useVibeGuardian Hook Tests
 * Tests for content safety guardian hook
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(global as any).__DEV__ = false;

// Mock dependencies
const mockStartMonitoring = jest.fn();
const mockStopMonitoring = jest.fn();
const mockCheckHealth = jest.fn();
const mockTrackEngagement = jest.fn();
const mockTrackPositiveInteraction = jest.fn();
const mockApplyProfile = jest.fn();
const mockGetSessionRecap = jest.fn();
const mockBuildVibeProfile = jest.fn();
const mockIsFeatureEnabled = jest.fn();

const mockAppStateListeners: Array<(state: string) => void> = [];

jest.mock('react-native', () => ({
  AppState: {
    addEventListener: jest.fn((_type: string, handler: (state: string) => void) => {
      mockAppStateListeners.push(handler);
      return { remove: jest.fn() };
    }),
    currentState: 'active',
  },
}));

jest.mock('../../services/vibeGuardian', () => ({
  vibeGuardian: {
    startMonitoring: () => mockStartMonitoring(),
    stopMonitoring: () => mockStopMonitoring(),
    checkHealth: () => mockCheckHealth(),
    trackEngagement: () => mockTrackEngagement(),
    trackPositiveInteraction: () => mockTrackPositiveInteraction(),
    applyProfile: (_config: unknown) => mockApplyProfile(_config),
    getSessionRecap: () => mockGetSessionRecap(),
  },
  VibeHealthStatus: {},
  SessionRecap: {},
}));

jest.mock('../../services/vibeProfile', () => ({
  buildVibeProfile: (_accountType: unknown, _tags: unknown[]) => mockBuildVibeProfile(_accountType, _tags),
}));

jest.mock('../../config/featureFlags', () => ({
  isFeatureEnabled: (_key: string) => mockIsFeatureEnabled(_key),
}));

jest.mock('../../stores/userStore', () => ({
  useUserStore: jest.fn((selector: (s: Record<string, unknown>) => unknown) =>
    selector({
      user: {
        accountType: 'personal',
        interests: ['music', 'art'],
        expertise: ['photography'],
      },
    })
  ),
}));

/**
 * Minimal hook runner
 */
function createHookRunner<T>(hookFn: () => T) {
  let state: Map<number, unknown> = new Map();
  let callbackMap: Map<number, unknown> = new Map();
  let refMap: Map<number, { current: unknown }> = new Map();
  let memoMap: Map<number, { value: unknown; deps: unknown[] }> = new Map();
  let stateIndex = 0;
  let callbackIndex = 0;
  let refIndex = 0;
  let memoIndex = 0;
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

  const mockUseMemo = jest.fn((fn: () => unknown, deps: unknown[]) => {
    const idx = memoIndex++;
    const cached = memoMap.get(idx);
    if (cached) {
      const depsChanged = deps.length !== cached.deps.length ||
        deps.some((d, i) => d !== cached.deps[i]);
      if (!depsChanged) return cached.value;
    }
    const value = fn();
    memoMap.set(idx, { value, deps });
    return value;
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
  jest.spyOn(require('react'), 'useMemo').mockImplementation(mockUseMemo as any);
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
    memoIndex = 0;
    effectIndex = 0;
    pendingEffects = [];
    mockAppStateListeners.length = 0;
    result = hookFn();
    flushEffects();
  }

  render();

  return {
    get current() { return result; },
    rerender() { render(); },
  };
}

import { useVibeGuardian, __resetVibeGuardianRecapCooldownForTests } from '../../hooks/useVibeGuardian';

describe('useVibeGuardian', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    __resetVibeGuardianRecapCooldownForTests();
    mockIsFeatureEnabled.mockReturnValue(true);
    mockBuildVibeProfile.mockReturnValue({ vibeEnabled: true, maxScrollTime: 30 });
    mockCheckHealth.mockReturnValue({ level: 'healthy', score: 80 });
    mockGetSessionRecap.mockReturnValue({ durationMinutes: 5, postsViewed: 20 });
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  // ========================================
  // Disabled state
  // ========================================

  it('should return disabled state when feature flag is off', () => {
    mockIsFeatureEnabled.mockReturnValue(false);

    const runner = createHookRunner(() => useVibeGuardian());

    expect(runner.current.isAlertVisible).toBe(false);
    expect(runner.current.vibeHealth).toBeNull();
    expect(runner.current.trackEngagement).toBeDefined();
  });

  it('should return disabled state when vibe is not enabled for profile', () => {
    mockBuildVibeProfile.mockReturnValue({ vibeEnabled: false });

    const runner = createHookRunner(() => useVibeGuardian());

    expect(runner.current.isAlertVisible).toBe(false);
    expect(runner.current.vibeHealth).toBeNull();
  });

  // ========================================
  // Enabled state
  // ========================================

  it('should start monitoring when enabled', () => {
    createHookRunner(() => useVibeGuardian());

    expect(mockStartMonitoring).toHaveBeenCalled();
    expect(mockApplyProfile).toHaveBeenCalled();
  });

  it('should build profile with interests for personal accounts', () => {
    createHookRunner(() => useVibeGuardian());

    expect(mockBuildVibeProfile).toHaveBeenCalledWith('personal', ['music', 'art']);
  });

  // ========================================
  // Health checks
  // ========================================

  it('should perform periodic health checks', () => {
    createHookRunner(() => useVibeGuardian());

    // Advance 15 seconds (HEALTH_CHECK_INTERVAL_MS)
    jest.advanceTimersByTime(15000);

    expect(mockCheckHealth).toHaveBeenCalled();
  });

  it('should show alert when health level is alert', () => {
    mockCheckHealth.mockReturnValue({ level: 'alert', score: 20 });

    const runner = createHookRunner(() => useVibeGuardian());

    jest.advanceTimersByTime(15000);
    runner.rerender();

    expect(runner.current.isAlertVisible).toBe(true);
  });

  // ========================================
  // Callbacks
  // ========================================

  it('should dismiss alert and prevent re-showing', () => {
    mockCheckHealth.mockReturnValue({ level: 'alert', score: 20 });

    const runner = createHookRunner(() => useVibeGuardian());

    jest.advanceTimersByTime(15000);
    runner.rerender();

    expect(runner.current.isAlertVisible).toBe(true);

    runner.current.dismissAlert();
    runner.rerender();

    expect(runner.current.isAlertVisible).toBe(false);
  });

  it('should track engagement when enabled', () => {
    const runner = createHookRunner(() => useVibeGuardian());

    runner.current.trackEngagement();

    expect(mockTrackEngagement).toHaveBeenCalled();
  });

  it('should track positive interaction when enabled', () => {
    const runner = createHookRunner(() => useVibeGuardian());

    runner.current.trackPositiveInteraction();

    expect(mockTrackPositiveInteraction).toHaveBeenCalled();
  });

  it('should not track engagement when disabled', () => {
    mockIsFeatureEnabled.mockReturnValue(false);

    const runner = createHookRunner(() => useVibeGuardian());

    runner.current.trackEngagement();

    expect(mockTrackEngagement).not.toHaveBeenCalled();
  });

  it('should dismiss session recap', () => {
    const runner = createHookRunner(() => useVibeGuardian());

    runner.current.dismissSessionRecap();
    runner.rerender();

    expect(runner.current.showSessionRecap).toBe(false);
    expect(runner.current.sessionRecap).toBeNull();
  });

  it('should not trigger session recap on inactive state changes', () => {
    mockGetSessionRecap.mockReturnValue({
      durationMinutes: 12,
      vibeTrajectory: 'declined',
      positiveInteractions: 0,
      startMood: 'neutral',
      endMood: 'sad',
    });

    const runner = createHookRunner(() => useVibeGuardian());
    mockAppStateListeners[0]?.('inactive');
    runner.rerender();

    expect(runner.current.showSessionRecap).toBe(false);
  });

  it('should trigger session recap only for meaningful background transitions', () => {
    mockGetSessionRecap.mockReturnValue({
      durationMinutes: 12,
      vibeTrajectory: 'declined',
      positiveInteractions: 0,
      startMood: 'neutral',
      endMood: 'sad',
    });

    const runner = createHookRunner(() => useVibeGuardian());
    mockAppStateListeners[0]?.('background');
    runner.rerender();

    expect(runner.current.showSessionRecap).toBe(true);
  });

  it('should enforce recap cooldown between background transitions', () => {
    mockGetSessionRecap.mockReturnValue({
      durationMinutes: 12,
      vibeTrajectory: 'declined',
      positiveInteractions: 0,
      startMood: 'neutral',
      endMood: 'sad',
    });

    const runner = createHookRunner(() => useVibeGuardian());
    mockAppStateListeners[0]?.('background');
    runner.rerender();
    expect(runner.current.showSessionRecap).toBe(true);

    runner.current.dismissSessionRecap();
    runner.rerender();
    mockAppStateListeners[0]?.('active');
    mockAppStateListeners[0]?.('background');
    runner.rerender();

    expect(runner.current.showSessionRecap).toBe(false);
  });
});

/**
 * useVibePrescriptions Hook Tests
 * Tests for vibe prescription recommendations hook
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(global as any).__DEV__ = false;

// Mock dependencies
const mockGeneratePrescriptions = jest.fn();
const mockGetWeather = jest.fn();
const mockAnalyzeMood = jest.fn();
const mockIsFeatureEnabled = jest.fn();
const mockCompletePrescription = jest.fn();
const mockUpdatePreferences = jest.fn();
const mockStartPrescription = jest.fn();
const mockCheckDailyReset = jest.fn();

const mockPreferences = {
  enabledCategories: ['movement', 'mindfulness'],
  excludedTypes: [],
  activityLevel: 'medium' as const,
  outdoorPreference: 'weather_permitting' as const,
  frequency: 'few_times_daily' as const,
};
const mockCompletedToday: string[] = [];

jest.mock('../../stores/vibeStore', () => ({
  useVibeStore: jest.fn((selector: (s: Record<string, unknown>) => unknown) =>
    selector({
      prescriptionPreferences: mockPreferences,
      completedToday: mockCompletedToday,
      completePrescription: mockCompletePrescription,
      updatePreferences: mockUpdatePreferences,
      startPrescription: mockStartPrescription,
      checkDailyReset: mockCheckDailyReset,
    })
  ),
  PrescriptionPreferences: {},
}));

jest.mock('../../services/prescriptionEngine', () => ({
  generatePrescriptions: (...args: unknown[]) => mockGeneratePrescriptions(...args),
  Prescription: {},
}));

jest.mock('../../services/weatherService', () => ({
  getWeather: () => mockGetWeather(),
  WeatherData: {},
}));

jest.mock('../../services/moodDetection', () => ({
  moodDetection: {
    analyzeMood: () => mockAnalyzeMood(),
  },
  MoodType: {},
}));

jest.mock('../../config/featureFlags', () => ({
  isFeatureEnabled: (_key: string) => mockIsFeatureEnabled(_key),
}));

/**
 * Minimal hook runner
 */
function createHookRunner<T>(hookFn: () => T) {
  let state: Map<number, unknown> = new Map();
  let callbackMap: Map<number, unknown> = new Map();
  let memoMap: Map<number, { value: unknown; deps: unknown[] }> = new Map();
  let stateIndex = 0;
  let callbackIndex = 0;
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
    memoIndex = 0;
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

function flushAsync(ms = 50): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

import { useVibePrescriptions } from '../../hooks/useVibePrescriptions';

describe('useVibePrescriptions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsFeatureEnabled.mockReturnValue(true);
    mockGetWeather.mockResolvedValue({ temp: 22, condition: 'sunny', humidity: 50 });
    mockAnalyzeMood.mockReturnValue({ primaryMood: 'neutral' });
    mockGeneratePrescriptions.mockReturnValue([
      { id: 'rx-1', title: 'Take a walk', vibeScoreReward: 10, durationMinutes: 15 },
      { id: 'rx-2', title: 'Listen to music', vibeScoreReward: 5, durationMinutes: 10 },
    ]);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should return expected properties', () => {
    const runner = createHookRunner(() => useVibePrescriptions());

    expect(typeof runner.current.completePrescription).toBe('function');
    expect(typeof runner.current.setActivePrescription).toBe('function');
    expect(typeof runner.current.updatePreferences).toBe('function');
    expect(typeof runner.current.refresh).toBe('function');
    expect(runner.current.enabled).toBe(true);
    expect(runner.current.preferences).toEqual(mockPreferences);
  });

  it('should check daily reset on mount', () => {
    createHookRunner(() => useVibePrescriptions());

    expect(mockCheckDailyReset).toHaveBeenCalled();
  });

  it('should be disabled when feature flag is off', () => {
    mockIsFeatureEnabled.mockReturnValue(false);

    const runner = createHookRunner(() => useVibePrescriptions());
    runner.rerender(); // flush state changes from the disabled effect

    expect(runner.current.enabled).toBe(false);
    expect(runner.current.isLoading).toBe(false);
    expect(runner.current.prescriptions).toEqual([]);
  });

  it('should fetch weather on mount when enabled', async () => {
    createHookRunner(() => useVibePrescriptions());

    await flushAsync();

    expect(mockGetWeather).toHaveBeenCalled();
  });

  it('should generate prescriptions when weather is loaded', async () => {
    const runner = createHookRunner(() => useVibePrescriptions());

    await flushAsync();
    runner.rerender();

    expect(mockGeneratePrescriptions).toHaveBeenCalledWith(
      'neutral', // mood
      { temp: 22, condition: 'sunny', humidity: 50 }, // weather
      mockPreferences,
      mockCompletedToday
    );
    expect(runner.current.prescriptions).toHaveLength(2);
  });

  it('should set active prescription and call startPrescription', () => {
    const rx = { id: 'rx-1', title: 'Walk', vibeScoreReward: 10, durationMinutes: 15 };
    const runner = createHookRunner(() => useVibePrescriptions());

    runner.current.setActivePrescription(rx as never);
    runner.rerender();

    expect(mockStartPrescription).toHaveBeenCalled();
    expect(runner.current.activePrescription).toEqual(rx);
  });

  it('should complete prescription and clear active', async () => {
    const runner = createHookRunner(() => useVibePrescriptions());

    await flushAsync();
    runner.rerender();

    // Now prescriptions should be loaded
    runner.current.completePrescription('rx-1');
    runner.rerender();

    expect(mockCompletePrescription).toHaveBeenCalledWith('rx-1', 10, 15);
    expect(runner.current.activePrescription).toBeNull();
  });

  it('should not complete prescription with unknown id', async () => {
    const runner = createHookRunner(() => useVibePrescriptions());

    await flushAsync();
    runner.rerender();

    runner.current.completePrescription('rx-nonexistent');

    expect(mockCompletePrescription).not.toHaveBeenCalled();
  });

  it('should call updatePreferences on vibeStore', () => {
    const runner = createHookRunner(() => useVibePrescriptions());

    runner.current.updatePreferences({ activityLevel: 'low' });

    expect(mockUpdatePreferences).toHaveBeenCalledWith({ activityLevel: 'low' });
  });

  it('should handle weather fetch failure gracefully', async () => {
    mockGetWeather.mockRejectedValue(new Error('GPS unavailable'));

    const runner = createHookRunner(() => useVibePrescriptions());

    await flushAsync();
    runner.rerender();

    // Should not crash, weather should be null, prescriptions empty
    expect(runner.current.weather).toBeNull();
    expect(runner.current.isLoading).toBe(false);
  });
});

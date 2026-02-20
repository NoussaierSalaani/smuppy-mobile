/**
 * useRipple Hook Tests
 * Tests for ripple effect tracking hook
 *
 * Uses a lightweight manual hook runner since the Jest config uses ts-jest/node.
 */

// Define __DEV__ global
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(global as any).__DEV__ = false;

// Mock dependencies BEFORE imports
const mockRippleScore = 75;
const mockGetRippleLevel = jest.fn((_score: number) => ({ name: 'High', threshold: 50, color: '#FF0000' }));
const mockGetRippleAnimationIntensity = jest.fn((_score: number) => 0.8);
const mockIsFeatureEnabled = jest.fn((_key: string) => true);

jest.mock('../../stores/vibeStore', () => ({
  useVibeStore: jest.fn((selector: (s: { rippleScore: number }) => unknown) =>
    selector({ rippleScore: mockRippleScore })
  ),
}));

jest.mock('../../services/rippleTracker', () => ({
  getRippleLevel: (score: number) => mockGetRippleLevel(score),
  getRippleAnimationIntensity: (score: number) => mockGetRippleAnimationIntensity(score),
}));

jest.mock('../../config/featureFlags', () => ({
  isFeatureEnabled: (key: string) => mockIsFeatureEnabled(key),
}));

/**
 * Minimal hook runner with useMemo support.
 */
function createHookRunner<T>(hookFn: () => T) {
  let memoMap: Map<number, { value: unknown; deps: unknown[] }> = new Map();
  let memoIndex = 0;
  let result: T;

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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  jest.spyOn(require('react'), 'useMemo').mockImplementation(mockUseMemo as any);

  function render() {
    memoIndex = 0;
    result = hookFn();
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

import { useRipple } from '../../hooks/useRipple';

describe('useRipple', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should return rippleScore from vibeStore', () => {
    const runner = createHookRunner(() => useRipple());

    expect(runner.current.rippleScore).toBe(mockRippleScore);
  });

  it('should return rippleLevel from getRippleLevel', () => {
    const runner = createHookRunner(() => useRipple());

    expect(runner.current.rippleLevel).toEqual({ name: 'High', threshold: 50, color: '#FF0000' });
    expect(mockGetRippleLevel).toHaveBeenCalledWith(mockRippleScore);
  });

  it('should return animationIntensity from getRippleAnimationIntensity', () => {
    const runner = createHookRunner(() => useRipple());

    expect(runner.current.animationIntensity).toBe(0.8);
    expect(mockGetRippleAnimationIntensity).toHaveBeenCalledWith(mockRippleScore);
  });

  it('should return enabled=true when feature flag is enabled', () => {
    mockIsFeatureEnabled.mockReturnValue(true);
    const runner = createHookRunner(() => useRipple());

    expect(runner.current.enabled).toBe(true);
    expect(mockIsFeatureEnabled).toHaveBeenCalledWith('EMOTIONAL_RIPPLE');
  });

  it('should return enabled=false when feature flag is disabled', () => {
    mockIsFeatureEnabled.mockReturnValue(false);
    const runner = createHookRunner(() => useRipple());

    expect(runner.current.enabled).toBe(false);
  });
});

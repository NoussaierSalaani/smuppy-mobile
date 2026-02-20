/**
 * useCooldown Hook Tests
 * Tests for countdown cooldown timer behavior
 *
 * Uses a lightweight manual hook runner since the Jest config uses ts-jest/node
 * (not jest-expo) and cannot load @testing-library/react-native.
 */

// Define __DEV__ global
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(global as any).__DEV__ = false;

// Minimal hook runner that simulates React hook state for testing
function createHookRunner<T>(hookFn: () => T) {
  let state: Map<number, unknown> = new Map();
  let callbackMap: Map<number, unknown> = new Map();
  let refMap: Map<number, { current: unknown }> = new Map();
  let effectCallbacks: Array<{ fn: () => void | (() => void); deps: unknown[] | undefined }> = [];
  let previousEffectDeps: Array<unknown[] | undefined> = [];
  let effectCleanups: Array<(() => void) | void> = [];
  let stateIndex = 0;
  let callbackIndex = 0;
  let refIndex = 0;
  let effectIndex = 0;
  let result: T;
  let stateSetters: Array<(v: unknown) => void> = [];
  let needsRerender = false;

  const mockUseState = jest.fn((initial: unknown) => {
    const idx = stateIndex++;
    if (!state.has(idx)) state.set(idx, initial);
    const setter = (val: unknown) => {
      const newVal = typeof val === 'function' ? (val as (prev: unknown) => unknown)(state.get(idx)) : val;
      state.set(idx, newVal);
      needsRerender = true;
    };
    stateSetters.push(setter);
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

    // Run effect if deps changed or first run
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
      // Run cleanup of previous effect
      if (effectCleanups[idx]) {
        effectCleanups[idx]!();
      }
      const cleanup = fn();
      effectCleanups[idx] = cleanup || undefined;
    }

    previousEffectDeps[idx] = deps;
    effectCallbacks[idx] = { fn, deps };
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  jest.spyOn(require('react'), 'useState').mockImplementation(mockUseState as any);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  jest.spyOn(require('react'), 'useCallback').mockImplementation(mockUseCallback as any);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  jest.spyOn(require('react'), 'useRef').mockImplementation(mockUseRef as any);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  jest.spyOn(require('react'), 'useEffect').mockImplementation(mockUseEffect as any);

  function render() {
    stateIndex = 0;
    callbackIndex = 0;
    refIndex = 0;
    effectIndex = 0;
    stateSetters = [];
    needsRerender = false;
    result = hookFn();
  }

  render();

  return {
    get current() {
      return result;
    },
    rerender() {
      render();
      // Process cascading re-renders from effects that change state
      let maxIterations = 10;
      while (needsRerender && maxIterations > 0) {
        maxIterations--;
        render();
      }
    },
    cleanup() {
      for (const cleanup of effectCleanups) {
        if (cleanup) cleanup();
      }
    },
  };
}

import { useCooldown } from '../../hooks/useCooldown';

describe('useCooldown', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('should initialize with remaining=0 and isCoolingDown=false', () => {
    const runner = createHookRunner(() => useCooldown(30));

    expect(runner.current.remaining).toBe(0);
    expect(runner.current.isCoolingDown).toBe(false);
  });

  it('should start cooldown and set remaining to the configured seconds', () => {
    const runner = createHookRunner(() => useCooldown(5));

    runner.current.start();
    runner.rerender();

    expect(runner.current.remaining).toBe(5);
    expect(runner.current.isCoolingDown).toBe(true);
  });

  it('should decrement remaining every second after start', () => {
    const runner = createHookRunner(() => useCooldown(3));

    runner.current.start();
    runner.rerender();

    expect(runner.current.remaining).toBe(3);

    // Advance 1 second
    jest.advanceTimersByTime(1000);
    runner.rerender();
    expect(runner.current.remaining).toBe(2);

    // Advance another second
    jest.advanceTimersByTime(1000);
    runner.rerender();
    expect(runner.current.remaining).toBe(1);

    // Advance final second
    jest.advanceTimersByTime(1000);
    runner.rerender();
    expect(runner.current.remaining).toBe(0);
    expect(runner.current.isCoolingDown).toBe(false);
  });

  it('should not go below 0', () => {
    const runner = createHookRunner(() => useCooldown(1));

    runner.current.start();
    runner.rerender();

    // Advance well past the cooldown
    jest.advanceTimersByTime(5000);
    runner.rerender();

    expect(runner.current.remaining).toBe(0);
    expect(runner.current.isCoolingDown).toBe(false);
  });

  it('should reset cooldown to 0 immediately', () => {
    const runner = createHookRunner(() => useCooldown(10));

    runner.current.start();
    runner.rerender();
    expect(runner.current.remaining).toBe(10);

    runner.current.reset();
    runner.rerender();

    expect(runner.current.remaining).toBe(0);
    expect(runner.current.isCoolingDown).toBe(false);
  });

  it('should allow restarting after cooldown completes', () => {
    const runner = createHookRunner(() => useCooldown(2));

    // First start
    runner.current.start();
    runner.rerender();
    expect(runner.current.remaining).toBe(2);

    // Let cooldown complete
    jest.advanceTimersByTime(2000);
    runner.rerender();
    expect(runner.current.remaining).toBe(0);

    // Restart
    runner.current.start();
    runner.rerender();
    expect(runner.current.remaining).toBe(2);
    expect(runner.current.isCoolingDown).toBe(true);
  });

  it('should allow restarting after reset', () => {
    const runner = createHookRunner(() => useCooldown(5));

    runner.current.start();
    runner.rerender();
    expect(runner.current.remaining).toBe(5);

    runner.current.reset();
    runner.rerender();
    expect(runner.current.remaining).toBe(0);

    runner.current.start();
    runner.rerender();
    expect(runner.current.remaining).toBe(5);
    expect(runner.current.isCoolingDown).toBe(true);
  });

  it('should handle cooldown of 0 seconds gracefully', () => {
    const runner = createHookRunner(() => useCooldown(0));

    runner.current.start();
    runner.rerender();

    // With 0 seconds, remaining is immediately set to 0
    expect(runner.current.remaining).toBe(0);
    expect(runner.current.isCoolingDown).toBe(false);
  });

  it('should handle cooldown of 1 second', () => {
    const runner = createHookRunner(() => useCooldown(1));

    runner.current.start();
    runner.rerender();
    expect(runner.current.remaining).toBe(1);
    expect(runner.current.isCoolingDown).toBe(true);

    jest.advanceTimersByTime(1000);
    runner.rerender();
    expect(runner.current.remaining).toBe(0);
    expect(runner.current.isCoolingDown).toBe(false);
  });

  it('should return start and reset as functions', () => {
    const runner = createHookRunner(() => useCooldown(10));

    expect(typeof runner.current.start).toBe('function');
    expect(typeof runner.current.reset).toBe('function');
  });
});

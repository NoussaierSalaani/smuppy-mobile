/**
 * usePreventDoubleClick Hook Tests
 * Tests for preventing double-click behavior
 *
 * Uses a lightweight manual hook runner since the Jest config uses ts-jest/node
 * (not jest-expo) and cannot load @testing-library/react-native.
 */

// Minimal hook runner that simulates React hook state for testing
function createHookRunner<T>(hookFn: () => T) {
  let state: Map<number, unknown> = new Map();
  let callbackMap: Map<number, unknown> = new Map();
  let refMap: Map<number, { current: unknown }> = new Map();
  let stateIndex = 0;
  let callbackIndex = 0;
  let refIndex = 0;
  let result: T;
  let stateSetters: Array<(v: unknown) => void> = [];

  const mockUseState = jest.fn((initial: unknown) => {
    const idx = stateIndex++;
    if (!state.has(idx)) state.set(idx, initial);
    const setter = (val: unknown) => {
      const newVal = typeof val === 'function' ? (val as (prev: unknown) => unknown)(state.get(idx)) : val;
      state.set(idx, newVal);
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  jest.spyOn(require('react'), 'useState').mockImplementation(mockUseState as any);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  jest.spyOn(require('react'), 'useCallback').mockImplementation(mockUseCallback as any);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  jest.spyOn(require('react'), 'useRef').mockImplementation(mockUseRef as any);

  function render() {
    stateIndex = 0;
    callbackIndex = 0;
    refIndex = 0;
    stateSetters = [];
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

import { usePreventDoubleClick } from '../../hooks/usePreventDoubleClick';

describe('usePreventDoubleClick', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('should execute callback on first click', () => {
    const callback = jest.fn();
    const runner = createHookRunner(() => usePreventDoubleClick(callback, 500));

    const [handleClick] = runner.current;
    handleClick();

    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('should prevent multiple clicks within delay period', () => {
    const callback = jest.fn();
    const runner = createHookRunner(() => usePreventDoubleClick(callback, 500));

    const [handleClick] = runner.current;
    handleClick();
    handleClick(); // Second click should be ignored
    handleClick(); // Third click should be ignored

    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('should allow clicking again after delay expires', () => {
    const callback = jest.fn();
    const runner = createHookRunner(() => usePreventDoubleClick(callback, 500));

    const [handleClick] = runner.current;

    // First click
    handleClick();
    expect(callback).toHaveBeenCalledTimes(1);

    // Advance timers past delay
    jest.advanceTimersByTime(500);

    // Re-render to pick up new state
    runner.rerender();
    const [handleClick2] = runner.current;

    // Second click should work now
    handleClick2();
    expect(callback).toHaveBeenCalledTimes(2);
  });

  it('should pass arguments to callback', () => {
    const callback = jest.fn();
    const runner = createHookRunner(() => usePreventDoubleClick(callback, 500));

    const [handleClick] = runner.current;
    handleClick('arg1', 'arg2', 123);

    expect(callback).toHaveBeenCalledWith('arg1', 'arg2', 123);
  });

  it('should handle undefined callback gracefully', () => {
    const runner = createHookRunner(() => usePreventDoubleClick(undefined, 500));

    const [handleClick] = runner.current;

    // Should not throw
    expect(() => handleClick()).not.toThrow();
  });

  it('should cleanup timeout on unmount', () => {
    const callback = jest.fn();
    const runner = createHookRunner(() => usePreventDoubleClick(callback, 500));

    const [handleClick, , cleanup] = runner.current;

    handleClick();

    // Cleanup should not throw
    expect(() => cleanup()).not.toThrow();
  });

  it('should use default delay of 500ms', () => {
    const callback = jest.fn();
    const runner = createHookRunner(() => usePreventDoubleClick(callback)); // No delay specified

    const [handleClick] = runner.current;

    handleClick();
    expect(callback).toHaveBeenCalledTimes(1);

    // Should still be blocked before 500ms
    jest.advanceTimersByTime(400);
    runner.rerender();
    const [handleClick2] = runner.current;
    handleClick2();
    expect(callback).toHaveBeenCalledTimes(1); // Still 1

    // After 500ms should work
    jest.advanceTimersByTime(100);
    runner.rerender();
    const [handleClick3] = runner.current;
    handleClick3();
    expect(callback).toHaveBeenCalledTimes(2);
  });

  it('should use custom delay when specified', () => {
    const callback = jest.fn();
    const runner = createHookRunner(() => usePreventDoubleClick(callback, 1000));

    const [handleClick] = runner.current;

    handleClick();

    // Should still be disabled at 500ms
    jest.advanceTimersByTime(500);
    runner.rerender();
    const [handleClick2] = runner.current;
    handleClick2();
    expect(callback).toHaveBeenCalledTimes(1);

    // Should work after 1000ms
    jest.advanceTimersByTime(500);
    runner.rerender();
    const [handleClick3] = runner.current;
    handleClick3();
    expect(callback).toHaveBeenCalledTimes(2);
  });
});

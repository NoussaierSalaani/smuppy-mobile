/**
 * usePreventDoubleNavigation Hook Tests
 * Tests for preventing double navigation actions
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

import { usePreventDoubleNavigation } from '../../hooks/usePreventDoubleClick';

function createMockNavigation() {
  return {
    canGoBack: jest.fn(() => true),
    goBack: jest.fn(),
    navigate: jest.fn(),
    replace: jest.fn(),
    reset: jest.fn(),
  };
}

describe('usePreventDoubleNavigation', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  // ---------- goBack ----------

  it('should call navigation.goBack() when canGoBack() returns true', () => {
    const nav = createMockNavigation();
    nav.canGoBack.mockReturnValue(true);
    const runner = createHookRunner(() => usePreventDoubleNavigation(nav));

    runner.current.goBack();

    expect(nav.canGoBack).toHaveBeenCalled();
    expect(nav.goBack).toHaveBeenCalledTimes(1);
  });

  it('should NOT call navigation.goBack() when canGoBack() returns false', () => {
    const nav = createMockNavigation();
    nav.canGoBack.mockReturnValue(false);
    const runner = createHookRunner(() => usePreventDoubleNavigation(nav));

    runner.current.goBack();

    expect(nav.canGoBack).toHaveBeenCalled();
    expect(nav.goBack).not.toHaveBeenCalled();
  });

  // ---------- navigate ----------

  it('should call navigation.navigate() with screen name and params', () => {
    const nav = createMockNavigation();
    const runner = createHookRunner(() => usePreventDoubleNavigation(nav));

    const params = { userId: '123', tab: 'posts' };
    runner.current.navigate('ProfileScreen', params);

    expect(nav.navigate).toHaveBeenCalledTimes(1);
    expect(nav.navigate).toHaveBeenCalledWith('ProfileScreen', params);
  });

  it('should call navigation.navigate() with screen name only (no params)', () => {
    const nav = createMockNavigation();
    const runner = createHookRunner(() => usePreventDoubleNavigation(nav));

    runner.current.navigate('HomeScreen');

    expect(nav.navigate).toHaveBeenCalledTimes(1);
    expect(nav.navigate).toHaveBeenCalledWith('HomeScreen', undefined);
  });

  // ---------- replace ----------

  it('should call navigation.replace() with screen name and params', () => {
    const nav = createMockNavigation();
    const runner = createHookRunner(() => usePreventDoubleNavigation(nav));

    const params = { mode: 'edit' };
    runner.current.replace('SettingsScreen', params);

    expect(nav.replace).toHaveBeenCalledTimes(1);
    expect(nav.replace).toHaveBeenCalledWith('SettingsScreen', params);
  });

  it('should call navigation.replace() with screen name only (no params)', () => {
    const nav = createMockNavigation();
    const runner = createHookRunner(() => usePreventDoubleNavigation(nav));

    runner.current.replace('LoginScreen');

    expect(nav.replace).toHaveBeenCalledTimes(1);
    expect(nav.replace).toHaveBeenCalledWith('LoginScreen', undefined);
  });

  // ---------- reset ----------

  it('should call navigation.reset() with state object', () => {
    const nav = createMockNavigation();
    const runner = createHookRunner(() => usePreventDoubleNavigation(nav));

    const resetState = {
      index: 0,
      routes: [{ name: 'HomeScreen' }],
    };
    runner.current.reset(resetState);

    expect(nav.reset).toHaveBeenCalledTimes(1);
    expect(nav.reset).toHaveBeenCalledWith(resetState);
  });

  it('should call navigation.reset() with state containing params', () => {
    const nav = createMockNavigation();
    const runner = createHookRunner(() => usePreventDoubleNavigation(nav));

    const resetState = {
      index: 1,
      routes: [
        { name: 'HomeScreen' },
        { name: 'ProfileScreen', params: { userId: 'abc' } },
      ],
    };
    runner.current.reset(resetState);

    expect(nav.reset).toHaveBeenCalledTimes(1);
    expect(nav.reset).toHaveBeenCalledWith(resetState);
  });

  // ---------- Double-click prevention ----------

  it('should ignore second navigate call within delay period', () => {
    const nav = createMockNavigation();
    const runner = createHookRunner(() => usePreventDoubleNavigation(nav));

    runner.current.navigate('ScreenA');

    // Re-render so the hook picks up disabled=true from setDisabled(true)
    runner.rerender();

    runner.current.navigate('ScreenB'); // Should be ignored

    expect(nav.navigate).toHaveBeenCalledTimes(1);
    expect(nav.navigate).toHaveBeenCalledWith('ScreenA', undefined);
  });

  it('should ignore second replace call within delay period', () => {
    const nav = createMockNavigation();
    const runner = createHookRunner(() => usePreventDoubleNavigation(nav));

    runner.current.replace('ScreenA');

    // Re-render so the hook picks up disabled=true
    runner.rerender();

    runner.current.replace('ScreenB'); // Should be ignored

    expect(nav.replace).toHaveBeenCalledTimes(1);
    expect(nav.replace).toHaveBeenCalledWith('ScreenA', undefined);
  });

  it('should ignore second goBack call within delay period', () => {
    const nav = createMockNavigation();
    nav.canGoBack.mockReturnValue(true);
    const runner = createHookRunner(() => usePreventDoubleNavigation(nav));

    runner.current.goBack();

    // Re-render so the hook picks up disabled=true
    runner.rerender();

    runner.current.goBack(); // Should be ignored

    expect(nav.goBack).toHaveBeenCalledTimes(1);
  });

  it('should ignore second reset call within delay period', () => {
    const nav = createMockNavigation();
    const runner = createHookRunner(() => usePreventDoubleNavigation(nav));

    const state1 = { index: 0, routes: [{ name: 'ScreenA' }] };
    const state2 = { index: 0, routes: [{ name: 'ScreenB' }] };

    runner.current.reset(state1);

    // Re-render so the hook picks up disabled=true
    runner.rerender();

    runner.current.reset(state2); // Should be ignored

    expect(nav.reset).toHaveBeenCalledTimes(1);
    expect(nav.reset).toHaveBeenCalledWith(state1);
  });

  it('should prevent cross-action double calls (navigate then goBack)', () => {
    const nav = createMockNavigation();
    nav.canGoBack.mockReturnValue(true);
    const runner = createHookRunner(() => usePreventDoubleNavigation(nav));

    runner.current.navigate('ScreenA');

    // Re-render so the hook picks up disabled=true
    runner.rerender();

    runner.current.goBack(); // Should be ignored because disabled

    expect(nav.navigate).toHaveBeenCalledTimes(1);
    expect(nav.goBack).not.toHaveBeenCalled();
  });

  // ---------- Re-enable after delay ----------

  it('should allow navigation again after delay expires', () => {
    const nav = createMockNavigation();
    const runner = createHookRunner(() => usePreventDoubleNavigation(nav));

    // First navigation
    runner.current.navigate('ScreenA');
    expect(nav.navigate).toHaveBeenCalledTimes(1);

    // Advance timers past default delay (500ms)
    jest.advanceTimersByTime(500);

    // Re-render to pick up new state
    runner.rerender();

    // Second navigation should work now
    runner.current.navigate('ScreenB');
    expect(nav.navigate).toHaveBeenCalledTimes(2);
    expect(nav.navigate).toHaveBeenLastCalledWith('ScreenB', undefined);
  });

  it('should still be blocked before delay expires', () => {
    const nav = createMockNavigation();
    const runner = createHookRunner(() => usePreventDoubleNavigation(nav));

    runner.current.navigate('ScreenA');
    expect(nav.navigate).toHaveBeenCalledTimes(1);

    // Advance timers but not past the delay
    jest.advanceTimersByTime(400);
    runner.rerender();

    runner.current.navigate('ScreenB');
    // Should still be blocked
    expect(nav.navigate).toHaveBeenCalledTimes(1);

    // Now advance past the delay
    jest.advanceTimersByTime(100);
    runner.rerender();

    runner.current.navigate('ScreenC');
    expect(nav.navigate).toHaveBeenCalledTimes(2);
    expect(nav.navigate).toHaveBeenLastCalledWith('ScreenC', undefined);
  });

  // ---------- disabled state ----------

  it('should start with disabled as false', () => {
    const nav = createMockNavigation();
    const runner = createHookRunner(() => usePreventDoubleNavigation(nav));

    expect(runner.current.disabled).toBe(false);
  });

  it('should set disabled to true after an action', () => {
    const nav = createMockNavigation();
    const runner = createHookRunner(() => usePreventDoubleNavigation(nav));

    runner.current.navigate('ScreenA');

    // Re-render to pick up state change
    runner.rerender();

    expect(runner.current.disabled).toBe(true);
  });

  it('should set disabled back to false after delay expires', () => {
    const nav = createMockNavigation();
    const runner = createHookRunner(() => usePreventDoubleNavigation(nav));

    runner.current.navigate('ScreenA');
    runner.rerender();
    expect(runner.current.disabled).toBe(true);

    jest.advanceTimersByTime(500);
    runner.rerender();

    expect(runner.current.disabled).toBe(false);
  });

  // ---------- Default delay ----------

  it('should use default delay of 500ms when no delay is specified', () => {
    const nav = createMockNavigation();
    const runner = createHookRunner(() => usePreventDoubleNavigation(nav));

    runner.current.navigate('ScreenA');
    expect(nav.navigate).toHaveBeenCalledTimes(1);

    // At 499ms, should still be blocked
    jest.advanceTimersByTime(499);
    runner.rerender();
    runner.current.navigate('ScreenB');
    expect(nav.navigate).toHaveBeenCalledTimes(1);

    // At 500ms, should be re-enabled
    jest.advanceTimersByTime(1);
    runner.rerender();
    runner.current.navigate('ScreenC');
    expect(nav.navigate).toHaveBeenCalledTimes(2);
  });

  // ---------- Custom delay ----------

  it('should use custom delay when specified', () => {
    const nav = createMockNavigation();
    const runner = createHookRunner(() => usePreventDoubleNavigation(nav, 1000));

    runner.current.navigate('ScreenA');
    expect(nav.navigate).toHaveBeenCalledTimes(1);

    // At 500ms, should still be blocked (custom delay is 1000ms)
    jest.advanceTimersByTime(500);
    runner.rerender();
    runner.current.navigate('ScreenB');
    expect(nav.navigate).toHaveBeenCalledTimes(1);

    // At 1000ms, should be re-enabled
    jest.advanceTimersByTime(500);
    runner.rerender();
    runner.current.navigate('ScreenC');
    expect(nav.navigate).toHaveBeenCalledTimes(2);
  });

  it('should use short custom delay', () => {
    const nav = createMockNavigation();
    const runner = createHookRunner(() => usePreventDoubleNavigation(nav, 100));

    runner.current.navigate('ScreenA');
    expect(nav.navigate).toHaveBeenCalledTimes(1);

    // At 100ms, should be re-enabled
    jest.advanceTimersByTime(100);
    runner.rerender();
    runner.current.navigate('ScreenB');
    expect(nav.navigate).toHaveBeenCalledTimes(2);
  });
});

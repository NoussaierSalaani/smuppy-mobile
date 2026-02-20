/**
 * useDataFetch Hook Tests
 * Tests for generic data fetching with loading/error/data states
 *
 * Uses a lightweight manual hook runner since the Jest config uses ts-jest/node
 * (not jest-expo) and cannot load @testing-library/react-native.
 */

// Define __DEV__ global
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(global as any).__DEV__ = false;

/**
 * Minimal hook runner with deferred useEffect execution.
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
    get current() {
      return result;
    },
    rerender() {
      render();
    },
  };
}

/** Helper: flush microtasks */
function flushAsync(ms = 50): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

import { useDataFetch } from '../../hooks/useDataFetch';

describe('useDataFetch', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  // ========================================
  // Initial state
  // ========================================

  it('should initialize with isLoading=true and data=null when fetchOnMount is true', () => {
    const fetcher = jest.fn().mockResolvedValue({ success: true, items: [] });
    const runner = createHookRunner(() => useDataFetch(fetcher));

    expect(runner.current.isLoading).toBe(true);
    expect(runner.current.data).toBeNull();
    expect(runner.current.error).toBeNull();
    expect(runner.current.isRefreshing).toBe(false);
  });

  it('should initialize with isLoading=false when fetchOnMount is false', () => {
    const fetcher = jest.fn().mockResolvedValue({ success: true });
    const runner = createHookRunner(() => useDataFetch(fetcher, { fetchOnMount: false }));

    expect(runner.current.isLoading).toBe(false);
    expect(runner.current.data).toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('should use defaultValue as initial data when provided', () => {
    const fetcher = jest.fn().mockResolvedValue({ success: true });
    const runner = createHookRunner(() =>
      useDataFetch(fetcher, { defaultValue: [] as string[], fetchOnMount: false })
    );

    expect(runner.current.data).toEqual([]);
  });

  it('should return refresh and reload as functions', () => {
    const fetcher = jest.fn().mockResolvedValue({ success: true });
    const runner = createHookRunner(() => useDataFetch(fetcher, { fetchOnMount: false }));

    expect(typeof runner.current.refresh).toBe('function');
    expect(typeof runner.current.reload).toBe('function');
  });

  // ========================================
  // Fetching data
  // ========================================

  it('should fetch data on mount when fetchOnMount is true', async () => {
    const fetcher = jest.fn().mockResolvedValue({ success: true, value: 42 });
    const runner = createHookRunner(() => useDataFetch(fetcher));

    expect(fetcher).toHaveBeenCalledTimes(1);

    await flushAsync();
    runner.rerender();

    expect(runner.current.isLoading).toBe(false);
    expect(runner.current.data).toEqual({ success: true, value: 42 });
  });

  it('should extract data using extractData option', async () => {
    const fetcher = jest.fn().mockResolvedValue({ success: true, items: [1, 2, 3] });
    const runner = createHookRunner(() =>
      useDataFetch(fetcher, {
        extractData: (r: { success: boolean; items: number[] }) => r.items,
      })
    );

    await flushAsync();
    runner.rerender();

    expect(runner.current.data).toEqual([1, 2, 3]);
  });

  it('should handle response with success=false by using defaultValue', async () => {
    const fetcher = jest.fn().mockResolvedValue({ success: false });
    const runner = createHookRunner(() =>
      useDataFetch(fetcher, { defaultValue: 'fallback' })
    );

    await flushAsync();
    runner.rerender();

    expect(runner.current.data).toBe('fallback');
    expect(runner.current.isLoading).toBe(false);
  });

  // ========================================
  // Error handling
  // ========================================

  it('should set error on fetch failure', async () => {
    const fetchError = new Error('Network error');
    const fetcher = jest.fn().mockRejectedValue(fetchError);
    const runner = createHookRunner(() => useDataFetch(fetcher));

    await flushAsync();
    runner.rerender();

    expect(runner.current.error).toBe(fetchError);
    expect(runner.current.isLoading).toBe(false);
  });

  it('should fallback to defaultValue on error when provided', async () => {
    const fetcher = jest.fn().mockRejectedValue(new Error('fail'));
    const runner = createHookRunner(() =>
      useDataFetch(fetcher, { defaultValue: 'safe-default' })
    );

    await flushAsync();
    runner.rerender();

    expect(runner.current.data).toBe('safe-default');
    expect(runner.current.error).toBeTruthy();
  });

  // ========================================
  // Refresh and reload
  // ========================================

  it('should call reload to re-fetch data with loading indicator', async () => {
    let callCount = 0;
    const fetcher = jest.fn().mockImplementation(() => {
      callCount++;
      return Promise.resolve({ success: true, count: callCount });
    });

    const runner = createHookRunner(() => useDataFetch(fetcher));

    await flushAsync();
    runner.rerender();

    expect(runner.current.data).toEqual({ success: true, count: 1 });

    // Call reload
    runner.current.reload();
    runner.rerender();

    await flushAsync();
    runner.rerender();

    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('should call refresh to re-fetch data with isRefreshing=true', () => {
    const fetcher = jest.fn().mockResolvedValue({ success: true });
    const runner = createHookRunner(() => useDataFetch(fetcher, { fetchOnMount: false }));

    runner.current.refresh();
    runner.rerender();

    expect(runner.current.isRefreshing).toBe(true);
  });
});

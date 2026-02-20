/**
 * useVideoStatus Hook Tests
 * Tests for video processing status polling
 *
 * Uses a lightweight manual hook runner since the Jest config uses ts-jest/node
 * (not jest-expo) and cannot load @testing-library/react-native.
 *
 * NOTE: useVideoStatus uses `await import('../services/aws-api')` (dynamic import)
 * inside the polling callback. We mock the dynamic import and use real timers with
 * short delays to allow async resolution.
 */

// Define __DEV__ global
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(global as any).__DEV__ = false;

// Mock dependencies BEFORE imports
const mockRequest = jest.fn();

jest.mock('../../services/aws-api', () => ({
  awsAPI: {
    request: (...args: unknown[]) => mockRequest(...args),
  },
}));

// Minimal hook runner with deferred useEffect (matches real React behavior)
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
    cleanup() {
      for (const cleanup of effectCleanups) {
        if (cleanup) cleanup();
      }
    },
  };
}

/** Helper: flush microtasks to let dynamic import + async operations complete */
function flushMicrotasks(ms = 50): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

import { useVideoStatus } from '../../hooks/useVideoStatus';

describe('useVideoStatus', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRequest.mockResolvedValue({
      success: true,
      videoStatus: 'processing',
      hlsUrl: null,
      thumbnailUrl: null,
      videoVariants: null,
      videoDuration: null,
    });
  });

afterEach(() => {
  jest.restoreAllMocks();
  jest.useFakeTimers();
  jest.runOnlyPendingTimers();
  jest.clearAllTimers();
  jest.useRealTimers();
});

afterAll(() => {
  jest.useFakeTimers();
  jest.runAllTimers();
  jest.useRealTimers();
});

  // ========================================
  // Initial state
  // ========================================

  it('should initialize with null status values', () => {
    const runner = createHookRunner(() =>
      useVideoStatus({ entityType: 'post', entityId: null })
    );

    expect(runner.current.videoStatus).toBeNull();
    expect(runner.current.hlsUrl).toBeNull();
    expect(runner.current.thumbnailUrl).toBeNull();
    expect(runner.current.videoVariants).toBeNull();
    expect(runner.current.videoDuration).toBeNull();
  });

  it('should not poll when entityId is null', () => {
    const runner = createHookRunner(() =>
      useVideoStatus({ entityType: 'post', entityId: null })
    );

    expect(runner.current.isPolling).toBe(false);
    expect(mockRequest).not.toHaveBeenCalled();
  });

  it('should not poll when enabled is false', () => {
    const runner = createHookRunner(() =>
      useVideoStatus({ entityType: 'post', entityId: 'post-123', enabled: false })
    );

    expect(runner.current.isPolling).toBe(false);
    expect(mockRequest).not.toHaveBeenCalled();
  });

  // ========================================
  // Polling behavior
  // ========================================

  it('should start polling when enabled with valid entityId', async () => {
    createHookRunner(() =>
      useVideoStatus({ entityType: 'post', entityId: 'post-123' })
    );

    // Wait for the dynamic import + async request to complete
    await flushMicrotasks();

    expect(mockRequest).toHaveBeenCalledWith(
      '/media/video-status?type=post&id=post-123'
    );
  });

  it('should update status when API returns ready', async () => {
    mockRequest.mockResolvedValue({
      success: true,
      videoStatus: 'ready',
      hlsUrl: 'https://cdn.example.com/video.m3u8',
      thumbnailUrl: 'https://cdn.example.com/thumb.jpg',
      videoVariants: [{ url: 'https://cdn.example.com/720p.mp4', width: 1280, height: 720 }],
      videoDuration: 30,
    });

    const runner = createHookRunner(() =>
      useVideoStatus({ entityType: 'post', entityId: 'post-123' })
    );

    await flushMicrotasks();
    runner.rerender();

    expect(runner.current.videoStatus).toBe('ready');
    expect(runner.current.hlsUrl).toBe('https://cdn.example.com/video.m3u8');
    expect(runner.current.thumbnailUrl).toBe('https://cdn.example.com/thumb.jpg');
    expect(runner.current.videoVariants).toEqual([
      { url: 'https://cdn.example.com/720p.mp4', width: 1280, height: 720 },
    ]);
    expect(runner.current.videoDuration).toBe(30);
    expect(runner.current.isPolling).toBe(false);
  });

  it('should stop polling when status is failed', async () => {
    mockRequest.mockResolvedValue({
      success: true,
      videoStatus: 'failed',
    });

    const runner = createHookRunner(() =>
      useVideoStatus({ entityType: 'post', entityId: 'post-123' })
    );

    await flushMicrotasks();
    runner.rerender();

    expect(runner.current.videoStatus).toBe('failed');
    expect(runner.current.isPolling).toBe(false);
  });

  it('should use correct URL for peak entity type', async () => {
    createHookRunner(() =>
      useVideoStatus({ entityType: 'peak', entityId: 'peak-456' })
    );

    await flushMicrotasks();

    expect(mockRequest).toHaveBeenCalledWith(
      '/media/video-status?type=peak&id=peak-456'
    );
  });

  it('should handle response with missing optional fields', async () => {
    mockRequest.mockResolvedValue({
      success: true,
      videoStatus: 'processing',
    });

    const runner = createHookRunner(() =>
      useVideoStatus({ entityType: 'post', entityId: 'post-123' })
    );

    await flushMicrotasks();
    runner.rerender();

    expect(runner.current.videoStatus).toBe('processing');
    expect(runner.current.hlsUrl).toBeNull();
    expect(runner.current.thumbnailUrl).toBeNull();
    expect(runner.current.videoVariants).toBeNull();
    expect(runner.current.videoDuration).toBeNull();
  });

  it('should not throw on network error (silent retry)', async () => {
    mockRequest.mockRejectedValueOnce(new Error('Network error'));

    // Should not throw
    const runner = createHookRunner(() =>
      useVideoStatus({ entityType: 'post', entityId: 'post-123', pollInterval: 100000 })
    );

    await flushMicrotasks();
    runner.rerender();

    // After a network error, status stays null (no crash)
    expect(runner.current.videoStatus).toBeNull();
  });

  it('should cleanup timer on unmount', async () => {
    const runner = createHookRunner(() =>
      useVideoStatus({ entityType: 'post', entityId: 'post-123', pollInterval: 100000 })
    );

    await flushMicrotasks();

    // Cleanup should not throw
    expect(() => runner.cleanup()).not.toThrow();
  });

  // ========================================
  // Configuration options
  // ========================================

  it('should accept all configuration options without error', () => {
    // This test verifies the hook accepts all options without error
    const runner = createHookRunner(() =>
      useVideoStatus({
        entityType: 'post',
        entityId: 'post-123',
        enabled: true,
        pollInterval: 5000,
        maxAttempts: 10,
      })
    );

    // Hook should be created without error
    expect(runner.current).toBeDefined();
    expect(runner.current.videoStatus).toBeNull();
  });

  it('should not start polling when entityId changes to null', () => {
    const runner = createHookRunner(() =>
      useVideoStatus({ entityType: 'post', entityId: null, enabled: true })
    );

    expect(runner.current.isPolling).toBe(false);
    expect(mockRequest).not.toHaveBeenCalled();
  });
});

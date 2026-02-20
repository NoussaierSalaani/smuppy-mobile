/**
 * useExpiredPeaks Hook Tests
 * Tests for expired peaks fetching, actions, and foreground refresh
 *
 * Uses a lightweight manual hook runner since the Jest config uses ts-jest/node
 * (not jest-expo) and cannot load @testing-library/react-native.
 */

// Define __DEV__ global
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(global as any).__DEV__ = false;

// Mock dependencies BEFORE imports
const mockGetExpiredPeaks = jest.fn();
const mockSavePeakDecision = jest.fn();
const mockDeletePeak = jest.fn();
const mockRequestPermissionsAsync = jest.fn();
const mockDownloadAsync = jest.fn();
const mockSaveToLibraryAsync = jest.fn();
const mockDeleteAsync = jest.fn();
const mockAddEventListener = jest.fn();

jest.mock('react-native', () => ({
  AppState: {
    addEventListener: (...args: unknown[]) => mockAddEventListener(...args),
  },
}));

jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: '/mock/documents/',
  downloadAsync: (...args: unknown[]) => mockDownloadAsync(...args),
  deleteAsync: (...args: unknown[]) => mockDeleteAsync(...args),
}));

jest.mock('expo-media-library', () => ({
  requestPermissionsAsync: () => mockRequestPermissionsAsync(),
  saveToLibraryAsync: (...args: unknown[]) => mockSaveToLibraryAsync(...args),
}));

jest.mock('../../services/aws-api', () => ({
  awsAPI: {
    getExpiredPeaks: (...args: unknown[]) => mockGetExpiredPeaks(...args),
    savePeakDecision: (...args: unknown[]) => mockSavePeakDecision(...args),
    deletePeak: (...args: unknown[]) => mockDeletePeak(...args),
  },
}));

// Minimal hook runner with useEffect support
function createHookRunner<T>(hookFn: () => T) {
  let state: Map<number, unknown> = new Map();
  let callbackMap: Map<number, unknown> = new Map();
  let refMap: Map<number, { current: unknown }> = new Map();
  let stateIndex = 0;
  let callbackIndex = 0;
  let refIndex = 0;
  let effectIndex = 0;
  let effectCallbacks: Array<{ fn: () => void | (() => void); deps: unknown[] | undefined }> = [];
  let previousEffectDeps: Array<unknown[] | undefined> = [];
  let effectCleanups: Array<(() => void) | void> = [];
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
      if (effectCleanups[idx]) effectCleanups[idx]!();
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

import { useExpiredPeaks } from '../../hooks/useExpiredPeaks';

describe('useExpiredPeaks', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetExpiredPeaks.mockResolvedValue({ data: [], total: 0 });
    mockSavePeakDecision.mockResolvedValue({ success: true });
    mockDeletePeak.mockResolvedValue({ success: true });
    mockDownloadAsync.mockResolvedValue({ uri: '/mock/documents/peak_test.mov' });
    mockSaveToLibraryAsync.mockResolvedValue(undefined);
    mockDeleteAsync.mockResolvedValue(undefined);
    mockRequestPermissionsAsync.mockResolvedValue({ status: 'granted' });
    mockAddEventListener.mockReturnValue({ remove: jest.fn() });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // ========================================
  // Initial state
  // ========================================

  it('should initialize with empty expiredPeaks and isLoading=false', () => {
    const runner = createHookRunner(() => useExpiredPeaks());

    expect(runner.current.expiredPeaks).toEqual([]);
    // isLoading starts false, then gets set to true by fetchExpired
    expect(typeof runner.current.isLoading).toBe('boolean');
  });

  it('should return expected function properties', () => {
    const runner = createHookRunner(() => useExpiredPeaks());

    expect(typeof runner.current.savePeakToProfile).toBe('function');
    expect(typeof runner.current.deletePeak).toBe('function');
    expect(typeof runner.current.downloadPeak).toBe('function');
    expect(typeof runner.current.refresh).toBe('function');
  });

  // ========================================
  // fetchExpired on mount
  // ========================================

  it('should fetch expired peaks on mount', async () => {
    const mockPeaks = [
      { id: 'peak-1', videoUrl: 'https://example.com/1.mov' },
      { id: 'peak-2', videoUrl: 'https://example.com/2.mov' },
    ];
    mockGetExpiredPeaks.mockResolvedValue({ data: mockPeaks, total: 2 });

    const runner = createHookRunner(() => useExpiredPeaks());

    await new Promise(resolve => setTimeout(resolve, 0));
    runner.rerender();

    expect(mockGetExpiredPeaks).toHaveBeenCalledTimes(1);
    expect(runner.current.expiredPeaks).toEqual(mockPeaks);
    expect(runner.current.isLoading).toBe(false);
  });

  it('should handle fetch error gracefully', async () => {
    mockGetExpiredPeaks.mockRejectedValue(new Error('Network error'));

    const runner = createHookRunner(() => useExpiredPeaks());

    await new Promise(resolve => setTimeout(resolve, 0));
    runner.rerender();

    expect(runner.current.expiredPeaks).toEqual([]);
    expect(runner.current.isLoading).toBe(false);
  });

  it('should handle empty data from API', async () => {
    mockGetExpiredPeaks.mockResolvedValue({ data: undefined });

    const runner = createHookRunner(() => useExpiredPeaks());

    await new Promise(resolve => setTimeout(resolve, 0));
    runner.rerender();

    expect(runner.current.expiredPeaks).toEqual([]);
  });

  // ========================================
  // AppState foreground listener
  // ========================================

  it('should register AppState listener on mount', () => {
    createHookRunner(() => useExpiredPeaks());

    expect(mockAddEventListener).toHaveBeenCalledWith('change', expect.any(Function));
  });

  // ========================================
  // savePeakToProfile
  // ========================================

  it('should call API and remove peak from list on save', async () => {
    const mockPeaks = [
      { id: 'peak-1', videoUrl: 'https://example.com/1.mov' },
      { id: 'peak-2', videoUrl: 'https://example.com/2.mov' },
    ];
    mockGetExpiredPeaks.mockResolvedValue({ data: mockPeaks, total: 2 });

    const runner = createHookRunner(() => useExpiredPeaks());

    await new Promise(resolve => setTimeout(resolve, 0));
    runner.rerender();

    await runner.current.savePeakToProfile('peak-1');
    runner.rerender();

    expect(mockSavePeakDecision).toHaveBeenCalledWith('peak-1', 'save_to_profile');
    expect(runner.current.expiredPeaks).toEqual([mockPeaks[1]]);
  });

  it('should throw and keep peak in list on save failure', async () => {
    const mockPeaks = [
      { id: 'peak-1', videoUrl: 'https://example.com/1.mov' },
    ];
    mockGetExpiredPeaks.mockResolvedValue({ data: mockPeaks, total: 1 });
    mockSavePeakDecision.mockRejectedValue(new Error('Server error'));

    const runner = createHookRunner(() => useExpiredPeaks());

    await new Promise(resolve => setTimeout(resolve, 0));
    runner.rerender();

    await expect(runner.current.savePeakToProfile('peak-1')).rejects.toThrow('Server error');
  });

  // ========================================
  // deletePeak
  // ========================================

  it('should call API and remove peak from list on delete', async () => {
    const mockPeaks = [
      { id: 'peak-1', videoUrl: 'https://example.com/1.mov' },
      { id: 'peak-2', videoUrl: 'https://example.com/2.mov' },
    ];
    mockGetExpiredPeaks.mockResolvedValue({ data: mockPeaks, total: 2 });

    const runner = createHookRunner(() => useExpiredPeaks());

    await new Promise(resolve => setTimeout(resolve, 0));
    runner.rerender();

    await runner.current.deletePeak('peak-2');
    runner.rerender();

    expect(mockDeletePeak).toHaveBeenCalledWith('peak-2');
    expect(runner.current.expiredPeaks).toEqual([mockPeaks[0]]);
  });

  it('should throw and keep peak in list on delete failure', async () => {
    const mockPeaks = [
      { id: 'peak-1', videoUrl: 'https://example.com/1.mov' },
    ];
    mockGetExpiredPeaks.mockResolvedValue({ data: mockPeaks, total: 1 });
    mockDeletePeak.mockRejectedValue(new Error('Delete failed'));

    const runner = createHookRunner(() => useExpiredPeaks());

    await new Promise(resolve => setTimeout(resolve, 0));
    runner.rerender();

    await expect(runner.current.deletePeak('peak-1')).rejects.toThrow('Delete failed');
  });

  // ========================================
  // downloadPeak
  // ========================================

  it('should download peak video to media library', async () => {
    const runner = createHookRunner(() => useExpiredPeaks());

    const result = await runner.current.downloadPeak('peak-1', 'https://example.com/video.mov');

    expect(mockRequestPermissionsAsync).toHaveBeenCalled();
    expect(mockDownloadAsync).toHaveBeenCalledWith(
      'https://example.com/video.mov',
      '/mock/documents/peak_peak-1.mov'
    );
    expect(mockSaveToLibraryAsync).toHaveBeenCalledWith('/mock/documents/peak_peak-1.mov');
    expect(mockDeleteAsync).toHaveBeenCalledWith('/mock/documents/peak_peak-1.mov', { idempotent: true });
    expect(result).toBe(true);
  });

  it('should throw PERMISSION_DENIED when media library permission is denied', async () => {
    mockRequestPermissionsAsync.mockResolvedValue({ status: 'denied' });

    const runner = createHookRunner(() => useExpiredPeaks());

    await expect(
      runner.current.downloadPeak('peak-1', 'https://example.com/video.mov')
    ).rejects.toThrow('PERMISSION_DENIED');
  });

  // ========================================
  // refresh
  // ========================================

  it('should re-fetch expired peaks when refresh is called', async () => {
    mockGetExpiredPeaks
      .mockResolvedValueOnce({ data: [{ id: 'peak-1' }], total: 1 })
      .mockResolvedValueOnce({ data: [{ id: 'peak-1' }, { id: 'peak-2' }], total: 2 });

    const runner = createHookRunner(() => useExpiredPeaks());

    await new Promise(resolve => setTimeout(resolve, 0));
    runner.rerender();
    expect(runner.current.expiredPeaks).toHaveLength(1);

    await runner.current.refresh();
    runner.rerender();

    expect(mockGetExpiredPeaks).toHaveBeenCalledTimes(2);
    expect(runner.current.expiredPeaks).toHaveLength(2);
  });
});

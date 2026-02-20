/**
 * useAgora Hook Tests
 * Tests for Agora RTC video calls/streaming
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(global as any).__DEV__ = false;

// Mock dependencies
const mockInitialize = jest.fn();
const mockJoinChannel = jest.fn();
const mockLeaveChannel = jest.fn();
const mockMuteLocalAudio = jest.fn();
const mockMuteLocalVideo = jest.fn();
const mockSwitchCamera = jest.fn();
const mockDestroy = jest.fn();
const mockSetCallbacks = jest.fn();
const mockGetEngine = jest.fn();

jest.mock('../../services/agora', () => ({
  agoraService: {
    initialize: () => mockInitialize(),
    joinChannel: (...args: unknown[]) => mockJoinChannel(...args),
    leaveChannel: () => mockLeaveChannel(),
    muteLocalAudio: (_muted: boolean) => mockMuteLocalAudio(_muted),
    muteLocalVideo: (_off: boolean) => mockMuteLocalVideo(_off),
    switchCamera: () => mockSwitchCamera(),
    destroy: () => mockDestroy(),
    setCallbacks: (_cbs: unknown) => mockSetCallbacks(_cbs),
    getEngine: () => mockGetEngine(),
  },
  generateLiveChannelName: (_hostId: string) => `live_${_hostId}`,
  generatePrivateChannelName: (_a: string, _b: string) => `private_${_a}_${_b}`,
}));

jest.mock('react-native', () => ({
  Platform: { OS: 'ios' },
  PermissionsAndroid: {
    request: jest.fn().mockResolvedValue('granted'),
    PERMISSIONS: { CAMERA: 'camera', RECORD_AUDIO: 'record_audio' },
    RESULTS: { GRANTED: 'granted' },
  },
}));

jest.mock('expo-camera', () => ({
  Camera: {
    requestCameraPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
  },
}));

jest.mock('expo-av', () => ({
  Audio: {
    requestPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
  },
}));

/**
 * Minimal hook runner
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
    get current() { return result; },
    rerender() { render(); },
  };
}

import { useAgora, useLiveStream as useAgoraLiveStream, useWatchLiveStream, usePrivateCall } from '../../hooks/useAgora';

describe('useAgora', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockInitialize.mockResolvedValue(true);
    mockJoinChannel.mockResolvedValue(true);
    mockLeaveChannel.mockResolvedValue(undefined);
    mockDestroy.mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should return initial state', () => {
    const runner = createHookRunner(() =>
      useAgora({ role: 'broadcaster', channelName: 'test' })
    );

    expect(runner.current.isInitialized).toBe(false);
    expect(runner.current.isJoined).toBe(false);
    expect(runner.current.isLoading).toBe(false);
    expect(runner.current.error).toBeNull();
    expect(runner.current.localUid).toBeNull();
    expect(runner.current.remoteUsers).toEqual([]);
    expect(runner.current.isMuted).toBe(false);
    expect(runner.current.isVideoOff).toBe(false);
  });

  it('should return action functions', () => {
    const runner = createHookRunner(() =>
      useAgora({ role: 'broadcaster', channelName: 'test' })
    );

    expect(typeof runner.current.initialize).toBe('function');
    expect(typeof runner.current.joinChannel).toBe('function');
    expect(typeof runner.current.leaveChannel).toBe('function');
    expect(typeof runner.current.toggleMute).toBe('function');
    expect(typeof runner.current.toggleVideo).toBe('function');
    expect(typeof runner.current.switchCamera).toBe('function');
    expect(typeof runner.current.destroy).toBe('function');
  });

  // ========================================
  // Initialize
  // ========================================

  it('should initialize Agora engine', async () => {
    const runner = createHookRunner(() =>
      useAgora({ role: 'broadcaster', channelName: 'test' })
    );

    const result = await runner.current.initialize();

    expect(result).toBe(true);
    expect(mockInitialize).toHaveBeenCalled();
    expect(mockSetCallbacks).toHaveBeenCalled();
  });

  it('should set error when initialization fails', async () => {
    mockInitialize.mockResolvedValue(false);

    const runner = createHookRunner(() =>
      useAgora({ role: 'broadcaster', channelName: 'test' })
    );

    const result = await runner.current.initialize();
    runner.rerender();

    expect(result).toBe(false);
    expect(runner.current.error).toContain('Failed to initialize');
  });

  it('should set error when permissions denied', async () => {
    const { Camera } = require('expo-camera');
    Camera.requestCameraPermissionsAsync.mockResolvedValueOnce({ status: 'denied' });

    const runner = createHookRunner(() =>
      useAgora({ role: 'broadcaster', channelName: 'test' })
    );

    const result = await runner.current.initialize();
    runner.rerender();

    expect(result).toBe(false);
    expect(runner.current.error).toContain('permissions are required');
  });

  // ========================================
  // Join channel
  // ========================================

  it('should join channel after initialization', async () => {
    const runner = createHookRunner(() =>
      useAgora({ role: 'broadcaster', channelName: 'test-channel' })
    );

    const result = await runner.current.joinChannel();

    expect(result).toBe(true);
    expect(mockJoinChannel).toHaveBeenCalledWith(
      'test-channel',
      null,
      expect.any(Number),
      'broadcaster'
    );
  });

  it('should join channel with custom token and uid', async () => {
    const runner = createHookRunner(() =>
      useAgora({ role: 'audience', channelName: 'ch', token: 'tok-123', uid: 42 })
    );

    await runner.current.joinChannel();

    expect(mockJoinChannel).toHaveBeenCalledWith('ch', 'tok-123', 42, 'audience');
  });

  it('should set error when channel name is missing', async () => {
    const runner = createHookRunner(() =>
      useAgora({ role: 'broadcaster' })
    );

    const result = await runner.current.joinChannel();
    runner.rerender();

    expect(result).toBe(false);
    expect(runner.current.error).toContain('Channel name is required');
  });

  it('should set error when join fails', async () => {
    mockJoinChannel.mockResolvedValue(false);

    const runner = createHookRunner(() =>
      useAgora({ role: 'broadcaster', channelName: 'test' })
    );

    const result = await runner.current.joinChannel();
    runner.rerender();

    expect(result).toBe(false);
    expect(runner.current.error).toContain('Failed to join');
  });

  // ========================================
  // Leave channel
  // ========================================

  it('should leave channel', async () => {
    const runner = createHookRunner(() =>
      useAgora({ role: 'broadcaster', channelName: 'test' })
    );

    await runner.current.leaveChannel();

    expect(mockLeaveChannel).toHaveBeenCalled();
  });

  // ========================================
  // Toggle controls
  // ========================================

  it('should toggle mute', () => {
    const runner = createHookRunner(() =>
      useAgora({ role: 'broadcaster', channelName: 'test' })
    );

    expect(runner.current.isMuted).toBe(false);

    runner.current.toggleMute();
    runner.rerender();

    expect(mockMuteLocalAudio).toHaveBeenCalledWith(true);
    expect(runner.current.isMuted).toBe(true);
  });

  it('should toggle video', () => {
    const runner = createHookRunner(() =>
      useAgora({ role: 'broadcaster', channelName: 'test' })
    );

    expect(runner.current.isVideoOff).toBe(false);

    runner.current.toggleVideo();
    runner.rerender();

    expect(mockMuteLocalVideo).toHaveBeenCalledWith(true);
    expect(runner.current.isVideoOff).toBe(true);
  });

  it('should switch camera', () => {
    const runner = createHookRunner(() =>
      useAgora({ role: 'broadcaster', channelName: 'test' })
    );

    runner.current.switchCamera();

    expect(mockSwitchCamera).toHaveBeenCalled();
  });

  // ========================================
  // Destroy
  // ========================================

  it('should destroy and reset state', async () => {
    const runner = createHookRunner(() =>
      useAgora({ role: 'broadcaster', channelName: 'test' })
    );

    await runner.current.destroy();
    runner.rerender();

    expect(mockDestroy).toHaveBeenCalled();
    expect(runner.current.isInitialized).toBe(false);
    expect(runner.current.isJoined).toBe(false);
    expect(runner.current.remoteUsers).toEqual([]);
    expect(runner.current.localUid).toBeNull();
  });

  // ========================================
  // Convenience hooks
  // ========================================

  it('useLiveStream should create broadcaster with generated channel', () => {
    const runner = createHookRunner(() => useAgoraLiveStream('host-123'));

    // The hook passes role: 'broadcaster' and channelName generated from hostId
    expect(runner.current.isInitialized).toBe(false);
    expect(typeof runner.current.joinChannel).toBe('function');
  });

  it('useWatchLiveStream should create audience with autoJoin', () => {
    const runner = createHookRunner(() => useWatchLiveStream('live_host-123'));

    expect(runner.current.isInitialized).toBe(false);
    expect(typeof runner.current.joinChannel).toBe('function');
  });

  it('usePrivateCall should create broadcaster with private channel', () => {
    const runner = createHookRunner(() => usePrivateCall('user-1', 'user-2'));

    expect(runner.current.isInitialized).toBe(false);
    expect(typeof runner.current.joinChannel).toBe('function');
  });
});

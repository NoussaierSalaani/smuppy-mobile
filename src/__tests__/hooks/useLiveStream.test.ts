/**
 * useLiveStream Hook Tests
 * Tests for live stream WebSocket connection and interactions
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(global as any).__DEV__ = false;

// Mock dependencies
const mockSend = jest.fn();
const mockConnect = jest.fn();
const mockOnMessage = jest.fn();
const mockOnConnectionChange = jest.fn();
const mockIsConnected = jest.fn();

jest.mock('../../services/websocket', () => ({
  websocketService: {
    send: (_msg: unknown) => mockSend(_msg),
    connect: () => mockConnect(),
    onMessage: (_handler: unknown) => mockOnMessage(_handler),
    onConnectionChange: (_handler: unknown) => mockOnConnectionChange(_handler),
    isConnected: () => mockIsConnected(),
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
    cleanup() {
      for (const cleanup of effectCleanups) {
        if (cleanup) cleanup();
      }
    },
  };
}

import { useLiveStream } from '../../hooks/useLiveStream';

describe('useLiveStream', () => {
  const unsubMessage = jest.fn();
  const unsubConnection = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockIsConnected.mockReturnValue(false);
    mockOnMessage.mockReturnValue(unsubMessage);
    mockOnConnectionChange.mockReturnValue(unsubConnection);
    mockConnect.mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should return expected properties', () => {
    const runner = createHookRunner(() =>
      useLiveStream({ channelName: 'test-channel' })
    );

    expect(runner.current.isConnected).toBe(false);
    expect(runner.current.viewerCount).toBe(0);
    expect(runner.current.comments).toEqual([]);
    expect(typeof runner.current.sendComment).toBe('function');
    expect(typeof runner.current.sendReaction).toBe('function');
    expect(typeof runner.current.joinStream).toBe('function');
    expect(typeof runner.current.leaveStream).toBe('function');
  });

  it('should subscribe to websocket messages on mount', () => {
    createHookRunner(() => useLiveStream({ channelName: 'test-channel' }));

    expect(mockOnMessage).toHaveBeenCalled();
    expect(mockOnConnectionChange).toHaveBeenCalled();
  });

  it('should join stream by connecting websocket and sending joinLive', async () => {
    // Start disconnected
    mockIsConnected.mockReturnValue(false);
    // After connect resolves, isConnected returns true
    mockConnect.mockImplementation(() => {
      mockIsConnected.mockReturnValue(true);
      return Promise.resolve();
    });

    const runner = createHookRunner(() =>
      useLiveStream({ channelName: 'test-channel' })
    );

    await runner.current.joinStream();

    expect(mockConnect).toHaveBeenCalled();
    expect(mockSend).toHaveBeenCalledWith({
      action: 'joinLive',
      channelName: 'test-channel',
    });
  });

  it('should not connect if already connected', async () => {
    mockIsConnected.mockReturnValue(true);

    const runner = createHookRunner(() =>
      useLiveStream({ channelName: 'test-channel' })
    );

    await runner.current.joinStream();

    expect(mockConnect).not.toHaveBeenCalled();
    expect(mockSend).toHaveBeenCalledWith({
      action: 'joinLive',
      channelName: 'test-channel',
    });
  });

  it('should leave stream by sending leaveLive action', async () => {
    mockIsConnected.mockReturnValue(true);

    const runner = createHookRunner(() =>
      useLiveStream({ channelName: 'test-channel' })
    );

    await runner.current.leaveStream();

    expect(mockSend).toHaveBeenCalledWith({
      action: 'leaveLive',
      channelName: 'test-channel',
    });
  });

  it('should send comment when content is non-empty', () => {
    mockIsConnected.mockReturnValue(true);

    const runner = createHookRunner(() =>
      useLiveStream({ channelName: 'test-channel' })
    );

    runner.current.sendComment('Hello world');

    expect(mockSend).toHaveBeenCalledWith({
      action: 'liveComment',
      channelName: 'test-channel',
      content: 'Hello world',
    });
  });

  it('should not send empty comment', () => {
    mockIsConnected.mockReturnValue(true);

    const runner = createHookRunner(() =>
      useLiveStream({ channelName: 'test-channel' })
    );

    runner.current.sendComment('   ');

    expect(mockSend).not.toHaveBeenCalled();
  });

  it('should trim comment content', () => {
    mockIsConnected.mockReturnValue(true);

    const runner = createHookRunner(() =>
      useLiveStream({ channelName: 'test-channel' })
    );

    runner.current.sendComment('  hello  ');

    expect(mockSend).toHaveBeenCalledWith(expect.objectContaining({
      content: 'hello',
    }));
  });

  it('should send reaction', () => {
    mockIsConnected.mockReturnValue(true);

    const runner = createHookRunner(() =>
      useLiveStream({ channelName: 'test-channel' })
    );

    runner.current.sendReaction('heart');

    expect(mockSend).toHaveBeenCalledWith({
      action: 'liveReaction',
      channelName: 'test-channel',
      emoji: 'heart',
    });
  });

  it('should not send when websocket is disconnected', () => {
    mockIsConnected.mockReturnValue(false);

    const runner = createHookRunner(() =>
      useLiveStream({ channelName: 'test-channel' })
    );

    runner.current.sendReaction('heart');

    expect(mockSend).not.toHaveBeenCalled();
  });

  it('should handle viewerJoined message', () => {
    let messageHandler: (msg: unknown) => void = () => {};
    mockOnMessage.mockImplementation((handler: (msg: unknown) => void) => {
      messageHandler = handler;
      return unsubMessage;
    });

    const onViewerJoined = jest.fn();
    const runner = createHookRunner(() =>
      useLiveStream({ channelName: 'test-channel', onViewerJoined })
    );

    const viewer = { id: 'v1', username: 'viewer1', displayName: 'Viewer 1', avatarUrl: '' };
    messageHandler({
      type: 'viewerJoined',
      channelName: 'test-channel',
      viewerCount: 5,
      user: viewer,
    });
    runner.rerender();

    expect(runner.current.viewerCount).toBe(5);
    expect(onViewerJoined).toHaveBeenCalledWith(viewer, 5);
  });

  it('should handle viewerLeft message', () => {
    let messageHandler: (msg: unknown) => void = () => {};
    mockOnMessage.mockImplementation((handler: (msg: unknown) => void) => {
      messageHandler = handler;
      return unsubMessage;
    });

    const onViewerLeft = jest.fn();
    const runner = createHookRunner(() =>
      useLiveStream({ channelName: 'test-channel', onViewerLeft })
    );

    messageHandler({
      type: 'viewerLeft',
      channelName: 'test-channel',
      viewerCount: 3,
      userId: 'v2',
    });
    runner.rerender();

    expect(runner.current.viewerCount).toBe(3);
    expect(onViewerLeft).toHaveBeenCalledWith('v2', 3);
  });

  it('should ignore messages for different channels', () => {
    let messageHandler: (msg: unknown) => void = () => {};
    mockOnMessage.mockImplementation((handler: (msg: unknown) => void) => {
      messageHandler = handler;
      return unsubMessage;
    });

    const onViewerJoined = jest.fn();
    createHookRunner(() =>
      useLiveStream({ channelName: 'test-channel', onViewerJoined })
    );

    messageHandler({
      type: 'viewerJoined',
      channelName: 'other-channel',
      viewerCount: 10,
      user: { id: 'v1', username: 'v1', displayName: 'V1', avatarUrl: '' },
    });

    expect(onViewerJoined).not.toHaveBeenCalled();
  });
});

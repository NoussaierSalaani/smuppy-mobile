/**
 * useNotifications Hook Tests
 * Tests for push notification management
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(global as any).__DEV__ = false;

// Mock dependencies
const mockRegisterPushToken = jest.fn();
const mockUnregisterPushToken = jest.fn();
const mockAddNotificationReceivedListener = jest.fn();
const mockAddNotificationResponseListener = jest.fn();
const mockParseNotificationData = jest.fn();
const mockClearBadge = jest.fn();
const mockSetBadgeCount = jest.fn();
const mockScheduleLocalNotification = jest.fn();
const mockNavigate = jest.fn();
const mockGoBack = jest.fn();
const mockCaptureMessage = jest.fn();

jest.mock('../../services/notifications', () => ({
  registerPushToken: (_userId: string) => mockRegisterPushToken(_userId),
  unregisterPushToken: (_userId: string) => mockUnregisterPushToken(_userId),
  addNotificationReceivedListener: (_handler: unknown) => mockAddNotificationReceivedListener(_handler),
  addNotificationResponseListener: (_handler: unknown) => mockAddNotificationResponseListener(_handler),
  parseNotificationData: (_resp: unknown) => mockParseNotificationData(_resp),
  clearBadge: () => mockClearBadge(),
  setBadgeCount: (_count: number) => mockSetBadgeCount(_count),
  scheduleLocalNotification: (_t: string, _b: string, _d?: unknown) => mockScheduleLocalNotification(_t, _b, _d),
}));

jest.mock('@react-navigation/native', () => ({
  useNavigation: jest.fn(() => ({
    navigate: mockNavigate,
    goBack: mockGoBack,
  })),
}));

jest.mock('expo-notifications', () => ({}));

jest.mock('../../stores/userStore', () => ({
  useUserStore: jest.fn((selector: (s: Record<string, unknown>) => unknown) =>
    selector({ user: { id: 'user-123' } })
  ),
}));

jest.mock('../../lib/sentry', () => ({
  captureMessage: (...args: unknown[]) => mockCaptureMessage(...args),
}));

/**
 * Minimal hook runner
 */
function createHookRunner<T>(hookFn: () => T) {
  let callbackMap: Map<number, unknown> = new Map();
  let refMap: Map<number, { current: unknown }> = new Map();
  let callbackIndex = 0;
  let refIndex = 0;
  let effectIndex = 0;
  let previousEffectDeps: Array<unknown[] | undefined> = [];
  let effectCleanups: Array<(() => void) | void> = [];
  let pendingEffects: Array<{ idx: number; fn: () => void | (() => void) }> = [];
  let result: T;

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

import { useNotifications } from '../../hooks/useNotifications';

describe('useNotifications', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAddNotificationReceivedListener.mockReturnValue({ remove: jest.fn() });
    mockAddNotificationResponseListener.mockReturnValue({ remove: jest.fn() });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // ========================================
  // Initial state
  // ========================================

  it('should return expected functions', () => {
    const runner = createHookRunner(() => useNotifications());

    expect(typeof runner.current.registerForPushNotifications).toBe('function');
    expect(typeof runner.current.unregisterFromPushNotifications).toBe('function');
    expect(typeof runner.current.sendLocalNotification).toBe('function');
    expect(typeof runner.current.clearBadgeCount).toBe('function');
    expect(typeof runner.current.setBadgeNumber).toBe('function');
  });

  it('should set up notification listeners on mount', () => {
    createHookRunner(() => useNotifications());

    expect(mockAddNotificationReceivedListener).toHaveBeenCalled();
    expect(mockAddNotificationResponseListener).toHaveBeenCalled();
  });

  // ========================================
  // Register / Unregister
  // ========================================

  it('should register push token with user ID', async () => {
    mockRegisterPushToken.mockResolvedValue(true);

    const runner = createHookRunner(() => useNotifications());
    const result = await runner.current.registerForPushNotifications();

    expect(result).toBe(true);
    expect(mockRegisterPushToken).toHaveBeenCalledWith('user-123');
  });

  it('should return false when no user is logged in', async () => {
    // Override user store to return null user
    const { useUserStore } = require('../../stores/userStore');
    useUserStore.mockImplementationOnce((selector: (s: Record<string, unknown>) => unknown) =>
      selector({ user: null })
    );

    const runner = createHookRunner(() => useNotifications());
    const result = await runner.current.registerForPushNotifications();

    expect(result).toBe(false);
    expect(mockRegisterPushToken).not.toHaveBeenCalled();
  });

  it('should unregister push token', async () => {
    mockUnregisterPushToken.mockResolvedValue(undefined);

    const runner = createHookRunner(() => useNotifications());
    await runner.current.unregisterFromPushNotifications();

    expect(mockUnregisterPushToken).toHaveBeenCalledWith('user-123');
  });

  // ========================================
  // Local notifications
  // ========================================

  it('should send local notification', async () => {
    mockScheduleLocalNotification.mockResolvedValue('notif-id-123');

    const runner = createHookRunner(() => useNotifications());
    const result = await runner.current.sendLocalNotification('Test Title', 'Test Body');

    expect(result).toBe('notif-id-123');
    expect(mockScheduleLocalNotification).toHaveBeenCalledWith('Test Title', 'Test Body', undefined);
  });

  it('should send local notification with data', async () => {
    mockScheduleLocalNotification.mockResolvedValue('notif-id-456');

    const runner = createHookRunner(() => useNotifications());
    const data = { type: 'message' as const, userId: 'u1' };
    await runner.current.sendLocalNotification('New Message', 'You have a new message', data);

    expect(mockScheduleLocalNotification).toHaveBeenCalledWith('New Message', 'You have a new message', data);
  });

  // ========================================
  // Badge management
  // ========================================

  it('should clear badge count', async () => {
    mockClearBadge.mockResolvedValue(undefined);

    const runner = createHookRunner(() => useNotifications());
    await runner.current.clearBadgeCount();

    expect(mockClearBadge).toHaveBeenCalled();
  });

  it('should set badge number', async () => {
    mockSetBadgeCount.mockResolvedValue(undefined);

    const runner = createHookRunner(() => useNotifications());
    await runner.current.setBadgeNumber(5);

    expect(mockSetBadgeCount).toHaveBeenCalledWith(5);
  });

  // ========================================
  // Notification navigation
  // ========================================

  it('should navigate to PostDetailFanFeed on like notification', () => {
    let responseHandler: (resp: unknown) => void = () => {};
    mockAddNotificationResponseListener.mockImplementation((handler: (resp: unknown) => void) => {
      responseHandler = handler;
      return { remove: jest.fn() };
    });
    mockParseNotificationData.mockReturnValue({
      type: 'like',
      postId: '550e8400-e29b-41d4-a716-446655440000',
    });

    createHookRunner(() => useNotifications());

    // Simulate tapping a notification
    responseHandler({ notification: {} });

    expect(mockNavigate).toHaveBeenCalledWith('PostDetailFanFeed', {
      postId: '550e8400-e29b-41d4-a716-446655440000',
    });
  });

  it('should navigate to Messages on message notification', () => {
    let responseHandler: (resp: unknown) => void = () => {};
    mockAddNotificationResponseListener.mockImplementation((handler: (resp: unknown) => void) => {
      responseHandler = handler;
      return { remove: jest.fn() };
    });
    mockParseNotificationData.mockReturnValue({ type: 'message' });

    createHookRunner(() => useNotifications());
    responseHandler({ notification: {} });

    expect(mockNavigate).toHaveBeenCalledWith('Messages');
  });

  it('should navigate to UserProfile on follow notification with valid UUID', () => {
    let responseHandler: (resp: unknown) => void = () => {};
    mockAddNotificationResponseListener.mockImplementation((handler: (resp: unknown) => void) => {
      responseHandler = handler;
      return { remove: jest.fn() };
    });
    mockParseNotificationData.mockReturnValue({
      type: 'new_follower',
      userId: '550e8400-e29b-41d4-a716-446655440000',
    });

    createHookRunner(() => useNotifications());
    responseHandler({ notification: {} });

    expect(mockNavigate).toHaveBeenCalledWith('UserProfile', {
      userId: '550e8400-e29b-41d4-a716-446655440000',
    });
  });

  it('should navigate to PeakView on peak notification', () => {
    let responseHandler: (resp: unknown) => void = () => {};
    mockAddNotificationResponseListener.mockImplementation((handler: (resp: unknown) => void) => {
      responseHandler = handler;
      return { remove: jest.fn() };
    });
    mockParseNotificationData.mockReturnValue({
      type: 'peak_like',
      peakId: '550e8400-e29b-41d4-a716-446655440000',
    });

    createHookRunner(() => useNotifications());
    responseHandler({ notification: {} });

    expect(mockNavigate).toHaveBeenCalledWith('PeakView', {
      peakId: '550e8400-e29b-41d4-a716-446655440000',
    });
  });

  it('should navigate to Home for unknown notification types', () => {
    let responseHandler: (resp: unknown) => void = () => {};
    mockAddNotificationResponseListener.mockImplementation((handler: (resp: unknown) => void) => {
      responseHandler = handler;
      return { remove: jest.fn() };
    });
    mockParseNotificationData.mockReturnValue({ type: 'unknown_type' });

    createHookRunner(() => useNotifications());
    responseHandler({ notification: {} });

    expect(mockNavigate).toHaveBeenCalledWith('Home');
  });

  it('should not navigate when postId is not a valid UUID', () => {
    let responseHandler: (resp: unknown) => void = () => {};
    mockAddNotificationResponseListener.mockImplementation((handler: (resp: unknown) => void) => {
      responseHandler = handler;
      return { remove: jest.fn() };
    });
    mockParseNotificationData.mockReturnValue({
      type: 'like',
      postId: 'not-a-valid-uuid',
    });

    createHookRunner(() => useNotifications());
    responseHandler({ notification: {} });

    // Should not navigate to PostDetailFanFeed with invalid UUID
    expect(mockNavigate).not.toHaveBeenCalledWith('PostDetailFanFeed', expect.anything());
  });

  it('should call custom onNotificationTapped handler when provided', () => {
    let responseHandler: (resp: unknown) => void = () => {};
    mockAddNotificationResponseListener.mockImplementation((handler: (resp: unknown) => void) => {
      responseHandler = handler;
      return { remove: jest.fn() };
    });
    const customData = { type: 'like', postId: '550e8400-e29b-41d4-a716-446655440000' };
    mockParseNotificationData.mockReturnValue(customData);

    const onNotificationTapped = jest.fn();
    createHookRunner(() => useNotifications({ onNotificationTapped }));

    responseHandler({ notification: {} });

    expect(onNotificationTapped).toHaveBeenCalledWith(customData);
    // Should NOT do default navigation
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});

/**
 * Analytics Service Tests
 *
 * Tests analytics tracking, user identification, event queuing, and flushing.
 */

// ---------------------------------------------------------------------------
// Mocks — must be declared before imports
// ---------------------------------------------------------------------------

jest.mock('react-native', () => ({
  Platform: { OS: 'ios', Version: '17.0' },
}));

jest.mock('expo-device', () => ({
  modelName: 'iPhone15',
}));

(global as Record<string, unknown>).__DEV__ = false;

// ---------------------------------------------------------------------------
// Imports — after mocks
// ---------------------------------------------------------------------------

import {
  initAnalytics,
  identify,
  setUserProperties,
  reset,
  track,
  trackScreen,
  trackSignUp,
  trackSignIn,
  trackPostCreate,
  trackPostInteraction,
  trackFollow,
  trackError,
  flush,
  getQueuedEvents,
  EVENTS,
} from '../../services/analytics';

import AsyncStorage from '@react-native-async-storage/async-storage';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('analytics', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    (AsyncStorage.getItem as jest.Mock).mockReset();
    (AsyncStorage.setItem as jest.Mock).mockReset();
    (AsyncStorage.removeItem as jest.Mock).mockReset();
    // Reset state by flushing and resetting
    await flush();
    await reset();
  });

  // =========================================================================
  // EVENTS constants
  // =========================================================================

  describe('EVENTS', () => {
    it('should define all event names', () => {
      expect(EVENTS.SIGN_UP).toBe('sign_up');
      expect(EVENTS.SIGN_IN).toBe('sign_in');
      expect(EVENTS.SIGN_OUT).toBe('sign_out');
      expect(EVENTS.POST_CREATE).toBe('post_create');
      expect(EVENTS.POST_VIEW).toBe('post_view');
      expect(EVENTS.POST_LIKE).toBe('post_like');
      expect(EVENTS.FOLLOW).toBe('follow');
      expect(EVENTS.SCREEN_VIEW).toBe('screen_view');
      expect(EVENTS.ERROR).toBe('error');
      expect(EVENTS.LIVE_START).toBe('live_start');
    });
  });

  // =========================================================================
  // initAnalytics
  // =========================================================================

  describe('initAnalytics', () => {
    it('should load persisted user ID', async () => {
      (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce('stored-user-id').mockResolvedValueOnce(null);

      await initAnalytics();

      // Verify it attempted to load
      expect(AsyncStorage.getItem).toHaveBeenCalled();
    });

    it('should load queued events from storage', async () => {
      const queuedEvents = [{ name: 'test_event', properties: {}, timestamp: 12345 }];
      (AsyncStorage.getItem as jest.Mock)
        .mockResolvedValueOnce(null) // user ID
        .mockResolvedValueOnce(JSON.stringify(queuedEvents)); // queue

      await initAnalytics();
      const events = getQueuedEvents();
      expect(events).toHaveLength(1);
      expect(events[0].name).toBe('test_event');
    });

    it('should handle storage errors gracefully', async () => {
      (AsyncStorage.getItem as jest.Mock).mockRejectedValue(new Error('Storage error'));

      await expect(initAnalytics()).resolves.toBeUndefined();
    });

    it('should accept config overrides', async () => {
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);

      await initAnalytics({ enabled: false, debugMode: false });
      // Track should be a no-op when disabled
      await track('test_event');
      // We would need access to internal state to verify, but at minimum no error
    });
  });

  // =========================================================================
  // identify
  // =========================================================================

  describe('identify', () => {
    it('should persist user ID to AsyncStorage', async () => {
      (AsyncStorage.setItem as jest.Mock).mockResolvedValue(undefined);

      await identify('user-123', { username: 'testuser' });

      expect(AsyncStorage.setItem).toHaveBeenCalledWith(
        '@smuppy_analytics_user_id',
        'user-123'
      );
    });

    it('should handle storage errors gracefully', async () => {
      (AsyncStorage.setItem as jest.Mock).mockRejectedValue(new Error('Write error'));

      await expect(identify('user-123')).resolves.toBeUndefined();
    });
  });

  // =========================================================================
  // setUserProperties
  // =========================================================================

  describe('setUserProperties', () => {
    it('should not throw', () => {
      expect(() => setUserProperties({ username: 'test' })).not.toThrow();
    });
  });

  // =========================================================================
  // reset
  // =========================================================================

  describe('reset', () => {
    it('should remove user ID from AsyncStorage', async () => {
      (AsyncStorage.removeItem as jest.Mock).mockResolvedValue(undefined);

      await reset();

      expect(AsyncStorage.removeItem).toHaveBeenCalledWith('@smuppy_analytics_user_id');
    });
  });

  // =========================================================================
  // track
  // =========================================================================

  describe('track', () => {
    beforeEach(async () => {
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
      await initAnalytics({ enabled: true, debugMode: false });
    });

    it('should queue an event', async () => {
      (AsyncStorage.setItem as jest.Mock).mockResolvedValue(undefined);

      await track('test_event', { key: 'value' });

      const events = getQueuedEvents();
      expect(events.length).toBeGreaterThanOrEqual(1);
      const lastEvent = events.at(-1)!;
      expect(lastEvent.name).toBe('test_event');
      expect(lastEvent.properties.key).toBe('value');
      expect(lastEvent.properties.platform).toBe('ios');
      expect(lastEvent.timestamp).toBeGreaterThan(0);
    });

    it('should trim queue when exceeding MAX_QUEUE_SIZE', async () => {
      (AsyncStorage.setItem as jest.Mock).mockResolvedValue(undefined);

      // Track more than 100 events
      for (let i = 0; i < 110; i++) {
        await track(`event_${i}`);
      }

      const events = getQueuedEvents();
      expect(events.length).toBeLessThanOrEqual(100);
    });

    it('should not track when disabled', async () => {
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
      await initAnalytics({ enabled: false });

      const before = getQueuedEvents().length;
      await track('disabled_event');
      const after = getQueuedEvents().length;

      expect(after).toBe(before);
    });
  });

  // =========================================================================
  // trackScreen
  // =========================================================================

  describe('trackScreen', () => {
    beforeEach(async () => {
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
      await initAnalytics({ enabled: true, debugMode: false });
    });

    it('should track screen view event', async () => {
      (AsyncStorage.setItem as jest.Mock).mockResolvedValue(undefined);

      trackScreen('HomeScreen');

      // Wait for async track
      await new Promise(resolve => setTimeout(resolve, 10));

      const events = getQueuedEvents();
      const screenEvent = events.find(e => e.name === EVENTS.SCREEN_VIEW);
      expect(screenEvent).toBeDefined();
      expect(screenEvent?.properties.screen_name).toBe('HomeScreen');
    });
  });

  // =========================================================================
  // Convenience methods
  // =========================================================================

  describe('convenience methods', () => {
    beforeEach(async () => {
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
      (AsyncStorage.setItem as jest.Mock).mockResolvedValue(undefined);
      await initAnalytics({ enabled: true, debugMode: false });
    });

    it('trackSignUp should track sign_up event', async () => {
      trackSignUp('email');
      await new Promise(resolve => setTimeout(resolve, 10));
      const events = getQueuedEvents();
      expect(events.some(e => e.name === EVENTS.SIGN_UP)).toBe(true);
    });

    it('trackSignIn should track sign_in event', async () => {
      trackSignIn('google');
      await new Promise(resolve => setTimeout(resolve, 10));
      const events = getQueuedEvents();
      expect(events.some(e => e.name === EVENTS.SIGN_IN)).toBe(true);
    });

    it('trackPostCreate should track post_create event', async () => {
      trackPostCreate('image');
      await new Promise(resolve => setTimeout(resolve, 10));
      const events = getQueuedEvents();
      expect(events.some(e => e.name === EVENTS.POST_CREATE)).toBe(true);
    });

    it('trackPostInteraction should map action to correct event', async () => {
      trackPostInteraction('like', 'post-1');
      await new Promise(resolve => setTimeout(resolve, 10));
      const events = getQueuedEvents();
      expect(events.some(e => e.name === EVENTS.POST_LIKE)).toBe(true);
    });

    it('trackFollow should track follow event', async () => {
      trackFollow('user-2', true);
      await new Promise(resolve => setTimeout(resolve, 10));
      const events = getQueuedEvents();
      expect(events.some(e => e.name === EVENTS.FOLLOW)).toBe(true);
    });

    it('trackFollow should track unfollow event', async () => {
      trackFollow('user-2', false);
      await new Promise(resolve => setTimeout(resolve, 10));
      const events = getQueuedEvents();
      expect(events.some(e => e.name === EVENTS.UNFOLLOW)).toBe(true);
    });

    it('trackError should track error event', async () => {
      trackError('TestError', 'Something went wrong', 'login');
      await new Promise(resolve => setTimeout(resolve, 10));
      const events = getQueuedEvents();
      const errorEvent = events.find(e => e.name === EVENTS.ERROR);
      expect(errorEvent).toBeDefined();
      expect(errorEvent?.properties.error_name).toBe('TestError');
    });
  });

  // =========================================================================
  // flush
  // =========================================================================

  describe('flush', () => {
    it('should clear the event queue', async () => {
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
      (AsyncStorage.setItem as jest.Mock).mockResolvedValue(undefined);
      (AsyncStorage.removeItem as jest.Mock).mockResolvedValue(undefined);
      await initAnalytics({ enabled: true, debugMode: false });

      await track('event_to_flush');
      expect(getQueuedEvents().length).toBeGreaterThan(0);

      await flush();
      expect(getQueuedEvents()).toHaveLength(0);
    });

    it('should be a no-op when queue is empty', async () => {
      await flush();
      // Should not throw or call storage
    });
  });

  // =========================================================================
  // getQueuedEvents
  // =========================================================================

  describe('getQueuedEvents', () => {
    it('should return a copy of the queue', async () => {
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
      (AsyncStorage.setItem as jest.Mock).mockResolvedValue(undefined);
      await initAnalytics({ enabled: true, debugMode: false });

      await track('test');

      const events1 = getQueuedEvents();
      const events2 = getQueuedEvents();
      expect(events1).not.toBe(events2);
      expect(events1).toEqual(events2);
    });
  });
});

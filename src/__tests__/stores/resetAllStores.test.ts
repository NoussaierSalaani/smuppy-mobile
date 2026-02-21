/**
 * resetAllStores Tests
 * Tests for the logout reset function that clears all Zustand stores
 */

// Mock AsyncStorage before any imports
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(global as any).__DEV__ = false;

// Mock react-native (needed by tabBarStore and themeStore)
jest.mock('react-native', () => {
  const animatedValue = {
    interpolate: jest.fn(() => ({ __type: 'interpolation' })),
    setValue: jest.fn(),
  };
  return {
    Animated: {
      Value: jest.fn(() => animatedValue),
      spring: jest.fn(() => ({ start: jest.fn() })),
    },
    Platform: { OS: 'ios' },
    Appearance: {
      getColorScheme: jest.fn(() => 'light'),
    },
  };
});

// Mock react
jest.mock('react', () => ({
  ...jest.requireActual('react'),
  useMemo: jest.fn((fn: () => unknown) => fn()),
}));

// Mock uuid
jest.mock('uuid', () => ({
  v4: jest.fn(() => 'test-uuid-1234'),
}));

// Mock database service (required by userSafetyStore)
jest.mock('../../services/database', () => ({
  blockUser: jest.fn(),
  unblockUser: jest.fn(),
  muteUser: jest.fn(),
  unmuteUser: jest.fn(),
  getBlockedUsers: jest.fn(),
  getMutedUsers: jest.fn(),
  reportPost: jest.fn(),
  reportUser: jest.fn(),
  hasReportedPost: jest.fn(),
  hasReportedUser: jest.fn(),
}));

// Mock dynamic imports that resetAllStores uses
jest.mock('../../screens/home/VibesFeed', () => ({
  clearVibesFeedCache: jest.fn(),
}), { virtual: true });

jest.mock('../../lib/queryClient', () => ({
  clearQueryCache: jest.fn().mockResolvedValue(undefined),
}), { virtual: true });

import { resetAllStores } from '../../stores/index';
import { useUserStore } from '../../stores/userStore';
import { useAppStore } from '../../stores/appStore';
import { useFeedStore } from '../../stores/feedStore';
import { useAuthStore } from '../../stores/authStore';
import { useFilterStore } from '../../stores/filterStore';
import { useTabBarStore } from '../../stores/tabBarStore';
import { useModerationStore } from '../../stores/moderationStore';
import AsyncStorage from '@react-native-async-storage/async-storage';

describe('resetAllStores', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should be a function', () => {
    expect(typeof resetAllStores).toBe('function');
  });

  it('should clear auth store session', async () => {
    // Set some auth state
    useAuthStore.getState().setSession({
      access_token: 'test-token',
      refresh_token: 'test-refresh',
    });
    expect(useAuthStore.getState().session).not.toBeNull();

    await resetAllStores();

    expect(useAuthStore.getState().session).toBeNull();
  });

  it('should reset app store to default values', async () => {
    // Modify app store state
    useAppStore.getState().setGlobalLoading(true);
    useAppStore.getState().setOnline(false);

    await resetAllStores();

    const appState = useAppStore.getState();
    expect(appState.isTabBarVisible).toBe(true);
    expect(appState.isOnline).toBe(true);
    expect(appState.globalLoading).toBe(false);
    expect(appState.errorModal.visible).toBe(false);
  });

  it('should clear feed store', async () => {
    // Set some feed data
    useFeedStore.getState().setFeedCache([{ id: 'post-1' }, { id: 'post-2' }]);
    expect(useFeedStore.getState().feedCache.length).toBeGreaterThan(0);

    await resetAllStores();

    expect(useFeedStore.getState().feedCache).toEqual([]);
  });

  it('should clear user store (logout)', async () => {
    // Set a user
    useUserStore.getState().setUser({ id: 'user-123', firstName: 'Test' });
    expect(useUserStore.getState().user).not.toBeNull();

    await resetAllStores();

    expect(useUserStore.getState().user).toBeNull();
  });

  it('should reset filter store', async () => {
    // Set some filter state
    useFilterStore.getState().enableBodyTracking();
    expect(useFilterStore.getState().isBodyTrackingEnabled).toBe(true);

    await resetAllStores();

    expect(useFilterStore.getState().isBodyTrackingEnabled).toBe(false);
    expect(useFilterStore.getState().activeFilter).toBeNull();
    expect(useFilterStore.getState().activeOverlays).toEqual([]);
  });

  it('should reset tab bar store', async () => {
    useTabBarStore.getState().setBottomBarHidden(true);
    expect(useTabBarStore.getState().bottomBarHidden).toBe(true);

    await resetAllStores();

    expect(useTabBarStore.getState().bottomBarHidden).toBe(false);
  });

  it('should clear moderation store', async () => {
    useModerationStore.getState().setModeration('suspended', 'test reason', '2026-12-31');
    expect(useModerationStore.getState().status).toBe('suspended');

    await resetAllStores();

    expect(useModerationStore.getState().status).toBeNull();
    expect(useModerationStore.getState().reason).toBeNull();
  });

  it('should call AsyncStorage.multiRemove with correct keys', async () => {
    await resetAllStores();

    expect(AsyncStorage.multiRemove).toHaveBeenCalledWith(
      expect.arrayContaining([
        '@smuppy_user_store',
        '@smuppy_analytics_queue',
        '@smuppy_vibe_store',
        '@smuppy_query_cache',
      ])
    );
  });

  it('should not throw when stores are already in initial state', async () => {
    await expect(resetAllStores()).resolves.not.toThrow();
  });

  it('should be safe to call multiple times', async () => {
    await resetAllStores();
    await resetAllStores();
    await resetAllStores();

    // Verify final state is clean
    expect(useAuthStore.getState().session).toBeNull();
    expect(useUserStore.getState().user).toBeNull();
    expect(useFeedStore.getState().feedCache).toEqual([]);
  });
});

/**
 * Zustand Stores — Barrel re-exports
 * For better tree-shaking, import directly from individual store files.
 * This barrel is kept for backward compatibility and resetAllStores.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

// Import stores for resetAllStores
import { useUserStore } from './userStore';
import { useAppStore } from './appStore';
import { useFeedStore } from './feedStore';
import { useAuthStore } from './authStore';
import { contentStore } from './contentStore';
import { userSafetyStore } from './userSafetyStore';
import { filterStore } from './filterStore';
import { tabBarStore } from './tabBarStore';
import { vibeStore } from './vibeStore';
import { useModerationStore } from './moderationStore';

// Re-export extracted stores
export { useUserStore } from './userStore';
export type { User, UserState } from './userStore';
export { useAppStore } from './appStore';
export type { AppState } from './appStore';
export { useFeedStore } from './feedStore';
export type { Post, FeedState } from './feedStore';
export { useAuthStore } from './authStore';
export type { Session, AuthState } from './authStore';

// Re-export existing stores
export { useContentStore, contentStore } from './contentStore';
export { useUserSafetyStore, userSafetyStore } from './userSafetyStore';
export { useFilterStore, useFilters, filterStore, FILTER_DEFINITIONS, getBodyPose, getFilterDefinition, getAllFilters, getFiltersByCategory } from './filterStore';
export { useTabBarStore, useTabBar, useTabBarAnimations, tabBarStore } from './tabBarStore';
export { useVibeStore, vibeStore } from './vibeStore';
export { useThemeStore, themeStore } from './themeStore';
export { useModerationStore } from './moderationStore';
export type { ThemePreference, ThemeMode } from './themeStore';
export type { TabBarContextValue } from './tabBarStore';
export type { ContentStatus } from './contentStore';
export type { RippleEntry, VibeState, VibeLevel, VibeActionType } from './vibeStore';

// ============================================
// RESET ALL STORES (for logout)
// ============================================

export const resetAllStores = async () => {
  // Reset Zustand stores
  useUserStore.getState().logout();
  useFeedStore.getState().clearFeed();
  useAuthStore.getState().clearAuth();

  // Reset module-level profile sync state to prevent cross-user data leaks
  try {
    const { resetProfileSyncState } = await import('../navigation/MainNavigator');
    resetProfileSyncState();
  } catch {
    // Expected: MainNavigator may not be loaded in test environment
  }
  useAppStore.setState({
    isTabBarVisible: true,
    isOnline: true,
    globalLoading: false,
    errorModal: { visible: false, title: '', message: '' },
    unreadNotifications: 0,
    unreadMessages: 0,
  });

  // Reset all Zustand stores (except themeStore — user preference should persist across accounts)
  contentStore.reset();
  userSafetyStore.reset();
  filterStore.reset();
  tabBarStore.reset();
  vibeStore.reset();
  // NOTE: themeStore intentionally NOT reset — theme is a device preference, not per-user
  useModerationStore.getState().clearModeration();

  // Clear module-level feed caches to prevent cross-user data leaks
  try {
    const { clearVibesFeedCache } = await import('../screens/home/VibesFeed');
    clearVibesFeedCache();
  } catch {
    // Expected: VibesFeed module may not be loaded yet
    if (__DEV__) console.warn('[resetAllStores] VibesFeed cache cleanup skipped');
  }

  // Clear React Query cache to prevent cross-user data leaks
  try {
    const { clearQueryCache } = await import('../lib/queryClient');
    await clearQueryCache();
  } catch {
    // Expected: queryClient may not be initialized
    if (__DEV__) console.warn('[resetAllStores] Query cache cleanup skipped');
  }

  // Clear persisted AsyncStorage data to prevent cross-user data leaks
  try {
    await AsyncStorage.multiRemove([
      '@smuppy_user_store',
      '@smuppy_analytics_queue',
      '@smuppy_vibe_store',
      // NOTE: '@smuppy_theme_store' intentionally kept — device preference
      '@smuppy_query_cache',
    ]);
  } catch {
    // Expected: AsyncStorage may be unavailable during shutdown
    if (__DEV__) console.warn('[resetAllStores] AsyncStorage cleanup skipped');
  }
};

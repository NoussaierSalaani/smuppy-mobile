/**
 * Zustand Stores
 * Optimized state management for 2M+ users
 * Replaces Context API for better performance (no unnecessary re-renders)
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Import Zustand stores for reset
import { contentStore } from './contentStore';
import { userSafetyStore } from './userSafetyStore';
import { filterStore } from './filterStore';
import { tabBarStore } from './tabBarStore';
import { vibeStore } from './vibeStore';
import { themeStore } from './themeStore';

// Re-export all stores
export { useContentStore, contentStore } from './contentStore';
export { useUserSafetyStore, userSafetyStore } from './userSafetyStore';
export { useFilterStore, useFilters, filterStore, FILTER_DEFINITIONS } from './filterStore';
export { useTabBarStore, useTabBar, useTabBarAnimations, tabBarStore } from './tabBarStore';
export { useVibeStore, vibeStore } from './vibeStore';
export { useThemeStore, themeStore } from './themeStore';
export type { ThemePreference, ThemeMode } from './themeStore';
export type { TabBarContextValue } from './tabBarStore';
export type { ContentStatus } from './contentStore';
export type { RippleEntry, VibeState, VibeLevel, VibeActionType } from './vibeStore';

// ============================================
// TYPE DEFINITIONS
// ============================================

interface User {
  id: string;
  // Basic info
  firstName?: string;
  lastName?: string;
  fullName?: string;
  displayName?: string;
  username?: string;
  email?: string;
  avatar?: string | null;
  coverImage?: string | null;
  bio?: string;
  location?: string;
  // Personal info
  dateOfBirth?: string;
  gender?: string;
  // Account type: 'personal' | 'pro_creator' | 'pro_business'
  accountType?: 'personal' | 'pro_creator' | 'pro_business';
  isVerified?: boolean;
  isPremium?: boolean;
  // Onboarding data
  interests?: string[];
  expertise?: string[];
  website?: string;
  socialLinks?: Record<string, string>;
  // Business data (for pro_business)
  businessName?: string;
  businessCategory?: string;
  businessAddress?: string;
  businessLatitude?: number;
  businessLongitude?: number;
  businessPhone?: string;
  locationsMode?: string;
  // Stats
  stats?: {
    fans?: number;
    posts?: number;
    following?: number;
  };
}

interface UserState {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  setUser: (user: User | null) => void;
  updateProfile: (updates: Partial<User>) => void;
  updateAvatar: (avatarUrl: string) => void;
  setLoading: (loading: boolean) => void;
  logout: () => void;
  getFullName: () => string;
  isPro: () => boolean;
  isProfileComplete: () => boolean;
}

interface AppState {
  isTabBarVisible: boolean;
  tabBarAnimation: unknown;
  isOnline: boolean;
  globalLoading: boolean;
  errorModal: {
    visible: boolean;
    title: string;
    message: string;
  };
  setTabBarVisible: (visible: boolean) => void;
  setOnline: (online: boolean) => void;
  setGlobalLoading: (loading: boolean) => void;
  showError: (title: string, message: string) => void;
  hideError: () => void;
}

interface Post {
  id: string;
  likes_count?: number;
  [key: string]: unknown;
}

interface FeedState {
  feedCache: Post[];
  lastFetchTime: number | null;
  optimisticLikes: Record<string, boolean>;
  setFeedCache: (posts: Post[]) => void;
  appendToFeed: (newPosts: Post[]) => void;
  prependToFeed: (newPost: Post) => void;
  removeFromFeed: (postId: string) => void;
  toggleLikeOptimistic: (postId: string, liked: boolean) => void;
  clearFeed: () => void;
  isCacheStale: () => boolean;
}

interface Session {
  access_token: string;
  refresh_token: string;
  user?: unknown;
  [key: string]: unknown;
}

interface AuthState {
  session: Session | null;
  biometricEnabled: boolean;
  biometricType: 'face' | 'fingerprint' | null;
  setSession: (session: Session | null) => void;
  setBiometric: (enabled: boolean, type?: 'face' | 'fingerprint' | null) => void;
  clearAuth: () => void;
}

// ============================================
// USER STORE
// ============================================

const initialUserState = {
  user: null as User | null,
  isLoading: true,
  isAuthenticated: false,
};

export const useUserStore = create<UserState>()(
  persist(
    immer((set, get) => ({
      ...initialUserState,

      // Actions
      setUser: (user: User | null) =>
        set((state) => {
          state.user = user;
          state.isAuthenticated = !!user;
          state.isLoading = false;
        }),

      updateProfile: (updates: Partial<User>) =>
        set((state) => {
          if (state.user) {
            state.user = { ...state.user, ...updates };
          }
        }),

      updateAvatar: (avatarUrl: string) =>
        set((state) => {
          if (state.user) {
            state.user.avatar = avatarUrl;
          }
        }),

      setLoading: (loading: boolean) =>
        set((state) => {
          state.isLoading = loading;
        }),

      logout: () =>
        set((state) => {
          state.user = null;
          state.isAuthenticated = false;
          state.isLoading = false;
        }),

      // Selectors (computed values)
      getFullName: () => {
        const { user } = get();
        if (!user) return '';
        // Business accounts use businessName as their display name
        if (user.accountType === 'pro_business' && user.businessName) return user.businessName;
        // Try fullName first, then construct from firstName + lastName
        if (user.fullName) return user.fullName;
        if (user.displayName) return user.displayName;
        return `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.username || 'User';
      },

      isPro: () => {
        const { user } = get();
        return user?.accountType === 'pro_creator' || user?.accountType === 'pro_business';
      },

      isProfileComplete: () => {
        const { user } = get();
        if (!user) return false;
        // Check required fields based on account type
        const hasBasicInfo = !!(user.username && (user.fullName || user.displayName || (user.firstName && user.lastName)));
        if (user.accountType === 'pro_business') {
          return hasBasicInfo && !!(user.businessName && user.businessCategory);
        }
        return hasBasicInfo;
      },
    })),
    {
      name: '@smuppy_user_store',
      storage: createJSONStorage(() => AsyncStorage),
      // Persist user data and auth state - all user fields are important
      partialize: (state) => ({
        user: state.user,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);

// ============================================
// APP STORE (UI State)
// ============================================

export const useAppStore = create<AppState>()(
  immer((set) => ({
    // Tab bar visibility
    isTabBarVisible: true,
    tabBarAnimation: null,

    // Network status
    isOnline: true,

    // Loading states
    globalLoading: false,

    // Error modal
    errorModal: {
      visible: false,
      title: '',
      message: '',
    },

    // Actions
    setTabBarVisible: (visible: boolean) =>
      set((state) => {
        state.isTabBarVisible = visible;
      }),

    setOnline: (online: boolean) =>
      set((state) => {
        state.isOnline = online;
      }),

    setGlobalLoading: (loading: boolean) =>
      set((state) => {
        state.globalLoading = loading;
      }),

    showError: (title: string, message: string) =>
      set((state) => {
        state.errorModal = { visible: true, title, message };
      }),

    hideError: () =>
      set((state) => {
        state.errorModal.visible = false;
      }),
  }))
);

// ============================================
// FEED STORE (Optimistic Updates)
// ============================================

export const useFeedStore = create<FeedState>()(
  immer((set, get) => ({
    // Cached feed data for instant display
    feedCache: [] as Post[],
    lastFetchTime: null as number | null,

    // Optimistic updates for likes
    optimisticLikes: {} as Record<string, boolean>,

    // Actions
    setFeedCache: (posts: Post[]) =>
      set((state) => {
        state.feedCache = posts;
        state.lastFetchTime = Date.now();
      }),

    appendToFeed: (newPosts: Post[]) =>
      set((state) => {
        // Avoid duplicates
        const existingIds = new Set(state.feedCache.map((p) => p.id));
        const uniquePosts = newPosts.filter((p) => !existingIds.has(p.id));
        state.feedCache = [...state.feedCache, ...uniquePosts];
      }),

    prependToFeed: (newPost: Post) =>
      set((state) => {
        state.feedCache = [newPost, ...state.feedCache];
      }),

    removeFromFeed: (postId: string) =>
      set((state) => {
        state.feedCache = state.feedCache.filter((p) => p.id !== postId);
      }),

    // Optimistic like
    toggleLikeOptimistic: (postId: string, liked: boolean) =>
      set((state) => {
        state.optimisticLikes[postId] = liked;
        // Update like count in cache
        const post = state.feedCache.find((p) => p.id === postId);
        if (post) {
          post.likes_count = (post.likes_count || 0) + (liked ? 1 : -1);
        }
      }),

    // Clear feed cache
    clearFeed: () =>
      set((state) => {
        state.feedCache = [];
        state.lastFetchTime = null;
        state.optimisticLikes = {};
      }),

    // Check if cache is stale (older than 5 minutes)
    isCacheStale: () => {
      const { lastFetchTime } = get();
      if (!lastFetchTime) return true;
      return Date.now() - lastFetchTime > 5 * 60 * 1000;
    },
  }))
);

// ============================================
// AUTH STORE (Sensitive data)
// ============================================

export const useAuthStore = create<AuthState>()(
  immer((set) => ({
    // Session info (not persisted - managed by AWS Cognito)
    session: null as Session | null,

    // Biometric state
    biometricEnabled: false,
    biometricType: null as 'face' | 'fingerprint' | null,

    // Actions
    setSession: (session: Session | null) =>
      set((state) => {
        state.session = session;
      }),

    setBiometric: (enabled: boolean, type: 'face' | 'fingerprint' | null = null) =>
      set((state) => {
        state.biometricEnabled = enabled;
        state.biometricType = type;
      }),

    clearAuth: () =>
      set((state) => {
        state.session = null;
      }),
  }))
);

// ============================================
// RESET ALL STORES (for logout)
// ============================================

export const resetAllStores = async () => {
  // Reset Zustand stores
  useUserStore.getState().logout();
  useFeedStore.getState().clearFeed();
  useAuthStore.getState().clearAuth();
  useAppStore.setState({
    isTabBarVisible: true,
    isOnline: true,
    globalLoading: false,
    errorModal: { visible: false, title: '', message: '' },
  });

  // Reset all Zustand stores
  contentStore.reset();
  userSafetyStore.reset();
  filterStore.reset();
  tabBarStore.reset();
  vibeStore.reset();
  themeStore.reset();

  // Clear persisted AsyncStorage data to prevent cross-user data leaks
  try {
    await AsyncStorage.multiRemove([
      '@smuppy_user_store',
      '@smuppy_analytics_queue',
      '@smuppy_vibe_store',
      '@smuppy_theme_store',
    ]);
  } catch {
    // Best-effort cleanup
  }
};

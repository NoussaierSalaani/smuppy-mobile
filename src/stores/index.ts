/**
 * Zustand Stores
 * Optimized state management for 2M+ users
 * Replaces Context API for better performance (no unnecessary re-renders)
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ============================================
// USER STORE
// ============================================

const initialUserState = {
  user: null,
  isLoading: true,
  isAuthenticated: false,
};

export const useUserStore = create(
  persist(
    immer((set, get) => ({
      ...initialUserState,

      // Actions
      setUser: (user) =>
        set((state) => {
          state.user = user;
          state.isAuthenticated = !!user;
          state.isLoading = false;
        }),

      updateProfile: (updates) =>
        set((state) => {
          if (state.user) {
            state.user = { ...state.user, ...updates };
          }
        }),

      updateAvatar: (avatarUrl) =>
        set((state) => {
          if (state.user) {
            state.user.avatar = avatarUrl;
          }
        }),

      setLoading: (loading) =>
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
        return `${user.firstName || ''} ${user.lastName || ''}`.trim();
      },

      isPro: () => {
        const { user } = get();
        return user?.accountType === 'pro';
      },

      isProfileComplete: () => {
        const { user } = get();
        if (!user) return false;
        return !!(user.firstName && user.lastName && user.username);
      },
    })),
    {
      name: '@smuppy_user_store',
      storage: createJSONStorage(() => AsyncStorage),
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

export const useAppStore = create(
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
    setTabBarVisible: (visible) =>
      set((state) => {
        state.isTabBarVisible = visible;
      }),

    setOnline: (online) =>
      set((state) => {
        state.isOnline = online;
      }),

    setGlobalLoading: (loading) =>
      set((state) => {
        state.globalLoading = loading;
      }),

    showError: (title, message) =>
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

export const useFeedStore = create(
  immer((set, get) => ({
    // Cached feed data for instant display
    feedCache: [],
    lastFetchTime: null,

    // Optimistic updates for likes
    optimisticLikes: {}, // postId -> boolean

    // Actions
    setFeedCache: (posts) =>
      set((state) => {
        state.feedCache = posts;
        state.lastFetchTime = Date.now();
      }),

    appendToFeed: (newPosts) =>
      set((state) => {
        // Avoid duplicates
        const existingIds = new Set(state.feedCache.map((p) => p.id));
        const uniquePosts = newPosts.filter((p) => !existingIds.has(p.id));
        state.feedCache = [...state.feedCache, ...uniquePosts];
      }),

    prependToFeed: (newPost) =>
      set((state) => {
        state.feedCache = [newPost, ...state.feedCache];
      }),

    removeFromFeed: (postId) =>
      set((state) => {
        state.feedCache = state.feedCache.filter((p) => p.id !== postId);
      }),

    // Optimistic like
    toggleLikeOptimistic: (postId, liked) =>
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

export const useAuthStore = create(
  immer((set) => ({
    // Session info (not persisted - managed by Supabase)
    session: null,

    // Biometric state
    biometricEnabled: false,
    biometricType: null, // 'face' | 'fingerprint' | null

    // Actions
    setSession: (session) =>
      set((state) => {
        state.session = session;
      }),

    setBiometric: (enabled, type = null) =>
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
// SELECTORS (for performance)
// ============================================

// Use these selectors to avoid unnecessary re-renders
export const selectUser = (state) => state.user;
export const selectIsAuthenticated = (state) => state.isAuthenticated;
export const selectIsLoading = (state) => state.isLoading;
export const selectIsOnline = (state) => state.isOnline;
export const selectFeedCache = (state) => state.feedCache;

// ============================================
// RESET ALL STORES (for logout)
// ============================================

export const resetAllStores = () => {
  useUserStore.getState().logout();
  useFeedStore.getState().clearFeed();
  useAuthStore.getState().clearAuth();
  useAppStore.setState({
    isTabBarVisible: true,
    isOnline: true,
    globalLoading: false,
    errorModal: { visible: false, title: '', message: '' },
  });
};

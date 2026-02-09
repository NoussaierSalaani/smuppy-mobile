/**
 * Feed Store (Optimistic Updates)
 * Manages feed cache and optimistic like/save state
 */

import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';

export interface Post {
  id: string;
  likes_count?: number;
  [key: string]: unknown;
}

export interface FeedState {
  feedCache: Post[];
  lastFetchTime: number | null;
  optimisticLikes: Record<string, boolean>;
  optimisticPeakLikes: Record<string, boolean>;
  setFeedCache: (posts: Post[]) => void;
  appendToFeed: (newPosts: Post[]) => void;
  prependToFeed: (newPost: Post) => void;
  removeFromFeed: (postId: string) => void;
  toggleLikeOptimistic: (postId: string, liked: boolean) => void;
  setPeakLikeOverride: (peakId: string, liked: boolean) => void;
  clearOptimisticLikes: (postIds: string[]) => void;
  clearOptimisticPeakLikes: (peakIds: string[]) => void;
  clearFeed: () => void;
  isCacheStale: () => boolean;
}

export const useFeedStore = create<FeedState>()(
  immer((set, get) => ({
    // Cached feed data for instant display
    feedCache: [] as Post[],
    lastFetchTime: null as number | null,

    // Optimistic updates for likes (shared between feed + detail screens)
    optimisticLikes: {} as Record<string, boolean>,
    optimisticPeakLikes: {} as Record<string, boolean>,

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
        const idx = state.feedCache.findIndex((p) => p.id === postId);
        if (idx !== -1) state.feedCache.splice(idx, 1);
      }),

    // Optimistic like (posts)
    toggleLikeOptimistic: (postId: string, liked: boolean) =>
      set((state) => {
        state.optimisticLikes[postId] = liked;
        // Update like count in cache
        const post = state.feedCache.find((p) => p.id === postId);
        if (post) {
          post.likes_count = (post.likes_count || 0) + (liked ? 1 : -1);
        }
      }),

    // Optimistic like (peaks)
    setPeakLikeOverride: (peakId: string, liked: boolean) =>
      set((state) => {
        state.optimisticPeakLikes[peakId] = liked;
      }),

    // Clear specific post overrides after applying them in the feed
    clearOptimisticLikes: (postIds: string[]) =>
      set((state) => {
        for (const id of postIds) {
          delete state.optimisticLikes[id];
        }
      }),

    // Clear specific peak overrides
    clearOptimisticPeakLikes: (peakIds: string[]) =>
      set((state) => {
        for (const id of peakIds) {
          delete state.optimisticPeakLikes[id];
        }
      }),

    // Clear feed cache
    clearFeed: () =>
      set((state) => {
        state.feedCache = [];
        state.lastFetchTime = null;
        state.optimisticLikes = {};
        state.optimisticPeakLikes = {};
      }),

    // Check if cache is stale (older than 5 minutes)
    isCacheStale: () => {
      const { lastFetchTime } = get();
      if (!lastFetchTime) return true;
      return Date.now() - lastFetchTime > 5 * 60 * 1000;
    },
  }))
);

/**
 * Feed Store (Optimistic Updates)
 * Manages feed cache and optimistic like/save state
 */

import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';

export interface Post {
  id: string;
  likes_count?: number;
  // Index signature needed: feed posts arrive with dynamic/varying fields from multiple API sources
  [key: string]: unknown;
}

export interface FeedState {
  feedCache: Post[];
  lastFetchTime: number | null;
  optimisticLikes: Record<string, boolean>;
  optimisticPeakLikes: Record<string, boolean>;
  deletedPostIds: Record<string, true>;
  deletedPeakIds: Record<string, true>;
  setFeedCache: (posts: Post[]) => void;
  appendToFeed: (newPosts: Post[]) => void;
  prependToFeed: (newPost: Post) => void;
  removeFromFeed: (postId: string) => void;
  markPostDeleted: (postId: string) => void;
  markPeakDeleted: (peakId: string) => void;
  toggleLikeOptimistic: (postId: string, liked: boolean) => void;
  setPeakLikeOverride: (peakId: string, liked: boolean) => void;
  clearOptimisticLikes: (postIds: string[]) => void;
  clearOptimisticPeakLikes: (peakIds: string[]) => void;
  clearFeed: () => void;
  isCacheStale: () => boolean;
}

const MAX_FEED_CACHE = 100;

export const useFeedStore = create<FeedState>()(
  immer((set, get) => ({
    // Cached feed data for instant display (capped at MAX_FEED_CACHE)
    feedCache: [] as Post[],
    lastFetchTime: null as number | null,

    // Optimistic updates for likes (shared between feed + detail screens)
    optimisticLikes: {} as Record<string, boolean>,
    optimisticPeakLikes: {} as Record<string, boolean>,

    // Deletion tracking — syncs detail screen deletions with parent screens
    deletedPostIds: {} as Record<string, true>,
    deletedPeakIds: {} as Record<string, true>,

    // Actions
    setFeedCache: (posts: Post[]) =>
      set((state) => {
        state.feedCache = posts.slice(0, MAX_FEED_CACHE);
        state.lastFetchTime = Date.now();
      }),

    appendToFeed: (newPosts: Post[]) =>
      set((state) => {
        // Avoid duplicates and cap at MAX_FEED_CACHE to prevent memory growth
        const existingIds = new Set(state.feedCache.map((p) => p.id));
        const uniquePosts = newPosts.filter((p) => !existingIds.has(p.id));
        const combined = [...state.feedCache, ...uniquePosts];
        state.feedCache = combined.length > MAX_FEED_CACHE
          ? combined.slice(combined.length - MAX_FEED_CACHE)
          : combined;
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

    markPostDeleted: (postId: string) =>
      set((state) => {
        state.deletedPostIds[postId] = true;
        // Also remove from feed cache
        const idx = state.feedCache.findIndex((p) => p.id === postId);
        if (idx !== -1) state.feedCache.splice(idx, 1);
      }),

    markPeakDeleted: (peakId: string) =>
      set((state) => {
        state.deletedPeakIds[peakId] = true;
      }),

    // Optimistic like (posts) — idempotent: skip if already in desired state
    toggleLikeOptimistic: (postId: string, liked: boolean) =>
      set((state) => {
        if (state.optimisticLikes[postId] === liked) return;
        state.optimisticLikes[postId] = liked;
        // Update like count in cache
        const post = state.feedCache.find((p) => p.id === postId);
        if (post) {
          post.likes_count = Math.max(0, (post.likes_count ?? 0) + (liked ? 1 : -1));
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
        state.deletedPostIds = {};
        state.deletedPeakIds = {};
      }),

    // Check if cache is stale (older than 5 minutes)
    isCacheStale: () => {
      const { lastFetchTime } = get();
      if (!lastFetchTime) return true;
      return Date.now() - lastFetchTime > 5 * 60 * 1000;
    },
  }))
);

/**
 * React Query Configuration
 * Optimized for 2M+ users with caching, offline support, and retry logic
 */

import { QueryClient } from '@tanstack/react-query';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';

// Cache keys for persistence
const QUERY_CACHE_KEY = '@smuppy_query_cache';

/**
 * Custom retry function with exponential backoff
 */
const retryFn = (failureCount, error) => {
  // Don't retry on 4xx errors (client errors)
  if (error?.status >= 400 && error?.status < 500) {
    return false;
  }
  // Retry up to 3 times for network/server errors
  return failureCount < 3;
};

/**
 * Calculate retry delay with exponential backoff
 */
const retryDelay = (attemptIndex) => {
  return Math.min(1000 * 2 ** attemptIndex, 30000);
};

/**
 * Create the Query Client with optimized settings
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Cache data for 5 minutes by default
      staleTime: 5 * 60 * 1000,
      // Keep unused data in cache for 30 minutes
      gcTime: 30 * 60 * 1000,
      // Retry failed requests
      retry: retryFn,
      retryDelay,
      // Don't refetch on window focus (mobile app)
      refetchOnWindowFocus: false,
      // Refetch on reconnect
      refetchOnReconnect: true,
      // Keep previous data while fetching new data
      placeholderData: (previousData) => previousData,
      // Network mode - fetch only when online
      networkMode: 'offlineFirst',
    },
    mutations: {
      retry: retryFn,
      retryDelay,
      networkMode: 'offlineFirst',
    },
  },
});

/**
 * Persist cache to AsyncStorage
 */
export const persistQueryCache = async () => {
  try {
    const cache = queryClient.getQueryCache().getAll();
    const serializableCache = cache
      .filter((query) => query.state.data !== undefined)
      .map((query) => ({
        queryKey: query.queryKey,
        data: query.state.data,
        dataUpdatedAt: query.state.dataUpdatedAt,
      }));

    await AsyncStorage.setItem(QUERY_CACHE_KEY, JSON.stringify(serializableCache));
  } catch (error) {
    console.warn('Failed to persist query cache:', error);
  }
};

/**
 * Restore cache from AsyncStorage
 */
export const restoreQueryCache = async () => {
  try {
    const cached = await AsyncStorage.getItem(QUERY_CACHE_KEY);
    if (cached) {
      const parsedCache = JSON.parse(cached);
      const now = Date.now();

      parsedCache.forEach(({ queryKey, data, dataUpdatedAt }) => {
        // Only restore if data is less than 30 minutes old
        if (now - dataUpdatedAt < 30 * 60 * 1000) {
          queryClient.setQueryData(queryKey, data);
        }
      });
    }
  } catch (error) {
    console.warn('Failed to restore query cache:', error);
  }
};

/**
 * Clear all cached data
 */
export const clearQueryCache = async () => {
  queryClient.clear();
  await AsyncStorage.removeItem(QUERY_CACHE_KEY);
};

/**
 * Invalidate specific queries
 */
export const invalidateQueries = (queryKey) => {
  queryClient.invalidateQueries({ queryKey });
};

/**
 * Prefetch data for better UX
 */
export const prefetchQuery = async (queryKey, queryFn) => {
  await queryClient.prefetchQuery({
    queryKey,
    queryFn,
    staleTime: 5 * 60 * 1000,
  });
};

/**
 * Check network status
 */
export const isOnline = async () => {
  const state = await NetInfo.fetch();
  return state.isConnected && state.isInternetReachable;
};

/**
 * Query keys factory for type-safe keys
 */
export const queryKeys = {
  // User
  user: {
    all: ['user'],
    profile: (id) => ['user', 'profile', id],
    current: () => ['user', 'current'],
  },
  // Posts
  posts: {
    all: ['posts'],
    feed: (page) => ['posts', 'feed', page],
    byUser: (userId, page) => ['posts', 'user', userId, page],
    single: (id) => ['posts', 'detail', id],
  },
  // Follows
  follows: {
    followers: (userId, page) => ['follows', 'followers', userId, page],
    following: (userId, page) => ['follows', 'following', userId, page],
    isFollowing: (userId) => ['follows', 'check', userId],
  },
  // Likes
  likes: {
    hasLiked: (postId) => ['likes', 'check', postId],
  },
  // Comments
  comments: {
    byPost: (postId, page) => ['comments', postId, page],
  },
  // Interests & Expertise
  interests: {
    all: () => ['interests'],
  },
  expertise: {
    all: () => ['expertise'],
  },
};

export default queryClient;

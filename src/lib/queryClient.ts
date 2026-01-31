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
const retryFn = (failureCount: number, error: Error) => {
  // Don't retry on 4xx errors (client errors)
  const status = (error as Error & { status?: number })?.status;
  if (status !== undefined && status >= 400 && status < 500) {
    return false;
  }
  // Retry up to 3 times for network/server errors
  return failureCount < 3;
};

/**
 * Calculate retry delay with exponential backoff
 */
const retryDelay = (attemptIndex: number) => {
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
      placeholderData: (previousData: unknown) => previousData,
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
    if (__DEV__) console.warn('Failed to persist query cache:', error);
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

      parsedCache.forEach(({ queryKey, data, dataUpdatedAt }: { queryKey: unknown[]; data: unknown; dataUpdatedAt: number }) => {
        // Only restore if data is less than 30 minutes old
        if (now - dataUpdatedAt < 30 * 60 * 1000) {
          queryClient.setQueryData(queryKey, data);
        }
      });
    }
  } catch (error) {
    if (__DEV__) console.warn('Failed to restore query cache:', error);
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
export const invalidateQueries = (queryKey: unknown[]) => {
  queryClient.invalidateQueries({ queryKey });
};

/**
 * Prefetch data for better UX
 */
export const prefetchQuery = async (queryKey: unknown[], queryFn: () => Promise<unknown>) => {
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
    all: ['user'] as const,
    profile: (id: string) => ['user', 'profile', id] as const,
    current: () => ['user', 'current'] as const,
  },
  // Posts
  posts: {
    all: ['posts'] as const,
    feed: (page: number) => ['posts', 'feed', page] as const,
    byUser: (userId: string, page: number) => ['posts', 'user', userId, page] as const,
    single: (id: string) => ['posts', 'detail', id] as const,
  },
  // Follows
  follows: {
    followers: (userId: string, page: number) => ['follows', 'followers', userId, page] as const,
    following: (userId: string, page: number) => ['follows', 'following', userId, page] as const,
    isFollowing: (userId: string) => ['follows', 'check', userId] as const,
  },
  // Likes
  likes: {
    hasLiked: (postId: string) => ['likes', 'check', postId] as const,
  },
  // Collections (Saved Posts)
  collections: {
    all: ['collections'] as const,
    saved: (page: number) => ['collections', 'saved', page] as const,
    hasSaved: (postId: string) => ['collections', 'saved', 'check', postId] as const,
  },
  // Comments
  comments: {
    byPost: (postId: string, page: number) => ['comments', postId, page] as const,
  },
  // Interests & Expertise
  interests: {
    all: () => ['interests'] as const,
  },
  expertise: {
    all: () => ['expertise'] as const,
  },
  // Spots
  spots: {
    all: ['spots'] as const,
    feed: (page: number) => ['spots', 'feed', page] as const,
    single: (id: string) => ['spots', 'detail', id] as const,
    byCreator: (creatorId: string, page: number) => ['spots', 'creator', creatorId, page] as const,
    byCategory: (category: string, page: number) => ['spots', 'category', category, page] as const,
    bySportType: (sportType: string, page: number) => ['spots', 'sport', sportType, page] as const,
    nearby: (lat: number, lon: number, radius: number) => ['spots', 'nearby', lat, lon, radius] as const,
    saved: (page: number) => ['spots', 'saved', page] as const,
    hasSaved: (spotId: string) => ['spots', 'saved', 'check', spotId] as const,
    reviews: (spotId: string, page: number) => ['spots', 'reviews', spotId, page] as const,
  },
};

export default queryClient;

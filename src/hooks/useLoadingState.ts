/**
 * useLoadingState - Unified loading state management
 * Replaces 51+ duplicated loading state patterns across screens
 */

import { useState, useCallback, useMemo } from 'react';

// ============================================
// TYPES
// ============================================

type LoadingRecord = Record<string, boolean>;

interface LoadingStateResult {
  // Simple loading states
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;

  // Refresh state
  isRefreshing: boolean;
  setIsRefreshing: (refreshing: boolean) => void;

  // Load more (pagination)
  isLoadingMore: boolean;
  setIsLoadingMore: (loading: boolean) => void;

  // Per-item loading (likes, bookmarks, etc.)
  itemLoading: LoadingRecord;
  setItemLoading: (id: string, loading: boolean) => void;
  isItemLoading: (id: string) => boolean;
  clearItemLoading: () => void;

  // Secondary per-item loading (e.g., bookmarks vs likes)
  secondaryLoading: LoadingRecord;
  setSecondaryLoading: (id: string, loading: boolean) => void;
  isSecondaryLoading: (id: string) => boolean;

  // Follow loading state
  followLoading: LoadingRecord;
  setFollowLoading: (userId: string, loading: boolean) => void;
  isFollowLoading: (userId: string) => boolean;

  // Utility: Check if any loading is active
  isAnyLoading: boolean;

  // Reset all loading states
  resetAll: () => void;
}

// ============================================
// HOOK IMPLEMENTATION
// ============================================

/**
 * Hook for managing multiple loading states in a component
 *
 * @example
 * ```tsx
 * const {
 *   isLoading, setIsLoading,
 *   isRefreshing, setIsRefreshing,
 *   itemLoading, setItemLoading, isItemLoading,
 * } = useLoadingState();
 *
 * // Check if a specific post like is loading
 * const likeLoading = isItemLoading(postId);
 *
 * // Set loading for a specific action
 * setItemLoading(postId, true);
 * await likePost(postId);
 * setItemLoading(postId, false);
 * ```
 */
export const useLoadingState = (initialLoading = true): LoadingStateResult => {
  // Primary loading states
  const [isLoading, setIsLoading] = useState(initialLoading);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  // Per-item loading records
  const [itemLoading, setItemLoadingRecord] = useState<LoadingRecord>({});
  const [secondaryLoading, setSecondaryLoadingRecord] = useState<LoadingRecord>({});
  const [followLoading, setFollowLoadingRecord] = useState<LoadingRecord>({});

  // Item loading helpers
  const setItemLoading = useCallback((id: string, loading: boolean) => {
    setItemLoadingRecord((prev) => ({ ...prev, [id]: loading }));
  }, []);

  const isItemLoading = useCallback((id: string) => {
    return itemLoading[id] || false;
  }, [itemLoading]);

  const clearItemLoading = useCallback(() => {
    setItemLoadingRecord({});
  }, []);

  // Secondary loading helpers (e.g., bookmarks)
  const setSecondaryLoading = useCallback((id: string, loading: boolean) => {
    setSecondaryLoadingRecord((prev) => ({ ...prev, [id]: loading }));
  }, []);

  const isSecondaryLoading = useCallback((id: string) => {
    return secondaryLoading[id] || false;
  }, [secondaryLoading]);

  // Follow loading helpers
  const setFollowLoading = useCallback((userId: string, loading: boolean) => {
    setFollowLoadingRecord((prev) => ({ ...prev, [userId]: loading }));
  }, []);

  const isFollowLoading = useCallback((userId: string) => {
    return followLoading[userId] || false;
  }, [followLoading]);

  // Check if any loading is active
  const isAnyLoading = useMemo(() => {
    return (
      isLoading ||
      isRefreshing ||
      isLoadingMore ||
      Object.values(itemLoading).some(Boolean) ||
      Object.values(secondaryLoading).some(Boolean) ||
      Object.values(followLoading).some(Boolean)
    );
  }, [isLoading, isRefreshing, isLoadingMore, itemLoading, secondaryLoading, followLoading]);

  // Reset all loading states
  const resetAll = useCallback(() => {
    setIsLoading(false);
    setIsRefreshing(false);
    setIsLoadingMore(false);
    setItemLoadingRecord({});
    setSecondaryLoadingRecord({});
    setFollowLoadingRecord({});
  }, []);

  return {
    isLoading,
    setIsLoading,
    isRefreshing,
    setIsRefreshing,
    isLoadingMore,
    setIsLoadingMore,
    itemLoading,
    setItemLoading,
    isItemLoading,
    clearItemLoading,
    secondaryLoading,
    setSecondaryLoading,
    isSecondaryLoading,
    followLoading,
    setFollowLoading,
    isFollowLoading,
    isAnyLoading,
    resetAll,
  };
};

// ============================================
// SPECIALIZED HOOKS
// ============================================

/**
 * Simplified hook for single loading state with item tracking
 * Use when you only need basic loading + per-item tracking
 */
export const useSimpleLoading = (initialLoading = true) => {
  const [isLoading, setIsLoading] = useState(initialLoading);
  const [itemLoading, setItemLoadingRecord] = useState<LoadingRecord>({});

  const setItemLoading = useCallback((id: string, loading: boolean) => {
    setItemLoadingRecord((prev) => ({ ...prev, [id]: loading }));
  }, []);

  const isItemLoading = useCallback((id: string) => {
    return itemLoading[id] || false;
  }, [itemLoading]);

  return {
    isLoading,
    setIsLoading,
    itemLoading,
    setItemLoading,
    isItemLoading,
  };
};

/**
 * Hook for pagination loading states
 */
export const usePaginationLoading = () => {
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  const startRefresh = useCallback(() => {
    setIsRefreshing(true);
    setHasMore(true);
  }, []);

  const endRefresh = useCallback((moreAvailable: boolean) => {
    setIsRefreshing(false);
    setIsLoading(false);
    setHasMore(moreAvailable);
  }, []);

  const startLoadMore = useCallback(() => {
    if (!isLoadingMore && hasMore) {
      setIsLoadingMore(true);
      return true;
    }
    return false;
  }, [isLoadingMore, hasMore]);

  const endLoadMore = useCallback((moreAvailable: boolean) => {
    setIsLoadingMore(false);
    setHasMore(moreAvailable);
  }, []);

  return {
    isLoading,
    setIsLoading,
    isRefreshing,
    isLoadingMore,
    hasMore,
    startRefresh,
    endRefresh,
    startLoadMore,
    endLoadMore,
  };
};

export default useLoadingState;

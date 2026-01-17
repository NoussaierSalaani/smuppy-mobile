/**
 * React Query Hooks
 * Custom hooks for data fetching with caching, offline support, and optimistic updates
 */

import { useQuery, useMutation, useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys, invalidateQueries } from '../../lib/queryClient';
import * as database from '../../services/database';
import { useFeedStore } from '../../stores';

// ============================================
// USER HOOKS
// ============================================

/**
 * Get current user's profile
 */
export const useCurrentProfile = () => {
  return useQuery({
    queryKey: queryKeys.user.current(),
    queryFn: async () => {
      const { data, error } = await database.getCurrentProfile();
      if (error) {
        const errorMsg = typeof error === 'object' ? (error.message || JSON.stringify(error)) : String(error);
        throw new Error(errorMsg);
      }
      return data; // Can be null if profile doesn't exist yet
    },
    staleTime: 10 * 60 * 1000,
  });
};

/**
 * Get profile by ID
 */
export const useProfile = (userId) => {
  return useQuery({
    queryKey: queryKeys.user.profile(userId),
    queryFn: async () => {
      const { data, error } = await database.getProfileById(userId);
      if (error) throw new Error(error);
      return data;
    },
    enabled: !!userId,
  });
};

/**
 * Update profile mutation
 */
export const useUpdateProfile = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (updates) => {
      const { data, error } = await database.updateProfile(updates);
      if (error) throw new Error(error);
      return data;
    },
    onSuccess: (data) => {
      // Update cache
      queryClient.setQueryData(queryKeys.user.current(), data);
    },
  });
};

// ============================================
// POSTS HOOKS
// ============================================

/**
 * Get feed posts with infinite scroll
 */
export const useFeedPosts = () => {
  const { setFeedCache, appendToFeed } = useFeedStore();

  return useInfiniteQuery({
    queryKey: queryKeys.posts.all,
    queryFn: async ({ pageParam = 0 }) => {
      const { data, error } = await database.getFeedPosts(pageParam, 10);
      if (error) throw new Error(error);
      return { posts: data || [], nextPage: pageParam + 1 };
    },
    getNextPageParam: (lastPage) => {
      // Stop if less than 10 posts returned
      if (lastPage.posts.length < 10) return undefined;
      return lastPage.nextPage;
    },
    initialPageParam: 0,
    staleTime: 2 * 60 * 1000, // 2 minutes for feed
    onSuccess: (data) => {
      // Update feed store for optimistic updates
      const allPosts = data.pages.flatMap((page) => page.posts);
      setFeedCache(allPosts);
    },
  });
};

/**
 * Get posts by user
 */
export const useUserPosts = (userId) => {
  return useInfiniteQuery({
    queryKey: queryKeys.posts.byUser(userId, 0),
    queryFn: async ({ pageParam = 0 }) => {
      const { data, error } = await database.getPostsByUser(userId, pageParam, 10);
      if (error) throw new Error(error);
      return { posts: data || [], nextPage: pageParam + 1 };
    },
    getNextPageParam: (lastPage) => {
      if (lastPage.posts.length < 10) return undefined;
      return lastPage.nextPage;
    },
    initialPageParam: 0,
    enabled: !!userId,
  });
};

/**
 * Create post mutation
 */
export const useCreatePost = () => {
  const queryClient = useQueryClient();
  const { prependToFeed } = useFeedStore();

  return useMutation({
    mutationFn: async (postData) => {
      const { data, error } = await database.createPost(postData);
      if (error) throw new Error(error);
      return data;
    },
    onSuccess: (newPost) => {
      // Optimistically add to feed
      prependToFeed(newPost);
      // Invalidate feed to refetch
      queryClient.invalidateQueries({ queryKey: queryKeys.posts.all });
    },
  });
};

/**
 * Delete post mutation
 */
export const useDeletePost = () => {
  const queryClient = useQueryClient();
  const { removeFromFeed } = useFeedStore();

  return useMutation({
    mutationFn: async (postId) => {
      const { error } = await database.deletePost(postId);
      if (error) throw new Error(error);
      return postId;
    },
    onMutate: async (postId) => {
      // Optimistically remove from feed
      removeFromFeed(postId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.posts.all });
    },
  });
};

// ============================================
// LIKES HOOKS
// ============================================

/**
 * Check if user liked a post
 */
export const useHasLiked = (postId) => {
  return useQuery({
    queryKey: queryKeys.likes.hasLiked(postId),
    queryFn: async () => {
      const { hasLiked } = await database.hasLikedPost(postId);
      return hasLiked;
    },
    enabled: !!postId,
    staleTime: 60 * 1000, // 1 minute
  });
};

/**
 * Like/Unlike mutation with optimistic update
 */
export const useToggleLike = () => {
  const queryClient = useQueryClient();
  const { toggleLikeOptimistic } = useFeedStore();

  return useMutation({
    mutationFn: async ({ postId, liked }) => {
      if (liked) {
        const { error } = await database.unlikePost(postId);
        if (error) throw new Error(error);
        return { postId, liked: false };
      } else {
        const { error } = await database.likePost(postId);
        if (error) throw new Error(error);
        return { postId, liked: true };
      }
    },
    onMutate: async ({ postId, liked }) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: queryKeys.likes.hasLiked(postId) });

      // Snapshot previous value
      const previousValue = queryClient.getQueryData(queryKeys.likes.hasLiked(postId));

      // Optimistically update
      queryClient.setQueryData(queryKeys.likes.hasLiked(postId), !liked);
      toggleLikeOptimistic(postId, !liked);

      return { previousValue, postId };
    },
    onError: (err, variables, context) => {
      // Rollback on error
      if (context?.previousValue !== undefined) {
        queryClient.setQueryData(
          queryKeys.likes.hasLiked(context.postId),
          context.previousValue
        );
        toggleLikeOptimistic(context.postId, context.previousValue);
      }
    },
  });
};

// ============================================
// FOLLOWS HOOKS
// ============================================

/**
 * Check if following a user
 */
export const useIsFollowing = (userId) => {
  return useQuery({
    queryKey: queryKeys.follows.isFollowing(userId),
    queryFn: async () => {
      const { following } = await database.isFollowing(userId);
      return following;
    },
    enabled: !!userId,
    staleTime: 2 * 60 * 1000,
  });
};

/**
 * Get followers
 */
export const useFollowers = (userId) => {
  return useInfiniteQuery({
    queryKey: queryKeys.follows.followers(userId, 0),
    queryFn: async ({ pageParam = 0 }) => {
      const { data, error } = await database.getFollowers(userId, pageParam, 20);
      if (error) throw new Error(error);
      return { users: data || [], nextPage: pageParam + 1 };
    },
    getNextPageParam: (lastPage) => {
      if (lastPage.users.length < 20) return undefined;
      return lastPage.nextPage;
    },
    initialPageParam: 0,
    enabled: !!userId,
  });
};

/**
 * Get following
 */
export const useFollowing = (userId) => {
  return useInfiniteQuery({
    queryKey: queryKeys.follows.following(userId, 0),
    queryFn: async ({ pageParam = 0 }) => {
      const { data, error } = await database.getFollowing(userId, pageParam, 20);
      if (error) throw new Error(error);
      return { users: data || [], nextPage: pageParam + 1 };
    },
    getNextPageParam: (lastPage) => {
      if (lastPage.users.length < 20) return undefined;
      return lastPage.nextPage;
    },
    initialPageParam: 0,
    enabled: !!userId,
  });
};

/**
 * Follow/Unfollow mutation
 */
export const useToggleFollow = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ userId, isFollowing }) => {
      if (isFollowing) {
        const { error } = await database.unfollowUser(userId);
        if (error) throw new Error(error);
        return { userId, following: false };
      } else {
        const { error } = await database.followUser(userId);
        if (error) throw new Error(error);
        return { userId, following: true };
      }
    },
    onMutate: async ({ userId, isFollowing }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.follows.isFollowing(userId) });
      const previousValue = queryClient.getQueryData(queryKeys.follows.isFollowing(userId));
      queryClient.setQueryData(queryKeys.follows.isFollowing(userId), !isFollowing);
      return { previousValue, userId };
    },
    onError: (err, variables, context) => {
      if (context?.previousValue !== undefined) {
        queryClient.setQueryData(
          queryKeys.follows.isFollowing(context.userId),
          context.previousValue
        );
      }
    },
    onSettled: (data) => {
      // Invalidate followers/following lists
      queryClient.invalidateQueries({ queryKey: ['follows'] });
    },
  });
};

// ============================================
// COMMENTS HOOKS
// ============================================

/**
 * Get comments for a post
 */
export const usePostComments = (postId) => {
  return useInfiniteQuery({
    queryKey: queryKeys.comments.byPost(postId, 0),
    queryFn: async ({ pageParam = 0 }) => {
      const { data, error } = await database.getPostComments(postId, pageParam, 20);
      if (error) throw new Error(error);
      return { comments: data || [], nextPage: pageParam + 1 };
    },
    getNextPageParam: (lastPage) => {
      if (lastPage.comments.length < 20) return undefined;
      return lastPage.nextPage;
    },
    initialPageParam: 0,
    enabled: !!postId,
  });
};

/**
 * Add comment mutation
 */
export const useAddComment = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ postId, text }) => {
      const { data, error } = await database.addComment(postId, text);
      if (error) throw new Error(error);
      return data;
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.comments.byPost(variables.postId, 0),
      });
    },
  });
};

// ============================================
// INTERESTS & EXPERTISE HOOKS
// ============================================

/**
 * Get all interests
 */
export const useInterests = () => {
  return useQuery({
    queryKey: queryKeys.interests.all(),
    queryFn: async () => {
      const { data, error } = await database.getInterests();
      if (error) throw new Error(error);
      return data || [];
    },
    staleTime: 60 * 60 * 1000, // 1 hour (rarely changes)
  });
};

/**
 * Get all expertise
 */
export const useExpertise = () => {
  return useQuery({
    queryKey: queryKeys.expertise.all(),
    queryFn: async () => {
      const { data, error } = await database.getExpertise();
      if (error) throw new Error(error);
      return data || [];
    },
    staleTime: 60 * 60 * 1000,
  });
};

/**
 * Save user interests mutation
 */
export const useSaveInterests = () => {
  return useMutation({
    mutationFn: async (interestIds) => {
      const { error } = await database.saveUserInterests(interestIds);
      if (error) throw new Error(error);
      return true;
    },
  });
};

// ============================================
// UTILITY HOOKS
// ============================================

/**
 * Prefetch profile data
 */
export const usePrefetchProfile = () => {
  const queryClient = useQueryClient();

  return (userId) => {
    queryClient.prefetchQuery({
      queryKey: queryKeys.user.profile(userId),
      queryFn: async () => {
        const { data } = await database.getProfileById(userId);
        return data;
      },
      staleTime: 5 * 60 * 1000,
    });
  };
};

/**
 * Invalidate all user-related queries (for logout)
 */
export const useInvalidateUserQueries = () => {
  const queryClient = useQueryClient();

  return () => {
    queryClient.removeQueries({ queryKey: queryKeys.user.all });
    queryClient.removeQueries({ queryKey: queryKeys.posts.all });
    queryClient.removeQueries({ queryKey: ['follows'] });
    queryClient.removeQueries({ queryKey: ['likes'] });
  };
};

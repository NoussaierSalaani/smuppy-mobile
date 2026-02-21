/**
 * React Query Hooks
 * Custom hooks for data fetching with caching, offline support, and optimistic updates
 */

import { useEffect } from 'react';
import { useQuery, useMutation, useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../../lib/queryClient';
import * as database from '../../services/database';
import type { Post, Profile } from '../../services/database';
import { useUserStore } from '../../stores/userStore';
import { useFeedStore } from '../../stores/feedStore';
import { resolveDisplayName } from '../../types/profile';

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
      // Don't throw for "Not authenticated" - just return null
      // This happens when user is not logged in or session expired
      if (error) {
        const errorMsg = typeof error === 'string' ? error : (error as { message?: string })?.message;
        if (errorMsg === 'Not authenticated') {
          if (__DEV__) console.log('[useCurrentProfile] Not authenticated, returning null');
          return null;
        }
        // For other errors, log but don't throw - return null for resilience
        if (__DEV__) console.warn('[useCurrentProfile] Error fetching profile:', error);
        return null;
      }
      return data;
    },
    staleTime: 10 * 60 * 1000,
    retry: 1, // Retry once in case of transient errors
  });
};

/**
 * Get profile by ID
 */
export const useProfile = (userId: string | null | undefined) => {
  return useQuery({
    queryKey: queryKeys.user.profile(userId || ''),
    queryFn: async () => {
      const { data, error } = await database.getProfileById(userId!);
      if (error) throw new Error(error);
      return data;
    },
    enabled: !!userId,
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchOnMount: true, // Refetch on mount if stale
  });
};

/**
 * Helper to convert database Profile to Zustand User format
 */
const convertProfileToUser = (profile: Profile) => ({
  id: profile.id,
  username: profile.username,
  fullName: profile.full_name,
  displayName: resolveDisplayName(profile, profile.display_name || profile.full_name || ''),
  avatar: profile.avatar_url || null,
  coverImage: profile.cover_url || null,
  bio: profile.bio || '',
  accountType: profile.account_type as 'personal' | 'pro_creator' | 'pro_business',
  isVerified: !!profile.is_verified,
  isPremium: !!profile.is_premium,
  interests: profile.interests || [],
  expertise: profile.expertise || [],
  businessName: profile.business_name || '',
  businessCategory: profile.business_category || '',
  businessAddress: profile.business_address || '',
  businessLatitude: profile.business_latitude,
  businessLongitude: profile.business_longitude,
  stats: {
    fans: profile.fan_count || 0,
    posts: profile.post_count || 0,
    following: profile.following_count || 0,
  },
});

/**
 * Update profile mutation
 * Auto-syncs with Zustand store and invalidates relevant caches
 */
export const useUpdateProfile = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (updates: Record<string, unknown>) => {
      const { data, error } = await database.updateProfile(updates);
      if (error) throw new Error(error);
      return data;
    },
    onSuccess: (data) => {
      if (!data) return;

      // 1. Update React Query cache for current user
      queryClient.setQueryData(queryKeys.user.current(), data);

      // 2. Auto-sync with Zustand store (no manual call needed in components)
      const userStore = useUserStore.getState();
      userStore.setUser(convertProfileToUser(data));

      // 3. Invalidate profile cache for this user (others viewing this profile)
      queryClient.invalidateQueries({
        queryKey: queryKeys.user.profile(data.id),
      });

      // 4. Invalidate followers/following lists that may display this profile
      queryClient.invalidateQueries({
        predicate: (query) => {
          const key = query.queryKey;
          return Array.isArray(key) && key[0] === 'follows';
        },
      });
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
  const setFeedCache = useFeedStore((state) => state.setFeedCache);

  const query = useInfiniteQuery({
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
  });

  // Update feed cache when data changes (in useEffect to avoid render-loop)
  const queryData = query.data;
  useEffect(() => {
    if (queryData) {
      const allPosts = queryData.pages.flatMap((page) => page.posts);
      setFeedCache(allPosts);
    }
  }, [queryData, setFeedCache]);

  return query;
};

/**
 * Get posts by user
 */
export const useUserPosts = (userId: string | null | undefined) => {
  return useInfiniteQuery({
    queryKey: queryKeys.posts.byUser(userId || ''),
    queryFn: async ({ pageParam = 0 }) => {
      const { data, error } = await database.getPostsByUser(userId!, pageParam, 10);
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
  const prependToFeed = useFeedStore((state) => state.prependToFeed);

  return useMutation({
    mutationFn: async (postData: Partial<Post>) => {
      const { data, error } = await database.createPost(postData);
      if (error) throw new Error(error);
      return data;
    },
    onSuccess: (newPost) => {
      // Optimistically add to feed
      if (newPost) {
        prependToFeed(newPost);
      }
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
  const removeFromFeed = useFeedStore((state) => state.removeFromFeed);

  return useMutation({
    mutationFn: async (postId: string) => {
      const { error } = await database.deletePost(postId);
      if (error) throw new Error(error);
      return postId;
    },
    onMutate: async (postId: string) => {
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
export const useHasLiked = (postId: string | null | undefined) => {
  return useQuery({
    queryKey: queryKeys.likes.hasLiked(postId || ''),
    queryFn: async () => {
      const { hasLiked } = await database.hasLikedPost(postId!);
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
  const toggleLikeOptimistic = useFeedStore((state) => state.toggleLikeOptimistic);

  return useMutation({
    mutationFn: async ({ postId, liked }: { postId: string; liked: boolean }) => {
      // Single toggle endpoint: backend returns { liked: true/false }
      const { error } = await database.likePost(postId);
      if (error) throw new Error(error);
      return { postId, liked: !liked };
    },
    onMutate: async ({ postId, liked }: { postId: string; liked: boolean }) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: queryKeys.likes.hasLiked(postId) });

      // Snapshot previous value
      const previousValue = queryClient.getQueryData(queryKeys.likes.hasLiked(postId));

      // Optimistically update
      queryClient.setQueryData(queryKeys.likes.hasLiked(postId), !liked);
      toggleLikeOptimistic(postId, !liked);

      return { previousValue, postId };
    },
    onError: (_err, _variables, context) => {
      // Rollback on error
      if (context?.previousValue !== undefined) {
        queryClient.setQueryData(
          queryKeys.likes.hasLiked(context.postId),
          context.previousValue
        );
        toggleLikeOptimistic(context.postId, context.previousValue as boolean);
      }
    },
  });
};

// ============================================
// COLLECTIONS HOOKS (Saved Posts)
// ============================================

/**
 * Check if user saved a post
 */
export const useHasSavedPost = (postId: string | null | undefined) => {
  return useQuery({
    queryKey: queryKeys.collections.hasSaved(postId || ''),
    queryFn: async () => {
      const { saved } = await database.hasSavedPost(postId!);
      return saved;
    },
    enabled: !!postId,
    staleTime: 60 * 1000,
  });
};

/**
 * Get user's saved posts (collections)
 */
export const useSavedPosts = () => {
  return useInfiniteQuery({
    queryKey: queryKeys.collections.saved(),
    queryFn: async ({ pageParam }: { pageParam: string | undefined }) => {
      const { data, error, nextCursor, hasMore } = await database.getSavedPosts(pageParam, 20);
      if (error) throw new Error(error);
      return { posts: data || [], nextCursor, hasMore };
    },
    getNextPageParam: (lastPage) => {
      if (!lastPage.hasMore || !lastPage.nextCursor) return undefined;
      return lastPage.nextCursor;
    },
    initialPageParam: undefined as string | undefined,
  });
};

/**
 * Toggle save post mutation
 */
export const useToggleSavePost = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ postId, isSaved }: { postId: string; isSaved: boolean }) => {
      if (isSaved) {
        const { error } = await database.unsavePost(postId);
        if (error) throw new Error(error);
        return { postId, saved: false };
      } else {
        const { error } = await database.savePost(postId);
        if (error) throw new Error(error);
        return { postId, saved: true };
      }
    },
    onMutate: async ({ postId, isSaved }: { postId: string; isSaved: boolean }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.collections.hasSaved(postId) });
      const previousValue = queryClient.getQueryData(queryKeys.collections.hasSaved(postId));
      queryClient.setQueryData(queryKeys.collections.hasSaved(postId), !isSaved);
      return { previousValue, postId };
    },
    onError: (_err, _variables, context) => {
      if (context?.previousValue !== undefined) {
        queryClient.setQueryData(
          queryKeys.collections.hasSaved(context.postId),
          context.previousValue
        );
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.collections.saved() });
    },
  });
};

// ============================================
// FOLLOWS HOOKS
// ============================================

/**
 * Check if following a user
 */
export const useIsFollowing = (userId: string | null | undefined) => {
  return useQuery({
    queryKey: queryKeys.follows.isFollowing(userId || ''),
    queryFn: async () => {
      const { following } = await database.isFollowing(userId!);
      return following;
    },
    enabled: !!userId,
    staleTime: 2 * 60 * 1000,
  });
};

/**
 * Get followers
 */
export const useFollowers = (userId: string | null | undefined) => {
  return useInfiniteQuery({
    queryKey: queryKeys.follows.followers(userId || ''),
    queryFn: async ({ pageParam }: { pageParam: string | undefined }) => {
      const { data, error, nextCursor, hasMore } = await database.getFollowers(userId!, pageParam, 20);
      if (error) throw new Error(error);
      return { users: data || [], nextCursor, hasMore };
    },
    getNextPageParam: (lastPage) => {
      if (!lastPage.hasMore || !lastPage.nextCursor) return undefined;
      return lastPage.nextCursor;
    },
    initialPageParam: undefined as string | undefined,
    enabled: !!userId,
  });
};

/**
 * Get following
 */
export const useFollowing = (userId: string | null | undefined) => {
  return useInfiniteQuery({
    queryKey: queryKeys.follows.following(userId || ''),
    queryFn: async ({ pageParam }: { pageParam: string | undefined }) => {
      const { data, error, nextCursor, hasMore } = await database.getFollowing(userId!, pageParam, 20);
      if (error) throw new Error(error);
      return { users: data || [], nextCursor, hasMore };
    },
    getNextPageParam: (lastPage) => {
      if (!lastPage.hasMore || !lastPage.nextCursor) return undefined;
      return lastPage.nextCursor;
    },
    initialPageParam: undefined as string | undefined,
    enabled: !!userId,
  });
};

/**
 * Follow/Unfollow mutation
 */
export const useToggleFollow = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ userId, isFollowing }: { userId: string; isFollowing: boolean }) => {
      if (isFollowing) {
        const result = await database.unfollowUser(userId);
        if (result.error) throw new Error(result.error);
        return { userId, following: false, cooldown: result.cooldown };
      } else {
        const result = await database.followUser(userId);
        if (result.cooldown?.blocked) {
          throw new Error(`Please wait ${result.cooldown.daysRemaining} more day${result.cooldown.daysRemaining > 1 ? 's' : ''} before becoming a fan again.`);
        }
        if (result.error) throw new Error(result.error);
        return { userId, following: true, requestCreated: result.requestCreated };
      }
    },
    onMutate: async ({ userId, isFollowing }: { userId: string; isFollowing: boolean }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.follows.isFollowing(userId) });
      const previousValue = queryClient.getQueryData(queryKeys.follows.isFollowing(userId));
      queryClient.setQueryData(queryKeys.follows.isFollowing(userId), !isFollowing);

      // Optimistically update profile fan_count
      const profileData = queryClient.getQueryData(queryKeys.user.profile(userId)) as database.Profile | undefined;
      if (profileData) {
        const currentFanCount = profileData.fan_count || 0;
        queryClient.setQueryData(queryKeys.user.profile(userId), {
          ...profileData,
          fan_count: isFollowing ? Math.max(0, currentFanCount - 1) : currentFanCount + 1,
        });
      }

      return { previousValue, userId, previousProfileData: profileData };
    },
    onError: (_err, _variables, context) => {
      if (context?.previousValue !== undefined) {
        queryClient.setQueryData(
          queryKeys.follows.isFollowing(context.userId),
          context.previousValue
        );
      }
      // Rollback profile data on error
      if (context?.previousProfileData) {
        queryClient.setQueryData(
          queryKeys.user.profile(context.userId),
          context.previousProfileData
        );
      }
    },
    onSettled: (_data, _error, variables) => {
      // Invalidate followers/following lists
      queryClient.invalidateQueries({ queryKey: ['follows'] });
      // Invalidate the user's profile to get fresh fan_count
      queryClient.invalidateQueries({ queryKey: queryKeys.user.profile(variables.userId) });
    },
  });
};

// ============================================
// COMMENTS HOOKS
// ============================================

/**
 * Get comments for a post
 */
export const usePostComments = (postId: string | null | undefined) => {
  return useInfiniteQuery({
    queryKey: queryKeys.comments.byPost(postId || ''),
    queryFn: async ({ pageParam }: { pageParam: string | undefined }) => {
      const { data, error, nextCursor, hasMore } = await database.getPostComments(postId!, pageParam, 20);
      if (error) throw new Error(error);
      return { comments: data || [], nextCursor, hasMore };
    },
    getNextPageParam: (lastPage) => {
      if (!lastPage.hasMore || !lastPage.nextCursor) return undefined;
      return lastPage.nextCursor;
    },
    initialPageParam: undefined as string | undefined,
    enabled: !!postId,
  });
};

/**
 * Add comment mutation
 */
export const useAddComment = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ postId, text }: { postId: string; text: string }) => {
      const { data, error } = await database.addComment(postId, text);
      if (error) throw new Error(error);
      return data;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.comments.byPost(variables.postId),
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
    mutationFn: async (interestIds: string[]) => {
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

  return (userId: string) => {
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
    queryClient.removeQueries({ queryKey: queryKeys.spots.all });
  };
};

// ============================================
// SPOTS HOOKS
// ============================================

/**
 * Get spots feed with infinite scroll
 */
export const useSpots = () => {
  return useInfiniteQuery({
    queryKey: queryKeys.spots.all,
    queryFn: async ({ pageParam = 0 }) => {
      const { data, error } = await database.getSpots(pageParam, 20);
      if (error) throw new Error(error);
      return { spots: data || [], nextPage: pageParam + 1 };
    },
    getNextPageParam: (lastPage) => {
      if (lastPage.spots.length < 20) return undefined;
      return lastPage.nextPage;
    },
    initialPageParam: 0,
    staleTime: 5 * 60 * 1000,
  });
};

/**
 * Get a single spot by ID
 */
export const useSpot = (spotId: string | null | undefined) => {
  return useQuery({
    queryKey: queryKeys.spots.single(spotId || ''),
    queryFn: async () => {
      const { data, error } = await database.getSpotById(spotId!);
      if (error) throw new Error(error);
      return data;
    },
    enabled: !!spotId,
  });
};

/**
 * Get spots by creator
 */
export const useSpotsByCreator = (creatorId: string | null | undefined) => {
  return useInfiniteQuery({
    queryKey: queryKeys.spots.byCreator(creatorId || ''),
    queryFn: async ({ pageParam = 0 }) => {
      const { data, error } = await database.getSpotsByCreator(creatorId!, pageParam, 20);
      if (error) throw new Error(error);
      return { spots: data || [], nextPage: pageParam + 1 };
    },
    getNextPageParam: (lastPage) => {
      if (lastPage.spots.length < 20) return undefined;
      return lastPage.nextPage;
    },
    initialPageParam: 0,
    enabled: !!creatorId,
  });
};

/**
 * Get spots by category
 */
export const useSpotsByCategory = (category: string | null | undefined) => {
  return useInfiniteQuery({
    queryKey: queryKeys.spots.byCategory(category || ''),
    queryFn: async ({ pageParam = 0 }) => {
      const { data, error } = await database.getSpotsByCategory(category!, pageParam, 20);
      if (error) throw new Error(error);
      return { spots: data || [], nextPage: pageParam + 1 };
    },
    getNextPageParam: (lastPage) => {
      if (lastPage.spots.length < 20) return undefined;
      return lastPage.nextPage;
    },
    initialPageParam: 0,
    enabled: !!category,
  });
};

/**
 * Get spots by sport type
 */
export const useSpotsBySportType = (sportType: string | null | undefined) => {
  return useInfiniteQuery({
    queryKey: queryKeys.spots.bySportType(sportType || ''),
    queryFn: async ({ pageParam = 0 }) => {
      const { data, error } = await database.getSpotsBySportType(sportType!, pageParam, 20);
      if (error) throw new Error(error);
      return { spots: data || [], nextPage: pageParam + 1 };
    },
    getNextPageParam: (lastPage) => {
      if (lastPage.spots.length < 20) return undefined;
      return lastPage.nextPage;
    },
    initialPageParam: 0,
    enabled: !!sportType,
  });
};

/**
 * Find nearby spots
 */
export const useNearbySpots = (
  latitude: number | null | undefined,
  longitude: number | null | undefined,
  radiusKm = 10
) => {
  return useQuery({
    queryKey: queryKeys.spots.nearby(latitude || 0, longitude || 0, radiusKm),
    queryFn: async () => {
      const { data, error } = await database.findNearbySpots(latitude!, longitude!, radiusKm);
      if (error) throw new Error(error);
      return data || [];
    },
    enabled: !!latitude && !!longitude,
    staleTime: 2 * 60 * 1000,
  });
};

/**
 * Create spot mutation
 */
export const useCreateSpot = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (spotData: Partial<database.Spot>) => {
      const { data, error } = await database.createSpot(spotData);
      if (error) throw new Error(error);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.spots.all });
    },
  });
};

/**
 * Update spot mutation
 */
export const useUpdateSpot = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ spotId, updates }: { spotId: string; updates: Partial<database.Spot> }) => {
      const { data, error } = await database.updateSpot(spotId, updates);
      if (error) throw new Error(error);
      return data;
    },
    onSuccess: (data) => {
      if (data) {
        queryClient.setQueryData(queryKeys.spots.single(data.id), data);
        queryClient.invalidateQueries({ queryKey: queryKeys.spots.all });
      }
    },
  });
};

/**
 * Delete spot mutation
 */
export const useDeleteSpot = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (spotId: string) => {
      const { error } = await database.deleteSpot(spotId);
      if (error) throw new Error(error);
      return spotId;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.spots.all });
    },
  });
};

// ============================================
// SPOT SAVES HOOKS
// ============================================

/**
 * Check if user saved a spot
 */
export const useHasSavedSpot = (spotId: string | null | undefined) => {
  return useQuery({
    queryKey: queryKeys.spots.hasSaved(spotId || ''),
    queryFn: async () => {
      const { saved } = await database.hasSavedSpot(spotId!);
      return saved;
    },
    enabled: !!spotId,
    staleTime: 60 * 1000,
  });
};

/**
 * Get user's saved spots
 */
export const useSavedSpots = () => {
  return useInfiniteQuery({
    queryKey: queryKeys.spots.saved(),
    queryFn: async ({ pageParam = 0 }) => {
      const { data, error } = await database.getSavedSpots(pageParam, 20);
      if (error) throw new Error(error);
      return { spots: data || [], nextPage: pageParam + 1 };
    },
    getNextPageParam: (lastPage) => {
      if (lastPage.spots.length < 20) return undefined;
      return lastPage.nextPage;
    },
    initialPageParam: 0,
  });
};

/**
 * Toggle save spot mutation
 */
export const useToggleSaveSpot = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ spotId, isSaved }: { spotId: string; isSaved: boolean }) => {
      if (isSaved) {
        const { error } = await database.unsaveSpot(spotId);
        if (error) throw new Error(error);
        return { spotId, saved: false };
      } else {
        const { error } = await database.saveSpot(spotId);
        if (error) throw new Error(error);
        return { spotId, saved: true };
      }
    },
    onMutate: async ({ spotId, isSaved }: { spotId: string; isSaved: boolean }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.spots.hasSaved(spotId) });
      const previousValue = queryClient.getQueryData(queryKeys.spots.hasSaved(spotId));
      queryClient.setQueryData(queryKeys.spots.hasSaved(spotId), !isSaved);
      return { previousValue, spotId };
    },
    onError: (_err, _variables, context) => {
      if (context?.previousValue !== undefined) {
        queryClient.setQueryData(
          queryKeys.spots.hasSaved(context.spotId),
          context.previousValue
        );
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.spots.saved() });
    },
  });
};

// ============================================
// SPOT REVIEWS HOOKS
// ============================================

/**
 * Get reviews for a spot
 */
export const useSpotReviews = (spotId: string | null | undefined) => {
  return useInfiniteQuery({
    queryKey: queryKeys.spots.reviews(spotId || ''),
    queryFn: async ({ pageParam = 0 }) => {
      const { data, error } = await database.getSpotReviews(spotId!, pageParam, 20);
      if (error) throw new Error(error);
      return { reviews: data || [], nextPage: pageParam + 1 };
    },
    getNextPageParam: (lastPage) => {
      if (lastPage.reviews.length < 20) return undefined;
      return lastPage.nextPage;
    },
    initialPageParam: 0,
    enabled: !!spotId,
  });
};

/**
 * Add spot review mutation
 */
export const useAddSpotReview = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      spotId,
      rating,
      comment,
      images,
    }: {
      spotId: string;
      rating: number;
      comment?: string;
      images?: string[];
    }) => {
      const { data, error } = await database.addSpotReview(spotId, rating, comment, images);
      if (error) throw new Error(error);
      return data;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.spots.reviews(variables.spotId),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.spots.single(variables.spotId),
      });
    },
  });
};

/**
 * Delete spot review mutation
 */
export const useDeleteSpotReview = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (spotId: string) => {
      const { error } = await database.deleteSpotReview(spotId);
      if (error) throw new Error(error);
      return spotId;
    },
    onSuccess: (spotId) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.spots.reviews(spotId),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.spots.single(spotId),
      });
    },
  });
};

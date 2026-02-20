/**
 * React Query Hooks Tests
 *
 * Tests for all query/mutation hooks exported from hooks/queries/index.ts.
 * Strategy: mock useQuery/useMutation/useInfiniteQuery/useQueryClient to capture
 * the config objects, then verify queryKey, enabled logic, queryFn behaviour,
 * and mutation callbacks.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(global as any).__DEV__ = true;

// ---------------------------------------------------------------------------
// Database service mock
// ---------------------------------------------------------------------------
const mockGetCurrentProfile = jest.fn();
const mockGetProfileById = jest.fn();
const mockUpdateProfile = jest.fn();
const mockGetFeedPosts = jest.fn();
const mockGetPostsByUser = jest.fn();
const mockCreatePost = jest.fn();
const mockDeletePost = jest.fn();
const mockHasLikedPost = jest.fn();
const mockLikePost = jest.fn();
const mockHasSavedPost = jest.fn();
const mockGetSavedPosts = jest.fn();
const mockSavePost = jest.fn();
const mockUnsavePost = jest.fn();
const mockIsFollowing = jest.fn();
const mockGetFollowers = jest.fn();
const mockGetFollowing = jest.fn();
const mockFollowUser = jest.fn();
const mockUnfollowUser = jest.fn();
const mockGetPostComments = jest.fn();
const mockAddComment = jest.fn();
const mockGetInterests = jest.fn();
const mockGetExpertise = jest.fn();
const mockSaveUserInterests = jest.fn();
const mockGetSpots = jest.fn();
const mockGetSpotById = jest.fn();
const mockGetSpotsByCreator = jest.fn();
const mockGetSpotsByCategory = jest.fn();
const mockGetSpotsBySportType = jest.fn();
const mockFindNearbySpots = jest.fn();
const mockCreateSpot = jest.fn();
const mockUpdateSpot = jest.fn();
const mockDeleteSpot = jest.fn();
const mockHasSavedSpot = jest.fn();
const mockGetSavedSpots = jest.fn();
const mockSaveSpot = jest.fn();
const mockUnsaveSpot = jest.fn();
const mockGetSpotReviews = jest.fn();
const mockAddSpotReview = jest.fn();
const mockDeleteSpotReview = jest.fn();

jest.mock('../../services/database', () => ({
  getCurrentProfile: (...a: unknown[]) => mockGetCurrentProfile(...a),
  getProfileById: (...a: unknown[]) => mockGetProfileById(...a),
  updateProfile: (...a: unknown[]) => mockUpdateProfile(...a),
  getFeedPosts: (...a: unknown[]) => mockGetFeedPosts(...a),
  getPostsByUser: (...a: unknown[]) => mockGetPostsByUser(...a),
  createPost: (...a: unknown[]) => mockCreatePost(...a),
  deletePost: (...a: unknown[]) => mockDeletePost(...a),
  hasLikedPost: (...a: unknown[]) => mockHasLikedPost(...a),
  likePost: (...a: unknown[]) => mockLikePost(...a),
  hasSavedPost: (...a: unknown[]) => mockHasSavedPost(...a),
  getSavedPosts: (...a: unknown[]) => mockGetSavedPosts(...a),
  savePost: (...a: unknown[]) => mockSavePost(...a),
  unsavePost: (...a: unknown[]) => mockUnsavePost(...a),
  isFollowing: (...a: unknown[]) => mockIsFollowing(...a),
  getFollowers: (...a: unknown[]) => mockGetFollowers(...a),
  getFollowing: (...a: unknown[]) => mockGetFollowing(...a),
  followUser: (...a: unknown[]) => mockFollowUser(...a),
  unfollowUser: (...a: unknown[]) => mockUnfollowUser(...a),
  getPostComments: (...a: unknown[]) => mockGetPostComments(...a),
  addComment: (...a: unknown[]) => mockAddComment(...a),
  getInterests: (...a: unknown[]) => mockGetInterests(...a),
  getExpertise: (...a: unknown[]) => mockGetExpertise(...a),
  saveUserInterests: (...a: unknown[]) => mockSaveUserInterests(...a),
  getSpots: (...a: unknown[]) => mockGetSpots(...a),
  getSpotById: (...a: unknown[]) => mockGetSpotById(...a),
  getSpotsByCreator: (...a: unknown[]) => mockGetSpotsByCreator(...a),
  getSpotsByCategory: (...a: unknown[]) => mockGetSpotsByCategory(...a),
  getSpotsBySportType: (...a: unknown[]) => mockGetSpotsBySportType(...a),
  findNearbySpots: (...a: unknown[]) => mockFindNearbySpots(...a),
  createSpot: (...a: unknown[]) => mockCreateSpot(...a),
  updateSpot: (...a: unknown[]) => mockUpdateSpot(...a),
  deleteSpot: (...a: unknown[]) => mockDeleteSpot(...a),
  hasSavedSpot: (...a: unknown[]) => mockHasSavedSpot(...a),
  getSavedSpots: (...a: unknown[]) => mockGetSavedSpots(...a),
  saveSpot: (...a: unknown[]) => mockSaveSpot(...a),
  unsaveSpot: (...a: unknown[]) => mockUnsaveSpot(...a),
  getSpotReviews: (...a: unknown[]) => mockGetSpotReviews(...a),
  addSpotReview: (...a: unknown[]) => mockAddSpotReview(...a),
  deleteSpotReview: (...a: unknown[]) => mockDeleteSpotReview(...a),
}));

// ---------------------------------------------------------------------------
// React Query mock — captures config objects
// ---------------------------------------------------------------------------
interface QueryConfig {
  queryKey: unknown[];
  queryFn: (...args: unknown[]) => unknown;
  enabled?: boolean;
  staleTime?: number;
  [k: string]: unknown;
}
interface MutationConfig {
  mutationFn: (...args: unknown[]) => unknown;
  onSuccess?: (...args: unknown[]) => void;
  onMutate?: (...args: unknown[]) => unknown;
  onError?: (...args: unknown[]) => void;
  onSettled?: (...args: unknown[]) => void;
  [k: string]: unknown;
}
interface InfiniteQueryConfig {
  queryKey: unknown[];
  queryFn: (...args: unknown[]) => unknown;
  getNextPageParam: (lastPage: unknown) => unknown;
  initialPageParam: unknown;
  enabled?: boolean;
  [k: string]: unknown;
}

let lastQueryConfig: QueryConfig | null = null;
let lastMutationConfig: MutationConfig | null = null;
let lastInfiniteQueryConfig: InfiniteQueryConfig | null = null;

const mockSetQueryData = jest.fn();
const mockInvalidateQueries = jest.fn();
const mockRemoveQueries = jest.fn();
const mockCancelQueries = jest.fn();
const mockGetQueryData = jest.fn();
const mockPrefetchQuery = jest.fn();

const mockQueryClient = {
  setQueryData: mockSetQueryData,
  invalidateQueries: mockInvalidateQueries,
  removeQueries: mockRemoveQueries,
  cancelQueries: mockCancelQueries,
  getQueryData: mockGetQueryData,
  prefetchQuery: mockPrefetchQuery,
};

jest.mock('@tanstack/react-query', () => ({
  useQuery: jest.fn((config: QueryConfig) => {
    lastQueryConfig = config;
    return { data: undefined, isLoading: false, error: null };
  }),
  useMutation: jest.fn((config: MutationConfig) => {
    lastMutationConfig = config;
    return { mutate: jest.fn(), mutateAsync: jest.fn(), isLoading: false };
  }),
  useInfiniteQuery: jest.fn((config: InfiniteQueryConfig) => {
    lastInfiniteQueryConfig = config;
    return { data: undefined, isLoading: false, fetchNextPage: jest.fn() };
  }),
  useQueryClient: jest.fn(() => mockQueryClient),
}));

// ---------------------------------------------------------------------------
// Query keys mock
// ---------------------------------------------------------------------------
jest.mock('../../lib/queryClient', () => ({
  queryKeys: {
    user: {
      all: ['user'],
      profile: (id: string) => ['user', 'profile', id],
      current: () => ['user', 'current'],
    },
    posts: {
      all: ['posts'],
      feed: () => ['posts', 'feed'],
      byUser: (userId: string) => ['posts', 'user', userId],
      single: (id: string) => ['posts', 'detail', id],
    },
    follows: {
      followers: (userId: string) => ['follows', 'followers', userId],
      following: (userId: string) => ['follows', 'following', userId],
      isFollowing: (userId: string) => ['follows', 'check', userId],
    },
    likes: {
      hasLiked: (postId: string) => ['likes', 'check', postId],
    },
    collections: {
      all: ['collections'],
      saved: () => ['collections', 'saved'],
      hasSaved: (postId: string) => ['collections', 'saved', 'check', postId],
    },
    comments: {
      byPost: (postId: string) => ['comments', postId],
    },
    interests: {
      all: () => ['interests'],
    },
    expertise: {
      all: () => ['expertise'],
    },
    spots: {
      all: ['spots'],
      feed: () => ['spots', 'feed'],
      single: (id: string) => ['spots', 'detail', id],
      byCreator: (creatorId: string) => ['spots', 'creator', creatorId],
      byCategory: (category: string) => ['spots', 'category', category],
      bySportType: (sportType: string) => ['spots', 'sport', sportType],
      nearby: (lat: number, lon: number, radius: number) => ['spots', 'nearby', lat, lon, radius],
      saved: () => ['spots', 'saved'],
      hasSaved: (spotId: string) => ['spots', 'saved', 'check', spotId],
      reviews: (spotId: string) => ['spots', 'reviews', spotId],
    },
  },
}));

// ---------------------------------------------------------------------------
// Stores mock
// ---------------------------------------------------------------------------
const mockSetUser = jest.fn();
const mockSetFeedCache = jest.fn();
const mockPrependToFeed = jest.fn();
const mockRemoveFromFeed = jest.fn();
const mockToggleLikeOptimistic = jest.fn();

jest.mock('../../stores/userStore', () => ({
  useUserStore: {
    getState: () => ({ setUser: mockSetUser }),
  },
}));

jest.mock('../../stores/feedStore', () => ({
  useFeedStore: jest.fn((selector: (state: Record<string, unknown>) => unknown) => {
    const state = {
      setFeedCache: mockSetFeedCache,
      prependToFeed: mockPrependToFeed,
      removeFromFeed: mockRemoveFromFeed,
      toggleLikeOptimistic: mockToggleLikeOptimistic,
    };
    return selector(state);
  }),
}));

// Mock useEffect to run callbacks immediately
jest.mock('react', () => ({
  useEffect: jest.fn((fn: () => void) => fn()),
}));

// ---------------------------------------------------------------------------
// Imports — after mocks
// ---------------------------------------------------------------------------
import {
  useCurrentProfile,
  useProfile,
  useUpdateProfile,
  useFeedPosts,
  useUserPosts,
  useCreatePost,
  useDeletePost,
  useHasLiked,
  useToggleLike,
  useHasSavedPost,
  useSavedPosts,
  useToggleSavePost,
  useIsFollowing,
  useFollowers,
  useFollowing,
  useToggleFollow,
  usePostComments,
  useAddComment,
  useInterests,
  useExpertise,
  useSaveInterests,
  usePrefetchProfile,
  useInvalidateUserQueries,
  useSpots,
  useSpot,
  useSpotsByCreator,
  useSpotsByCategory,
  useSpotsBySportType,
  useNearbySpots,
  useCreateSpot,
  useUpdateSpot,
  useDeleteSpot,
  useHasSavedSpot,
  useSavedSpots,
  useToggleSaveSpot,
  useSpotReviews,
  useAddSpotReview,
  useDeleteSpotReview,
} from '../../hooks/queries';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('hooks/queries', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    lastQueryConfig = null;
    lastMutationConfig = null;
    lastInfiniteQueryConfig = null;
  });

  // =========================================================================
  // USER HOOKS
  // =========================================================================
  describe('useCurrentProfile', () => {
    it('uses correct queryKey', () => {
      useCurrentProfile();
      expect(lastQueryConfig?.queryKey).toEqual(['user', 'current']);
    });

    it('has 10min staleTime', () => {
      useCurrentProfile();
      expect(lastQueryConfig?.staleTime).toBe(10 * 60 * 1000);
    });

    it('queryFn returns data on success', async () => {
      const profile = { id: 'u1', username: 'test' };
      mockGetCurrentProfile.mockResolvedValue({ data: profile, error: null });

      useCurrentProfile();
      const result = await lastQueryConfig!.queryFn();
      expect(result).toEqual(profile);
    });

    it('queryFn returns null when not authenticated', async () => {
      mockGetCurrentProfile.mockResolvedValue({ data: null, error: 'Not authenticated' });

      useCurrentProfile();
      const result = await lastQueryConfig!.queryFn();
      expect(result).toBeNull();
    });

    it('queryFn returns null on other errors (resilient)', async () => {
      mockGetCurrentProfile.mockResolvedValue({ data: null, error: 'DB timeout' });

      useCurrentProfile();
      const result = await lastQueryConfig!.queryFn();
      expect(result).toBeNull();
    });

    it('queryFn handles error as object with message', async () => {
      mockGetCurrentProfile.mockResolvedValue({ data: null, error: { message: 'Not authenticated' } });

      useCurrentProfile();
      const result = await lastQueryConfig!.queryFn();
      expect(result).toBeNull();
    });
  });

  describe('useProfile', () => {
    it('uses correct queryKey with userId', () => {
      useProfile('user-123');
      expect(lastQueryConfig?.queryKey).toEqual(['user', 'profile', 'user-123']);
    });

    it('is disabled when userId is null', () => {
      useProfile(null);
      expect(lastQueryConfig?.enabled).toBe(false);
    });

    it('is disabled when userId is undefined', () => {
      useProfile(undefined);
      expect(lastQueryConfig?.enabled).toBe(false);
    });

    it('is enabled when userId is provided', () => {
      useProfile('user-123');
      expect(lastQueryConfig?.enabled).toBe(true);
    });

    it('queryFn calls getProfileById', async () => {
      const profile = { id: 'user-123', username: 'test' };
      mockGetProfileById.mockResolvedValue({ data: profile, error: null });

      useProfile('user-123');
      const result = await lastQueryConfig!.queryFn();
      expect(mockGetProfileById).toHaveBeenCalledWith('user-123');
      expect(result).toEqual(profile);
    });

    it('queryFn throws on error', async () => {
      mockGetProfileById.mockResolvedValue({ data: null, error: 'Not found' });

      useProfile('user-123');
      await expect(lastQueryConfig!.queryFn()).rejects.toThrow('Not found');
    });
  });

  describe('useUpdateProfile', () => {
    it('mutationFn calls updateProfile', async () => {
      const updates = { username: 'new' };
      const updatedProfile = { id: 'u1', username: 'new', full_name: 'Test', account_type: 'personal' };
      mockUpdateProfile.mockResolvedValue({ data: updatedProfile, error: null });

      useUpdateProfile();
      const result = await lastMutationConfig!.mutationFn(updates);
      expect(mockUpdateProfile).toHaveBeenCalledWith(updates);
      expect(result).toEqual(updatedProfile);
    });

    it('mutationFn throws on error', async () => {
      mockUpdateProfile.mockResolvedValue({ data: null, error: 'Validation failed' });

      useUpdateProfile();
      await expect(lastMutationConfig!.mutationFn({})).rejects.toThrow('Validation failed');
    });

    it('onSuccess updates queryClient cache and Zustand store', () => {
      useUpdateProfile();
      const profile = {
        id: 'u1',
        username: 'new',
        full_name: 'Test User',
        display_name: 'Test',
        avatar_url: null,
        cover_url: null,
        bio: '',
        account_type: 'personal',
        is_verified: false,
        is_premium: false,
        interests: [],
        expertise: [],
        business_name: '',
        business_category: '',
        business_address: '',
        business_latitude: null,
        business_longitude: null,
        fan_count: 10,
        post_count: 5,
        following_count: 3,
      };
      lastMutationConfig!.onSuccess!(profile);

      expect(mockSetQueryData).toHaveBeenCalledWith(['user', 'current'], profile);
      expect(mockSetUser).toHaveBeenCalled();
      expect(mockInvalidateQueries).toHaveBeenCalled();
    });

    it('onSuccess does nothing when data is null', () => {
      useUpdateProfile();
      lastMutationConfig!.onSuccess!(null);
      expect(mockSetQueryData).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // POSTS HOOKS
  // =========================================================================
  describe('useFeedPosts', () => {
    it('uses correct queryKey', () => {
      useFeedPosts();
      expect(lastInfiniteQueryConfig?.queryKey).toEqual(['posts']);
    });

    it('queryFn calls getFeedPosts with page and limit', async () => {
      mockGetFeedPosts.mockResolvedValue({ data: [{ id: 'p1' }], error: null });

      useFeedPosts();
      const result = await lastInfiniteQueryConfig!.queryFn({ pageParam: 0 });
      expect(mockGetFeedPosts).toHaveBeenCalledWith(0, 10);
      expect(result).toEqual({ posts: [{ id: 'p1' }], nextPage: 1 });
    });

    it('queryFn throws on error', async () => {
      mockGetFeedPosts.mockResolvedValue({ data: null, error: 'Server error' });

      useFeedPosts();
      await expect(lastInfiniteQueryConfig!.queryFn({ pageParam: 0 })).rejects.toThrow('Server error');
    });

    it('getNextPageParam returns undefined when fewer than 10 posts', () => {
      useFeedPosts();
      const result = lastInfiniteQueryConfig!.getNextPageParam({ posts: [1, 2, 3], nextPage: 1 });
      expect(result).toBeUndefined();
    });

    it('getNextPageParam returns nextPage when 10 posts returned', () => {
      useFeedPosts();
      const result = lastInfiniteQueryConfig!.getNextPageParam({
        posts: Array(10).fill({}),
        nextPage: 2,
      });
      expect(result).toBe(2);
    });
  });

  describe('useUserPosts', () => {
    it('is disabled when userId is null', () => {
      useUserPosts(null);
      expect(lastInfiniteQueryConfig?.enabled).toBe(false);
    });

    it('is enabled when userId is provided', () => {
      useUserPosts('user-123');
      expect(lastInfiniteQueryConfig?.enabled).toBe(true);
    });

    it('uses correct queryKey', () => {
      useUserPosts('user-123');
      expect(lastInfiniteQueryConfig?.queryKey).toEqual(['posts', 'user', 'user-123']);
    });

    it('queryFn calls getPostsByUser', async () => {
      mockGetPostsByUser.mockResolvedValue({ data: [], error: null });

      useUserPosts('user-123');
      await lastInfiniteQueryConfig!.queryFn({ pageParam: 0 });
      expect(mockGetPostsByUser).toHaveBeenCalledWith('user-123', 0, 10);
    });
  });

  describe('useCreatePost', () => {
    it('mutationFn calls createPost', async () => {
      const postData = { content: 'Hello' };
      mockCreatePost.mockResolvedValue({ data: { id: 'p1', content: 'Hello' }, error: null });

      useCreatePost();
      const result = await lastMutationConfig!.mutationFn(postData);
      expect(mockCreatePost).toHaveBeenCalledWith(postData);
      expect(result).toEqual({ id: 'p1', content: 'Hello' });
    });

    it('onSuccess prepends to feed and invalidates', () => {
      useCreatePost();
      const newPost = { id: 'p1' };
      lastMutationConfig!.onSuccess!(newPost);
      expect(mockPrependToFeed).toHaveBeenCalledWith(newPost);
      expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ['posts'] });
    });

    it('onSuccess does not prepend null post', () => {
      useCreatePost();
      lastMutationConfig!.onSuccess!(null);
      expect(mockPrependToFeed).not.toHaveBeenCalled();
    });
  });

  describe('useDeletePost', () => {
    it('mutationFn calls deletePost', async () => {
      mockDeletePost.mockResolvedValue({ error: null });

      useDeletePost();
      const result = await lastMutationConfig!.mutationFn('post-1');
      expect(mockDeletePost).toHaveBeenCalledWith('post-1');
      expect(result).toBe('post-1');
    });

    it('onMutate removes from feed optimistically', async () => {
      useDeletePost();
      await lastMutationConfig!.onMutate!('post-1');
      expect(mockRemoveFromFeed).toHaveBeenCalledWith('post-1');
    });
  });

  // =========================================================================
  // LIKES HOOKS
  // =========================================================================
  describe('useHasLiked', () => {
    it('uses correct queryKey', () => {
      useHasLiked('post-1');
      expect(lastQueryConfig?.queryKey).toEqual(['likes', 'check', 'post-1']);
    });

    it('is disabled when postId is null', () => {
      useHasLiked(null);
      expect(lastQueryConfig?.enabled).toBe(false);
    });

    it('queryFn returns hasLiked boolean', async () => {
      mockHasLikedPost.mockResolvedValue({ hasLiked: true });

      useHasLiked('post-1');
      const result = await lastQueryConfig!.queryFn();
      expect(result).toBe(true);
    });
  });

  describe('useToggleLike', () => {
    it('mutationFn calls likePost', async () => {
      mockLikePost.mockResolvedValue({ error: null });

      useToggleLike();
      const result = await lastMutationConfig!.mutationFn({ postId: 'post-1', liked: false });
      expect(mockLikePost).toHaveBeenCalledWith('post-1');
      expect(result).toEqual({ postId: 'post-1', liked: true });
    });

    it('onMutate sets optimistic state', async () => {
      mockGetQueryData.mockReturnValue(false);
      mockCancelQueries.mockResolvedValue(undefined);

      useToggleLike();
      const context = await lastMutationConfig!.onMutate!({ postId: 'post-1', liked: false });

      expect(mockCancelQueries).toHaveBeenCalled();
      expect(mockSetQueryData).toHaveBeenCalledWith(['likes', 'check', 'post-1'], true);
      expect(mockToggleLikeOptimistic).toHaveBeenCalledWith('post-1', true);
      expect(context).toEqual({ previousValue: false, postId: 'post-1' });
    });

    it('onError rolls back optimistic state', () => {
      useToggleLike();
      const context = { previousValue: false, postId: 'post-1' };
      lastMutationConfig!.onError!(new Error('fail'), {}, context);

      expect(mockSetQueryData).toHaveBeenCalledWith(['likes', 'check', 'post-1'], false);
      expect(mockToggleLikeOptimistic).toHaveBeenCalledWith('post-1', false);
    });
  });

  // =========================================================================
  // COLLECTIONS HOOKS
  // =========================================================================
  describe('useHasSavedPost', () => {
    it('uses correct queryKey', () => {
      useHasSavedPost('post-1');
      expect(lastQueryConfig?.queryKey).toEqual(['collections', 'saved', 'check', 'post-1']);
    });

    it('is disabled when postId is null', () => {
      useHasSavedPost(null);
      expect(lastQueryConfig?.enabled).toBe(false);
    });

    it('queryFn returns saved boolean', async () => {
      mockHasSavedPost.mockResolvedValue({ saved: true });

      useHasSavedPost('post-1');
      const result = await lastQueryConfig!.queryFn();
      expect(result).toBe(true);
    });
  });

  describe('useSavedPosts', () => {
    it('uses correct queryKey', () => {
      useSavedPosts();
      expect(lastInfiniteQueryConfig?.queryKey).toEqual(['collections', 'saved']);
    });

    it('queryFn calls getSavedPosts', async () => {
      mockGetSavedPosts.mockResolvedValue({ data: [], error: null, nextCursor: null, hasMore: false });

      useSavedPosts();
      const result = await lastInfiniteQueryConfig!.queryFn({ pageParam: undefined });
      expect(mockGetSavedPosts).toHaveBeenCalledWith(undefined, 20);
      expect(result).toEqual({ posts: [], nextCursor: null, hasMore: false });
    });

    it('getNextPageParam returns undefined when no more', () => {
      useSavedPosts();
      expect(lastInfiniteQueryConfig!.getNextPageParam({ hasMore: false, nextCursor: null })).toBeUndefined();
    });

    it('getNextPageParam returns cursor when more data', () => {
      useSavedPosts();
      expect(lastInfiniteQueryConfig!.getNextPageParam({ hasMore: true, nextCursor: 'abc' })).toBe('abc');
    });
  });

  describe('useToggleSavePost', () => {
    it('mutationFn calls savePost when not saved', async () => {
      mockSavePost.mockResolvedValue({ error: null });

      useToggleSavePost();
      const result = await lastMutationConfig!.mutationFn({ postId: 'post-1', isSaved: false });
      expect(mockSavePost).toHaveBeenCalledWith('post-1');
      expect(result).toEqual({ postId: 'post-1', saved: true });
    });

    it('mutationFn calls unsavePost when already saved', async () => {
      mockUnsavePost.mockResolvedValue({ error: null });

      useToggleSavePost();
      const result = await lastMutationConfig!.mutationFn({ postId: 'post-1', isSaved: true });
      expect(mockUnsavePost).toHaveBeenCalledWith('post-1');
      expect(result).toEqual({ postId: 'post-1', saved: false });
    });

    it('onMutate sets optimistic state', async () => {
      mockCancelQueries.mockResolvedValue(undefined);
      mockGetQueryData.mockReturnValue(false);

      useToggleSavePost();
      const context = await lastMutationConfig!.onMutate!({ postId: 'post-1', isSaved: false });
      expect(mockSetQueryData).toHaveBeenCalledWith(['collections', 'saved', 'check', 'post-1'], true);
      expect(context).toEqual({ previousValue: false, postId: 'post-1' });
    });

    it('onError rolls back', () => {
      useToggleSavePost();
      lastMutationConfig!.onError!(new Error('fail'), {}, { previousValue: false, postId: 'post-1' });
      expect(mockSetQueryData).toHaveBeenCalledWith(['collections', 'saved', 'check', 'post-1'], false);
    });

    it('onSettled invalidates saved posts', () => {
      useToggleSavePost();
      lastMutationConfig!.onSettled!();
      expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ['collections', 'saved'] });
    });
  });

  // =========================================================================
  // FOLLOWS HOOKS
  // =========================================================================
  describe('useIsFollowing', () => {
    it('uses correct queryKey', () => {
      useIsFollowing('user-1');
      expect(lastQueryConfig?.queryKey).toEqual(['follows', 'check', 'user-1']);
    });

    it('is disabled when userId is null', () => {
      useIsFollowing(null);
      expect(lastQueryConfig?.enabled).toBe(false);
    });

    it('queryFn returns following boolean', async () => {
      mockIsFollowing.mockResolvedValue({ following: true });

      useIsFollowing('user-1');
      const result = await lastQueryConfig!.queryFn();
      expect(result).toBe(true);
    });
  });

  describe('useFollowers', () => {
    it('is disabled when userId is null', () => {
      useFollowers(null);
      expect(lastInfiniteQueryConfig?.enabled).toBe(false);
    });

    it('uses correct queryKey', () => {
      useFollowers('user-1');
      expect(lastInfiniteQueryConfig?.queryKey).toEqual(['follows', 'followers', 'user-1']);
    });

    it('queryFn calls getFollowers', async () => {
      mockGetFollowers.mockResolvedValue({ data: [], error: null, nextCursor: null, hasMore: false });

      useFollowers('user-1');
      await lastInfiniteQueryConfig!.queryFn({ pageParam: undefined });
      expect(mockGetFollowers).toHaveBeenCalledWith('user-1', undefined, 20);
    });
  });

  describe('useFollowing', () => {
    it('uses correct queryKey', () => {
      useFollowing('user-1');
      expect(lastInfiniteQueryConfig?.queryKey).toEqual(['follows', 'following', 'user-1']);
    });

    it('queryFn calls getFollowing', async () => {
      mockGetFollowing.mockResolvedValue({ data: [], error: null, nextCursor: null, hasMore: false });

      useFollowing('user-1');
      await lastInfiniteQueryConfig!.queryFn({ pageParam: undefined });
      expect(mockGetFollowing).toHaveBeenCalledWith('user-1', undefined, 20);
    });
  });

  describe('useToggleFollow', () => {
    it('mutationFn unfollows when isFollowing=true', async () => {
      mockUnfollowUser.mockResolvedValue({ error: null, cooldown: null });

      useToggleFollow();
      const result = await lastMutationConfig!.mutationFn({ userId: 'u1', isFollowing: true });
      expect(mockUnfollowUser).toHaveBeenCalledWith('u1');
      expect(result).toEqual({ userId: 'u1', following: false, cooldown: null });
    });

    it('mutationFn follows when isFollowing=false', async () => {
      mockFollowUser.mockResolvedValue({ error: null, requestCreated: true });

      useToggleFollow();
      const result = await lastMutationConfig!.mutationFn({ userId: 'u1', isFollowing: false });
      expect(mockFollowUser).toHaveBeenCalledWith('u1');
      expect(result).toEqual({ userId: 'u1', following: true, requestCreated: true });
    });

    it('mutationFn throws when cooldown blocks follow', async () => {
      mockFollowUser.mockResolvedValue({ cooldown: { blocked: true, daysRemaining: 3 } });

      useToggleFollow();
      await expect(
        lastMutationConfig!.mutationFn({ userId: 'u1', isFollowing: false }),
      ).rejects.toThrow('Please wait 3 more days before becoming a fan again.');
    });

    it('onMutate optimistically updates isFollowing and fan_count', async () => {
      mockCancelQueries.mockResolvedValue(undefined);
      mockGetQueryData.mockReturnValueOnce(true); // previousValue
      const profileData = { id: 'u1', fan_count: 10 };
      // For the profile lookup
      mockQueryClient.getQueryData.mockReturnValueOnce(profileData);

      useToggleFollow();
      const context = await lastMutationConfig!.onMutate!({ userId: 'u1', isFollowing: true });

      expect(mockSetQueryData).toHaveBeenCalledWith(['follows', 'check', 'u1'], false);
      expect(context).toHaveProperty('previousValue');
      expect(context).toHaveProperty('userId', 'u1');
    });

    it('onError rolls back isFollowing and profile data', () => {
      useToggleFollow();
      const context = {
        previousValue: true,
        userId: 'u1',
        previousProfileData: { id: 'u1', fan_count: 10 },
      };
      lastMutationConfig!.onError!(new Error('fail'), {}, context);

      expect(mockSetQueryData).toHaveBeenCalledWith(['follows', 'check', 'u1'], true);
      expect(mockSetQueryData).toHaveBeenCalledWith(['user', 'profile', 'u1'], { id: 'u1', fan_count: 10 });
    });

    it('onSettled invalidates follows and user profile', () => {
      useToggleFollow();
      lastMutationConfig!.onSettled!(undefined, undefined, { userId: 'u1', isFollowing: true });
      expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ['follows'] });
      expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ['user', 'profile', 'u1'] });
    });
  });

  // =========================================================================
  // COMMENTS HOOKS
  // =========================================================================
  describe('usePostComments', () => {
    it('uses correct queryKey', () => {
      usePostComments('post-1');
      expect(lastInfiniteQueryConfig?.queryKey).toEqual(['comments', 'post-1']);
    });

    it('is disabled when postId is null', () => {
      usePostComments(null);
      expect(lastInfiniteQueryConfig?.enabled).toBe(false);
    });

    it('queryFn calls getPostComments', async () => {
      mockGetPostComments.mockResolvedValue({ data: [], error: null, nextCursor: null, hasMore: false });

      usePostComments('post-1');
      await lastInfiniteQueryConfig!.queryFn({ pageParam: undefined });
      expect(mockGetPostComments).toHaveBeenCalledWith('post-1', undefined, 20);
    });
  });

  describe('useAddComment', () => {
    it('mutationFn calls addComment', async () => {
      mockAddComment.mockResolvedValue({ data: { id: 'c1' }, error: null });

      useAddComment();
      const result = await lastMutationConfig!.mutationFn({ postId: 'post-1', text: 'Hello' });
      expect(mockAddComment).toHaveBeenCalledWith('post-1', 'Hello');
      expect(result).toEqual({ id: 'c1' });
    });

    it('onSuccess invalidates comments for the post', () => {
      useAddComment();
      lastMutationConfig!.onSuccess!(undefined, { postId: 'post-1', text: 'Hi' });
      expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ['comments', 'post-1'] });
    });
  });

  // =========================================================================
  // INTERESTS & EXPERTISE HOOKS
  // =========================================================================
  describe('useInterests', () => {
    it('uses correct queryKey', () => {
      useInterests();
      expect(lastQueryConfig?.queryKey).toEqual(['interests']);
    });

    it('has 1 hour staleTime', () => {
      useInterests();
      expect(lastQueryConfig?.staleTime).toBe(60 * 60 * 1000);
    });

    it('queryFn returns interests array', async () => {
      mockGetInterests.mockResolvedValue({ data: ['sport', 'music'], error: null });

      useInterests();
      const result = await lastQueryConfig!.queryFn();
      expect(result).toEqual(['sport', 'music']);
    });

    it('queryFn returns empty array when data is null', async () => {
      mockGetInterests.mockResolvedValue({ data: null, error: null });

      useInterests();
      const result = await lastQueryConfig!.queryFn();
      expect(result).toEqual([]);
    });
  });

  describe('useExpertise', () => {
    it('uses correct queryKey', () => {
      useExpertise();
      expect(lastQueryConfig?.queryKey).toEqual(['expertise']);
    });

    it('queryFn returns expertise array', async () => {
      mockGetExpertise.mockResolvedValue({ data: ['coding'], error: null });

      useExpertise();
      const result = await lastQueryConfig!.queryFn();
      expect(result).toEqual(['coding']);
    });
  });

  describe('useSaveInterests', () => {
    it('mutationFn calls saveUserInterests', async () => {
      mockSaveUserInterests.mockResolvedValue({ error: null });

      useSaveInterests();
      const result = await lastMutationConfig!.mutationFn(['id1', 'id2']);
      expect(mockSaveUserInterests).toHaveBeenCalledWith(['id1', 'id2']);
      expect(result).toBe(true);
    });

    it('mutationFn throws on error', async () => {
      mockSaveUserInterests.mockResolvedValue({ error: 'Failed' });

      useSaveInterests();
      await expect(lastMutationConfig!.mutationFn(['id1'])).rejects.toThrow('Failed');
    });
  });

  // =========================================================================
  // UTILITY HOOKS
  // =========================================================================
  describe('usePrefetchProfile', () => {
    it('returns a function that prefetches profile', () => {
      const prefetch = usePrefetchProfile();
      expect(typeof prefetch).toBe('function');

      prefetch('user-123');
      expect(mockPrefetchQuery).toHaveBeenCalledWith(
        expect.objectContaining({
          queryKey: ['user', 'profile', 'user-123'],
          staleTime: 5 * 60 * 1000,
        }),
      );
    });
  });

  describe('useInvalidateUserQueries', () => {
    it('returns a function that removes all user-related queries', () => {
      const invalidate = useInvalidateUserQueries();
      expect(typeof invalidate).toBe('function');

      invalidate();
      expect(mockRemoveQueries).toHaveBeenCalledTimes(5);
      expect(mockRemoveQueries).toHaveBeenCalledWith({ queryKey: ['user'] });
      expect(mockRemoveQueries).toHaveBeenCalledWith({ queryKey: ['posts'] });
      expect(mockRemoveQueries).toHaveBeenCalledWith({ queryKey: ['follows'] });
      expect(mockRemoveQueries).toHaveBeenCalledWith({ queryKey: ['likes'] });
      expect(mockRemoveQueries).toHaveBeenCalledWith({ queryKey: ['spots'] });
    });
  });

  // =========================================================================
  // SPOTS HOOKS
  // =========================================================================
  describe('useSpots', () => {
    it('uses correct queryKey', () => {
      useSpots();
      expect(lastInfiniteQueryConfig?.queryKey).toEqual(['spots']);
    });

    it('queryFn calls getSpots', async () => {
      mockGetSpots.mockResolvedValue({ data: [], error: null });

      useSpots();
      await lastInfiniteQueryConfig!.queryFn({ pageParam: 0 });
      expect(mockGetSpots).toHaveBeenCalledWith(0, 20);
    });

    it('getNextPageParam stops when fewer than 20', () => {
      useSpots();
      expect(lastInfiniteQueryConfig!.getNextPageParam({ spots: [1], nextPage: 1 })).toBeUndefined();
    });

    it('getNextPageParam returns nextPage when 20 spots', () => {
      useSpots();
      expect(lastInfiniteQueryConfig!.getNextPageParam({ spots: Array(20).fill({}), nextPage: 2 })).toBe(2);
    });
  });

  describe('useSpot', () => {
    it('is disabled when spotId is null', () => {
      useSpot(null);
      expect(lastQueryConfig?.enabled).toBe(false);
    });

    it('queryFn calls getSpotById', async () => {
      mockGetSpotById.mockResolvedValue({ data: { id: 's1' }, error: null });

      useSpot('s1');
      const result = await lastQueryConfig!.queryFn();
      expect(mockGetSpotById).toHaveBeenCalledWith('s1');
      expect(result).toEqual({ id: 's1' });
    });
  });

  describe('useSpotsByCreator', () => {
    it('is disabled when creatorId is null', () => {
      useSpotsByCreator(null);
      expect(lastInfiniteQueryConfig?.enabled).toBe(false);
    });

    it('uses correct queryKey', () => {
      useSpotsByCreator('creator-1');
      expect(lastInfiniteQueryConfig?.queryKey).toEqual(['spots', 'creator', 'creator-1']);
    });
  });

  describe('useSpotsByCategory', () => {
    it('is disabled when category is null', () => {
      useSpotsByCategory(null);
      expect(lastInfiniteQueryConfig?.enabled).toBe(false);
    });

    it('uses correct queryKey', () => {
      useSpotsByCategory('climbing');
      expect(lastInfiniteQueryConfig?.queryKey).toEqual(['spots', 'category', 'climbing']);
    });
  });

  describe('useSpotsBySportType', () => {
    it('is disabled when sportType is null', () => {
      useSpotsBySportType(null);
      expect(lastInfiniteQueryConfig?.enabled).toBe(false);
    });

    it('uses correct queryKey', () => {
      useSpotsBySportType('running');
      expect(lastInfiniteQueryConfig?.queryKey).toEqual(['spots', 'sport', 'running']);
    });
  });

  describe('useNearbySpots', () => {
    it('is disabled when latitude is null', () => {
      useNearbySpots(null, 2.3, 10);
      expect(lastQueryConfig?.enabled).toBe(false);
    });

    it('is disabled when longitude is null', () => {
      useNearbySpots(48.8, null, 10);
      expect(lastQueryConfig?.enabled).toBe(false);
    });

    it('is enabled when both coords provided', () => {
      useNearbySpots(48.8, 2.3, 10);
      expect(lastQueryConfig?.enabled).toBe(true);
    });

    it('uses correct queryKey with coords and radius', () => {
      useNearbySpots(48.8, 2.3, 5);
      expect(lastQueryConfig?.queryKey).toEqual(['spots', 'nearby', 48.8, 2.3, 5]);
    });

    it('queryFn calls findNearbySpots', async () => {
      mockFindNearbySpots.mockResolvedValue({ data: [], error: null });

      useNearbySpots(48.8, 2.3, 5);
      await lastQueryConfig!.queryFn();
      expect(mockFindNearbySpots).toHaveBeenCalledWith(48.8, 2.3, 5);
    });
  });

  describe('useCreateSpot', () => {
    it('mutationFn calls createSpot', async () => {
      mockCreateSpot.mockResolvedValue({ data: { id: 's1' }, error: null });

      useCreateSpot();
      const result = await lastMutationConfig!.mutationFn({ name: 'New Spot' });
      expect(mockCreateSpot).toHaveBeenCalledWith({ name: 'New Spot' });
      expect(result).toEqual({ id: 's1' });
    });

    it('onSuccess invalidates spots', () => {
      useCreateSpot();
      lastMutationConfig!.onSuccess!();
      expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ['spots'] });
    });
  });

  describe('useUpdateSpot', () => {
    it('mutationFn calls updateSpot', async () => {
      mockUpdateSpot.mockResolvedValue({ data: { id: 's1', name: 'Updated' }, error: null });

      useUpdateSpot();
      const result = await lastMutationConfig!.mutationFn({ spotId: 's1', updates: { name: 'Updated' } });
      expect(mockUpdateSpot).toHaveBeenCalledWith('s1', { name: 'Updated' });
      expect(result).toEqual({ id: 's1', name: 'Updated' });
    });

    it('onSuccess updates cache and invalidates', () => {
      useUpdateSpot();
      lastMutationConfig!.onSuccess!({ id: 's1', name: 'Updated' });
      expect(mockSetQueryData).toHaveBeenCalledWith(['spots', 'detail', 's1'], { id: 's1', name: 'Updated' });
      expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ['spots'] });
    });
  });

  describe('useDeleteSpot', () => {
    it('mutationFn calls deleteSpot', async () => {
      mockDeleteSpot.mockResolvedValue({ error: null });

      useDeleteSpot();
      const result = await lastMutationConfig!.mutationFn('s1');
      expect(mockDeleteSpot).toHaveBeenCalledWith('s1');
      expect(result).toBe('s1');
    });

    it('onSuccess invalidates spots', () => {
      useDeleteSpot();
      lastMutationConfig!.onSuccess!();
      expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ['spots'] });
    });
  });

  // =========================================================================
  // SPOT SAVES HOOKS
  // =========================================================================
  describe('useHasSavedSpot', () => {
    it('uses correct queryKey', () => {
      useHasSavedSpot('spot-1');
      expect(lastQueryConfig?.queryKey).toEqual(['spots', 'saved', 'check', 'spot-1']);
    });

    it('is disabled when spotId is null', () => {
      useHasSavedSpot(null);
      expect(lastQueryConfig?.enabled).toBe(false);
    });

    it('queryFn returns saved boolean', async () => {
      mockHasSavedSpot.mockResolvedValue({ saved: true });

      useHasSavedSpot('spot-1');
      const result = await lastQueryConfig!.queryFn();
      expect(result).toBe(true);
    });
  });

  describe('useSavedSpots', () => {
    it('queryFn calls getSavedSpots', async () => {
      mockGetSavedSpots.mockResolvedValue({ data: [], error: null });

      useSavedSpots();
      await lastInfiniteQueryConfig!.queryFn({ pageParam: 0 });
      expect(mockGetSavedSpots).toHaveBeenCalledWith(0, 20);
    });
  });

  describe('useToggleSaveSpot', () => {
    it('mutationFn calls saveSpot when not saved', async () => {
      mockSaveSpot.mockResolvedValue({ error: null });

      useToggleSaveSpot();
      const result = await lastMutationConfig!.mutationFn({ spotId: 's1', isSaved: false });
      expect(mockSaveSpot).toHaveBeenCalledWith('s1');
      expect(result).toEqual({ spotId: 's1', saved: true });
    });

    it('mutationFn calls unsaveSpot when saved', async () => {
      mockUnsaveSpot.mockResolvedValue({ error: null });

      useToggleSaveSpot();
      const result = await lastMutationConfig!.mutationFn({ spotId: 's1', isSaved: true });
      expect(mockUnsaveSpot).toHaveBeenCalledWith('s1');
      expect(result).toEqual({ spotId: 's1', saved: false });
    });

    it('onSettled invalidates saved spots', () => {
      useToggleSaveSpot();
      lastMutationConfig!.onSettled!();
      expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ['spots', 'saved'] });
    });
  });

  // =========================================================================
  // SPOT REVIEWS HOOKS
  // =========================================================================
  describe('useSpotReviews', () => {
    it('uses correct queryKey', () => {
      useSpotReviews('spot-1');
      expect(lastInfiniteQueryConfig?.queryKey).toEqual(['spots', 'reviews', 'spot-1']);
    });

    it('is disabled when spotId is null', () => {
      useSpotReviews(null);
      expect(lastInfiniteQueryConfig?.enabled).toBe(false);
    });

    it('queryFn calls getSpotReviews', async () => {
      mockGetSpotReviews.mockResolvedValue({ data: [], error: null });

      useSpotReviews('spot-1');
      await lastInfiniteQueryConfig!.queryFn({ pageParam: 0 });
      expect(mockGetSpotReviews).toHaveBeenCalledWith('spot-1', 0, 20);
    });
  });

  describe('useAddSpotReview', () => {
    it('mutationFn calls addSpotReview', async () => {
      mockAddSpotReview.mockResolvedValue({ data: { id: 'r1' }, error: null });

      useAddSpotReview();
      const result = await lastMutationConfig!.mutationFn({
        spotId: 's1',
        rating: 5,
        comment: 'Great!',
        images: ['img1.jpg'],
      });
      expect(mockAddSpotReview).toHaveBeenCalledWith('s1', 5, 'Great!', ['img1.jpg']);
      expect(result).toEqual({ id: 'r1' });
    });

    it('onSuccess invalidates reviews and spot', () => {
      useAddSpotReview();
      lastMutationConfig!.onSuccess!(undefined, { spotId: 's1', rating: 5 });
      expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ['spots', 'reviews', 's1'] });
      expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ['spots', 'detail', 's1'] });
    });
  });

  describe('useDeleteSpotReview', () => {
    it('mutationFn calls deleteSpotReview', async () => {
      mockDeleteSpotReview.mockResolvedValue({ error: null });

      useDeleteSpotReview();
      const result = await lastMutationConfig!.mutationFn('s1');
      expect(mockDeleteSpotReview).toHaveBeenCalledWith('s1');
      expect(result).toBe('s1');
    });

    it('onSuccess invalidates reviews and spot', () => {
      useDeleteSpotReview();
      lastMutationConfig!.onSuccess!('s1');
      expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ['spots', 'reviews', 's1'] });
      expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ['spots', 'detail', 's1'] });
    });
  });
});

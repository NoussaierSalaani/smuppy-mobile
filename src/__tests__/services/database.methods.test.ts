/**
 * Database Service Methods Tests
 *
 * Comprehensive tests for ALL exported functions in database.ts
 * that are not covered by database.test.ts or database.batch.test.ts.
 *
 * Covers: feeds, posts, peaks, conversations, messages, spots,
 * reports, mutes, follow requests, sharing, reactions, and more.
 */

// ---------------------------------------------------------------------------
// Mocks -- must be declared before imports
// ---------------------------------------------------------------------------

(global as unknown as { __DEV__: boolean }).__DEV__ = true;

jest.mock('@sentry/react-native', () => ({}));
jest.mock('expo-constants', () => ({ default: { manifest: {} } }));
jest.mock('../../config/env', () => ({ ENV: { API_URL: '', STAGE: 'test' } }));
jest.mock('../../lib/sentry', () => ({}));

const mockRequest = jest.fn();
const mockGetProfile = jest.fn();
const mockGetProfileByUsername = jest.fn();
const mockUpdateProfile = jest.fn();
const mockSearchProfiles = jest.fn();
const mockCreatePost = jest.fn();
const mockDeletePost = jest.fn();
const mockGetPost = jest.fn();
const mockGetPosts = jest.fn();
const mockLikePost = jest.fn();
const mockGetComments = jest.fn();
const mockCreateComment = jest.fn();
const mockDeleteComment = jest.fn();
const mockFollowUser = jest.fn();
const mockUnfollowUser = jest.fn();
const mockGetFollowers = jest.fn();
const mockGetFollowing = jest.fn();
const mockGetNotifications = jest.fn();
const mockMarkNotificationRead = jest.fn();
const mockMarkAllNotificationsRead = jest.fn();
const mockGetUnreadCount = jest.fn();
const mockGetPeaks = jest.fn();
const mockGetPeak = jest.fn();
const mockGetPostLikers = jest.fn();
const mockGetCDNUrl = jest.fn((key: string) => `https://cdn.example.com/${key}`);

jest.mock('../../services/aws-api', () => ({
  awsAPI: {
    request: mockRequest,
    getProfile: mockGetProfile,
    getProfileByUsername: mockGetProfileByUsername,
    updateProfile: mockUpdateProfile,
    searchProfiles: mockSearchProfiles,
    createPost: mockCreatePost,
    deletePost: mockDeletePost,
    getPost: mockGetPost,
    getPosts: mockGetPosts,
    likePost: mockLikePost,
    getComments: mockGetComments,
    createComment: mockCreateComment,
    deleteComment: mockDeleteComment,
    followUser: mockFollowUser,
    unfollowUser: mockUnfollowUser,
    getFollowers: mockGetFollowers,
    getFollowing: mockGetFollowing,
    getNotifications: mockGetNotifications,
    markNotificationRead: mockMarkNotificationRead,
    markAllNotificationsRead: mockMarkAllNotificationsRead,
    getUnreadCount: mockGetUnreadCount,
    getPeaks: mockGetPeaks,
    getPeak: mockGetPeak,
    getPostLikers: mockGetPostLikers,
    getCDNUrl: mockGetCDNUrl,
  },
}));

const mockGetCurrentUser = jest.fn();

jest.mock('../../services/aws-auth', () => ({
  awsAuth: { getCurrentUser: mockGetCurrentUser },
}));

jest.mock('../../utils/contentFilters', () => ({
  filterContent: jest.fn((_text: string) => ({ clean: true, severity: 'none' })),
}));

jest.mock('../../utils/cdnUrl', () => ({
  normalizeCdnUrl: jest.fn((url: string | undefined) => url),
}));

jest.mock('../../utils/sanitize', () => ({
  sanitizeDisplayText: jest.fn((text: string) => text),
}));

jest.mock('../../stores', () => ({
  useFeedStore: {
    getState: () => ({ setFeedCache: jest.fn() }),
  },
}));

// ---------------------------------------------------------------------------
// Imports -- after mocks
// ---------------------------------------------------------------------------

import {
  // Profiles
  getTrendingHashtags,
  getSuggestedProfiles,
  ensureProfile,
  // Feeds
  getFeedPosts,
  getOptimizedFeed,
  getPostsByUser,
  getFeedFromFollowed,
  getDiscoveryFeed,
  getPostsByTags,
  // Posts
  createPost,
  getPostById,
  getSavedPosts,
  // Peaks
  getPeaks,
  getPeaksByUser,
  getPeakById,
  // Follow counts
  getFollowersCount,
  getFollowingCount,
  // Post likers
  getPostLikers,
  // Expertise / Interests
  getExpertise,
  // Spots
  getSpotsNearLocation,
  getSpotById,
  createSpot,
  getSpotReviews,
  addSpotReview,
  getSpots,
  getSpotsByCreator,
  getSpotsByCategory,
  getSpotsBySportType,
  updateSpot,
  deleteSpot,
  hasSavedSpot,
  getSavedSpots,
  saveSpot,
  unsaveSpot,
  deleteSpotReview,
  // Conversations / Messages
  getConversations,
  getMessages,
  sendMessage,
  getOrCreateConversation,
  sharePostToUser,
  sharePeakToUser,
  shareProfileToUser,
  shareTextToUser,
  markConversationAsRead,
  // Reports
  reportComment,
  reportPeak,
  reportUser,
  reportLivestream,
  reportMessage,
  // Mutes
  muteUser,
  unmuteUser,
  getMutedUsers,
  // Follow requests
  getPendingFollowRequests,
  acceptFollowRequest,
  declineFollowRequest,
  getPendingFollowRequestsCount,
  hasPendingFollowRequest,
  cancelFollowRequest,
  // Report checks
  hasReportedPost,
  hasReportedUser,
  // Save interests
  saveUserInterests,
  // Message reactions
  addMessageReaction,
  removeMessageReaction,
  getMessageReactions,
  // Message deletion & forwarding
  deleteMessage,
  forwardMessage,
  // Discover
  getDiscoverPosts,
  getRecentPeaks,
  // Aliases
  findNearbySpots,
  getPostComments,
  sharePostToConversation,
  // Constants
  AVAILABLE_REACTIONS,
} from '../../services/database';
import type { Spot } from '../../types';

// ---------------------------------------------------------------------------
// Helper factories
// ---------------------------------------------------------------------------

const VALID_UUID = '11111111-2222-3333-4444-555555555555';
const VALID_UUID_2 = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

const makeAWSProfile = (overrides: Record<string, unknown> = {}) => ({
  id: 'u1',
  username: 'testuser',
  fullName: 'Test User',
  avatarUrl: 'https://cdn.example.com/avatar.jpg',
  coverUrl: null,
  bio: 'Hello',
  website: null,
  isVerified: false,
  isPremium: false,
  isPrivate: false,
  accountType: 'personal',
  followersCount: 10,
  followingCount: 5,
  postsCount: 3,
  peaksCount: 1,
  ...overrides,
});

const makeAWSPost = (overrides: Record<string, unknown> = {}) => ({
  id: 'p1',
  authorId: 'u1',
  content: 'Post content',
  mediaUrls: ['https://cdn.example.com/img.jpg'],
  mediaType: 'image',
  visibility: 'public',
  likesCount: 5,
  commentsCount: 2,
  viewsCount: 100,
  createdAt: '2024-01-01T00:00:00Z',
  tags: ['Fitness'],
  author: makeAWSProfile(),
  ...overrides,
});

const makeAWSPeak = (overrides: Record<string, unknown> = {}) => ({
  id: 'pk1',
  authorId: 'u1',
  videoUrl: 'https://cdn.example.com/video.mp4',
  thumbnailUrl: null,
  caption: 'Peak caption',
  duration: 15,
  replyToPeakId: null,
  likesCount: 3,
  commentsCount: 1,
  viewsCount: 50,
  createdAt: '2024-01-01T00:00:00Z',
  filterId: null,
  filterIntensity: null,
  overlays: null,
  expiresAt: null,
  savedToProfile: null,
  author: makeAWSProfile(),
  challenge: null,
  ...overrides,
});

const _makeAWSComment = (overrides: Record<string, unknown> = {}) => ({
  id: 'c1',
  postId: 'p1',
  authorId: 'u1',
  content: 'Great post!',
  likesCount: 0,
  repliesCount: 0,
  createdAt: '2024-01-01T00:00:00Z',
  author: makeAWSProfile(),
  ...overrides,
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('database.methods', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetCurrentUser.mockResolvedValue({ id: 'u1', email: 'test@test.com' });
  });

  // =========================================================================
  // TRENDING HASHTAGS
  // =========================================================================

  describe('getTrendingHashtags', () => {
    it('should return trending hashtags', async () => {
      mockRequest.mockResolvedValue({ data: [{ tag: 'fitness', count: 42 }] });
      const result = await getTrendingHashtags();
      expect(result.data).toEqual([{ tag: 'fitness', count: 42 }]);
      expect(result.error).toBeNull();
    });

    it('should pass limit param', async () => {
      mockRequest.mockResolvedValue({ data: [] });
      await getTrendingHashtags(5);
      expect(mockRequest).toHaveBeenCalledWith(expect.stringContaining('limit=5'));
    });

    it('should return empty array on error', async () => {
      mockRequest.mockRejectedValue(new Error('Network error'));
      const result = await getTrendingHashtags();
      expect(result.data).toEqual([]);
      expect(result.error).toBe('Network error');
    });
  });

  // =========================================================================
  // SUGGESTED PROFILES
  // =========================================================================

  describe('getSuggestedProfiles', () => {
    it('should return profiles from profiles key', async () => {
      mockRequest.mockResolvedValue({ profiles: [makeAWSProfile()], nextCursor: null, hasMore: false });
      const result = await getSuggestedProfiles();
      expect(result.data).toHaveLength(1);
      expect(result.error).toBeNull();
    });

    it('should return profiles from data key', async () => {
      mockRequest.mockResolvedValue({ data: [makeAWSProfile()], nextCursor: 'c1', hasMore: true });
      const result = await getSuggestedProfiles();
      expect(result.data).toHaveLength(1);
      expect(result.nextCursor).toBe('c1');
      expect(result.hasMore).toBe(true);
    });

    it('should pass limit and cursor', async () => {
      mockRequest.mockResolvedValue({ profiles: [] });
      await getSuggestedProfiles(5, 'cursor123');
      expect(mockRequest).toHaveBeenCalledWith(expect.stringContaining('limit=5'));
      expect(mockRequest).toHaveBeenCalledWith(expect.stringContaining('cursor=cursor123'));
    });

    it('should fallback to searchProfiles on error', async () => {
      mockRequest.mockRejectedValue(new Error('Not found'));
      mockSearchProfiles.mockResolvedValue({ data: [makeAWSProfile()], nextCursor: null, hasMore: false });
      const result = await getSuggestedProfiles();
      expect(result.data).toHaveLength(1);
    });

    it('should return empty array when both endpoints fail', async () => {
      mockRequest.mockRejectedValue(new Error('Not found'));
      mockSearchProfiles.mockRejectedValue(new Error('Search failed'));
      const result = await getSuggestedProfiles();
      expect(result.data).toEqual([]);
      expect(result.error).toBe('Search failed');
    });
  });

  // =========================================================================
  // ENSURE PROFILE
  // =========================================================================

  describe('ensureProfile', () => {
    it('should return existing profile with created=false', async () => {
      mockGetProfile.mockResolvedValue(makeAWSProfile());
      const result = await ensureProfile();
      expect(result.data).toBeTruthy();
      expect(result.created).toBe(false);
      expect(result.error).toBeNull();
    });

    it('should return not authenticated when no user', async () => {
      mockGetCurrentUser.mockResolvedValue(null);
      const result = await ensureProfile();
      expect(result.data).toBeNull();
      expect(result.error).toBe('Not authenticated');
    });

    it('should create profile on 404 with created=true', async () => {
      mockGetProfile.mockRejectedValue({ statusCode: 404 });
      mockUpdateProfile.mockResolvedValue(makeAWSProfile({ username: 'test' }));
      const result = await ensureProfile();
      expect(result.data).toBeTruthy();
      expect(result.created).toBe(true);
    });

    it('should return error if profile creation fails', async () => {
      mockGetProfile.mockRejectedValue({ statusCode: 404 });
      mockUpdateProfile.mockRejectedValue(new Error('Create failed'));
      const result = await ensureProfile();
      expect(result.data).toBeNull();
      expect(result.error).toBe('Create failed');
    });

    it('should return error on non-404 errors', async () => {
      mockGetProfile.mockRejectedValue(new Error('Server error'));
      const result = await ensureProfile();
      expect(result.data).toBeNull();
      expect(result.error).toBe('Server error');
    });
  });

  // =========================================================================
  // FEED POSTS
  // =========================================================================

  describe('getFeedPosts', () => {
    it('should return posts from feed', async () => {
      mockGetPosts.mockResolvedValue({ ok: true, data: { data: [makeAWSPost()], nextCursor: null, hasMore: false } });
      const result = await getFeedPosts();
      expect(result.data).toHaveLength(1);
      expect(result.data![0].id).toBe('p1');
      expect(result.error).toBeNull();
    });

    it('should pass limit and type', async () => {
      mockGetPosts.mockResolvedValue({ ok: true, data: { data: [], nextCursor: null, hasMore: false } });
      await getFeedPosts(0, 5);
      expect(mockGetPosts).toHaveBeenCalledWith({ limit: 5, type: 'all' });
    });

    it('should return error on failure', async () => {
      mockGetPosts.mockResolvedValue({ ok: false, code: 'FEED_POSTS_FAILED', message: 'Feed failed' });
      const result = await getFeedPosts();
      expect(result.data).toBeNull();
      expect(result.error).toBe('Feed failed');
    });
  });

  // =========================================================================
  // OPTIMIZED FEED
  // =========================================================================

  describe('getOptimizedFeed', () => {
    it('should return posts with status', async () => {
      mockRequest.mockResolvedValue({
        data: [{ ...makeAWSPost(), isLiked: true, isSaved: true }],
        nextCursor: 'next1',
        hasMore: true,
      });
      const result = await getOptimizedFeed();
      expect(result.data).toHaveLength(1);
      expect(result.data![0].has_liked).toBe(true);
      expect(result.data![0].has_saved).toBe(true);
      expect(result.nextCursor).toBe('next1');
      expect(result.hasMore).toBe(true);
    });

    it('should pass cursor and limit', async () => {
      mockRequest.mockResolvedValue({ data: [], nextCursor: null, hasMore: false });
      await getOptimizedFeed('cursor1', 5);
      expect(mockRequest).toHaveBeenCalledWith(expect.stringContaining('cursor=cursor1'));
      expect(mockRequest).toHaveBeenCalledWith(expect.stringContaining('limit=5'));
    });

    it('should fallback to regular feed on error', async () => {
      mockRequest.mockRejectedValue(new Error('Not available'));
      mockGetPosts.mockResolvedValue({ ok: true, data: { data: [makeAWSPost()], nextCursor: null, hasMore: false } });
      const result = await getOptimizedFeed();
      expect(result.data).toHaveLength(1);
      expect(result.data![0].has_liked).toBe(false);
      expect(result.data![0].has_saved).toBe(false);
    });

    it('should handle has_liked / has_saved snake_case keys', async () => {
      mockRequest.mockResolvedValue({
        data: [{ ...makeAWSPost(), has_liked: true, has_saved: true }],
        nextCursor: null,
        hasMore: false,
      });
      const result = await getOptimizedFeed();
      expect(result.data![0].has_liked).toBe(true);
      expect(result.data![0].has_saved).toBe(true);
    });
  });

  // =========================================================================
  // POSTS BY USER
  // =========================================================================

  describe('getPostsByUser', () => {
    it('should return user posts', async () => {
      mockGetPosts.mockResolvedValue({ ok: true, data: { data: [makeAWSPost()], nextCursor: 'c1', hasMore: true } });
      const result = await getPostsByUser('u1');
      expect(result.data).toHaveLength(1);
      expect(result.nextCursor).toBe('c1');
      expect(result.hasMore).toBe(true);
    });

    it('should pass userId, limit, cursor', async () => {
      mockGetPosts.mockResolvedValue({ ok: true, data: { data: [], nextCursor: null, hasMore: false } });
      await getPostsByUser('u1', 0, 5, 'cursor1');
      expect(mockGetPosts).toHaveBeenCalledWith({ userId: 'u1', limit: 5, cursor: 'cursor1' });
    });

    it('should return error on failure', async () => {
      mockGetPosts.mockResolvedValue({ ok: false, code: 'FEED_POSTS_FAILED', message: 'Fetch failed' });
      const result = await getPostsByUser('u1');
      expect(result.data).toBeNull();
      expect(result.error).toBe('Fetch failed');
    });
  });

  // =========================================================================
  // FEED FROM FOLLOWED
  // =========================================================================

  describe('getFeedFromFollowed', () => {
    it('should return followed feed', async () => {
      mockGetPosts.mockResolvedValue({ ok: true, data: { data: [makeAWSPost()], nextCursor: 'c1', hasMore: true } });
      const result = await getFeedFromFollowed();
      expect(result.data).toHaveLength(1);
      expect(result.nextCursor).toBe('c1');
      expect(result.hasMore).toBe(true);
      expect(result.error).toBeNull();
    });

    it('should pass options', async () => {
      mockGetPosts.mockResolvedValue({ ok: true, data: { data: [], nextCursor: null, hasMore: false } });
      await getFeedFromFollowed({ cursor: 'cur1', limit: 5 });
      expect(mockGetPosts).toHaveBeenCalledWith({ type: 'following', limit: 5, cursor: 'cur1' });
    });

    it('should return error on failure', async () => {
      mockGetPosts.mockResolvedValue({ ok: false, code: 'FEED_POSTS_FAILED', message: 'Feed error' });
      const result = await getFeedFromFollowed();
      expect(result.data).toBeNull();
      expect(result.nextCursor).toBeNull();
      expect(result.hasMore).toBe(false);
      expect(result.error).toBe('Feed error');
    });
  });

  // =========================================================================
  // DISCOVERY FEED
  // =========================================================================

  describe('getDiscoveryFeed', () => {
    it('should return discovery posts with interests', async () => {
      mockRequest.mockResolvedValue({
        posts: [makeAWSPost()],
        nextCursor: null,
        hasMore: false,
      });
      const result = await getDiscoveryFeed(['Fitness']);
      expect(result.data).toHaveLength(1);
      expect(result.error).toBeNull();
      expect(mockRequest).toHaveBeenCalledWith(expect.stringContaining('interests=Fitness'));
    });

    it('should use userInterests when selectedInterests is empty', async () => {
      mockRequest.mockResolvedValue({ data: [makeAWSPost()] });
      await getDiscoveryFeed([], ['Yoga', 'Running']);
      expect(mockRequest).toHaveBeenCalledWith(expect.stringContaining('interests=Yoga%2CRunning'));
    });

    it('should handle data key in response', async () => {
      mockRequest.mockResolvedValue({ data: [makeAWSPost()] });
      const result = await getDiscoveryFeed();
      expect(result.data).toHaveLength(1);
    });

    it('should retry without interests if first page returns empty', async () => {
      // First call with interests returns empty
      mockRequest
        .mockResolvedValueOnce({ posts: [], nextCursor: null, hasMore: false })
        // Fallback call without interests
        .mockResolvedValueOnce({ posts: [makeAWSPost()] });
      const result = await getDiscoveryFeed(['Fitness']);
      expect(result.data).toHaveLength(1);
      expect(mockRequest).toHaveBeenCalledTimes(2);
    });

    it('should fallback to explore on error', async () => {
      mockRequest.mockRejectedValue(new Error('Discovery failed'));
      mockGetPosts.mockResolvedValue({ ok: true, data: { data: [makeAWSPost()], nextCursor: null, hasMore: false } });
      const result = await getDiscoveryFeed();
      expect(result.data).toHaveLength(1);
      expect(mockGetPosts).toHaveBeenCalledWith({ type: 'explore', limit: 20 });
    });

    it('should return empty array when both fallbacks fail', async () => {
      mockRequest.mockRejectedValue(new Error('Discovery failed'));
      mockGetPosts.mockResolvedValue({ ok: false, code: 'FEED_POSTS_FAILED', message: 'Explore failed' });
      const result = await getDiscoveryFeed();
      expect(result.data).toEqual([]);
      expect(result.error).toBe('Discovery failed');
    });
  });

  // =========================================================================
  // POSTS BY TAGS
  // =========================================================================

  describe('getPostsByTags', () => {
    it('should return posts by tags', async () => {
      mockRequest.mockResolvedValue({ data: [makeAWSPost()] });
      const result = await getPostsByTags(['Fitness', 'Yoga']);
      expect(result.data).toHaveLength(1);
      expect(result.error).toBeNull();
      expect(mockRequest).toHaveBeenCalledWith(expect.stringContaining('tags=Fitness%2CYoga'));
    });

    it('should return error on failure', async () => {
      mockRequest.mockRejectedValue(new Error('Tag search failed'));
      const result = await getPostsByTags(['Fitness']);
      expect(result.data).toBeNull();
      expect(result.error).toBe('Tag search failed');
    });
  });

  // =========================================================================
  // CREATE POST
  // =========================================================================

  describe('createPost', () => {
    it('should create a post', async () => {
      mockCreatePost.mockResolvedValue({ ok: true, data: makeAWSPost() });
      const result = await createPost({
        content: 'Hello world',
        media_urls: ['https://cdn.example.com/img.jpg'],
        media_type: 'image',
        visibility: 'public',
      });
      expect(result.data).toBeTruthy();
      expect(result.data!.id).toBe('p1');
      expect(result.error).toBeNull();
    });

    it('should return not authenticated when no user', async () => {
      mockGetCurrentUser.mockResolvedValue(null);
      const result = await createPost({ content: 'test' });
      expect(result.data).toBeNull();
      expect(result.error).toBe('Not authenticated');
    });

    it('should handle peak-specific fields', async () => {
      mockCreatePost.mockResolvedValue({ ok: true, data: makeAWSPost({ isPeak: true }) });
      await createPost({
        content: 'Peak',
        is_peak: true,
        peak_duration: 15,
        peak_expires_at: '2024-12-31',
        save_to_profile: true,
      });
      expect(mockCreatePost).toHaveBeenCalledWith(
        expect.objectContaining({
          isPeak: true,
          is_peak: true,
          peakDuration: 15,
          peak_duration: 15,
          peakExpiresAt: '2024-12-31',
          peak_expires_at: '2024-12-31',
          saveToProfile: true,
          save_to_profile: true,
        })
      );
    });

    it('should pass tags and tagged_users', async () => {
      mockCreatePost.mockResolvedValue({ ok: true, data: makeAWSPost() });
      await createPost({
        content: 'Tagged',
        tags: ['Fitness'],
        tagged_users: ['u2'],
      });
      expect(mockCreatePost).toHaveBeenCalledWith(
        expect.objectContaining({
          tags: ['Fitness'],
          taggedUsers: ['u2'],
          tagged_users: ['u2'],
        })
      );
    });

    it('should send both camelCase and snake_case media fields', async () => {
      mockCreatePost.mockResolvedValue({ ok: true, data: makeAWSPost() });
      await createPost({
        content: 'Mixed payload',
        media_urls: ['https://cdn.example.com/photo.jpg'],
        media_type: 'image',
        visibility: 'public',
      });
      expect(mockCreatePost).toHaveBeenCalledWith(
        expect.objectContaining({
          mediaUrls: ['https://cdn.example.com/photo.jpg'],
          media_urls: ['https://cdn.example.com/photo.jpg'],
          mediaType: 'image',
          media_type: 'image',
        })
      );
    });

    it('should return error on failure', async () => {
      mockCreatePost.mockResolvedValue({ ok: false, code: 'POST_CREATE_FAILED', message: 'Create failed' });
      const result = await createPost({ content: 'test' });
      expect(result.data).toBeNull();
      expect(result.error).toBe('Create failed');
    });

    it('should use caption when content is missing', async () => {
      mockCreatePost.mockResolvedValue({ ok: true, data: makeAWSPost() });
      await createPost({ caption: 'My caption' });
      expect(mockCreatePost).toHaveBeenCalledWith(
        expect.objectContaining({ content: 'My caption' })
      );
    });
  });

  // =========================================================================
  // GET POST BY ID
  // =========================================================================

  describe('getPostById', () => {
    it('should return post by ID', async () => {
      mockGetPost.mockResolvedValue({ ok: true, data: makeAWSPost() });
      const result = await getPostById('p1');
      expect(result.data).toBeTruthy();
      expect(result.data!.id).toBe('p1');
      expect(result.error).toBeNull();
    });

    it('should return error on failure', async () => {
      mockGetPost.mockResolvedValue({ ok: false, code: 'POST_DETAILS_FAILED', message: 'Not found' });
      const result = await getPostById('p1');
      expect(result.data).toBeNull();
      expect(result.error).toBe('Not found');
    });
  });

  // =========================================================================
  // SAVED POSTS
  // =========================================================================

  describe('getSavedPosts', () => {
    it('should return saved posts', async () => {
      mockRequest.mockResolvedValue({ data: [makeAWSPost()], nextCursor: 'c1', hasMore: true });
      const result = await getSavedPosts();
      expect(result.data).toHaveLength(1);
      expect(result.nextCursor).toBe('c1');
      expect(result.hasMore).toBe(true);
    });

    it('should pass cursor and limit', async () => {
      mockRequest.mockResolvedValue({ data: [], nextCursor: null, hasMore: false });
      await getSavedPosts('cur1', 5);
      expect(mockRequest).toHaveBeenCalledWith(expect.stringContaining('cursor=cur1'));
      expect(mockRequest).toHaveBeenCalledWith(expect.stringContaining('limit=5'));
    });

    it('should return error on failure', async () => {
      mockRequest.mockRejectedValue(new Error('Save fetch failed'));
      const result = await getSavedPosts();
      expect(result.data).toBeNull();
      expect(result.error).toBe('Save fetch failed');
    });
  });

  // =========================================================================
  // PEAKS
  // =========================================================================

  describe('getPeaks', () => {
    it('should return peaks as posts', async () => {
      mockGetPeaks.mockResolvedValue({ data: [makeAWSPeak()] });
      const result = await getPeaks();
      expect(result.data).toHaveLength(1);
      expect(result.data![0].is_peak).toBe(true);
      expect(result.data![0].media_type).toBe('video');
      expect(result.error).toBeNull();
    });

    it('should pass limit', async () => {
      mockGetPeaks.mockResolvedValue({ data: [] });
      await getPeaks(0, 5);
      expect(mockGetPeaks).toHaveBeenCalledWith({ limit: 5 });
    });

    it('should return error on failure', async () => {
      mockGetPeaks.mockRejectedValue(new Error('Peaks failed'));
      const result = await getPeaks();
      expect(result.data).toBeNull();
      expect(result.error).toBe('Peaks failed');
    });

    it('should handle peak without author', async () => {
      mockGetPeaks.mockResolvedValue({ data: [makeAWSPeak({ author: null })] });
      const result = await getPeaks();
      expect(result.data![0].author).toBeUndefined();
    });

    it('should map snake_case peak payload to playable post fields', async () => {
      mockGetPeaks.mockResolvedValue({
        data: [{
          id: 'pk2',
          author_id: 'u2',
          video_url: 'https://cdn.example.com/video-snake.mp4',
          hls_url: 'https://cdn.example.com/video-snake.m3u8',
          thumbnail_url: 'https://cdn.example.com/video-snake.jpg',
          caption: 'Snake peak',
          duration: 18,
          video_status: 'processing',
          likes_count: 12,
          comments_count: 4,
          views_count: 77,
          created_at: '2024-01-02T00:00:00Z',
        }],
      });
      const result = await getPeaks();
      expect(result.error).toBeNull();
      expect(result.data?.[0].media_urls).toContain('https://cdn.example.com/video-snake.mp4');
      expect(result.data?.[0].hls_url).toBe('https://cdn.example.com/video-snake.m3u8');
      expect(result.data?.[0].thumbnail_url).toBe('https://cdn.example.com/video-snake.jpg');
      expect(result.data?.[0].video_status).toBe('processing');
    });
  });

  describe('getPeaksByUser', () => {
    it('should return peaks for user', async () => {
      mockGetPeaks.mockResolvedValue({ data: [makeAWSPeak()] });
      const result = await getPeaksByUser('u1');
      expect(result.data).toHaveLength(1);
      expect(result.error).toBeNull();
    });

    it('should pass userId and limit', async () => {
      mockGetPeaks.mockResolvedValue({ data: [] });
      await getPeaksByUser('u1', 0, 5);
      expect(mockGetPeaks).toHaveBeenCalledWith({ userId: 'u1', limit: 5 });
    });

    it('should return error on failure', async () => {
      mockGetPeaks.mockRejectedValue(new Error('User peaks failed'));
      const result = await getPeaksByUser('u1');
      expect(result.data).toBeNull();
      expect(result.error).toBe('User peaks failed');
    });
  });

  describe('getPeakById', () => {
    it('should return single peak as post', async () => {
      mockGetPeak.mockResolvedValue(makeAWSPeak());
      const result = await getPeakById('pk1');
      expect(result.data).toBeTruthy();
      expect(result.data!.is_peak).toBe(true);
      expect(result.data!.id).toBe('pk1');
      expect(result.error).toBeNull();
    });

    it('should return error on failure', async () => {
      mockGetPeak.mockRejectedValue(new Error('Peak not found'));
      const result = await getPeakById('pk1');
      expect(result.data).toBeNull();
      expect(result.error).toBe('Peak not found');
    });
  });

  // =========================================================================
  // FOLLOW COUNTS
  // =========================================================================

  describe('getFollowersCount', () => {
    it('should return followers count from profile', async () => {
      mockGetProfile.mockResolvedValue(makeAWSProfile({ followersCount: 42 }));
      const result = await getFollowersCount('u1');
      expect(result.count).toBe(42);
    });

    it('should return 0 when followersCount is undefined', async () => {
      mockGetProfile.mockResolvedValue(makeAWSProfile({ followersCount: undefined }));
      const result = await getFollowersCount('u1');
      expect(result.count).toBe(0);
    });

    it('should return 0 on error', async () => {
      mockGetProfile.mockRejectedValue(new Error('Not found'));
      const result = await getFollowersCount('u1');
      expect(result.count).toBe(0);
    });
  });

  describe('getFollowingCount', () => {
    it('should return following count from profile', async () => {
      mockGetProfile.mockResolvedValue(makeAWSProfile({ followingCount: 15 }));
      const result = await getFollowingCount('u1');
      expect(result.count).toBe(15);
    });

    it('should return 0 on error', async () => {
      mockGetProfile.mockRejectedValue(new Error('Not found'));
      const result = await getFollowingCount('u1');
      expect(result.count).toBe(0);
    });
  });

  // =========================================================================
  // POST LIKERS
  // =========================================================================

  describe('getPostLikers', () => {
    it('should return likers list', async () => {
      mockGetPostLikers.mockResolvedValue({
        data: [makeAWSProfile()],
        nextCursor: 'c1',
        hasMore: true,
      });
      const result = await getPostLikers('p1');
      expect(result.data).toHaveLength(1);
      expect(result.nextCursor).toBe('c1');
      expect(result.hasMore).toBe(true);
    });

    it('should pass limit and cursor', async () => {
      mockGetPostLikers.mockResolvedValue({ data: [], nextCursor: null, hasMore: false });
      await getPostLikers('p1', 'cursor1', 10);
      expect(mockGetPostLikers).toHaveBeenCalledWith('p1', { limit: 10, cursor: 'cursor1' });
    });

    it('should return error on failure', async () => {
      mockGetPostLikers.mockRejectedValue(new Error('Likers failed'));
      const result = await getPostLikers('p1');
      expect(result.data).toBeNull();
      expect(result.error).toBe('Likers failed');
      expect(result.nextCursor).toBeNull();
      expect(result.hasMore).toBe(false);
    });
  });

  // =========================================================================
  // EXPERTISE
  // =========================================================================

  describe('getExpertise', () => {
    it('should return expertise list', async () => {
      mockRequest.mockResolvedValue({ data: [{ id: 'e1', name: 'Yoga' }] });
      const result = await getExpertise();
      expect(result.data).toHaveLength(1);
      expect(result.error).toBeNull();
    });

    it('should return empty on error', async () => {
      mockRequest.mockRejectedValue(new Error('Expertise failed'));
      const result = await getExpertise();
      expect(result.data).toEqual([]);
      expect(result.error).toBe('Expertise failed');
    });
  });

  // =========================================================================
  // SPOTS
  // =========================================================================

  describe('getSpotsNearLocation', () => {
    it('should return nearby spots', async () => {
      mockRequest.mockResolvedValue({ data: [{ id: 's1', name: 'Gym' }] });
      const result = await getSpotsNearLocation(48.8, 2.3);
      expect(result.data).toHaveLength(1);
      expect(result.error).toBeNull();
      expect(mockRequest).toHaveBeenCalledWith(expect.stringContaining('lat=48.8'));
      expect(mockRequest).toHaveBeenCalledWith(expect.stringContaining('lng=2.3'));
    });

    it('should pass radius and limit', async () => {
      mockRequest.mockResolvedValue({ data: [] });
      await getSpotsNearLocation(48.8, 2.3, 5000, 10);
      expect(mockRequest).toHaveBeenCalledWith(expect.stringContaining('radius=5000'));
      expect(mockRequest).toHaveBeenCalledWith(expect.stringContaining('limit=10'));
    });

    it('should return empty on error', async () => {
      mockRequest.mockRejectedValue(new Error('Location failed'));
      const result = await getSpotsNearLocation(48.8, 2.3);
      expect(result.data).toEqual([]);
      expect(result.error).toBe('Location failed');
    });
  });

  describe('findNearbySpots', () => {
    it('should be an alias for getSpotsNearLocation', () => {
      expect(findNearbySpots).toBe(getSpotsNearLocation);
    });
  });

  describe('getSpotById', () => {
    it('should return spot', async () => {
      mockRequest.mockResolvedValue({ id: 's1', name: 'Gym' });
      const result = await getSpotById('s1');
      expect(result.data).toEqual({ id: 's1', name: 'Gym' });
      expect(result.error).toBeNull();
    });

    it('should return error on failure', async () => {
      mockRequest.mockRejectedValue(new Error('Not found'));
      const result = await getSpotById('s1');
      expect(result.data).toBeNull();
      expect(result.error).toBe('Not found');
    });
  });

  describe('createSpot', () => {
    it('should create a spot', async () => {
      mockRequest.mockResolvedValue({ id: 's1', name: 'New Gym' });
      const result = await createSpot({ name: 'New Gym' } as Partial<Spot>);
      expect(result.data).toBeTruthy();
      expect(result.error).toBeNull();
    });

    it('should return not authenticated', async () => {
      mockGetCurrentUser.mockResolvedValue(null);
      const result = await createSpot({ name: 'Gym' } as Partial<Spot>);
      expect(result.error).toBe('Not authenticated');
    });

    it('should return error on failure', async () => {
      mockRequest.mockRejectedValue(new Error('Create failed'));
      const result = await createSpot({ name: 'Gym' } as Partial<Spot>);
      expect(result.error).toBe('Create failed');
    });
  });

  describe('getSpotReviews', () => {
    it('should return reviews', async () => {
      mockRequest.mockResolvedValue({ data: [{ id: 'r1', rating: 5 }] });
      const result = await getSpotReviews('s1');
      expect(result.data).toHaveLength(1);
      expect(result.error).toBeNull();
    });

    it('should return empty on error', async () => {
      mockRequest.mockRejectedValue(new Error('Reviews failed'));
      const result = await getSpotReviews('s1');
      expect(result.data).toEqual([]);
      expect(result.error).toBe('Reviews failed');
    });
  });

  describe('addSpotReview', () => {
    it('should add a review', async () => {
      mockRequest.mockResolvedValue({ id: 'r1', rating: 5, comment: 'Great' });
      const result = await addSpotReview('s1', 5, 'Great', ['photo.jpg']);
      expect(result.data).toBeTruthy();
      expect(result.error).toBeNull();
    });

    it('should return not authenticated', async () => {
      mockGetCurrentUser.mockResolvedValue(null);
      const result = await addSpotReview('s1', 5);
      expect(result.error).toBe('Not authenticated');
    });

    it('should return error on failure', async () => {
      mockRequest.mockRejectedValue(new Error('Review failed'));
      const result = await addSpotReview('s1', 5);
      expect(result.error).toBe('Review failed');
    });
  });

  describe('getSpots', () => {
    it('should return all spots', async () => {
      mockRequest.mockResolvedValue({ data: [{ id: 's1' }] });
      const result = await getSpots();
      expect(result.data).toHaveLength(1);
      expect(result.error).toBeNull();
    });

    it('should return empty on error', async () => {
      mockRequest.mockRejectedValue(new Error('Failed'));
      const result = await getSpots();
      expect(result.data).toEqual([]);
    });
  });

  describe('getSpotsByCreator', () => {
    it('should return spots by creator', async () => {
      mockRequest.mockResolvedValue({ data: [{ id: 's1' }] });
      const result = await getSpotsByCreator('u1');
      expect(result.data).toHaveLength(1);
      expect(mockRequest).toHaveBeenCalledWith(expect.stringContaining('creatorId=u1'));
    });

    it('should return empty on error', async () => {
      mockRequest.mockRejectedValue(new Error('Failed'));
      const result = await getSpotsByCreator('u1');
      expect(result.data).toEqual([]);
    });
  });

  describe('getSpotsByCategory', () => {
    it('should return spots by category', async () => {
      mockRequest.mockResolvedValue({ data: [{ id: 's1' }] });
      const result = await getSpotsByCategory('Gym');
      expect(result.data).toHaveLength(1);
      expect(mockRequest).toHaveBeenCalledWith(expect.stringContaining('category=Gym'));
    });

    it('should return empty on error', async () => {
      mockRequest.mockRejectedValue(new Error('Failed'));
      const result = await getSpotsByCategory('Gym');
      expect(result.data).toEqual([]);
    });
  });

  describe('getSpotsBySportType', () => {
    it('should return spots by sport type', async () => {
      mockRequest.mockResolvedValue({ data: [{ id: 's1' }] });
      const result = await getSpotsBySportType('Yoga');
      expect(result.data).toHaveLength(1);
      expect(mockRequest).toHaveBeenCalledWith(expect.stringContaining('sportType=Yoga'));
    });

    it('should return empty on error', async () => {
      mockRequest.mockRejectedValue(new Error('Failed'));
      const result = await getSpotsBySportType('Yoga');
      expect(result.data).toEqual([]);
    });
  });

  describe('updateSpot', () => {
    it('should update a spot', async () => {
      mockRequest.mockResolvedValue({ id: 's1', name: 'Updated' });
      const result = await updateSpot('s1', { name: 'Updated' } as Partial<Spot>);
      expect(result.data).toBeTruthy();
      expect(result.error).toBeNull();
    });

    it('should return error on failure', async () => {
      mockRequest.mockRejectedValue(new Error('Update failed'));
      const result = await updateSpot('s1', {} as Partial<Spot>);
      expect(result.data).toBeNull();
      expect(result.error).toBe('Update failed');
    });
  });

  describe('deleteSpot', () => {
    it('should delete a spot', async () => {
      mockRequest.mockResolvedValue(undefined);
      const result = await deleteSpot('s1');
      expect(result.error).toBeNull();
    });

    it('should return error on failure', async () => {
      mockRequest.mockRejectedValue(new Error('Delete failed'));
      const result = await deleteSpot('s1');
      expect(result.error).toBe('Delete failed');
    });
  });

  describe('hasSavedSpot', () => {
    it('should return saved status', async () => {
      mockRequest.mockResolvedValue({ saved: true });
      const result = await hasSavedSpot('s1');
      expect(result.saved).toBe(true);
    });

    it('should return false on error', async () => {
      mockRequest.mockRejectedValue(new Error('Failed'));
      const result = await hasSavedSpot('s1');
      expect(result.saved).toBe(false);
    });
  });

  describe('getSavedSpots', () => {
    it('should return saved spots', async () => {
      mockRequest.mockResolvedValue({ data: [{ id: 's1' }] });
      const result = await getSavedSpots();
      expect(result.data).toHaveLength(1);
      expect(result.error).toBeNull();
    });

    it('should return empty on error', async () => {
      mockRequest.mockRejectedValue(new Error('Failed'));
      const result = await getSavedSpots();
      expect(result.data).toEqual([]);
    });
  });

  describe('saveSpot', () => {
    it('should save a spot', async () => {
      mockRequest.mockResolvedValue(undefined);
      const result = await saveSpot('s1');
      expect(result.error).toBeNull();
    });

    it('should return error on failure', async () => {
      mockRequest.mockRejectedValue(new Error('Save failed'));
      const result = await saveSpot('s1');
      expect(result.error).toBe('Save failed');
    });
  });

  describe('unsaveSpot', () => {
    it('should unsave a spot', async () => {
      mockRequest.mockResolvedValue(undefined);
      const result = await unsaveSpot('s1');
      expect(result.error).toBeNull();
    });

    it('should return error on failure', async () => {
      mockRequest.mockRejectedValue(new Error('Unsave failed'));
      const result = await unsaveSpot('s1');
      expect(result.error).toBe('Unsave failed');
    });
  });

  describe('deleteSpotReview', () => {
    it('should delete a review', async () => {
      mockRequest.mockResolvedValue(undefined);
      const result = await deleteSpotReview('r1');
      expect(result.error).toBeNull();
    });

    it('should return error on failure', async () => {
      mockRequest.mockRejectedValue(new Error('Delete failed'));
      const result = await deleteSpotReview('r1');
      expect(result.error).toBe('Delete failed');
    });
  });

  // =========================================================================
  // CONVERSATIONS
  // =========================================================================

  describe('getConversations', () => {
    it('should return conversations', async () => {
      mockRequest.mockResolvedValue({
        conversations: [{
          id: 'conv1',
          created_at: '2024-01-01T00:00:00Z',
          last_message: { id: 'm1', content: 'Hello', created_at: '2024-01-01T00:00:00Z', sender_id: 'u2' },
          unread_count: 2,
          other_participant: { id: 'u2', username: 'other', full_name: 'Other User', avatar_url: 'https://img.jpg', is_verified: false },
        }],
      });
      const result = await getConversations();
      expect(result.data).toHaveLength(1);
      expect(result.data![0].id).toBe('conv1');
      expect(result.data![0].unread_count).toBe(2);
      expect(result.data![0].other_user?.username).toBe('other');
      expect(result.error).toBeNull();
    });

    it('should return not authenticated', async () => {
      mockGetCurrentUser.mockResolvedValue(null);
      const result = await getConversations();
      expect(result.data).toBeNull();
      expect(result.error).toBe('Not authenticated');
    });

    it('should support nested data.conversations payload', async () => {
      mockRequest.mockResolvedValue({
        data: {
          conversations: [{
            id: 'conv1',
            created_at: '2024-01-01T00:00:00Z',
            last_message: { id: 'm1', content: 'Hello', created_at: '2024-01-01T00:00:00Z', sender_id: 'u2' },
            unread_count: 1,
            other_participant: { id: 'u2', username: 'other', full_name: 'Other User', avatar_url: 'https://img.jpg', is_verified: false },
          }],
        },
      });

      const result = await getConversations();
      expect(result.error).toBeNull();
      expect(result.data).toHaveLength(1);
      expect(result.data?.[0]?.id).toBe('conv1');
      expect(result.data?.[0]?.unread_count).toBe(1);
    });

    it('should handle audio last message preview', async () => {
      mockRequest.mockResolvedValue({
        conversations: [{
          id: 'conv1',
          created_at: '2024-01-01T00:00:00Z',
          last_message: { id: 'm1', content: 'audio', media_type: 'audio', created_at: '2024-01-01T00:00:00Z', sender_id: 'u2' },
          unread_count: 0,
          other_participant: null,
        }],
      });
      const result = await getConversations();
      expect(result.data![0].last_message_preview).toBe('Voice message');
    });

    it('should handle voice last message preview', async () => {
      mockRequest.mockResolvedValue({
        conversations: [{
          id: 'conv1',
          created_at: '2024-01-01T00:00:00Z',
          last_message: { id: 'm1', content: '', media_type: 'voice', created_at: '2024-01-01T00:00:00Z', sender_id: 'u2' },
          unread_count: 0,
          other_participant: null,
        }],
      });
      const result = await getConversations();
      expect(result.data![0].last_message_preview).toBe('Voice message');
    });

    it('should handle shared_post last message preview', async () => {
      mockRequest.mockResolvedValue({
        conversations: [{
          id: 'conv1',
          created_at: '2024-01-01T00:00:00Z',
          last_message: { id: 'm1', content: `[shared_post:${VALID_UUID}]`, created_at: '2024-01-01T00:00:00Z', sender_id: 'u2' },
          unread_count: 0,
          other_participant: null,
        }],
      });
      const result = await getConversations();
      expect(result.data![0].last_message_preview).toBe('Shared a post');
    });

    it('should handle shared_peak last message preview', async () => {
      mockRequest.mockResolvedValue({
        conversations: [{
          id: 'conv1',
          created_at: '2024-01-01T00:00:00Z',
          last_message: { id: 'm1', content: `[shared_peak:${VALID_UUID}]`, created_at: '2024-01-01T00:00:00Z', sender_id: 'u2' },
          unread_count: 0,
          other_participant: null,
        }],
      });
      const result = await getConversations();
      expect(result.data![0].last_message_preview).toBe('Shared a peak');
    });

    it('should handle null last_message', async () => {
      mockRequest.mockResolvedValue({
        conversations: [{
          id: 'conv1',
          created_at: '2024-01-01T00:00:00Z',
          last_message: null,
          unread_count: 0,
          other_participant: null,
        }],
      });
      const result = await getConversations();
      expect(result.data![0].last_message_preview).toBeUndefined();
    });

    it('should return error on failure', async () => {
      mockRequest.mockRejectedValue(new Error('Conversations failed'));
      const result = await getConversations();
      expect(result.data).toBeNull();
      expect(result.error).toBe('Conversations failed');
    });
  });

  // =========================================================================
  // MESSAGES
  // =========================================================================

  describe('getMessages', () => {
    it('should return messages', async () => {
      mockRequest.mockResolvedValue({
        messages: [{
          id: 'm1',
          content: 'Hello',
          sender_id: 'u1',
          read: true,
          created_at: '2024-01-01T00:00:00Z',
          sender: { id: 'u1', username: 'test', display_name: 'Test', avatar_url: 'https://img.jpg' },
        }],
      });
      const result = await getMessages('conv1');
      expect(result.data).toHaveLength(1);
      expect(result.data![0].id).toBe('m1');
      expect(result.data![0].conversation_id).toBe('conv1');
      expect(result.data![0].sender?.username).toBe('test');
      expect(result.error).toBeNull();
    });

    it('should support nested data.messages payload', async () => {
      mockRequest.mockResolvedValue({
        data: {
          messages: [{
            id: 'm1',
            content: 'Nested hello',
            sender_id: 'u1',
            read: true,
            created_at: '2024-01-01T00:00:00Z',
            sender: { id: 'u1', username: 'test', full_name: 'Test Full Name', avatar_url: 'https://img.jpg' },
          }],
        },
      });

      const result = await getMessages('conv1');
      expect(result.error).toBeNull();
      expect(result.data).toHaveLength(1);
      expect(result.data?.[0]?.content).toBe('Nested hello');
      expect(result.data?.[0]?.sender?.full_name).toBe('Test Full Name');
    });

    it('should support data.messages.data with camelCase message fields', async () => {
      mockRequest.mockResolvedValue({
        data: {
          messages: {
            data: [{
              id: 'm-camel',
              text: 'Camel hello',
              senderId: 'u1',
              mediaUrl: 'https://cdn.example.com/chat.jpg',
              mediaType: 'image',
              createdAt: '2024-01-03T00:00:00Z',
              isRead: true,
              sender: { id: 'u1', username: 'test', displayName: 'Test Display', avatarUrl: 'https://img.jpg' },
            }],
          },
        },
      });
      const result = await getMessages('conv1');
      expect(result.error).toBeNull();
      expect(result.data?.[0]?.content).toBe('Camel hello');
      expect(result.data?.[0]?.media_url).toBe('https://cdn.example.com/chat.jpg');
      expect(result.data?.[0]?.is_read).toBe(true);
      expect(result.data?.[0]?.sender?.display_name).toBe('Test Display');
    });

    it('should handle messages with reactions and read receipts', async () => {
      mockRequest.mockResolvedValue({
        messages: [{
          id: 'm1', content: 'Hi', sender_id: 'u1', read: false, created_at: '2024-01-01T00:00:00Z',
          sender: null,
          reactions: [{
            id: 'r1', message_id: 'm1', user_id: 'u2', emoji: '❤️', created_at: '2024-01-01T00:00:00Z',
            user: { id: 'u2', username: 'other', display_name: 'Other', avatar_url: 'https://img.jpg' },
          }],
          read_by: [{
            message_id: 'm1', user_id: 'u2', read_at: '2024-01-01T00:00:00Z',
            user: { id: 'u2', username: 'other', display_name: 'Other', avatar_url: 'https://img.jpg' },
          }],
        }],
      });
      const result = await getMessages('conv1');
      expect(result.data![0].reactions).toHaveLength(1);
      expect(result.data![0].reactions![0].emoji).toBe('❤️');
      expect(result.data![0].read_by).toHaveLength(1);
    });

    it('should handle reply_to_message', async () => {
      mockRequest.mockResolvedValue({
        messages: [{
          id: 'm2', content: 'Reply', sender_id: 'u1', read: false, created_at: '2024-01-02T00:00:00Z',
          sender: null,
          reply_to_message_id: 'm1',
          reply_to_message: {
            id: 'm1', content: 'Original', sender_id: 'u2',
            sender: { id: 'u2', username: 'other', display_name: 'Other', avatar_url: 'https://img.jpg' },
          },
        }],
      });
      const result = await getMessages('conv1');
      expect(result.data![0].reply_to_message).toBeTruthy();
      expect(result.data![0].reply_to_message!.content).toBe('Original');
    });

    it('should handle markAsRead param', async () => {
      mockRequest.mockResolvedValue({ messages: [] });
      await getMessages('conv1', 0, 50, true);
      expect(mockRequest).toHaveBeenCalledWith(expect.stringContaining('markAsRead=true'));
    });

    it('should return error on failure', async () => {
      mockRequest.mockRejectedValue(new Error('Messages failed'));
      const result = await getMessages('conv1');
      expect(result.data).toBeNull();
      expect(result.error).toBe('Messages failed');
    });

    it('should handle is_read from response', async () => {
      mockRequest.mockResolvedValue({
        messages: [{
          id: 'm1', content: 'Test', sender_id: 'u1', read: false, is_read: true,
          created_at: '2024-01-01T00:00:00Z', sender: null,
        }],
      });
      const result = await getMessages('conv1');
      expect(result.data![0].is_read).toBe(true);
    });
  });

  // =========================================================================
  // SEND MESSAGE
  // =========================================================================

  describe('sendMessage', () => {
    const validConvId = VALID_UUID;

    it('should send a message', async () => {
      mockRequest.mockResolvedValue({
        message: {
          id: 'm1', content: 'Hello', sender_id: 'u1', recipient_id: 'u2',
          read: false, created_at: '2024-01-01T00:00:00Z',
          sender: { id: 'u1', username: 'test', display_name: 'Test', avatar_url: 'https://img.jpg' },
        },
      });
      const result = await sendMessage(validConvId, 'Hello');
      expect(result.data).toBeTruthy();
      expect(result.data!.content).toBe('Hello');
      expect(result.error).toBeNull();
    });

    it('should support send response shape where message is directly in data', async () => {
      mockRequest.mockResolvedValue({
        data: {
          id: 'm2',
          text: 'Hi from data',
          senderId: 'u1',
          mediaUrl: 'https://cdn.example.com/img.jpg',
          mediaType: 'image',
          createdAt: '2024-01-01T00:00:00Z',
          sender: { id: 'u1', username: 'test', display_name: 'Test', avatar_url: 'https://img.jpg' },
        },
      });
      const result = await sendMessage(validConvId, 'ignored');
      expect(result.error).toBeNull();
      expect(result.data?.id).toBe('m2');
      expect(result.data?.content).toBe('Hi from data');
      expect(result.data?.media_url).toBe('https://cdn.example.com/img.jpg');
    });

    it('should return error for invalid conversation ID', async () => {
      const result = await sendMessage('invalid-id', 'Hello');
      expect(result.data).toBeNull();
      expect(result.error).toBe('Invalid conversation ID');
    });

    it('should return not authenticated', async () => {
      mockGetCurrentUser.mockResolvedValue(null);
      const result = await sendMessage(validConvId, 'Hello');
      expect(result.data).toBeNull();
      expect(result.error).toBe('Not authenticated');
    });

    it('should return error for empty content', async () => {
      // sanitizeDisplayText returns the same text, empty string is falsy
      const { sanitizeDisplayText } = require('../../utils/sanitize');
      (sanitizeDisplayText as jest.Mock).mockReturnValueOnce('');
      const result = await sendMessage(validConvId, '');
      expect(result.data).toBeNull();
      expect(result.error).toBe('Message content is required');
    });

    it('should handle reply_to_message in response', async () => {
      mockRequest.mockResolvedValue({
        message: {
          id: 'm2', content: 'Reply', sender_id: 'u1', recipient_id: 'u2',
          read: false, created_at: '2024-01-01T00:00:00Z',
          sender: { id: 'u1', username: 'test', display_name: 'Test', avatar_url: 'https://img.jpg' },
          reply_to_message_id: 'm1',
          reply_to_message: {
            id: 'm1', content: 'Original', sender_id: 'u2',
            sender: { id: 'u2', username: 'other', display_name: 'Other', avatar_url: 'https://img2.jpg' },
          },
        },
      });
      const result = await sendMessage(validConvId, 'Reply', undefined, undefined, 'm1');
      expect(result.data!.reply_to_message).toBeTruthy();
      expect(result.data!.reply_to_message!.content).toBe('Original');
    });

    it('should return error on failure', async () => {
      mockRequest.mockRejectedValue(new Error('Send failed'));
      const result = await sendMessage(validConvId, 'Hello');
      expect(result.data).toBeNull();
      expect(result.error).toBe('Send failed');
    });
  });

  // =========================================================================
  // REPORTS
  // =========================================================================

  describe('reportComment', () => {
    it('should report a comment', async () => {
      mockRequest.mockResolvedValue({ id: 'r1' });
      const result = await reportComment('c1', 'spam', 'Spam comment');
      expect(result.data).toEqual({ id: 'r1' });
      expect(result.error).toBeNull();
    });

    it('should return not authenticated', async () => {
      mockGetCurrentUser.mockResolvedValue(null);
      const result = await reportComment('c1', 'spam');
      expect(result.error).toBe('Not authenticated');
    });

    it('should handle already_reported', async () => {
      mockRequest.mockRejectedValue(new Error('User has already reported this content'));
      const result = await reportComment('c1', 'spam');
      expect(result.error).toBe('already_reported');
    });

    it('should return error on failure', async () => {
      mockRequest.mockRejectedValue(new Error('Report failed'));
      const result = await reportComment('c1', 'spam');
      expect(result.error).toBe('Report failed');
    });
  });

  describe('reportPeak', () => {
    it('should report a peak', async () => {
      mockRequest.mockResolvedValue({ id: 'r1' });
      const result = await reportPeak('pk1', 'inappropriate');
      expect(result.data).toEqual({ id: 'r1' });
      expect(result.error).toBeNull();
    });

    it('should return not authenticated', async () => {
      mockGetCurrentUser.mockResolvedValue(null);
      const result = await reportPeak('pk1', 'spam');
      expect(result.error).toBe('Not authenticated');
    });

    it('should handle already_reported', async () => {
      mockRequest.mockRejectedValue(new Error('already reported'));
      const result = await reportPeak('pk1', 'spam');
      expect(result.error).toBe('already_reported');
    });
  });

  describe('reportUser', () => {
    it('should report a user', async () => {
      mockRequest.mockResolvedValue({ id: 'r1' });
      const result = await reportUser('u2', 'harassment', 'Harassing me');
      expect(result.data).toEqual({ id: 'r1' });
      expect(result.error).toBeNull();
    });

    it('should return not authenticated', async () => {
      mockGetCurrentUser.mockResolvedValue(null);
      const result = await reportUser('u2', 'spam');
      expect(result.error).toBe('Not authenticated');
    });

    it('should handle already_reported', async () => {
      mockRequest.mockRejectedValue(new Error('already reported'));
      const result = await reportUser('u2', 'spam');
      expect(result.error).toBe('already_reported');
    });
  });

  describe('reportLivestream', () => {
    it('should report a livestream', async () => {
      mockRequest.mockResolvedValue({ id: 'r1' });
      const result = await reportLivestream('ls1', 'nudity', 'Inappropriate');
      expect(result.data).toEqual({ id: 'r1' });
      expect(result.error).toBeNull();
    });

    it('should return not authenticated', async () => {
      mockGetCurrentUser.mockResolvedValue(null);
      const result = await reportLivestream('ls1', 'spam');
      expect(result.error).toBe('Not authenticated');
    });

    it('should handle already_reported', async () => {
      mockRequest.mockRejectedValue(new Error('already reported'));
      const result = await reportLivestream('ls1', 'spam');
      expect(result.error).toBe('already_reported');
    });
  });

  describe('reportMessage', () => {
    it('should report a message', async () => {
      mockRequest.mockResolvedValue({ id: 'r1' });
      const result = await reportMessage('m1', 'conv1', 'harassment', 'Threats');
      expect(result.data).toEqual({ id: 'r1' });
      expect(result.error).toBeNull();
    });

    it('should return not authenticated', async () => {
      mockGetCurrentUser.mockResolvedValue(null);
      const result = await reportMessage('m1', 'conv1', 'spam');
      expect(result.error).toBe('Not authenticated');
    });

    it('should handle already_reported', async () => {
      mockRequest.mockRejectedValue(new Error('already reported'));
      const result = await reportMessage('m1', 'conv1', 'spam');
      expect(result.error).toBe('already_reported');
    });

    it('should return error on failure', async () => {
      mockRequest.mockRejectedValue(new Error('Report failed'));
      const result = await reportMessage('m1', 'conv1', 'spam');
      expect(result.error).toBe('Report failed');
    });
  });

  // =========================================================================
  // MUTES
  // =========================================================================

  describe('muteUser', () => {
    it('should mute a user', async () => {
      mockRequest.mockResolvedValue({
        id: 'mt1', mutedUserId: 'u2', mutedAt: '2024-01-01T00:00:00Z',
      });
      const result = await muteUser('u2');
      expect(result.data).toBeTruthy();
      expect(result.data!.muted_user_id).toBe('u2');
      expect(result.error).toBeNull();
    });

    it('should return not authenticated', async () => {
      mockGetCurrentUser.mockResolvedValue(null);
      const result = await muteUser('u2');
      expect(result.error).toBe('Not authenticated');
    });

    it('should return error on failure', async () => {
      mockRequest.mockRejectedValue(new Error('Mute failed'));
      const result = await muteUser('u2');
      expect(result.error).toBe('Mute failed');
    });

    it('should handle snake_case response', async () => {
      mockRequest.mockResolvedValue({
        id: 'mt1', muted_user_id: 'u2', muted_at: '2024-01-01T00:00:00Z',
      });
      const result = await muteUser('u2');
      expect(result.data!.muted_user_id).toBe('u2');
    });
  });

  describe('unmuteUser', () => {
    it('should unmute a user', async () => {
      mockRequest.mockResolvedValue(undefined);
      const result = await unmuteUser('u2');
      expect(result.data).toEqual({ success: true });
      expect(result.error).toBeNull();
    });

    it('should return not authenticated', async () => {
      mockGetCurrentUser.mockResolvedValue(null);
      const result = await unmuteUser('u2');
      expect(result.error).toBe('Not authenticated');
    });

    it('should return error on failure', async () => {
      mockRequest.mockRejectedValue(new Error('Unmute failed'));
      const result = await unmuteUser('u2');
      expect(result.error).toBe('Unmute failed');
    });
  });

  describe('getMutedUsers', () => {
    it('should return muted users', async () => {
      mockRequest.mockResolvedValue({
        data: [{ id: 'mt1', mutedUserId: 'u2', mutedAt: '2024-01-01T00:00:00Z' }],
      });
      const result = await getMutedUsers();
      expect(result.data).toHaveLength(1);
      expect(result.data![0].muted_user_id).toBe('u2');
      expect(result.error).toBeNull();
    });

    it('should return not authenticated', async () => {
      mockGetCurrentUser.mockResolvedValue(null);
      const result = await getMutedUsers();
      expect(result.error).toBe('Not authenticated');
    });

    it('should return empty on error', async () => {
      mockRequest.mockRejectedValue(new Error('Failed'));
      const result = await getMutedUsers();
      expect(result.data).toEqual([]);
      expect(result.error).toBe('Failed');
    });
  });

  // =========================================================================
  // FOLLOW REQUESTS
  // =========================================================================

  describe('getPendingFollowRequests', () => {
    it('should return follow requests', async () => {
      mockRequest.mockResolvedValue({ requests: [{ id: 'fr1', requester_id: 'u2', target_id: 'u1', status: 'pending' }] });
      const result = await getPendingFollowRequests();
      expect(result.data).toHaveLength(1);
      expect(result.error).toBeNull();
    });

    it('should return not authenticated', async () => {
      mockGetCurrentUser.mockResolvedValue(null);
      const result = await getPendingFollowRequests();
      expect(result.error).toBe('Not authenticated');
    });

    it('should return empty on error', async () => {
      mockRequest.mockRejectedValue(new Error('Failed'));
      const result = await getPendingFollowRequests();
      expect(result.data).toEqual([]);
    });
  });

  describe('acceptFollowRequest', () => {
    it('should accept a follow request', async () => {
      mockRequest.mockResolvedValue(undefined);
      const result = await acceptFollowRequest('fr1');
      expect(result.error).toBeNull();
    });

    it('should return error on failure', async () => {
      mockRequest.mockRejectedValue(new Error('Accept failed'));
      const result = await acceptFollowRequest('fr1');
      expect(result.error).toBe('Accept failed');
    });
  });

  describe('declineFollowRequest', () => {
    it('should decline a follow request', async () => {
      mockRequest.mockResolvedValue(undefined);
      const result = await declineFollowRequest('fr1');
      expect(result.error).toBeNull();
    });

    it('should return error on failure', async () => {
      mockRequest.mockRejectedValue(new Error('Decline failed'));
      const result = await declineFollowRequest('fr1');
      expect(result.error).toBe('Decline failed');
    });
  });

  describe('getPendingFollowRequestsCount', () => {
    it('should return count', async () => {
      mockRequest.mockResolvedValue({ count: 3 });
      const result = await getPendingFollowRequestsCount();
      expect(result).toBe(3);
    });

    it('should return 0 on error', async () => {
      mockRequest.mockRejectedValue(new Error('Failed'));
      const result = await getPendingFollowRequestsCount();
      expect(result).toBe(0);
    });
  });

  describe('hasPendingFollowRequest', () => {
    it('should return pending status', async () => {
      mockRequest.mockResolvedValue({ hasPending: true });
      const result = await hasPendingFollowRequest('u2');
      expect(result.pending).toBe(true);
      expect(result.hasPending).toBe(true);
    });

    it('should return false on error', async () => {
      mockRequest.mockRejectedValue(new Error('Failed'));
      const result = await hasPendingFollowRequest('u2');
      expect(result.pending).toBe(false);
      expect(result.hasPending).toBe(false);
    });
  });

  describe('cancelFollowRequest', () => {
    it('should cancel a follow request', async () => {
      mockRequest.mockResolvedValue(undefined);
      const result = await cancelFollowRequest('u2');
      expect(result.error).toBeNull();
    });

    it('should return error on failure', async () => {
      mockRequest.mockRejectedValue(new Error('Cancel failed'));
      const result = await cancelFollowRequest('u2');
      expect(result.error).toBe('Cancel failed');
    });
  });

  // =========================================================================
  // REPORT CHECKS
  // =========================================================================

  describe('hasReportedPost', () => {
    it('should return reported status', async () => {
      mockRequest.mockResolvedValue({ hasReported: true });
      const result = await hasReportedPost('p1');
      expect(result.reported).toBe(true);
      expect(result.hasReported).toBe(true);
    });

    it('should return false on error', async () => {
      mockRequest.mockRejectedValue(new Error('Failed'));
      const result = await hasReportedPost('p1');
      expect(result.reported).toBe(false);
      expect(result.hasReported).toBe(false);
    });
  });

  describe('hasReportedUser', () => {
    it('should return reported status', async () => {
      mockRequest.mockResolvedValue({ hasReported: true });
      const result = await hasReportedUser('u2');
      expect(result.reported).toBe(true);
      expect(result.hasReported).toBe(true);
    });

    it('should return false on error', async () => {
      mockRequest.mockRejectedValue(new Error('Failed'));
      const result = await hasReportedUser('u2');
      expect(result.reported).toBe(false);
      expect(result.hasReported).toBe(false);
    });
  });

  // =========================================================================
  // SAVE INTERESTS
  // =========================================================================

  describe('saveUserInterests', () => {
    it('should save interests', async () => {
      mockUpdateProfile.mockResolvedValue(makeAWSProfile());
      const result = await saveUserInterests(['Fitness', 'Yoga']);
      expect(result.error).toBeNull();
      expect(mockUpdateProfile).toHaveBeenCalledWith({ interests: ['Fitness', 'Yoga'] });
    });

    it('should return error on failure', async () => {
      mockUpdateProfile.mockRejectedValue(new Error('Save failed'));
      const result = await saveUserInterests(['Fitness']);
      expect(result.error).toBe('Save failed');
    });
  });

  // =========================================================================
  // ALIASES
  // =========================================================================

  describe('getPostComments', () => {
    it('should be an alias for getComments', () => {
      // getPostComments is assigned as getComments
      expect(typeof getPostComments).toBe('function');
    });
  });

  describe('sharePostToConversation', () => {
    it('should be an alias for sharePostToUser', () => {
      expect(sharePostToConversation).toBe(sharePostToUser);
    });
  });

  // =========================================================================
  // GET OR CREATE CONVERSATION
  // =========================================================================

  describe('getOrCreateConversation', () => {
    it('should return conversation ID from conversation key', async () => {
      mockRequest.mockResolvedValue({ conversation: { id: 'conv1' } });
      const result = await getOrCreateConversation('u2');
      expect(result.data).toBe('conv1');
      expect(result.error).toBeNull();
    });

    it('should return conversation ID from id key', async () => {
      mockRequest.mockResolvedValue({ id: 'conv2' });
      const result = await getOrCreateConversation('u2');
      expect(result.data).toBe('conv2');
      expect(result.error).toBeNull();
    });

    it('should return not authenticated', async () => {
      mockGetCurrentUser.mockResolvedValue(null);
      const result = await getOrCreateConversation('u2');
      expect(result.error).toBe('Not authenticated');
    });

    it('should return error for invalid response', async () => {
      mockRequest.mockResolvedValue({});
      const result = await getOrCreateConversation('u2');
      expect(result.data).toBeNull();
      expect(result.error).toBe('Invalid conversation response');
    });

    it('should return error on failure', async () => {
      mockRequest.mockRejectedValue(new Error('Conversation failed'));
      const result = await getOrCreateConversation('u2');
      expect(result.error).toBe('Conversation failed');
    });
  });

  // =========================================================================
  // SHARE POST TO USER
  // =========================================================================

  describe('sharePostToUser', () => {
    it('should share post to user', async () => {
      mockRequest
        .mockResolvedValueOnce({ conversation: { id: 'conv1' } }) // getOrCreateConversation
        .mockResolvedValueOnce(undefined); // send message
      const result = await sharePostToUser(VALID_UUID, VALID_UUID_2);
      expect(result.error).toBeNull();
    });

    it('should return error for invalid post ID', async () => {
      const result = await sharePostToUser('invalid', VALID_UUID_2);
      expect(result.error).toBe('Invalid post ID');
    });

    it('should return error for invalid user ID', async () => {
      const result = await sharePostToUser(VALID_UUID, 'invalid');
      expect(result.error).toBe('Invalid user ID');
    });

    it('should return error when conversation creation fails', async () => {
      mockGetCurrentUser.mockResolvedValue(null);
      const result = await sharePostToUser(VALID_UUID, VALID_UUID_2);
      expect(result.error).toBeTruthy();
    });

    it('should return error when message send fails', async () => {
      mockRequest
        .mockResolvedValueOnce({ conversation: { id: 'conv1' } })
        .mockRejectedValueOnce(new Error('Send failed'));
      const result = await sharePostToUser(VALID_UUID, VALID_UUID_2);
      expect(result.error).toBe('Send failed');
    });
  });

  // =========================================================================
  // SHARE PEAK TO USER
  // =========================================================================

  describe('sharePeakToUser', () => {
    it('should share peak to user', async () => {
      mockRequest
        .mockResolvedValueOnce({ conversation: { id: 'conv1' } })
        .mockResolvedValueOnce(undefined);
      const result = await sharePeakToUser(VALID_UUID, VALID_UUID_2);
      expect(result.error).toBeNull();
    });

    it('should return error for invalid peak ID', async () => {
      const result = await sharePeakToUser('invalid', VALID_UUID_2);
      expect(result.error).toBe('Invalid peak ID');
    });

    it('should return error for invalid user ID', async () => {
      const result = await sharePeakToUser(VALID_UUID, 'invalid');
      expect(result.error).toBe('Invalid user ID');
    });

    it('should return error on failure', async () => {
      mockRequest
        .mockResolvedValueOnce({ conversation: { id: 'conv1' } })
        .mockRejectedValueOnce(new Error('Send failed'));
      const result = await sharePeakToUser(VALID_UUID, VALID_UUID_2);
      expect(result.error).toBe('Send failed');
    });
  });

  // =========================================================================
  // SHARE PROFILE TO USER
  // =========================================================================

  describe('shareProfileToUser', () => {
    it('should share profile to user', async () => {
      mockRequest
        .mockResolvedValueOnce({ conversation: { id: 'conv1' } })
        .mockResolvedValueOnce(undefined);
      const result = await shareProfileToUser(VALID_UUID, VALID_UUID_2);
      expect(result.error).toBeNull();
    });

    it('should return error for invalid profile ID', async () => {
      const result = await shareProfileToUser('invalid', VALID_UUID_2);
      expect(result.error).toBe('Invalid profile ID');
    });

    it('should return error for invalid user ID', async () => {
      const result = await shareProfileToUser(VALID_UUID, 'invalid');
      expect(result.error).toBe('Invalid user ID');
    });

    it('should return error on failure', async () => {
      mockRequest
        .mockResolvedValueOnce({ conversation: { id: 'conv1' } })
        .mockRejectedValueOnce(new Error('Send failed'));
      const result = await shareProfileToUser(VALID_UUID, VALID_UUID_2);
      expect(result.error).toBe('Send failed');
    });
  });

  // =========================================================================
  // SHARE TEXT TO USER
  // =========================================================================

  describe('shareTextToUser', () => {
    it('should share text to user', async () => {
      mockRequest
        .mockResolvedValueOnce({ conversation: { id: 'conv1' } })
        .mockResolvedValueOnce(undefined);
      const result = await shareTextToUser('Hello!', VALID_UUID_2);
      expect(result.error).toBeNull();
    });

    it('should return error for empty text', async () => {
      const result = await shareTextToUser('', VALID_UUID_2);
      expect(result.error).toBe('Empty message');
    });

    it('should return error for whitespace-only text', async () => {
      const result = await shareTextToUser('   ', VALID_UUID_2);
      expect(result.error).toBe('Empty message');
    });

    it('should return error for invalid user ID', async () => {
      const result = await shareTextToUser('Hello', 'invalid');
      expect(result.error).toBe('Invalid user ID');
    });

    it('should return error on failure', async () => {
      mockRequest
        .mockResolvedValueOnce({ conversation: { id: 'conv1' } })
        .mockRejectedValueOnce(new Error('Send failed'));
      const result = await shareTextToUser('Hello', VALID_UUID_2);
      expect(result.error).toBe('Send failed');
    });
  });

  // =========================================================================
  // MARK CONVERSATION AS READ
  // =========================================================================

  describe('markConversationAsRead', () => {
    it('should mark conversation as read', async () => {
      mockRequest.mockResolvedValue(undefined);
      const result = await markConversationAsRead('conv1');
      expect(result.error).toBeNull();
      expect(mockRequest).toHaveBeenCalledWith(expect.stringContaining('markAsRead=true'));
    });

    it('should return error on failure', async () => {
      mockRequest.mockRejectedValue(new Error('Mark failed'));
      const result = await markConversationAsRead('conv1');
      expect(result.error).toBe('Mark failed');
    });
  });

  // =========================================================================
  // MESSAGE REACTIONS
  // =========================================================================

  describe('AVAILABLE_REACTIONS', () => {
    it('should contain expected emojis', () => {
      expect(AVAILABLE_REACTIONS).toContain('❤️');
      expect(AVAILABLE_REACTIONS).toContain('😂');
      expect(AVAILABLE_REACTIONS).toContain('👍');
      expect(AVAILABLE_REACTIONS).toHaveLength(6);
    });
  });

  describe('addMessageReaction', () => {
    it('should add a reaction', async () => {
      mockRequest.mockResolvedValue({
        reaction: {
          id: 'r1', message_id: 'm1', user_id: 'u1', emoji: '❤️',
          created_at: '2024-01-01T00:00:00Z',
          user: { id: 'u1', username: 'test', display_name: 'Test', avatar_url: 'https://img.jpg' },
        },
      });
      const result = await addMessageReaction('m1', '❤️');
      expect(result.data).toBeTruthy();
      expect(result.data!.emoji).toBe('❤️');
      expect(result.data!.user?.username).toBe('test');
      expect(result.error).toBeNull();
    });

    it('should return not authenticated', async () => {
      mockGetCurrentUser.mockResolvedValue(null);
      const result = await addMessageReaction('m1', '❤️');
      expect(result.error).toBe('Not authenticated');
    });

    it('should return error on failure', async () => {
      mockRequest.mockRejectedValue(new Error('Reaction failed'));
      const result = await addMessageReaction('m1', '❤️');
      expect(result.error).toBe('Reaction failed');
    });

    it('should handle reaction without user', async () => {
      mockRequest.mockResolvedValue({
        reaction: {
          id: 'r1', message_id: 'm1', user_id: 'u1', emoji: '👍',
          created_at: '2024-01-01T00:00:00Z',
        },
      });
      const result = await addMessageReaction('m1', '👍');
      expect(result.data).toBeTruthy();
      expect(result.data!.user).toBeUndefined();
    });
  });

  describe('removeMessageReaction', () => {
    it('should remove a reaction', async () => {
      mockRequest.mockResolvedValue(undefined);
      const result = await removeMessageReaction('m1', '❤️');
      expect(result.success).toBe(true);
      expect(result.error).toBeNull();
    });

    it('should return not authenticated', async () => {
      mockGetCurrentUser.mockResolvedValue(null);
      const result = await removeMessageReaction('m1', '❤️');
      expect(result.success).toBe(false);
      expect(result.error).toBe('Not authenticated');
    });

    it('should return error on failure', async () => {
      mockRequest.mockRejectedValue(new Error('Remove failed'));
      const result = await removeMessageReaction('m1', '❤️');
      expect(result.success).toBe(false);
      expect(result.error).toBe('Remove failed');
    });
  });

  describe('getMessageReactions', () => {
    it('should return reactions', async () => {
      mockRequest.mockResolvedValue({
        reactions: [{
          id: 'r1', message_id: 'm1', user_id: 'u1', emoji: '❤️',
          created_at: '2024-01-01T00:00:00Z',
          user: { id: 'u1', username: 'test', display_name: 'Test', avatar_url: 'https://img.jpg' },
        }],
      });
      const result = await getMessageReactions('m1');
      expect(result.data).toHaveLength(1);
      expect(result.data[0].emoji).toBe('❤️');
      expect(result.error).toBeNull();
    });

    it('should handle empty reactions', async () => {
      mockRequest.mockResolvedValue({ reactions: [] });
      const result = await getMessageReactions('m1');
      expect(result.data).toEqual([]);
    });

    it('should handle null reactions', async () => {
      mockRequest.mockResolvedValue({ reactions: null });
      const result = await getMessageReactions('m1');
      expect(result.data).toEqual([]);
    });

    it('should return empty on error', async () => {
      mockRequest.mockRejectedValue(new Error('Failed'));
      const result = await getMessageReactions('m1');
      expect(result.data).toEqual([]);
      expect(result.error).toBe('Failed');
    });

    it('should handle reaction without user', async () => {
      mockRequest.mockResolvedValue({
        reactions: [{
          id: 'r1', message_id: 'm1', user_id: 'u1', emoji: '👍',
          created_at: '2024-01-01T00:00:00Z',
        }],
      });
      const result = await getMessageReactions('m1');
      expect(result.data[0].user).toBeUndefined();
    });
  });

  // =========================================================================
  // DELETE MESSAGE
  // =========================================================================

  describe('deleteMessage', () => {
    it('should delete a message', async () => {
      mockRequest.mockResolvedValue(undefined);
      const result = await deleteMessage('m1');
      expect(result.success).toBe(true);
      expect(result.error).toBeNull();
    });

    it('should return not authenticated', async () => {
      mockGetCurrentUser.mockResolvedValue(null);
      const result = await deleteMessage('m1');
      expect(result.success).toBe(false);
      expect(result.error).toBe('Not authenticated');
    });

    it('should return error on failure', async () => {
      mockRequest.mockRejectedValue(new Error('Delete failed'));
      const result = await deleteMessage('m1');
      expect(result.success).toBe(false);
      expect(result.error).toBe('Delete failed');
    });
  });

  // =========================================================================
  // FORWARD MESSAGE
  // =========================================================================

  describe('forwardMessage', () => {
    it('should forward a message', async () => {
      mockRequest.mockResolvedValue({
        message: {
          id: 'm2', content: 'Forwarded', sender_id: 'u1',
          created_at: '2024-01-01T00:00:00Z',
          sender: { id: 'u1', username: 'test', display_name: 'Test', avatar_url: 'https://img.jpg' },
        },
      });
      const result = await forwardMessage('m1', 'conv2');
      expect(result.data).toBeTruthy();
      expect(result.data!.content).toBe('Forwarded');
      expect(result.data!.conversation_id).toBe('conv2');
      expect(result.error).toBeNull();
    });

    it('should return not authenticated', async () => {
      mockGetCurrentUser.mockResolvedValue(null);
      const result = await forwardMessage('m1', 'conv2');
      expect(result.data).toBeNull();
      expect(result.error).toBe('Not authenticated');
    });

    it('should return error on failure', async () => {
      mockRequest.mockRejectedValue(new Error('Forward failed'));
      const result = await forwardMessage('m1', 'conv2');
      expect(result.data).toBeNull();
      expect(result.error).toBe('Forward failed');
    });

    it('should handle media in forwarded message', async () => {
      mockRequest.mockResolvedValue({
        message: {
          id: 'm2', content: '', media_url: 'https://cdn.example.com/img.jpg', media_type: 'image',
          sender_id: 'u1', created_at: '2024-01-01T00:00:00Z',
          sender: null,
        },
      });
      const result = await forwardMessage('m1', 'conv2');
      expect(result.data!.media_url).toBe('https://cdn.example.com/img.jpg');
      expect(result.data!.media_type).toBe('image');
    });
  });

  // =========================================================================
  // DISCOVER POSTS
  // =========================================================================

  describe('getDiscoverPosts', () => {
    it('should return discover posts', async () => {
      mockRequest.mockResolvedValue({
        data: [makeAWSPost()],
        nextCursor: 'c1',
        hasMore: true,
      });
      const result = await getDiscoverPosts();
      expect(result.data).toHaveLength(1);
      expect(result.nextCursor).toBe('c1');
      expect(result.hasMore).toBe(true);
      expect(result.error).toBeNull();
    });

    it('should pass limit and cursor', async () => {
      mockRequest.mockResolvedValue({ data: [] });
      await getDiscoverPosts(5, 'cursor1');
      expect(mockRequest).toHaveBeenCalledWith(expect.stringContaining('limit=5'));
      expect(mockRequest).toHaveBeenCalledWith(expect.stringContaining('cursor=cursor1'));
    });

    it('should handle empty data', async () => {
      mockRequest.mockResolvedValue({ data: null });
      const result = await getDiscoverPosts();
      expect(result.data).toEqual([]);
    });

    it('should return empty on error', async () => {
      mockRequest.mockRejectedValue(new Error('Discover failed'));
      const result = await getDiscoverPosts();
      expect(result.data).toEqual([]);
      expect(result.error).toBe('Discover failed');
    });
  });

  // =========================================================================
  // RECENT PEAKS
  // =========================================================================

  describe('getRecentPeaks', () => {
    it('should return recent peaks', async () => {
      mockRequest.mockResolvedValue({
        data: [makeAWSPost({ isPeak: true })],
        nextCursor: 'c1',
        hasMore: true,
      });
      const result = await getRecentPeaks();
      expect(result.data).toHaveLength(1);
      expect(result.nextCursor).toBe('c1');
      expect(result.hasMore).toBe(true);
      expect(result.error).toBeNull();
    });

    it('should pass limit and cursor', async () => {
      mockRequest.mockResolvedValue({ data: [] });
      await getRecentPeaks(5, 'cursor1');
      expect(mockRequest).toHaveBeenCalledWith(expect.stringContaining('limit=5'));
      expect(mockRequest).toHaveBeenCalledWith(expect.stringContaining('cursor=cursor1'));
    });

    it('should handle empty data', async () => {
      mockRequest.mockResolvedValue({ data: null });
      const result = await getRecentPeaks();
      expect(result.data).toEqual([]);
    });

    it('should return empty on error', async () => {
      mockRequest.mockRejectedValue(new Error('Peaks failed'));
      const result = await getRecentPeaks();
      expect(result.data).toEqual([]);
      expect(result.error).toBe('Peaks failed');
    });
  });
});

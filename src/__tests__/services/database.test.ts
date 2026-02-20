/**
 * Database Service Tests
 *
 * Tests the frontend database service layer (AWS API wrapper).
 * Covers profile operations, post operations, follows, search, and more.
 * Complements database.batch.test.ts which covers batch helpers.
 */

// ---------------------------------------------------------------------------
// Mocks — must be declared before imports
// ---------------------------------------------------------------------------

(global as unknown as { __DEV__: boolean }).__DEV__ = false;

jest.mock('@sentry/react-native', () => ({}));
jest.mock('expo-constants', () => ({ default: { manifest: {} } }));
jest.mock('../../config/env', () => ({ ENV: { API_URL: '', STAGE: 'test' } }));
jest.mock('../../lib/sentry', () => ({}));

const mockRequest = jest.fn();
const mockGetProfile = jest.fn();
const mockGetProfileByUsername = jest.fn();
const mockUpdateProfile = jest.fn();
const mockSearchProfiles = jest.fn();
const mockLikePost = jest.fn();
const mockDeletePost = jest.fn();
const mockDeleteComment = jest.fn();
const mockGetComments = jest.fn();
const mockCreateComment = jest.fn();
const mockFollowUser = jest.fn();
const mockUnfollowUser = jest.fn();
const mockGetFollowers = jest.fn();
const mockGetFollowing = jest.fn();
const mockGetNotifications = jest.fn();
const mockMarkNotificationRead = jest.fn();
const mockMarkAllNotificationsRead = jest.fn();
const mockGetUnreadCount = jest.fn();

jest.mock('../../services/aws-api', () => ({
  awsAPI: {
    request: mockRequest,
    getProfile: mockGetProfile,
    getProfileByUsername: mockGetProfileByUsername,
    updateProfile: mockUpdateProfile,
    searchProfiles: mockSearchProfiles,
    likePost: mockLikePost,
    deletePost: mockDeletePost,
    deleteComment: mockDeleteComment,
    getComments: mockGetComments,
    createComment: mockCreateComment,
    followUser: mockFollowUser,
    unfollowUser: mockUnfollowUser,
    getFollowers: mockGetFollowers,
    getFollowing: mockGetFollowing,
    getNotifications: mockGetNotifications,
    markNotificationRead: mockMarkNotificationRead,
    markAllNotificationsRead: mockMarkAllNotificationsRead,
    getUnreadCount: mockGetUnreadCount,
  },
}));

const mockGetCurrentUser = jest.fn();

jest.mock('../../services/aws-auth', () => ({
  awsAuth: { getCurrentUser: mockGetCurrentUser },
}));

jest.mock('../../utils/contentFilters', () => ({
  filterContent: jest.fn(() => ({ clean: true })),
}));

jest.mock('../../utils/cdnUrl', () => ({
  normalizeCdnUrl: jest.fn((url: string | undefined) => url),
}));

jest.mock('../../utils/sanitize', () => ({
  sanitizeDisplayText: jest.fn((text: string) => text),
}));

// Mock stores required by followUser/unfollowUser
jest.mock('../../stores', () => ({
  useFeedStore: {
    getState: () => ({ setFeedCache: jest.fn() }),
  },
}));

// ---------------------------------------------------------------------------
// Imports — after mocks
// ---------------------------------------------------------------------------

import {
  getCurrentUserId,
  getCurrentProfile,
  getProfileById,
  getProfileByUsername,
  updateProfile,
  createProfile,
  searchProfiles,
  searchPosts,
  searchPeaks,
  searchByHashtag,
  likePost,
  hasLikedPost,
  savePost,
  unsavePost,
  hasSavedPost,
  followUser,
  unfollowUser,
  isFollowing,
  getFollowers,
  getFollowing,
  getComments,
  addComment,
  deleteComment,
  getNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  getUnreadNotificationCount,
  getInterests,
  deletePost,
  reportPost,
  blockUser,
  unblockUser,
  getBlockedUsers,
  clearFollowCache,
} from '../../services/database';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('database service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetCurrentUser.mockResolvedValue({ id: 'u1', email: 'test@test.com' });
  });

  // =========================================================================
  // getCurrentUserId
  // =========================================================================

  describe('getCurrentUserId', () => {
    it('should return user ID when authenticated', async () => {
      const id = await getCurrentUserId();
      expect(id).toBe('u1');
    });

    it('should return null when not authenticated', async () => {
      mockGetCurrentUser.mockResolvedValue(null);
      const id = await getCurrentUserId();
      expect(id).toBeNull();
    });
  });

  // =========================================================================
  // getCurrentProfile
  // =========================================================================

  describe('getCurrentProfile', () => {
    it('should return profile', async () => {
      mockGetProfile.mockResolvedValue({
        id: 'u1', username: 'testuser', fullName: 'Test User',
      });

      const result = await getCurrentProfile();
      expect(result.data).toBeTruthy();
      expect(result.data?.username).toBe('testuser');
      expect(result.error).toBeNull();
    });

    it('should return error when not authenticated', async () => {
      mockGetCurrentUser.mockResolvedValue(null);
      const result = await getCurrentProfile();
      expect(result.data).toBeNull();
      expect(result.error).toBe('Not authenticated');
    });

    it('should auto-create profile on 404', async () => {
      mockGetProfile.mockRejectedValue({ statusCode: 404 });
      mockUpdateProfile.mockResolvedValue({
        id: 'u1', username: 'test', fullName: '',
      });

      const result = await getCurrentProfile(true);
      expect(result.data).toBeTruthy();
      expect(mockUpdateProfile).toHaveBeenCalled();
    });

    it('should not auto-create when autoCreate=false', async () => {
      mockGetProfile.mockRejectedValue({ statusCode: 404, message: 'Not found' });

      const result = await getCurrentProfile(false);
      expect(result.data).toBeNull();
      expect(result.error).toBe('Not found');
    });
  });

  // =========================================================================
  // getProfileById
  // =========================================================================

  describe('getProfileById', () => {
    it('should return profile by ID', async () => {
      mockGetProfile.mockResolvedValue({ id: 'u2', username: 'other' });
      const result = await getProfileById('u2');
      expect(result.data?.username).toBe('other');
    });

    it('should return error on failure', async () => {
      mockGetProfile.mockRejectedValue(new Error('Not found'));
      const result = await getProfileById('u2');
      expect(result.data).toBeNull();
      expect(result.error).toBe('Not found');
    });
  });

  // =========================================================================
  // getProfileByUsername
  // =========================================================================

  describe('getProfileByUsername', () => {
    it('should return profile by username', async () => {
      mockGetProfileByUsername.mockResolvedValue({ id: 'u2', username: 'other' });
      const result = await getProfileByUsername('other');
      expect(result.data?.username).toBe('other');
    });
  });

  // =========================================================================
  // updateProfile
  // =========================================================================

  describe('updateProfile', () => {
    it('should update profile with mapped fields', async () => {
      mockUpdateProfile.mockResolvedValue({ id: 'u1', username: 'newname' });

      const result = await updateProfile({ username: 'newname', bio: 'Hello' });
      expect(result.data?.username).toBe('newname');
      expect(mockUpdateProfile).toHaveBeenCalledWith(
        expect.objectContaining({ username: 'newname', bio: 'Hello' })
      );
    });

    it('should return error when not authenticated', async () => {
      mockGetCurrentUser.mockResolvedValue(null);
      const result = await updateProfile({ username: 'test' });
      expect(result.error).toBe('Not authenticated');
    });
  });

  // =========================================================================
  // createProfile
  // =========================================================================

  describe('createProfile', () => {
    it('should delegate to updateProfile', async () => {
      mockUpdateProfile.mockResolvedValue({ id: 'u1', username: 'newuser' });
      const result = await createProfile({ username: 'newuser' });
      expect(result.data).toBeTruthy();
    });
  });

  // =========================================================================
  // searchProfiles
  // =========================================================================

  describe('searchProfiles', () => {
    it('should return matching profiles', async () => {
      mockSearchProfiles.mockResolvedValue({
        data: [{ id: 'u1', username: 'test' }],
        nextCursor: null,
        hasMore: false,
      });

      const result = await searchProfiles('test');
      expect(result.data).toHaveLength(1);
    });

    it('should return empty on error', async () => {
      mockSearchProfiles.mockRejectedValue(new Error('Search failed'));
      const result = await searchProfiles('test');
      expect(result.data).toEqual([]);
      expect(result.error).toBe('Search failed');
    });
  });

  // =========================================================================
  // searchPosts
  // =========================================================================

  describe('searchPosts', () => {
    it('should return empty for empty query', async () => {
      const result = await searchPosts('');
      expect(result.data).toEqual([]);
    });

    it('should return empty for whitespace-only query', async () => {
      const result = await searchPosts('   ');
      expect(result.data).toEqual([]);
    });

    it('should call API with query params', async () => {
      mockRequest.mockResolvedValue({
        data: [{ id: 'p1', authorId: 'u1', content: 'test', createdAt: '2024-01-01', visibility: 'public' }],
        nextCursor: null,
      });

      const result = await searchPosts('test', 10);
      expect(result.data).toHaveLength(1);
    });
  });

  // =========================================================================
  // searchPeaks
  // =========================================================================

  describe('searchPeaks', () => {
    it('should return empty for empty query', async () => {
      const result = await searchPeaks('');
      expect(result.data).toEqual([]);
    });
  });

  // =========================================================================
  // searchByHashtag
  // =========================================================================

  describe('searchByHashtag', () => {
    it('should return empty for empty hashtag', async () => {
      const result = await searchByHashtag('');
      expect(result.data).toEqual([]);
    });

    it('should strip # prefix', async () => {
      mockRequest.mockResolvedValue({ data: [], nextCursor: null });

      await searchByHashtag('#fitness');
      expect(mockRequest).toHaveBeenCalledWith(expect.stringContaining('q=%23fitness'));
    });
  });

  // =========================================================================
  // Post interactions
  // =========================================================================

  describe('likePost', () => {
    it('should like a post', async () => {
      mockLikePost.mockResolvedValue(undefined);
      const result = await likePost('p1');
      expect(result.error).toBeNull();
    });

    it('should return error on failure', async () => {
      mockLikePost.mockRejectedValue(new Error('Like failed'));
      const result = await likePost('p1');
      expect(result.error).toBe('Like failed');
    });

    it('should return error when not authenticated', async () => {
      mockGetCurrentUser.mockResolvedValue(null);
      const result = await likePost('p1');
      expect(result.error).toBe('Not authenticated');
    });
  });

  describe('hasLikedPost', () => {
    it('should return hasLiked status', async () => {
      mockRequest.mockResolvedValue({ hasLiked: true });
      const result = await hasLikedPost('p1');
      expect(result.hasLiked).toBe(true);
    });

    it('should return false when not authenticated', async () => {
      mockGetCurrentUser.mockResolvedValue(null);
      const result = await hasLikedPost('p1');
      expect(result.hasLiked).toBe(false);
    });
  });

  describe('savePost', () => {
    it('should save a post', async () => {
      mockRequest.mockResolvedValue(undefined);
      const result = await savePost('p1');
      expect(result.error).toBeNull();
    });
  });

  describe('unsavePost', () => {
    it('should unsave a post', async () => {
      mockRequest.mockResolvedValue(undefined);
      const result = await unsavePost('p1');
      expect(result.error).toBeNull();
    });
  });

  describe('hasSavedPost', () => {
    it('should return saved status', async () => {
      mockRequest.mockResolvedValue({ saved: true });
      const result = await hasSavedPost('p1');
      expect(result.saved).toBe(true);
    });
  });

  describe('deletePost', () => {
    it('should delete a post', async () => {
      mockDeletePost.mockResolvedValue(undefined);
      const result = await deletePost('p1');
      expect(result.error).toBeNull();
    });
  });

  // =========================================================================
  // Follow operations
  // =========================================================================

  describe('followUser', () => {
    it('should follow a user', async () => {
      mockFollowUser.mockResolvedValue({ type: 'followed' });
      const result = await followUser('u2');
      expect(result.error).toBeNull();
    });

    it('should handle follow request created for private accounts', async () => {
      mockFollowUser.mockResolvedValue({ type: 'request_created' });
      const result = await followUser('u2');
      expect(result.error).toBeNull();
      expect(result.requestCreated).toBe(true);
    });
  });

  describe('unfollowUser', () => {
    it('should unfollow a user', async () => {
      mockUnfollowUser.mockResolvedValue({});
      const result = await unfollowUser('u2');
      expect(result.error).toBeNull();
    });
  });

  describe('isFollowing', () => {
    it('should return following status', async () => {
      mockRequest.mockResolvedValue({ isFollowing: true });
      const result = await isFollowing('u2');
      expect(result.isFollowing).toBe(true);
    });

    it('should return false when not authenticated', async () => {
      mockGetCurrentUser.mockResolvedValue(null);
      const result = await isFollowing('u2');
      expect(result.isFollowing).toBe(false);
    });
  });

  describe('getFollowers', () => {
    it('should return followers list', async () => {
      mockGetFollowers.mockResolvedValue({
        data: [{ id: 'u3', username: 'follower' }],
        nextCursor: null,
        hasMore: false,
      });
      const result = await getFollowers('u1');
      expect(result.data).toHaveLength(1);
    });
  });

  describe('getFollowing', () => {
    it('should return following list', async () => {
      mockGetFollowing.mockResolvedValue({
        data: [{ id: 'u4', username: 'following' }],
        nextCursor: null,
        hasMore: false,
      });
      const result = await getFollowing('u1');
      expect(result.data).toHaveLength(1);
    });
  });

  describe('clearFollowCache', () => {
    it('should not throw (no-op)', () => {
      expect(() => clearFollowCache()).not.toThrow();
    });
  });

  // =========================================================================
  // Comments
  // =========================================================================

  describe('getComments', () => {
    it('should return comments for a post', async () => {
      mockGetComments.mockResolvedValue({
        data: [{
          id: 'c1', content: 'Great!', authorId: 'u2', postId: 'p1', createdAt: '2024-01-01',
        }],
        nextCursor: null,
        hasMore: false,
      });
      const result = await getComments('p1');
      expect(result.data).toHaveLength(1);
    });
  });

  describe('addComment', () => {
    it('should add a comment', async () => {
      mockCreateComment.mockResolvedValue({ id: 'c1', content: 'Nice', authorId: 'u1', postId: 'p1', createdAt: '2024-01-01' });
      const result = await addComment('p1', 'Nice');
      expect(result.error).toBeNull();
    });

    it('should return error when not authenticated', async () => {
      mockGetCurrentUser.mockResolvedValue(null);
      const result = await addComment('p1', 'Hello');
      expect(result.error).toBe('Not authenticated');
    });
  });

  describe('deleteComment', () => {
    it('should delete a comment', async () => {
      mockDeleteComment.mockResolvedValue(undefined);
      const result = await deleteComment('c1');
      expect(result.error).toBeNull();
    });
  });

  // =========================================================================
  // Notifications
  // =========================================================================

  describe('getNotifications', () => {
    it('should return notifications', async () => {
      mockGetNotifications.mockResolvedValue({
        data: [{ id: 'n1', type: 'like' }],
      });
      const result = await getNotifications();
      expect(result.data).toHaveLength(1);
    });

    it('should return error when not authenticated', async () => {
      mockGetCurrentUser.mockResolvedValue(null);
      const result = await getNotifications();
      expect(result.error).toBe('Not authenticated');
    });
  });

  describe('markNotificationRead', () => {
    it('should mark notification as read', async () => {
      mockMarkNotificationRead.mockResolvedValue(undefined);
      const result = await markNotificationRead('n1');
      expect(result.error).toBeNull();
    });
  });

  describe('markAllNotificationsRead', () => {
    it('should mark all as read', async () => {
      mockMarkAllNotificationsRead.mockResolvedValue(undefined);
      const result = await markAllNotificationsRead();
      expect(result.error).toBeNull();
    });
  });

  describe('getUnreadNotificationCount', () => {
    it('should return unread count', async () => {
      mockGetUnreadCount.mockResolvedValue({ unreadCount: 5 });
      const result = await getUnreadNotificationCount();
      expect(result.count).toBe(5);
    });

    it('should return 0 on error', async () => {
      mockGetUnreadCount.mockRejectedValue(new Error('Fail'));
      const result = await getUnreadNotificationCount();
      expect(result.count).toBe(0);
    });
  });

  // =========================================================================
  // Interests
  // =========================================================================

  describe('getInterests', () => {
    it('should return interests list', async () => {
      mockRequest.mockResolvedValue({
        data: [{ id: 'i1', name: 'Fitness' }, { id: 'i2', name: 'Art' }],
      });
      const result = await getInterests();
      expect(result.data).toHaveLength(2);
    });
  });

  // =========================================================================
  // Moderation
  // =========================================================================

  describe('reportPost', () => {
    it('should report a post', async () => {
      mockRequest.mockResolvedValue({ id: 'r1' });
      const result = await reportPost('p1', 'spam', 'Spam content');
      expect(result.error).toBeNull();
    });

    it('should handle error', async () => {
      mockRequest.mockRejectedValue(new Error('Report failed'));
      const result = await reportPost('p1', 'spam');
      expect(result.error).toBe('Report failed');
    });
  });

  describe('blockUser', () => {
    it('should block a user', async () => {
      mockRequest.mockResolvedValue({ id: 'b1', blockedUserId: 'u2', blockedAt: '2024-01-01' });
      const result = await blockUser('u2');
      expect(result.error).toBeNull();
      expect(result.data?.blocked_user_id).toBe('u2');
    });
  });

  describe('unblockUser', () => {
    it('should unblock a user', async () => {
      mockRequest.mockResolvedValue(undefined);
      const result = await unblockUser('u2');
      expect(result.error).toBeNull();
      expect(result.data?.success).toBe(true);
    });
  });

  describe('getBlockedUsers', () => {
    it('should return blocked users', async () => {
      mockRequest.mockResolvedValue({
        data: [{ id: 'b1', blockedUserId: 'u2', blockedAt: '2024-01-01' }],
      });
      const result = await getBlockedUsers();
      expect(result.data).toHaveLength(1);
    });

    it('should return error when not authenticated', async () => {
      mockGetCurrentUser.mockResolvedValue(null);
      const result = await getBlockedUsers();
      expect(result.error).toBe('Not authenticated');
    });
  });
});

/**
 * Backend Service Tests
 *
 * Tests the backend service which wraps AWS auth and API calls.
 * All AWS dependencies are mocked.
 */

// ---------------------------------------------------------------------------
// Mocks — must be declared before imports
// ---------------------------------------------------------------------------

const mockAwsAuth = {
  initialize: jest.fn(),
  signUp: jest.fn(),
  signIn: jest.fn(),
  signOut: jest.fn(),
  getCurrentUser: jest.fn(),
  forgotPassword: jest.fn(),
  confirmForgotPassword: jest.fn(),
  confirmSignUp: jest.fn(),
  resendConfirmationCode: jest.fn(),
  onAuthStateChange: jest.fn(),
};

const mockAwsAPI = {
  getPosts: jest.fn(),
  createPost: jest.fn(),
  likePost: jest.fn(),
  getProfile: jest.fn(),
  updateProfile: jest.fn(),
  searchProfiles: jest.fn(),
  followUser: jest.fn(),
  unfollowUser: jest.fn(),
  getNotifications: jest.fn(),
};

jest.mock('../../services/aws-auth', () => ({
  awsAuth: mockAwsAuth,
}));

jest.mock('../../services/aws-api', () => ({
  awsAPI: mockAwsAPI,
  APIError: class APIError extends Error {},
}));

(global as Record<string, unknown>).__DEV__ = false;

// ---------------------------------------------------------------------------
// Imports — after mocks
// ---------------------------------------------------------------------------

import {
  initializeBackend,
  isUsingAWS,
  initializeAuth,
  signUp,
  signIn,
  signOut,
  getCurrentUser,
  forgotPassword,
  confirmForgotPassword,
  confirmSignUp,
  resendConfirmationCode,
  onAuthStateChange,
  getPosts,
  createPost,
  likePost,
  getProfile,
  updateProfile,
  searchProfiles,
  followUser,
  unfollowUser,
  getNotifications,
} from '../../services/backend';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('backend', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // =========================================================================
  // Initialization
  // =========================================================================

  describe('initializeBackend', () => {
    it('should resolve without error', async () => {
      await expect(initializeBackend()).resolves.toBeUndefined();
    });
  });

  describe('isUsingAWS', () => {
    it('should always return true', () => {
      expect(isUsingAWS()).toBe(true);
    });
  });

  // =========================================================================
  // Authentication
  // =========================================================================

  describe('initializeAuth', () => {
    it('should return user when initialized', async () => {
      mockAwsAuth.initialize.mockResolvedValue({ id: 'u1', email: 'a@b.com', username: 'ab' });
      const result = await initializeAuth();
      expect(result).toEqual({ id: 'u1', email: 'a@b.com', username: 'ab' });
    });

    it('should return null when no user', async () => {
      mockAwsAuth.initialize.mockResolvedValue(null);
      const result = await initializeAuth();
      expect(result).toBeNull();
    });
  });

  describe('signUp', () => {
    it('should return user and confirmationRequired', async () => {
      mockAwsAuth.signUp.mockResolvedValue({
        user: { id: 'u1', email: 'a@b.com', username: 'ab' },
        confirmationRequired: true,
      });
      const result = await signUp({ email: 'a@b.com', password: 'pass', username: 'ab' });
      expect(result.user).toEqual({ id: 'u1', email: 'a@b.com', username: 'ab' });
      expect(result.confirmationRequired).toBe(true);
    });

    it('should return null user when auth returns null', async () => {
      mockAwsAuth.signUp.mockResolvedValue({ user: null, confirmationRequired: false });
      const result = await signUp({ email: 'a@b.com', password: 'pass', username: 'ab' });
      expect(result.user).toBeNull();
    });
  });

  describe('signIn', () => {
    it('should return mapped user', async () => {
      mockAwsAuth.signIn.mockResolvedValue({ id: 'u1', email: 'a@b.com', username: 'ab' });
      const result = await signIn({ email: 'a@b.com', password: 'pass' });
      expect(result).toEqual({ id: 'u1', email: 'a@b.com', username: 'ab' });
    });
  });

  describe('signOut', () => {
    it('should delegate to awsAuth.signOut', async () => {
      mockAwsAuth.signOut.mockResolvedValue(undefined);
      await signOut();
      expect(mockAwsAuth.signOut).toHaveBeenCalledTimes(1);
    });
  });

  describe('getCurrentUser', () => {
    it('should return user when authenticated', async () => {
      mockAwsAuth.getCurrentUser.mockResolvedValue({ id: 'u1', email: 'a@b.com', username: 'ab' });
      const result = await getCurrentUser();
      expect(result).toEqual({ id: 'u1', email: 'a@b.com', username: 'ab' });
    });

    it('should return null when not authenticated', async () => {
      mockAwsAuth.getCurrentUser.mockResolvedValue(null);
      const result = await getCurrentUser();
      expect(result).toBeNull();
    });
  });

  describe('forgotPassword', () => {
    it('should delegate to awsAuth', async () => {
      mockAwsAuth.forgotPassword.mockResolvedValue(undefined);
      await forgotPassword('a@b.com');
      expect(mockAwsAuth.forgotPassword).toHaveBeenCalledWith('a@b.com');
    });
  });

  describe('confirmForgotPassword', () => {
    it('should delegate to awsAuth', async () => {
      mockAwsAuth.confirmForgotPassword.mockResolvedValue(undefined);
      await confirmForgotPassword('a@b.com', '123456', 'newpass');
      expect(mockAwsAuth.confirmForgotPassword).toHaveBeenCalledWith('a@b.com', '123456', 'newpass');
    });
  });

  describe('confirmSignUp', () => {
    it('should return result from awsAuth', async () => {
      mockAwsAuth.confirmSignUp.mockResolvedValue(true);
      const result = await confirmSignUp('a@b.com', '123456');
      expect(result).toBe(true);
    });
  });

  describe('resendConfirmationCode', () => {
    it('should return result from awsAuth', async () => {
      mockAwsAuth.resendConfirmationCode.mockResolvedValue(true);
      const result = await resendConfirmationCode('a@b.com');
      expect(result).toBe(true);
    });
  });

  describe('onAuthStateChange', () => {
    it('should subscribe and map user', () => {
      const unsubscribe = jest.fn();
      mockAwsAuth.onAuthStateChange.mockImplementation((cb: (user: unknown) => void) => {
        cb({ id: 'u1', email: 'a@b.com', username: 'ab' });
        return unsubscribe;
      });

      const callback = jest.fn();
      const unsub = onAuthStateChange(callback);

      expect(callback).toHaveBeenCalledWith({ id: 'u1', email: 'a@b.com', username: 'ab' });
      expect(unsub).toBe(unsubscribe);
    });

    it('should pass null when no user', () => {
      mockAwsAuth.onAuthStateChange.mockImplementation((cb: (user: unknown) => void) => {
        cb(null);
        return jest.fn();
      });

      const callback = jest.fn();
      onAuthStateChange(callback);

      expect(callback).toHaveBeenCalledWith(null);
    });
  });

  // =========================================================================
  // Posts
  // =========================================================================

  describe('getPosts', () => {
    it('should return posts from AWS API', async () => {
      const mockPosts = [{ id: 'p1' }, { id: 'p2' }];
      mockAwsAPI.getPosts.mockResolvedValue({
        data: mockPosts,
        nextCursor: 'cursor1',
        hasMore: true,
      });

      const result = await getPosts({ limit: 10 });

      expect(result.posts).toEqual(mockPosts);
      expect(result.nextCursor).toBe('cursor1');
      expect(result.hasMore).toBe(true);
    });
  });

  describe('createPost', () => {
    it('should delegate to awsAPI', async () => {
      const mockPost = { id: 'p1', content: 'Hello' };
      mockAwsAPI.createPost.mockResolvedValue(mockPost);

      const result = await createPost({ content: 'Hello' } as never);
      expect(result).toEqual(mockPost);
    });
  });

  describe('likePost', () => {
    it('should delegate to awsAPI', async () => {
      mockAwsAPI.likePost.mockResolvedValue(undefined);
      await likePost('p1');
      expect(mockAwsAPI.likePost).toHaveBeenCalledWith('p1');
    });
  });

  // =========================================================================
  // Profiles
  // =========================================================================

  describe('getProfile', () => {
    it('should delegate to awsAPI', async () => {
      const mockProfile = { id: 'u1', username: 'test' };
      mockAwsAPI.getProfile.mockResolvedValue(mockProfile);

      const result = await getProfile('u1');
      expect(result).toEqual(mockProfile);
    });
  });

  describe('updateProfile', () => {
    it('should delegate to awsAPI', async () => {
      const mockProfile = { id: 'u1', username: 'test' };
      mockAwsAPI.updateProfile.mockResolvedValue(mockProfile);

      const result = await updateProfile({ username: 'test' } as never);
      expect(result).toEqual(mockProfile);
    });
  });

  describe('searchProfiles', () => {
    it('should return profiles from API', async () => {
      mockAwsAPI.searchProfiles.mockResolvedValue({ data: [{ id: 'u1' }] });
      const result = await searchProfiles('test');
      expect(result).toEqual([{ id: 'u1' }]);
    });

    it('should return empty array when data is null', async () => {
      mockAwsAPI.searchProfiles.mockResolvedValue({ data: null });
      const result = await searchProfiles('test');
      expect(result).toEqual([]);
    });
  });

  // =========================================================================
  // Follows
  // =========================================================================

  describe('followUser', () => {
    it('should delegate to awsAPI', async () => {
      mockAwsAPI.followUser.mockResolvedValue(undefined);
      await followUser('u2');
      expect(mockAwsAPI.followUser).toHaveBeenCalledWith('u2');
    });
  });

  describe('unfollowUser', () => {
    it('should delegate to awsAPI', async () => {
      mockAwsAPI.unfollowUser.mockResolvedValue(undefined);
      await unfollowUser('u2');
      expect(mockAwsAPI.unfollowUser).toHaveBeenCalledWith('u2');
    });
  });

  // =========================================================================
  // Notifications
  // =========================================================================

  describe('getNotifications', () => {
    it('should return notifications from API', async () => {
      const mockNotifs = [{ id: 'n1', type: 'like' }];
      mockAwsAPI.getNotifications.mockResolvedValue({ data: mockNotifs });

      const result = await getNotifications();
      expect(result).toEqual(mockNotifs);
    });
  });
});

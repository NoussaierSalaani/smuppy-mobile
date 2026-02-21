/**
 * Content Store Tests
 */

import { useContentStore } from '../../stores/contentStore';

// Mock the database functions
jest.mock('../../services/database', () => ({
  reportPost: jest.fn(),
  reportUser: jest.fn(),
  hasReportedPost: jest.fn(),
  hasReportedUser: jest.fn(),
}));

import {
  reportPost as mockReportPost,
  reportUser as mockReportUser,
  hasReportedPost as mockHasReportedPost,
  hasReportedUser as mockHasReportedUser,
} from '../../services/database';

describe('ContentStore', () => {
  // Reset store before each test
  beforeEach(() => {
    useContentStore.getState().reset();
    jest.clearAllMocks();
  });

  describe('Initial State', () => {
    it('should have empty arrays initially', () => {
      const state = useContentStore.getState();
      expect(state.reportedPosts).toEqual([]);
      expect(state.reportedUsers).toEqual([]);
      expect(state.contentStatus).toEqual({});
    });
  });

  describe('hasUserReportedPost', () => {
    it('should return false for unreported posts', () => {
      const result = useContentStore.getState().hasUserReportedPost('post-123');
      expect(result).toBe(false);
    });

    it('should return true for reported posts', () => {
      useContentStore.setState({ reportedPosts: ['post-123'] });
      const result = useContentStore.getState().hasUserReportedPost('post-123');
      expect(result).toBe(true);
    });
  });

  describe('hasUserReportedUser', () => {
    it('should return false for unreported users', () => {
      const result = useContentStore.getState().hasUserReportedUser('user-123');
      expect(result).toBe(false);
    });

    it('should return true for reported users', () => {
      useContentStore.setState({ reportedUsers: ['user-123'] });
      const result = useContentStore.getState().hasUserReportedUser('user-123');
      expect(result).toBe(true);
    });
  });

  describe('submitPostReport', () => {
    it('should return error if post already reported locally', async () => {
      useContentStore.setState({ reportedPosts: ['post-123'] });

      const result = await useContentStore.getState().submitPostReport('post-123', 'spam');

      expect(result.success).toBe(false);
      expect(result.alreadyReported).toBe(true);
      expect(mockReportPost).not.toHaveBeenCalled();
    });

    it('should submit report and update state on success', async () => {
      (mockReportPost as jest.Mock).mockResolvedValue({ error: null });

      const result = await useContentStore.getState().submitPostReport('post-123', 'spam', 'details');

      expect(result.success).toBe(true);
      expect(result.alreadyReported).toBe(false);
      expect(mockReportPost).toHaveBeenCalledWith('post-123', 'spam', 'details');
      expect(useContentStore.getState().reportedPosts).toContain('post-123');
      expect(useContentStore.getState().contentStatus['post-123']).toBe('under_review');
    });

    it('should handle already_reported error from server', async () => {
      (mockReportPost as jest.Mock).mockResolvedValue({ error: 'already_reported' });

      const result = await useContentStore.getState().submitPostReport('post-123', 'spam');

      expect(result.success).toBe(false);
      expect(result.alreadyReported).toBe(true);
      expect(useContentStore.getState().reportedPosts).toContain('post-123');
    });

    it('should handle other errors from server', async () => {
      (mockReportPost as jest.Mock).mockResolvedValue({ error: 'server_error' });

      const result = await useContentStore.getState().submitPostReport('post-123', 'spam');

      expect(result.success).toBe(false);
      expect(result.alreadyReported).toBe(false);
      expect(result.message).toBe('server_error');
    });
  });

  describe('submitUserReport', () => {
    it('should return error if user already reported locally', async () => {
      useContentStore.setState({ reportedUsers: ['user-123'] });

      const result = await useContentStore.getState().submitUserReport('user-123', 'harassment');

      expect(result.success).toBe(false);
      expect(result.alreadyReported).toBe(true);
      expect(mockReportUser).not.toHaveBeenCalled();
    });

    it('should submit report and update state on success', async () => {
      (mockReportUser as jest.Mock).mockResolvedValue({ error: null });

      const result = await useContentStore.getState().submitUserReport('user-123', 'harassment');

      expect(result.success).toBe(true);
      expect(result.alreadyReported).toBe(false);
      expect(mockReportUser).toHaveBeenCalledWith('user-123', 'harassment', undefined);
      expect(useContentStore.getState().reportedUsers).toContain('user-123');
    });
  });

  describe('submitReport (legacy sync method)', () => {
    it('should return error if content already reported', () => {
      useContentStore.setState({ reportedPosts: ['post-123'] });

      const result = useContentStore.getState().submitReport('post-123', 'spam');

      expect(result.success).toBe(false);
      expect(result.alreadyReported).toBe(true);
    });

    it('should add to reported posts and update status', () => {
      const result = useContentStore.getState().submitReport('post-123', 'spam');

      expect(result.success).toBe(true);
      expect(useContentStore.getState().reportedPosts).toContain('post-123');
      expect(useContentStore.getState().contentStatus['post-123']).toBe('under_review');
    });
  });

  describe('checkPostReportedStatus', () => {
    it('should return true if already in local state', async () => {
      useContentStore.setState({ reportedPosts: ['post-123'] });

      const result = await useContentStore.getState().checkPostReportedStatus('post-123');

      expect(result).toBe(true);
      expect(mockHasReportedPost).not.toHaveBeenCalled();
    });

    it('should check server if not in local state', async () => {
      (mockHasReportedPost as jest.Mock).mockResolvedValue({ reported: true });

      const result = await useContentStore.getState().checkPostReportedStatus('post-123');

      expect(result).toBe(true);
      expect(mockHasReportedPost).toHaveBeenCalledWith('post-123');
      expect(useContentStore.getState().reportedPosts).toContain('post-123');
    });

    it('should return false if not reported anywhere', async () => {
      (mockHasReportedPost as jest.Mock).mockResolvedValue({ reported: false });

      const result = await useContentStore.getState().checkPostReportedStatus('post-123');

      expect(result).toBe(false);
    });
  });

  describe('checkUserReportedStatus', () => {
    it('should return true if already in local state', async () => {
      useContentStore.setState({ reportedUsers: ['user-123'] });

      const result = await useContentStore.getState().checkUserReportedStatus('user-123');

      expect(result).toBe(true);
      expect(mockHasReportedUser).not.toHaveBeenCalled();
    });

    it('should check server if not in local state', async () => {
      (mockHasReportedUser as jest.Mock).mockResolvedValue({ reported: true });

      const result = await useContentStore.getState().checkUserReportedStatus('user-123');

      expect(result).toBe(true);
      expect(mockHasReportedUser).toHaveBeenCalledWith('user-123');
      expect(useContentStore.getState().reportedUsers).toContain('user-123');
    });
  });

  describe('getContentStatus', () => {
    it('should return "active" by default', () => {
      const result = useContentStore.getState().getContentStatus('post-123');
      expect(result).toBe('active');
    });

    it('should return stored status', () => {
      useContentStore.setState({ contentStatus: { 'post-123': 'under_review' } });
      const result = useContentStore.getState().getContentStatus('post-123');
      expect(result).toBe('under_review');
    });
  });

  describe('isUnderReview', () => {
    it('should return false for active content', () => {
      const result = useContentStore.getState().isUnderReview('post-123');
      expect(result).toBe(false);
    });

    it('should return true for content under review', () => {
      useContentStore.setState({ contentStatus: { 'post-123': 'under_review' } });
      const result = useContentStore.getState().isUnderReview('post-123');
      expect(result).toBe(true);
    });
  });

  describe('isActive', () => {
    it('should return true for active content', () => {
      const result = useContentStore.getState().isActive('post-123');
      expect(result).toBe(true);
    });

    it('should return false for content under review', () => {
      useContentStore.setState({ contentStatus: { 'post-123': 'under_review' } });
      const result = useContentStore.getState().isActive('post-123');
      expect(result).toBe(false);
    });
  });

  describe('reset', () => {
    it('should clear all state', () => {
      useContentStore.setState({
        reportedPosts: ['post-1', 'post-2'],
        reportedUsers: ['user-1'],
        contentStatus: { 'post-1': 'under_review' },
      });

      useContentStore.getState().reset();

      const state = useContentStore.getState();
      expect(state.reportedPosts).toEqual([]);
      expect(state.reportedUsers).toEqual([]);
      expect(state.contentStatus).toEqual({});
    });

    it('should be safe to call when already empty', () => {
      useContentStore.getState().reset();
      useContentStore.getState().reset();

      const state = useContentStore.getState();
      expect(state.reportedPosts).toEqual([]);
      expect(state.reportedUsers).toEqual([]);
      expect(state.contentStatus).toEqual({});
    });
  });

  describe('Edge Cases', () => {
    it('submitPostReport should propagate rejection from server', async () => {
      (mockReportPost as jest.Mock).mockRejectedValue(new Error('Network error'));

      await expect(
        useContentStore.getState().submitPostReport('post-123', 'spam')
      ).rejects.toThrow('Network error');
    });

    it('submitUserReport should propagate rejection from server', async () => {
      (mockReportUser as jest.Mock).mockRejectedValue(new Error('Timeout'));

      await expect(
        useContentStore.getState().submitUserReport('user-123', 'harassment')
      ).rejects.toThrow('Timeout');
    });

    it('checkPostReportedStatus should propagate rejection from server', async () => {
      (mockHasReportedPost as jest.Mock).mockRejectedValue(new Error('Server error'));

      await expect(
        useContentStore.getState().checkPostReportedStatus('post-123')
      ).rejects.toThrow('Server error');
    });

    it('checkUserReportedStatus should propagate rejection from server', async () => {
      (mockHasReportedUser as jest.Mock).mockRejectedValue(new Error('Server error'));

      await expect(
        useContentStore.getState().checkUserReportedStatus('user-123')
      ).rejects.toThrow('Server error');
    });

    it('submitPostReport rollback should work on server error', async () => {
      (mockReportPost as jest.Mock).mockResolvedValue({ error: 'rate_limited' });

      const result = await useContentStore.getState().submitPostReport('post-rollback', 'spam');
      expect(result.success).toBe(false);
      // Optimistic add should have been rolled back
      expect(useContentStore.getState().reportedPosts).not.toContain('post-rollback');
    });

    it('submitUserReport rollback should work on server error', async () => {
      (mockReportUser as jest.Mock).mockResolvedValue({ error: 'rate_limited' });

      const result = await useContentStore.getState().submitUserReport('user-rollback', 'harassment');
      expect(result.success).toBe(false);
      // Optimistic add should have been rolled back
      expect(useContentStore.getState().reportedUsers).not.toContain('user-rollback');
    });
  });
});

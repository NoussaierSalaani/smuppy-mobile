/**
 * User Safety Store Tests
 * Tests for mute/block user management with optimistic updates
 */

// Define __DEV__ global
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(global as any).__DEV__ = false;

// Mock database functions
const mockBlockUser = jest.fn();
const mockUnblockUser = jest.fn();
const mockGetBlockedUsers = jest.fn();
const mockMuteUser = jest.fn();
const mockUnmuteUser = jest.fn();
const mockGetMutedUsers = jest.fn();

jest.mock('../../services/database', () => ({
  blockUser: (...args: unknown[]) => mockBlockUser(...args),
  unblockUser: (...args: unknown[]) => mockUnblockUser(...args),
  getBlockedUsers: (...args: unknown[]) => mockGetBlockedUsers(...args),
  muteUser: (...args: unknown[]) => mockMuteUser(...args),
  unmuteUser: (...args: unknown[]) => mockUnmuteUser(...args),
  getMutedUsers: (...args: unknown[]) => mockGetMutedUsers(...args),
}));

import { useUserSafetyStore } from '../../stores/userSafetyStore';

describe('UserSafetyStore', () => {
  beforeEach(() => {
    useUserSafetyStore.getState().reset();
    jest.clearAllMocks();
  });

  describe('Initial State', () => {
    it('should start uninitialized', () => {
      const state = useUserSafetyStore.getState();
      expect(state.isInitialized).toBe(false);
      expect(state.isLoading).toBe(false);
      expect(state.mutedUserIds).toEqual([]);
      expect(state.blockedUserIds).toEqual([]);
    });
  });

  describe('Initialize', () => {
    it('should load blocked and muted users from database', async () => {
      mockGetBlockedUsers.mockResolvedValue({
        data: [{ blocked_user_id: 'user-1' }],
      });
      mockGetMutedUsers.mockResolvedValue({
        data: [{ muted_user_id: 'user-2' }],
      });

      await useUserSafetyStore.getState().initialize();

      const state = useUserSafetyStore.getState();
      expect(state.isInitialized).toBe(true);
      expect(state.blockedUserIds).toEqual(['user-1']);
      expect(state.mutedUserIds).toEqual(['user-2']);
    });

    it('should not reinitialize if already initialized', async () => {
      mockGetBlockedUsers.mockResolvedValue({ data: [] });
      mockGetMutedUsers.mockResolvedValue({ data: [] });

      await useUserSafetyStore.getState().initialize();
      await useUserSafetyStore.getState().initialize();

      expect(mockGetBlockedUsers).toHaveBeenCalledTimes(1);
    });

    it('should handle null data gracefully', async () => {
      mockGetBlockedUsers.mockResolvedValue({ data: null });
      mockGetMutedUsers.mockResolvedValue({ data: null });

      await useUserSafetyStore.getState().initialize();

      const state = useUserSafetyStore.getState();
      expect(state.blockedUserIds).toEqual([]);
      expect(state.mutedUserIds).toEqual([]);
      expect(state.isInitialized).toBe(true);
    });
  });

  describe('Mute', () => {
    it('should optimistically mute a user', async () => {
      mockMuteUser.mockResolvedValue({ data: { muted_user_id: 'user-1' }, error: null });

      const result = await useUserSafetyStore.getState().mute('user-1');

      expect(result.error).toBeNull();
      expect(useUserSafetyStore.getState().mutedUserIds).toContain('user-1');
    });

    it('should rollback on mute failure', async () => {
      mockMuteUser.mockResolvedValue({ data: null, error: 'Network error' });

      const result = await useUserSafetyStore.getState().mute('user-1');

      expect(result.error).toBe('Network error');
      expect(useUserSafetyStore.getState().mutedUserIds).not.toContain('user-1');
    });

    it('should not duplicate mute for already-muted user', async () => {
      mockMuteUser.mockResolvedValue({ data: { muted_user_id: 'user-1' }, error: null });

      await useUserSafetyStore.getState().mute('user-1');
      await useUserSafetyStore.getState().mute('user-1');

      // Should only call DB once (second call returns early)
      expect(mockMuteUser).toHaveBeenCalledTimes(1);
    });

    it('should reject empty user ID', async () => {
      const result = await useUserSafetyStore.getState().mute('');
      expect(result.error).toBe('Invalid user ID');
    });
  });

  describe('Unmute', () => {
    it('should unmute a muted user', async () => {
      mockMuteUser.mockResolvedValue({ data: { muted_user_id: 'user-1' }, error: null });
      mockUnmuteUser.mockResolvedValue({ error: null });

      await useUserSafetyStore.getState().mute('user-1');
      const result = await useUserSafetyStore.getState().unmute('user-1');

      expect(result.error).toBeNull();
      expect(useUserSafetyStore.getState().mutedUserIds).not.toContain('user-1');
    });

    it('should rollback unmute on failure', async () => {
      mockMuteUser.mockResolvedValue({ data: { muted_user_id: 'user-1' }, error: null });
      mockUnmuteUser.mockResolvedValue({ error: 'DB error' });
      // Rollback re-fetches from DB — DB still has user muted since unmute failed
      mockGetMutedUsers.mockResolvedValue({ data: [{ muted_user_id: 'user-1' }] });

      await useUserSafetyStore.getState().mute('user-1');
      const result = await useUserSafetyStore.getState().unmute('user-1');

      expect(result.error).toBe('DB error');
      expect(useUserSafetyStore.getState().mutedUserIds).toContain('user-1');
    });
  });

  describe('Block', () => {
    it('should block a user and also mute them', async () => {
      mockBlockUser.mockResolvedValue({ data: { blocked_user_id: 'user-1' }, error: null });
      mockMuteUser.mockResolvedValue({ data: null, error: null });

      const result = await useUserSafetyStore.getState().block('user-1');

      expect(result.error).toBeNull();
      expect(useUserSafetyStore.getState().blockedUserIds).toContain('user-1');
      expect(useUserSafetyStore.getState().mutedUserIds).toContain('user-1');
    });

    it('should rollback block on failure', async () => {
      mockBlockUser.mockResolvedValue({ data: null, error: 'Failed' });

      const result = await useUserSafetyStore.getState().block('user-1');

      expect(result.error).toBe('Failed');
      expect(useUserSafetyStore.getState().blockedUserIds).not.toContain('user-1');
    });
  });

  describe('Unblock', () => {
    it('should unblock a blocked user', async () => {
      mockBlockUser.mockResolvedValue({ data: { blocked_user_id: 'user-1' }, error: null });
      mockMuteUser.mockResolvedValue({ data: null, error: null });
      mockUnblockUser.mockResolvedValue({ error: null });

      await useUserSafetyStore.getState().block('user-1');
      const result = await useUserSafetyStore.getState().unblock('user-1');

      expect(result.error).toBeNull();
      expect(useUserSafetyStore.getState().blockedUserIds).not.toContain('user-1');
    });
  });

  describe('Query Methods', () => {
    beforeEach(async () => {
      mockMuteUser.mockResolvedValue({ data: { muted_user_id: 'muted-1' }, error: null });
      mockBlockUser.mockResolvedValue({ data: { blocked_user_id: 'blocked-1' }, error: null });
      // block also calls muteUser
      mockMuteUser
        .mockResolvedValueOnce({ data: { muted_user_id: 'muted-1' }, error: null })
        .mockResolvedValue({ data: null, error: null });

      await useUserSafetyStore.getState().mute('muted-1');
      await useUserSafetyStore.getState().block('blocked-1');
    });

    it('isMuted should return true for muted users', () => {
      expect(useUserSafetyStore.getState().isMuted('muted-1')).toBe(true);
      expect(useUserSafetyStore.getState().isMuted('unknown')).toBe(false);
    });

    it('isBlocked should return true for blocked users', () => {
      expect(useUserSafetyStore.getState().isBlocked('blocked-1')).toBe(true);
      expect(useUserSafetyStore.getState().isBlocked('unknown')).toBe(false);
    });

    it('isHidden should return true for muted OR blocked', () => {
      expect(useUserSafetyStore.getState().isHidden('muted-1')).toBe(true);
      expect(useUserSafetyStore.getState().isHidden('blocked-1')).toBe(true);
      expect(useUserSafetyStore.getState().isHidden('unknown')).toBe(false);
    });

    it('should handle null/empty userId', () => {
      expect(useUserSafetyStore.getState().isMuted('')).toBe(false);
      expect(useUserSafetyStore.getState().isBlocked('')).toBe(false);
      expect(useUserSafetyStore.getState().isHidden('')).toBe(false);
    });
  });

  describe('Reset', () => {
    it('should clear all state', async () => {
      mockMuteUser.mockResolvedValue({ data: { muted_user_id: 'user-1' }, error: null });
      await useUserSafetyStore.getState().mute('user-1');

      useUserSafetyStore.getState().reset();

      const state = useUserSafetyStore.getState();
      expect(state.mutedUserIds).toEqual([]);
      expect(state.blockedUserIds).toEqual([]);
      expect(state.isInitialized).toBe(false);
    });
  });
});

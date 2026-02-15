/**
 * User Safety Store - Zustand Version
 * Manages muted and blocked users for anti-harassment protection
 */

import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import {
  blockUser as dbBlockUser,
  unblockUser as dbUnblockUser,
  getBlockedUsers,
  muteUser as dbMuteUser,
  unmuteUser as dbUnmuteUser,
  getMutedUsers,
  BlockedUser,
  MutedUser,
} from '../services/database';

interface UserSafetyState {
  // State
  mutedUserIds: string[];
  blockedUserIds: string[];
  blockedUsers: BlockedUser[];
  mutedUsers: MutedUser[];
  isInitialized: boolean;
  isLoading: boolean;

  // Actions
  initialize: () => Promise<void>;
  mute: (userId: string) => Promise<{ error: string | null }>;
  unmute: (userId: string) => Promise<{ error: string | null }>;
  block: (userId: string) => Promise<{ error: string | null }>;
  unblock: (userId: string) => Promise<{ error: string | null }>;
  isMuted: (userId: string) => boolean;
  isBlocked: (userId: string) => boolean;
  isHidden: (userId: string) => boolean;
  getMutedUserIds: () => string[];
  getBlockedUserIds: () => string[];
  getBlockedUsers: () => BlockedUser[];
  getMutedUsers: () => MutedUser[];
  refresh: () => Promise<void>;
  reset: () => void;
}

export const useUserSafetyStore = create<UserSafetyState>()(
  immer((set, get) => ({
    mutedUserIds: [],
    blockedUserIds: [],
    blockedUsers: [],
    mutedUsers: [],
    isInitialized: false,
    isLoading: false,

    // Initialize from database
    initialize: async () => {
      const state = get();
      if (state.isInitialized || state.isLoading) return;

      set({ isLoading: true });

      try {
        const [{ data: blocked }, { data: muted }] = await Promise.all([
          getBlockedUsers(),
          getMutedUsers(),
        ]);

        set((s) => {
          s.blockedUsers = blocked || [];
          s.blockedUserIds = (blocked || []).map((b) => b.blocked_user_id);
          s.mutedUsers = muted || [];
          s.mutedUserIds = (muted || []).map((m) => m.muted_user_id);
          s.isInitialized = true;
          s.isLoading = false;
        });
      } catch (error) {
        if (__DEV__) console.warn('[UserSafetyStore] Initialize error:', error);
        set({ isLoading: false });
      }
    },

    // Mute a user
    mute: async (userId) => {
      if (!userId) return { error: 'Invalid user ID' };
      if (get().mutedUserIds.includes(userId)) return { error: null };

      // Optimistic update
      set((state) => {
        if (!state.mutedUserIds.includes(userId)) {
          state.mutedUserIds.push(userId);
        }
      });

      const { data, error } = await dbMuteUser(userId);

      if (error) {
        // Rollback
        set((state) => {
          const idx = state.mutedUserIds.indexOf(userId);
          if (idx !== -1) state.mutedUserIds.splice(idx, 1);
        });
        return { error };
      }

      if (data) {
        set((state) => {
          state.mutedUsers.push(data);
        });
      }

      return { error: null };
    },

    // Unmute a user
    unmute: async (userId) => {
      if (!userId) return { error: 'Invalid user ID' };
      if (!get().mutedUserIds.includes(userId)) return { error: null };

      // Optimistic update
      set((state) => {
        const muteIdx = state.mutedUserIds.indexOf(userId);
        if (muteIdx !== -1) state.mutedUserIds.splice(muteIdx, 1);
        const userIdx = state.mutedUsers.findIndex((m) => m.muted_user_id === userId);
        if (userIdx !== -1) state.mutedUsers.splice(userIdx, 1);
      });

      const { error } = await dbUnmuteUser(userId);

      if (error) {
        // Rollback: re-fetch fresh state from DB to avoid stale reference race
        const { data: freshMuted } = await getMutedUsers();
        set((state) => {
          state.mutedUsers = freshMuted || [];
          state.mutedUserIds = (freshMuted || []).map((m) => m.muted_user_id);
        });
        return { error };
      }

      return { error: null };
    },

    // Block a user
    block: async (userId) => {
      if (!userId) return { error: 'Invalid user ID' };
      if (get().blockedUserIds.includes(userId)) return { error: null };

      // Capture pre-block mute state for rollback
      const wasMuted = get().mutedUserIds.includes(userId);

      // Optimistic update
      set((state) => {
        if (!state.blockedUserIds.includes(userId)) {
          state.blockedUserIds.push(userId);
        }
        if (!state.mutedUserIds.includes(userId)) {
          state.mutedUserIds.push(userId);
        }
      });

      const { data, error } = await dbBlockUser(userId);

      if (error) {
        // Rollback
        set((state) => {
          const blockIdx = state.blockedUserIds.indexOf(userId);
          if (blockIdx !== -1) state.blockedUserIds.splice(blockIdx, 1);
          if (!wasMuted) {
            const muteIdx = state.mutedUserIds.indexOf(userId);
            if (muteIdx !== -1) state.mutedUserIds.splice(muteIdx, 1);
          }
        });
        return { error };
      }

      if (data) {
        set((state) => {
          state.blockedUsers.push(data);
        });
      }

      // Also mute in database (best-effort, block is primary)
      try {
        await dbMuteUser(userId);
      } catch (muteErr) {
        if (__DEV__) console.warn('[UserSafetyStore] Mute after block failed (non-critical):', muteErr);
      }

      return { error: null };
    },

    // Unblock a user
    unblock: async (userId) => {
      if (!userId) return { error: 'Invalid user ID' };
      if (!get().blockedUserIds.includes(userId)) return { error: null };

      // Optimistic update
      set((state) => {
        const blockIdx = state.blockedUserIds.indexOf(userId);
        if (blockIdx !== -1) state.blockedUserIds.splice(blockIdx, 1);
        const userIdx = state.blockedUsers.findIndex((b) => b.blocked_user_id === userId);
        if (userIdx !== -1) state.blockedUsers.splice(userIdx, 1);
      });

      const { error } = await dbUnblockUser(userId);

      if (error) {
        // Rollback: re-fetch fresh state from DB to avoid stale reference race
        const { data: freshBlocked } = await getBlockedUsers();
        set((state) => {
          state.blockedUsers = freshBlocked || [];
          state.blockedUserIds = (freshBlocked || []).map((b) => b.blocked_user_id);
        });
        return { error };
      }

      return { error: null };
    },

    // Check if muted
    isMuted: (userId) => {
      if (!userId) return false;
      return get().mutedUserIds.includes(userId);
    },

    // Check if blocked
    isBlocked: (userId) => {
      if (!userId) return false;
      return get().blockedUserIds.includes(userId);
    },

    // Check if hidden (muted OR blocked)
    isHidden: (userId) => {
      if (!userId) return false;
      const state = get();
      return state.mutedUserIds.includes(userId) || state.blockedUserIds.includes(userId);
    },

    // Get muted user IDs
    getMutedUserIds: () => get().mutedUserIds,

    // Get blocked user IDs
    getBlockedUserIds: () => get().blockedUserIds,

    // Get blocked users with profiles
    getBlockedUsers: () => get().blockedUsers,

    // Get muted users with profiles
    getMutedUsers: () => get().mutedUsers,

    // Refresh from database
    refresh: async () => {
      set({ isInitialized: false });
      await get().initialize();
    },

    // Reset store
    reset: () => {
      set({
        mutedUserIds: [],
        blockedUserIds: [],
        blockedUsers: [],
        mutedUsers: [],
        isInitialized: false,
        isLoading: false,
      });
    },
  }))
);

// Legacy export for backward compatibility with stores/index.ts
export const userSafetyStore = {
  reset: () => useUserSafetyStore.getState().reset(),
  initialize: () => useUserSafetyStore.getState().initialize(),
};

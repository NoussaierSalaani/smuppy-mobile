/**
 * User Safety Store - Zustand Version
 * Manages muted and blocked users for anti-harassment protection
 */

import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import {
  blockUser as dbBlockUser,
  unblockUser as dbUnblockUser,
  muteUser as dbMuteUser,
  unmuteUser as dbUnmuteUser,
  getBlockedUsers,
  getMutedUsers,
  BlockedUser,
  MutedUser,
} from '../services/database';
import { useFeedStore } from './feedStore';

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
          s.blockedUsers = blocked ?? [];
          s.blockedUserIds = (blocked ?? []).map((b) => b.blocked_user_id);
          s.mutedUsers = muted ?? [];
          s.mutedUserIds = (muted ?? []).map((m) => m.muted_user_id);
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

      // Atomic check-and-optimistic-update to prevent TOCTOU race
      let alreadyMuted = false;
      set((state) => {
        if (state.mutedUserIds.includes(userId)) {
          alreadyMuted = true;
          return;
        }
        state.mutedUserIds.push(userId);
      });

      if (alreadyMuted) return { error: null };

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

      // Purge muted user's content from feed cache
      useFeedStore.getState().purgeUserContent(userId);

      return { error: null };
    },

    // Unmute a user
    unmute: async (userId) => {
      if (!userId) return { error: 'Invalid user ID' };

      // Atomic check-and-optimistic-update — save removed item for rollback
      let wasNotMuted = false;
      let removedUser: MutedUser | undefined;
      set((state) => {
        if (!state.mutedUserIds.includes(userId)) {
          wasNotMuted = true;
          return;
        }
        const muteIdx = state.mutedUserIds.indexOf(userId);
        if (muteIdx !== -1) state.mutedUserIds.splice(muteIdx, 1);
        const userIdx = state.mutedUsers.findIndex((m) => m.muted_user_id === userId);
        if (userIdx !== -1) {
          removedUser = { ...state.mutedUsers[userIdx] } as MutedUser;
          state.mutedUsers.splice(userIdx, 1);
        }
      });

      if (wasNotMuted) return { error: null };

      const { error } = await dbUnmuteUser(userId);

      if (error) {
        // Rollback: restore the removed items (consistent with mute rollback)
        set((state) => {
          if (!state.mutedUserIds.includes(userId)) {
            state.mutedUserIds.push(userId);
          }
          if (removedUser && !state.mutedUsers.some((m) => m.muted_user_id === userId)) {
            state.mutedUsers.push(removedUser);
          }
        });
        return { error };
      }

      return { error: null };
    },

    // Block a user
    block: async (userId) => {
      if (!userId) return { error: 'Invalid user ID' };

      // Atomic check-and-optimistic-update to prevent TOCTOU race
      let alreadyBlocked = false;
      let wasMuted = false;
      set((state) => {
        if (state.blockedUserIds.includes(userId)) {
          alreadyBlocked = true;
          return;
        }
        wasMuted = state.mutedUserIds.includes(userId);
        state.blockedUserIds.push(userId);
        if (!wasMuted) {
          state.mutedUserIds.push(userId);
        }
      });

      if (alreadyBlocked) return { error: null };

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

      // Purge blocked user's content from feed cache + VibesFeed module cache
      useFeedStore.getState().purgeUserContent(userId);
      try {
        const { clearVibesFeedCache } = require('../screens/home/VibesFeed');
        clearVibesFeedCache();
      } catch { /* VibesFeed not loaded yet, nothing to clear */ }

      return { error: null };
    },

    // Unblock a user
    unblock: async (userId) => {
      if (!userId) return { error: 'Invalid user ID' };

      // Atomic check-and-optimistic-update — save removed item for rollback
      let wasNotBlocked = false;
      let removedUser: BlockedUser | undefined;
      set((state) => {
        if (!state.blockedUserIds.includes(userId)) {
          wasNotBlocked = true;
          return;
        }
        const blockIdx = state.blockedUserIds.indexOf(userId);
        if (blockIdx !== -1) state.blockedUserIds.splice(blockIdx, 1);
        const userIdx = state.blockedUsers.findIndex((b) => b.blocked_user_id === userId);
        if (userIdx !== -1) {
          removedUser = { ...state.blockedUsers[userIdx] } as BlockedUser;
          state.blockedUsers.splice(userIdx, 1);
        }
      });

      if (wasNotBlocked) return { error: null };

      const { error } = await dbUnblockUser(userId);

      if (error) {
        // Rollback: restore the removed items (consistent with block rollback)
        set((state) => {
          if (!state.blockedUserIds.includes(userId)) {
            state.blockedUserIds.push(userId);
          }
          if (removedUser && !state.blockedUsers.some((b) => b.blocked_user_id === userId)) {
            state.blockedUsers.push(removedUser);
          }
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

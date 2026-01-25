/**
 * User Safety Store - SAFETY-3
 * Manages muted and blocked users for anti-harassment protection
 *
 * Features:
 * - Mute users (hide their posts from feeds)
 * - Block users (hide their posts + prevent interactions)
 * - Persisted to AWS database
 * - Local cache for fast lookups
 */

import { useState, useEffect, useCallback } from 'react';
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

// In-memory cache with database sync
class UserSafetyStore {
  private mutedUserIds: Set<string> = new Set();
  private blockedUserIds: Set<string> = new Set();
  private blockedUsers: BlockedUser[] = [];
  private mutedUsers: MutedUser[] = [];
  private listeners: Set<() => void> = new Set();
  private initialized: boolean = false;
  private loading: boolean = false;

  /**
   * Initialize store from database
   */
  async initialize(): Promise<void> {
    if (this.initialized || this.loading) return;
    this.loading = true;

    try {
      // Load blocked users
      const { data: blocked } = await getBlockedUsers();
      if (blocked) {
        this.blockedUsers = blocked;
        this.blockedUserIds = new Set(blocked.map(b => b.blocked_user_id));
      }

      // Load muted users
      const { data: muted } = await getMutedUsers();
      if (muted) {
        this.mutedUsers = muted;
        this.mutedUserIds = new Set(muted.map(m => m.muted_user_id));
      }

      this.initialized = true;
      this.notifyListeners();
    } catch (error) {
      console.error('[UserSafetyStore] Initialize error:', error);
    } finally {
      this.loading = false;
    }
  }

  /**
   * Mute a user (hide their posts from feeds)
   */
  async mute(userId: string): Promise<{ error: string | null }> {
    if (!userId) return { error: 'Invalid user ID' };
    if (this.mutedUserIds.has(userId)) return { error: null }; // Already muted

    // Optimistic update
    this.mutedUserIds.add(userId);
    this.notifyListeners();

    // Persist to database
    const { data, error } = await dbMuteUser(userId);

    if (error) {
      // Rollback on error
      this.mutedUserIds.delete(userId);
      this.notifyListeners();
      return { error };
    }

    if (data) {
      this.mutedUsers.push(data);
    }

    return { error: null };
  }

  /**
   * Unmute a user
   */
  async unmute(userId: string): Promise<{ error: string | null }> {
    if (!userId) return { error: 'Invalid user ID' };
    if (!this.mutedUserIds.has(userId)) return { error: null }; // Not muted

    // Optimistic update
    this.mutedUserIds.delete(userId);
    this.mutedUsers = this.mutedUsers.filter(m => m.muted_user_id !== userId);
    this.notifyListeners();

    // Persist to database
    const { error } = await dbUnmuteUser(userId);

    if (error) {
      // Rollback on error
      this.mutedUserIds.add(userId);
      await this.initialize(); // Refresh from DB
      return { error };
    }

    return { error: null };
  }

  /**
   * Block a user (hide posts + prevent interactions)
   */
  async block(userId: string): Promise<{ error: string | null }> {
    if (!userId) return { error: 'Invalid user ID' };
    if (this.blockedUserIds.has(userId)) return { error: null }; // Already blocked

    // Optimistic update
    this.blockedUserIds.add(userId);
    // Also add to muted for complete hiding
    this.mutedUserIds.add(userId);
    this.notifyListeners();

    // Persist to database
    const { data, error } = await dbBlockUser(userId);

    if (error) {
      // Rollback on error
      this.blockedUserIds.delete(userId);
      this.mutedUserIds.delete(userId);
      this.notifyListeners();
      return { error };
    }

    if (data) {
      this.blockedUsers.push(data);
    }

    // Also mute in database
    await dbMuteUser(userId);

    return { error: null };
  }

  /**
   * Unblock a user
   */
  async unblock(userId: string): Promise<{ error: string | null }> {
    if (!userId) return { error: 'Invalid user ID' };
    if (!this.blockedUserIds.has(userId)) return { error: null }; // Not blocked

    // Optimistic update
    this.blockedUserIds.delete(userId);
    this.blockedUsers = this.blockedUsers.filter(b => b.blocked_user_id !== userId);
    // Note: unblocking does NOT unmute automatically
    this.notifyListeners();

    // Persist to database
    const { error } = await dbUnblockUser(userId);

    if (error) {
      // Rollback on error
      this.blockedUserIds.add(userId);
      await this.initialize(); // Refresh from DB
      return { error };
    }

    return { error: null };
  }

  /**
   * Check if a user is muted
   */
  isMuted(userId: string): boolean {
    if (!userId) return false;
    return this.mutedUserIds.has(userId);
  }

  /**
   * Check if a user is blocked
   */
  isBlocked(userId: string): boolean {
    if (!userId) return false;
    return this.blockedUserIds.has(userId);
  }

  /**
   * Check if a user's content should be hidden (muted OR blocked)
   */
  isHidden(userId: string): boolean {
    if (!userId) return false;
    return this.isMuted(userId) || this.isBlocked(userId);
  }

  /**
   * Get all muted user IDs
   */
  getMutedUserIds(): string[] {
    return Array.from(this.mutedUserIds);
  }

  /**
   * Get all blocked user IDs
   */
  getBlockedUserIds(): string[] {
    return Array.from(this.blockedUserIds);
  }

  /**
   * Get all blocked users with profiles
   */
  getBlockedUsers(): BlockedUser[] {
    return this.blockedUsers;
  }

  /**
   * Get all muted users with profiles
   */
  getMutedUsers(): MutedUser[] {
    return this.mutedUsers;
  }

  /**
   * Check if store is initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Check if store is loading
   */
  isLoading(): boolean {
    return this.loading;
  }

  /**
   * Subscribe to store changes
   */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Notify all listeners of changes
   */
  private notifyListeners(): void {
    this.listeners.forEach((listener) => listener());
  }

  /**
   * Refresh from database
   */
  async refresh(): Promise<void> {
    this.initialized = false;
    await this.initialize();
  }

  /**
   * Reset store (for logout)
   */
  reset(): void {
    this.mutedUserIds.clear();
    this.blockedUserIds.clear();
    this.blockedUsers = [];
    this.mutedUsers = [];
    this.initialized = false;
    this.notifyListeners();
  }
}

// Singleton instance
export const userSafetyStore = new UserSafetyStore();

// React hook for using the store
export function useUserSafetyStore() {
  const [, forceUpdate] = useState({});

  useEffect(() => {
    // Initialize on first use
    userSafetyStore.initialize();

    const unsubscribe = userSafetyStore.subscribe(() => {
      forceUpdate({});
    });
    return unsubscribe;
  }, []);

  const mute = useCallback(async (userId: string) => {
    return userSafetyStore.mute(userId);
  }, []);

  const unmute = useCallback(async (userId: string) => {
    return userSafetyStore.unmute(userId);
  }, []);

  const block = useCallback(async (userId: string) => {
    return userSafetyStore.block(userId);
  }, []);

  const unblock = useCallback(async (userId: string) => {
    return userSafetyStore.unblock(userId);
  }, []);

  const isMuted = useCallback((userId: string) => {
    return userSafetyStore.isMuted(userId);
  }, []);

  const isBlocked = useCallback((userId: string) => {
    return userSafetyStore.isBlocked(userId);
  }, []);

  const isHidden = useCallback((userId: string) => {
    return userSafetyStore.isHidden(userId);
  }, []);

  const getBlockedUsers = useCallback(() => {
    return userSafetyStore.getBlockedUsers();
  }, []);

  const getMutedUsers = useCallback(() => {
    return userSafetyStore.getMutedUsers();
  }, []);

  const refresh = useCallback(async () => {
    return userSafetyStore.refresh();
  }, []);

  return {
    mute,
    unmute,
    block,
    unblock,
    isMuted,
    isBlocked,
    isHidden,
    getBlockedUsers,
    getMutedUsers,
    refresh,
    isInitialized: userSafetyStore.isInitialized(),
    isLoading: userSafetyStore.isLoading(),
  };
}

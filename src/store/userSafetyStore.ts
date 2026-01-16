/**
 * User Safety Store - SAFETY-3
 * Manages muted and blocked users for anti-harassment protection
 *
 * Features:
 * - Mute users (hide their posts from feeds)
 * - Block users (hide their posts + prevent interactions)
 * - Anti-spam protection (1 action per user)
 */

// In-memory store (will be replaced with persistent storage/API)
class UserSafetyStore {
  private mutedUserIds: Set<string> = new Set();
  private blockedUserIds: Set<string> = new Set();
  private listeners: Set<() => void> = new Set();

  /**
   * Mute a user (hide their posts from feeds)
   */
  mute(userId: string): void {
    if (!userId) return;
    this.mutedUserIds.add(userId);
    this.notifyListeners();
  }

  /**
   * Unmute a user
   */
  unmute(userId: string): void {
    if (!userId) return;
    this.mutedUserIds.delete(userId);
    this.notifyListeners();
  }

  /**
   * Block a user (hide posts + prevent interactions)
   */
  block(userId: string): void {
    if (!userId) return;
    this.blockedUserIds.add(userId);
    // Also mute when blocking for complete hiding
    this.mutedUserIds.add(userId);
    this.notifyListeners();
  }

  /**
   * Unblock a user
   */
  unblock(userId: string): void {
    if (!userId) return;
    this.blockedUserIds.delete(userId);
    // Note: unblocking does NOT unmute automatically
    this.notifyListeners();
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
   * Reset store (for testing)
   */
  reset(): void {
    this.mutedUserIds.clear();
    this.blockedUserIds.clear();
    this.notifyListeners();
  }
}

// Singleton instance
export const userSafetyStore = new UserSafetyStore();

// React hook for using the store
import { useState, useEffect, useCallback } from 'react';

export function useUserSafetyStore() {
  const [, forceUpdate] = useState({});

  useEffect(() => {
    const unsubscribe = userSafetyStore.subscribe(() => {
      forceUpdate({});
    });
    return unsubscribe;
  }, []);

  const mute = useCallback((userId: string) => {
    userSafetyStore.mute(userId);
  }, []);

  const unmute = useCallback((userId: string) => {
    userSafetyStore.unmute(userId);
  }, []);

  const block = useCallback((userId: string) => {
    userSafetyStore.block(userId);
  }, []);

  const unblock = useCallback((userId: string) => {
    userSafetyStore.unblock(userId);
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

  return {
    mute,
    unmute,
    block,
    unblock,
    isMuted,
    isBlocked,
    isHidden,
  };
}

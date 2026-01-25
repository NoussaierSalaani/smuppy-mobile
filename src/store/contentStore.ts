/**
 * Content Store - SAFETY-1
 * Manages reports and content status for launch-safe moderation
 *
 * Features:
 * - Report storage with anti-spam (1 report per user per content)
 * - Content status tracking (active, under_review)
 * - Persisted to AWS database
 * - Local cache for fast lookups
 */

import { useState, useEffect, useCallback } from 'react';
import {
  reportPost as dbReportPost,
  reportUser as dbReportUser,
  hasReportedPost as dbHasReportedPost,
  hasReportedUser as dbHasReportedUser,
} from '../services/database';

// Content status types
export type ContentStatus = 'active' | 'under_review';

// Report interface (local cache)
export interface LocalReport {
  id: string;
  content_id: string;
  content_type: 'post' | 'user';
  reason: string;
  created_at: string;
}

// Content status interface
export interface ContentStatusEntry {
  content_id: string;
  status: ContentStatus;
  updated_at: string;
}

// In-memory cache with database sync
class ContentStore {
  private reportedPosts: Set<string> = new Set();
  private reportedUsers: Set<string> = new Set();
  private contentStatus: Map<string, ContentStatusEntry> = new Map();
  private listeners: Set<() => void> = new Set();

  /**
   * Check if user has already reported this post (from local cache)
   */
  hasUserReportedPost(contentId: string): boolean {
    return this.reportedPosts.has(contentId);
  }

  /**
   * Check if user has already reported this user (from local cache)
   */
  hasUserReportedUser(userId: string): boolean {
    return this.reportedUsers.has(userId);
  }

  /**
   * Legacy method for backward compatibility
   */
  hasUserReported(contentId: string): boolean {
    return this.reportedPosts.has(contentId);
  }

  /**
   * Submit a post report
   */
  async submitPostReport(
    postId: string,
    reason: string,
    details?: string
  ): Promise<{ success: boolean; message: string; alreadyReported: boolean }> {
    // Check local cache first
    if (this.reportedPosts.has(postId)) {
      return {
        success: false,
        message: 'Vous avez déjà signalé ce contenu',
        alreadyReported: true,
      };
    }

    // Submit to database
    const { data, error } = await dbReportPost(postId, reason, details);

    if (error === 'already_reported') {
      this.reportedPosts.add(postId);
      this.notifyListeners();
      return {
        success: false,
        message: 'Vous avez déjà signalé ce contenu',
        alreadyReported: true,
      };
    }

    if (error) {
      return {
        success: false,
        message: error,
        alreadyReported: false,
      };
    }

    // Update local cache
    this.reportedPosts.add(postId);
    this.setContentStatus(postId, 'under_review');
    this.notifyListeners();

    return {
      success: true,
      message: 'Signalé — sous examen',
      alreadyReported: false,
    };
  }

  /**
   * Submit a user report
   */
  async submitUserReport(
    userId: string,
    reason: string,
    details?: string
  ): Promise<{ success: boolean; message: string; alreadyReported: boolean }> {
    // Check local cache first
    if (this.reportedUsers.has(userId)) {
      return {
        success: false,
        message: 'Vous avez déjà signalé cet utilisateur',
        alreadyReported: true,
      };
    }

    // Submit to database
    const { data, error } = await dbReportUser(userId, reason, details);

    if (error === 'already_reported') {
      this.reportedUsers.add(userId);
      this.notifyListeners();
      return {
        success: false,
        message: 'Vous avez déjà signalé cet utilisateur',
        alreadyReported: true,
      };
    }

    if (error) {
      return {
        success: false,
        message: error,
        alreadyReported: false,
      };
    }

    // Update local cache
    this.reportedUsers.add(userId);
    this.notifyListeners();

    return {
      success: true,
      message: 'Utilisateur signalé — sous examen',
      alreadyReported: false,
    };
  }

  /**
   * Legacy method for backward compatibility
   */
  submitReport(
    contentId: string,
    reason: string
  ): { success: boolean; message: string; alreadyReported: boolean } {
    // This is now sync but we handle it gracefully
    if (this.reportedPosts.has(contentId)) {
      return {
        success: false,
        message: 'Vous avez déjà signalé ce contenu',
        alreadyReported: true,
      };
    }

    // Mark as reported locally and trigger async report
    this.reportedPosts.add(contentId);
    this.setContentStatus(contentId, 'under_review');
    this.notifyListeners();

    // Fire and forget database call
    dbReportPost(contentId, reason).catch(console.error);

    return {
      success: true,
      message: 'Signalé — sous examen',
      alreadyReported: false,
    };
  }

  /**
   * Check reported status from database
   */
  async checkPostReportedStatus(postId: string): Promise<boolean> {
    if (this.reportedPosts.has(postId)) return true;

    const { reported } = await dbHasReportedPost(postId);
    if (reported) {
      this.reportedPosts.add(postId);
      this.notifyListeners();
    }
    return reported;
  }

  /**
   * Check reported status from database
   */
  async checkUserReportedStatus(userId: string): Promise<boolean> {
    if (this.reportedUsers.has(userId)) return true;

    const { reported } = await dbHasReportedUser(userId);
    if (reported) {
      this.reportedUsers.add(userId);
      this.notifyListeners();
    }
    return reported;
  }

  /**
   * Get content status
   */
  getContentStatus(contentId: string): ContentStatus {
    const entry = this.contentStatus.get(contentId);
    return entry?.status || 'active';
  }

  /**
   * Set content status
   */
  setContentStatus(contentId: string, status: ContentStatus): void {
    const entry: ContentStatusEntry = {
      content_id: contentId,
      status,
      updated_at: new Date().toISOString(),
    };
    this.contentStatus.set(contentId, entry);
    this.notifyListeners();
  }

  /**
   * Check if content is under review
   */
  isUnderReview(contentId: string): boolean {
    return this.getContentStatus(contentId) === 'under_review';
  }

  /**
   * Check if content is active (not under review)
   */
  isActive(contentId: string): boolean {
    return this.getContentStatus(contentId) === 'active';
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
   * Reset store (for logout)
   */
  reset(): void {
    this.reportedPosts.clear();
    this.reportedUsers.clear();
    this.contentStatus.clear();
    this.notifyListeners();
  }
}

// Singleton instance
export const contentStore = new ContentStore();

// React hook for using the store
export function useContentStore() {
  const [, forceUpdate] = useState({});

  useEffect(() => {
    const unsubscribe = contentStore.subscribe(() => {
      forceUpdate({});
    });
    return unsubscribe;
  }, []);

  const submitReport = useCallback(
    (contentId: string, reason: string) => {
      return contentStore.submitReport(contentId, reason);
    },
    []
  );

  const submitPostReport = useCallback(
    async (postId: string, reason: string, details?: string) => {
      return contentStore.submitPostReport(postId, reason, details);
    },
    []
  );

  const submitUserReport = useCallback(
    async (userId: string, reason: string, details?: string) => {
      return contentStore.submitUserReport(userId, reason, details);
    },
    []
  );

  const hasUserReported = useCallback((contentId: string) => {
    return contentStore.hasUserReported(contentId);
  }, []);

  const hasUserReportedPost = useCallback((postId: string) => {
    return contentStore.hasUserReportedPost(postId);
  }, []);

  const hasUserReportedUser = useCallback((userId: string) => {
    return contentStore.hasUserReportedUser(userId);
  }, []);

  const getContentStatus = useCallback((contentId: string) => {
    return contentStore.getContentStatus(contentId);
  }, []);

  const isUnderReview = useCallback((contentId: string) => {
    return contentStore.isUnderReview(contentId);
  }, []);

  const isActive = useCallback((contentId: string) => {
    return contentStore.isActive(contentId);
  }, []);

  return {
    submitReport,
    submitPostReport,
    submitUserReport,
    hasUserReported,
    hasUserReportedPost,
    hasUserReportedUser,
    getContentStatus,
    isUnderReview,
    isActive,
  };
}

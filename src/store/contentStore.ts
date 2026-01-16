/**
 * Content Store - SAFETY-1
 * Manages reports and content status for launch-safe moderation
 *
 * Features:
 * - Report storage with anti-spam (1 report per user per content)
 * - Content status tracking (active, under_review)
 * - Auto-mark content as under_review after report
 */

// Content status types
export type ContentStatus = 'active' | 'under_review';

// Report interface
export interface Report {
  id: string;
  content_id: string;
  reporter_id: string;
  reason: string;
  created_at: string;
}

// Content status interface
export interface ContentStatusEntry {
  content_id: string;
  status: ContentStatus;
  updated_at: string;
}

// In-memory store (will be replaced with persistent storage/API)
class ContentStore {
  private reports: Map<string, Report> = new Map();
  private contentStatus: Map<string, ContentStatusEntry> = new Map();
  private listeners: Set<() => void> = new Set();

  // Current user ID (mock - will be replaced with auth)
  private currentUserId: string = 'current_user_123';

  /**
   * Generate unique report key for anti-spam check
   */
  private getReportKey(contentId: string, reporterId: string): string {
    return `${contentId}:${reporterId}`;
  }

  /**
   * Check if user has already reported this content
   */
  hasUserReported(contentId: string, reporterId?: string): boolean {
    const userId = reporterId || this.currentUserId;
    const key = this.getReportKey(contentId, userId);
    return this.reports.has(key);
  }

  /**
   * Submit a report (with anti-spam protection)
   * Returns: { success: boolean, message: string, alreadyReported: boolean }
   */
  submitReport(
    contentId: string,
    reason: string,
    reporterId?: string
  ): { success: boolean; message: string; alreadyReported: boolean } {
    const userId = reporterId || this.currentUserId;
    const key = this.getReportKey(contentId, userId);

    // Anti-spam: Check if already reported
    if (this.reports.has(key)) {
      return {
        success: false,
        message: 'Vous avez déjà signalé ce contenu',
        alreadyReported: true,
      };
    }

    // Create report
    const report: Report = {
      id: `report_${Date.now()}`,
      content_id: contentId,
      reporter_id: userId,
      reason,
      created_at: new Date().toISOString(),
    };

    // Store report
    this.reports.set(key, report);

    // Auto-mark content as under_review
    this.setContentStatus(contentId, 'under_review');

    // Notify listeners
    this.notifyListeners();

    return {
      success: true,
      message: 'Signalé — sous examen',
      alreadyReported: false,
    };
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
   * Get all reports for a content
   */
  getReportsForContent(contentId: string): Report[] {
    return Array.from(this.reports.values()).filter(
      (r) => r.content_id === contentId
    );
  }

  /**
   * Get report count for a content
   */
  getReportCount(contentId: string): number {
    return this.getReportsForContent(contentId).length;
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
    this.reports.clear();
    this.contentStatus.clear();
    this.notifyListeners();
  }
}

// Singleton instance
export const contentStore = new ContentStore();

// React hook for using the store
import { useState, useEffect, useCallback } from 'react';

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

  const hasUserReported = useCallback((contentId: string) => {
    return contentStore.hasUserReported(contentId);
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
    hasUserReported,
    getContentStatus,
    isUnderReview,
    isActive,
  };
}

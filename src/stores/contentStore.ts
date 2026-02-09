/**
 * Content Store - Zustand Version
 * Manages reports and content status for launch-safe moderation
 */

import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import {
  reportPost as dbReportPost,
  reportPeak as dbReportPeak,
  reportUser as dbReportUser,
  hasReportedPost as dbHasReportedPost,
  hasReportedUser as dbHasReportedUser,
} from '../services/database';

// Memory bounds — server is source of truth, these are just local caches
const MAX_REPORTED_ITEMS = 500;

// Types
export type ContentStatus = 'active' | 'under_review';

interface ReportResult {
  success: boolean;
  message: string;
  alreadyReported: boolean;
}

/** Trim array to last N items if it exceeds the cap */
const trimToMax = (arr: string[]): void => {
  if (arr.length > MAX_REPORTED_ITEMS) {
    arr.splice(0, arr.length - MAX_REPORTED_ITEMS);
  }
};

/** Trim Record keys to last N entries if it exceeds the cap */
const trimRecordToMax = (record: Record<string, ContentStatus>): void => {
  const keys = Object.keys(record);
  if (keys.length > MAX_REPORTED_ITEMS) {
    const toRemove = keys.slice(0, keys.length - MAX_REPORTED_ITEMS);
    for (const key of toRemove) {
      delete record[key];
    }
  }
};

interface ContentState {
  // State
  reportedPosts: string[];
  reportedPeaks: string[];
  reportedUsers: string[];
  contentStatus: Record<string, ContentStatus>;

  // Actions
  submitPostReport: (postId: string, reason: string, details?: string) => Promise<ReportResult>;
  submitPeakReport: (peakId: string, reason: string, details?: string) => Promise<ReportResult>;
  submitUserReport: (userId: string, reason: string, details?: string) => Promise<ReportResult>;
  submitReport: (contentId: string, reason: string) => ReportResult;
  checkPostReportedStatus: (postId: string) => Promise<boolean>;
  checkUserReportedStatus: (userId: string) => Promise<boolean>;
  hasUserReportedPost: (postId: string) => boolean;
  hasUserReportedPeak: (peakId: string) => boolean;
  hasUserReportedUser: (userId: string) => boolean;
  hasUserReported: (contentId: string) => boolean;
  getContentStatus: (contentId: string) => ContentStatus;
  isUnderReview: (contentId: string) => boolean;
  isActive: (contentId: string) => boolean;
  reset: () => void;
}

export const useContentStore = create<ContentState>()(
  immer((set, get) => ({
    reportedPosts: [],
    reportedPeaks: [],
    reportedUsers: [],
    contentStatus: {},

    // Check if user has reported a post
    hasUserReportedPost: (postId: string) => {
      return get().reportedPosts.includes(postId);
    },

    // Check if user has reported a peak
    hasUserReportedPeak: (peakId: string) => {
      return get().reportedPeaks.includes(peakId);
    },

    // Check if user has reported a user
    hasUserReportedUser: (userId: string) => {
      return get().reportedUsers.includes(userId);
    },

    // Legacy method
    hasUserReported: (contentId: string) => {
      return get().reportedPosts.includes(contentId);
    },

    // Submit post report (async)
    submitPostReport: async (postId, reason, details) => {
      const { reportedPosts } = get();

      if (reportedPosts.includes(postId)) {
        return {
          success: false,
          message: 'You have already reported this content',
          alreadyReported: true,
        };
      }

      const { error } = await dbReportPost(postId, reason, details);

      if (error === 'already_reported') {
        set((state) => {
          if (!state.reportedPosts.includes(postId)) {
            state.reportedPosts.push(postId);
            trimToMax(state.reportedPosts);
          }
        });
        return {
          success: false,
          message: 'You have already reported this content',
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

      set((state) => {
        if (!state.reportedPosts.includes(postId)) {
          state.reportedPosts.push(postId);
          trimToMax(state.reportedPosts);
        }
        state.contentStatus[postId] = 'under_review';
        trimRecordToMax(state.contentStatus);
      });

      return {
        success: true,
        message: 'Reported — under review',
        alreadyReported: false,
      };
    },

    // Submit peak report (async)
    submitPeakReport: async (peakId, reason, details) => {
      const { reportedPeaks } = get();

      if (reportedPeaks.includes(peakId)) {
        return {
          success: false,
          message: 'You have already reported this peak',
          alreadyReported: true,
        };
      }

      const { error } = await dbReportPeak(peakId, reason, details);

      if (error === 'already_reported') {
        set((state) => {
          if (!state.reportedPeaks.includes(peakId)) {
            state.reportedPeaks.push(peakId);
            trimToMax(state.reportedPeaks);
          }
        });
        return {
          success: false,
          message: 'You have already reported this peak',
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

      set((state) => {
        if (!state.reportedPeaks.includes(peakId)) {
          state.reportedPeaks.push(peakId);
          trimToMax(state.reportedPeaks);
        }
        state.contentStatus[peakId] = 'under_review';
        trimRecordToMax(state.contentStatus);
      });

      return {
        success: true,
        message: 'Reported — under review',
        alreadyReported: false,
      };
    },

    // Submit user report (async)
    submitUserReport: async (userId, reason, details) => {
      const { reportedUsers } = get();

      if (reportedUsers.includes(userId)) {
        return {
          success: false,
          message: 'You have already reported this user',
          alreadyReported: true,
        };
      }

      const { error } = await dbReportUser(userId, reason, details);

      if (error === 'already_reported') {
        set((state) => {
          if (!state.reportedUsers.includes(userId)) {
            state.reportedUsers.push(userId);
            trimToMax(state.reportedUsers);
          }
        });
        return {
          success: false,
          message: 'You have already reported this user',
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

      set((state) => {
        if (!state.reportedUsers.includes(userId)) {
          state.reportedUsers.push(userId);
          trimToMax(state.reportedUsers);
        }
      });

      return {
        success: true,
        message: 'User reported — under review',
        alreadyReported: false,
      };
    },

    // Legacy sync method
    submitReport: (contentId, reason) => {
      const { reportedPosts } = get();

      if (reportedPosts.includes(contentId)) {
        return {
          success: false,
          message: 'You have already reported this content',
          alreadyReported: true,
        };
      }

      set((state) => {
        if (!state.reportedPosts.includes(contentId)) {
          state.reportedPosts.push(contentId);
          trimToMax(state.reportedPosts);
        }
        state.contentStatus[contentId] = 'under_review';
        trimRecordToMax(state.contentStatus);
      });

      // Fire and forget
      dbReportPost(contentId, reason).catch((err) => { if (__DEV__) console.warn(err); });

      return {
        success: true,
        message: 'Reported — under review',
        alreadyReported: false,
      };
    },

    // Check post reported status from DB
    checkPostReportedStatus: async (postId) => {
      if (get().reportedPosts.includes(postId)) return true;

      const { reported } = await dbHasReportedPost(postId);
      if (reported) {
        set((state) => {
          if (!state.reportedPosts.includes(postId)) {
            state.reportedPosts.push(postId);
            trimToMax(state.reportedPosts);
          }
        });
      }
      return reported;
    },

    // Check user reported status from DB
    checkUserReportedStatus: async (userId) => {
      if (get().reportedUsers.includes(userId)) return true;

      const { reported } = await dbHasReportedUser(userId);
      if (reported) {
        set((state) => {
          if (!state.reportedUsers.includes(userId)) {
            state.reportedUsers.push(userId);
            trimToMax(state.reportedUsers);
          }
        });
      }
      return reported;
    },

    // Get content status
    getContentStatus: (contentId) => {
      return get().contentStatus[contentId] || 'active';
    },

    // Check if under review
    isUnderReview: (contentId) => {
      return get().getContentStatus(contentId) === 'under_review';
    },

    // Check if active
    isActive: (contentId) => {
      return get().getContentStatus(contentId) === 'active';
    },

    // Reset store
    reset: () => {
      set({
        reportedPosts: [],
        reportedPeaks: [],
        reportedUsers: [],
        contentStatus: {},
      });
    },
  }))
);

// Legacy export for backward compatibility with stores/index.ts
export const contentStore = {
  reset: () => useContentStore.getState().reset(),
};

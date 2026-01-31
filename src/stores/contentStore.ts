/**
 * Content Store - Zustand Version
 * Manages reports and content status for launch-safe moderation
 */

import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import {
  reportPost as dbReportPost,
  reportUser as dbReportUser,
  hasReportedPost as dbHasReportedPost,
  hasReportedUser as dbHasReportedUser,
} from '../services/database';

// Types
export type ContentStatus = 'active' | 'under_review';

interface ReportResult {
  success: boolean;
  message: string;
  alreadyReported: boolean;
}

interface ContentState {
  // State
  reportedPosts: string[];
  reportedUsers: string[];
  contentStatus: Record<string, ContentStatus>;

  // Actions
  submitPostReport: (postId: string, reason: string, details?: string) => Promise<ReportResult>;
  submitUserReport: (userId: string, reason: string, details?: string) => Promise<ReportResult>;
  submitReport: (contentId: string, reason: string) => ReportResult;
  checkPostReportedStatus: (postId: string) => Promise<boolean>;
  checkUserReportedStatus: (userId: string) => Promise<boolean>;
  hasUserReportedPost: (postId: string) => boolean;
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
    reportedUsers: [],
    contentStatus: {},

    // Check if user has reported a post
    hasUserReportedPost: (postId: string) => {
      return get().reportedPosts.includes(postId);
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
          message: 'Vous avez déjà signalé ce contenu',
          alreadyReported: true,
        };
      }

      const { error } = await dbReportPost(postId, reason, details);

      if (error === 'already_reported') {
        set((state) => {
          if (!state.reportedPosts.includes(postId)) {
            state.reportedPosts.push(postId);
          }
        });
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

      set((state) => {
        if (!state.reportedPosts.includes(postId)) {
          state.reportedPosts.push(postId);
        }
        state.contentStatus[postId] = 'under_review';
      });

      return {
        success: true,
        message: 'Signalé — sous examen',
        alreadyReported: false,
      };
    },

    // Submit user report (async)
    submitUserReport: async (userId, reason, details) => {
      const { reportedUsers } = get();

      if (reportedUsers.includes(userId)) {
        return {
          success: false,
          message: 'Vous avez déjà signalé cet utilisateur',
          alreadyReported: true,
        };
      }

      const { error } = await dbReportUser(userId, reason, details);

      if (error === 'already_reported') {
        set((state) => {
          if (!state.reportedUsers.includes(userId)) {
            state.reportedUsers.push(userId);
          }
        });
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

      set((state) => {
        if (!state.reportedUsers.includes(userId)) {
          state.reportedUsers.push(userId);
        }
      });

      return {
        success: true,
        message: 'Utilisateur signalé — sous examen',
        alreadyReported: false,
      };
    },

    // Legacy sync method
    submitReport: (contentId, reason) => {
      const { reportedPosts } = get();

      if (reportedPosts.includes(contentId)) {
        return {
          success: false,
          message: 'Vous avez déjà signalé ce contenu',
          alreadyReported: true,
        };
      }

      set((state) => {
        if (!state.reportedPosts.includes(contentId)) {
          state.reportedPosts.push(contentId);
        }
        state.contentStatus[contentId] = 'under_review';
      });

      // Fire and forget
      dbReportPost(contentId, reason).catch((err) => { if (__DEV__) console.error(err); });

      return {
        success: true,
        message: 'Signalé — sous examen',
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

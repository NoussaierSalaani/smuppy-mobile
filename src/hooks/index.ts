// src/hooks/index.ts
// Export all hooks from this folder

// UI Hooks
export {
  usePreventDoubleClick,
  usePreventDoubleNavigation
} from './usePreventDoubleClick';

// Push Notifications
export {
  useNotifications,
  useAutoRegisterPushNotifications,
} from './useNotifications';

// Media Upload (S3 + CloudFront)
export { useMediaUpload } from './useMediaUpload';

// Data Fetching Hooks (React Query)
export {
  // User
  useCurrentProfile,
  useProfile,
  useUpdateProfile,
  // Posts
  useFeedPosts,
  useUserPosts,
  useCreatePost,
  useDeletePost,
  // Likes
  useHasLiked,
  useToggleLike,
  // Collections (Saved Posts)
  useHasSavedPost,
  useSavedPosts,
  useToggleSavePost,
  // Follows
  useIsFollowing,
  useFollowers,
  useFollowing,
  useToggleFollow,
  // Comments
  usePostComments,
  useAddComment,
  // Interests & Expertise
  useInterests,
  useExpertise,
  useSaveInterests,
  // Utilities
  usePrefetchProfile,
  useInvalidateUserQueries,
} from './queries';

export { useCooldown } from './useCooldown';

// Post Interactions (DRY like/save with optimistic updates)
export { usePostInteractions } from './usePostInteractions';

// Post Detail Actions (shared logic for PostDetail screens)
export { usePostDetailActions } from './usePostDetailActions';
export type { PostDetailPost, PostDetailActions } from './usePostDetailActions';

// Modal State Management
export {
  useModalState,
  useShareModal,
  useMenuModal,
  useConfirmationModal,
  useImageViewerModal,
  useMultiModal,
} from './useModalState';
export type {
  ShareContentData,
  ShareContentType,
  MenuPostData,
  ConfirmationData,
  ImageViewerData,
} from './useModalState';

// Live Streaming Real-time
export { useLiveStream } from './useLiveStream';
export type {
  LiveComment,
  LiveReaction,
  LiveViewer,
} from './useLiveStream';

// Currency
export { useCurrency } from './useCurrency';

// Tips Payment
export { useTipPayment } from './useTipPayment';

// Image Preloading
export {
  useImagePreload,
  preloadImage,
  preloadImages,
} from './useImagePreload';

// Analytics
export { useAnalytics } from './useAnalytics';

// Theme
export { useTheme } from './useTheme';

// Expired Peaks
export { useExpiredPeaks } from './useExpiredPeaks';

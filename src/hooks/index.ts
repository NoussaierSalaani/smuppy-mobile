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

// Usage Examples:
//
// User profile:
// const { data: profile, isLoading } = useCurrentProfile();
// const { mutate: updateProfile } = useUpdateProfile();
//
// Feed with infinite scroll:
// const { data, fetchNextPage, hasNextPage, isFetchingNextPage } = useFeedPosts();
// const posts = data?.pages.flatMap(page => page.posts) ?? [];
//
// Like with optimistic update:
// const { mutate: toggleLike } = useToggleLike();
// toggleLike({ postId: post.id, liked: hasLiked });
//
// Follow/Unfollow:
// const { data: isFollowing } = useIsFollowing(userId);
// const { mutate: toggleFollow } = useToggleFollow();

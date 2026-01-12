// SMUPPY Components Library
// Export all reusable components

// Core UI Components
export { default as Button } from './Button';
export { default as Input } from './Input';
export { default as Card } from './Card';
export { default as Avatar } from './Avatar';
export { default as Header } from './Header';
export { default as Tag } from './Tag';
export { default as Toggle } from './Toggle';
export { default as TabBar } from './TabBar';
export { default as BottomNav } from './BottomNav';
export { default as ErrorBoundary } from './ErrorBoundary';

// Logo Components
export {
  default as SmuppyLogo,
  SmuppyIcon,
  SmuppyText,
  SmuppyLogoFull,
  SmuppyLogoStacked
} from './SmuppyLogo';

// Optimized Components (Performance)
export {
  default as OptimizedImage,
  AvatarImage,
  PostImage,
  BackgroundImage,
  ThumbnailImage,
} from './OptimizedImage';

export {
  default as OptimizedList,
  FeedList,
  UserList,
  CommentList,
  GridList,
} from './OptimizedList';

// Usage examples:
//
// Basic components:
// import { Button, Input, Card, SmuppyLogo } from '../components';
//
// Optimized images (with caching):
// import { OptimizedImage, AvatarImage, PostImage } from '../components';
// <AvatarImage source={user.avatar} size={50} />
// <PostImage source={post.image} aspectRatio={16/9} />
//
// Optimized lists (10x faster than FlatList):
// import { FeedList, UserList } from '../components';
// <FeedList
//   posts={posts}
//   renderPost={({ item }) => <PostCard post={item} />}
//   onLoadMore={fetchNextPage}
//   isLoadingMore={isFetchingNextPage}
// />
//
// Logo variants:
// <SmuppyIcon size={80} variant="gradient" />
// <SmuppyText width={100} variant="gradient" />
// <SmuppyLogoFull iconSize={50} textWidth={120} />
// <SmuppyLogoStacked iconSize={80} textWidth={100} />

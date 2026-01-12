/**
 * Smuppy Mobile - Type Definitions
 * Centralized types for the entire application
 */

// ============================================
// USER TYPES
// ============================================

export interface User {
  id: string;
  email: string;
  username: string;
  displayName: string;
  avatar: string | null;
  coverImage: string | null;
  bio: string | null;
  profession: string | null;
  location: string | null;
  website: string | null;
  isVerified: boolean;
  accountType: 'fan' | 'creator';
  createdAt: string;
  updatedAt: string;
}

export interface UserProfile extends User {
  fanCount: number;
  followingCount: number;
  postCount: number;
  interests: string[];
  expertise: string[];
}

export interface UserPreferences {
  theme: 'light' | 'dark' | 'system';
  notifications: boolean;
  privateAccount: boolean;
  language: string;
}

// ============================================
// POST TYPES
// ============================================

export interface Post {
  id: string;
  userId: string;
  type: 'image' | 'video';
  media: string;
  thumbnail: string;
  description: string;
  location: string | null;
  visibility: 'public' | 'fans' | 'private';
  likes: number;
  comments: number;
  shares: number;
  duration?: string;
  createdAt: string;
  updatedAt: string;
  user: PostUser;
}

export interface PostUser {
  id: string;
  name: string;
  username: string;
  avatar: string;
  isVerified: boolean;
  followsMe?: boolean;
}

export interface CreatePostData {
  media: MediaAsset[];
  description: string;
  location?: string;
  visibility: 'public' | 'fans' | 'private';
  taggedPeople?: string[];
}

// ============================================
// MEDIA TYPES
// ============================================

export interface MediaAsset {
  id: string;
  uri: string;
  mediaType: 'photo' | 'video';
  width: number;
  height: number;
  duration?: number;
  filename?: string;
}

// ============================================
// COMMENT TYPES
// ============================================

export interface Comment {
  id: string;
  postId: string;
  userId: string;
  text: string;
  likes: number;
  replies: number;
  timeAgo: string;
  createdAt: string;
  user: {
    name: string;
    avatar: string;
  };
}

export interface CreateCommentData {
  postId: string;
  text: string;
  parentId?: string;
}

// ============================================
// MESSAGE TYPES
// ============================================

export interface Conversation {
  id: string;
  user: ConversationUser;
  lastMessage: string;
  lastMessageTime: string;
  unreadCount: number;
  isOnline: boolean;
}

export interface ConversationUser {
  id: string;
  name: string;
  username: string;
  avatar: string;
  isVerified: boolean;
  isOnline: boolean;
}

export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  type: 'text' | 'image' | 'voice' | 'link';
  content: string;
  caption?: string;
  duration?: number;
  preview?: LinkPreview;
  timestamp: string;
  isRead: boolean;
}

export interface LinkPreview {
  title: string;
  description: string;
  image: string;
  url: string;
}

// ============================================
// SOCIAL TYPES
// ============================================

export interface FollowRelation {
  followerId: string;
  followingId: string;
  createdAt: string;
}

export interface Fan {
  id: string;
  name: string;
  username: string;
  avatar: string;
  bio: string;
  isFanOfMe: boolean;
  iAmFanOf: boolean;
  isVerified: boolean;
}

// ============================================
// ONBOARDING TYPES
// ============================================

export interface OnboardingData {
  accountType: 'fan' | 'creator';
  displayName: string;
  dateOfBirth: Date;
  gender: 'male' | 'female' | 'other' | 'prefer_not_to_say';
  profession: string;
  interests: string[];
  expertise: string[];
}

export interface Interest {
  id: string;
  name: string;
  icon: string;
  category: string;
}

export interface Expertise {
  id: string;
  name: string;
  icon: string;
  category: string;
}

// ============================================
// AUTH TYPES
// ============================================

export interface AuthState {
  isAuthenticated: boolean;
  user: User | null;
  token: string | null;
  loading: boolean;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface SignupCredentials {
  email: string;
  password: string;
  username: string;
  displayName: string;
}

export interface ResetPasswordData {
  email: string;
  code: string;
  newPassword: string;
}

// ============================================
// API TYPES
// ============================================

export interface ApiResponse<T> {
  data: T;
  success: boolean;
  message?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
}

export interface ApiError {
  code: string;
  message: string;
  status: number;
}

// ============================================
// NAVIGATION TYPES
// ============================================

export type RootStackParamList = {
  // Auth
  Login: undefined;
  Signup: undefined;
  ForgotPassword: undefined;
  ResetCode: { email: string };
  NewPassword: { email: string; code: string };
  PasswordSuccess: undefined;
  VerifyCode: { email: string };

  // Onboarding
  AccountType: undefined;
  TellUsAboutYou: { accountType: 'fan' | 'creator' };
  Profession: undefined;
  Interests: undefined;
  Expertise: undefined;
  Guidelines: undefined;
  OnboardingSuccess: undefined;

  // Main
  MainTabs: undefined;
  Home: undefined;
  FanFeed: undefined;
  VibesFeed: undefined;
  Search: undefined;
  Messages: undefined;
  Profile: undefined;

  // Details
  UserProfile: { userId: string };
  PostDetailFanFeed: { postId: string; fanFeedPosts?: Post[] };
  PostDetailVibesFeed: { postId: string; post?: Post };
  PostDetailProfile: { postId: string; profilePosts?: Post[] };
  FansList: { userId: string; type: 'fans' | 'following' };
  Chat: { conversation: Conversation };

  // Create
  CreatePost: undefined;
  AddPostDetails: { media: MediaAsset[] };

  // Settings
  Settings: undefined;
  EditProfile: undefined;
  AccountSettings: undefined;
  PrivacySettings: undefined;
  NotificationSettings: undefined;
  TermsPolicies: undefined;
};

// ============================================
// STORE TYPES
// ============================================

export interface UserStore {
  profile: UserProfile | null;
  preferences: UserPreferences;
  setProfile: (profile: UserProfile | null) => void;
  updateProfile: (updates: Partial<UserProfile>) => void;
  updatePreferences: (prefs: Partial<UserPreferences>) => void;
  clearUser: () => void;
}

export interface AppStore {
  isOnline: boolean;
  isLoading: boolean;
  error: string | null;
  setOnline: (isOnline: boolean) => void;
  setLoading: (isLoading: boolean) => void;
  setError: (error: string | null) => void;
  clearError: () => void;
}

export interface FeedStore {
  scrollPosition: number;
  activeTab: 'fan' | 'vibes';
  setScrollPosition: (position: number) => void;
  setActiveTab: (tab: 'fan' | 'vibes') => void;
}

export interface AuthStore {
  isAuthenticated: boolean;
  user: User | null;
  setAuth: (user: User | null) => void;
  logout: () => void;
}

// ============================================
// COMPONENT PROPS TYPES
// ============================================

export interface OptimizedImageProps {
  source: string | { uri: string } | number;
  style?: object;
  contentFit?: 'cover' | 'contain' | 'fill' | 'none' | 'scale-down';
  placeholder?: string;
  transition?: number;
  priority?: 'low' | 'normal' | 'high';
  recyclingKey?: string;
  onLoad?: () => void;
  onError?: (error: Error) => void;
}

export interface AvatarImageProps extends Omit<OptimizedImageProps, 'contentFit' | 'priority'> {
  size?: number;
  fallbackColor?: string;
}

export interface GradientButtonProps {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  style?: object;
  textStyle?: object;
  colors?: string[];
}

// ============================================
// HOOK TYPES
// ============================================

export interface UsePreventDoubleClickResult {
  handleClick: (callback: () => void) => void;
  isDisabled: boolean;
}

export interface UseFeedPostsResult {
  data: { pages: { posts: Post[] }[] } | undefined;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  fetchNextPage: () => void;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  refetch: () => void;
}

// ============================================
// UTILITY TYPES
// ============================================

export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

export type Nullable<T> = T | null;

export type Optional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

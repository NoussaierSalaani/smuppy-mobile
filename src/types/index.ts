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
// PAYMENT TYPES
// ============================================

export interface Payment {
  id: string;
  stripePaymentIntentId: string;
  buyerId: string;
  creatorId: string;
  sessionId?: string;
  amount: number; // Amount in cents
  currency: string;
  platformFee: number;
  status: 'pending' | 'succeeded' | 'failed' | 'refunded';
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PrivateSession {
  id: string;
  creatorId: string;
  buyerId?: string;
  scheduledAt: string;
  durationMinutes: number;
  price: number; // Price in cents
  currency: string;
  status: 'pending' | 'confirmed' | 'completed' | 'cancelled';
  paymentStatus: 'unpaid' | 'paid' | 'refunded';
  agoraChannelName?: string;
  startedAt?: string;
  endedAt?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
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
// ICON TYPES
// ============================================

import type { Ionicons } from '@expo/vector-icons';

/**
 * Valid Ionicons icon names - use this instead of 'as any' for icon props
 */
export type IconName = keyof typeof Ionicons.glyphMap;

// ============================================
// SPOT TYPES (Custom locations by pro creators/businesses)
// ============================================

export interface Spot {
  id: string;
  creator_id: string;
  name: string;
  description?: string;
  latitude: number;
  longitude: number;
  address?: string;
  city?: string;
  country?: string;
  category: SpotCategory;
  sport_type?: SportType;
  cover_image_url?: string;
  images?: string[];
  difficulty_level?: DifficultyLevel;
  estimated_duration?: number;
  distance?: number;
  elevation_gain?: number;
  is_route: boolean;
  route_points?: RoutePoint[];
  visibility: 'public' | 'private' | 'followers';
  is_verified: boolean;
  is_featured: boolean;
  visit_count: number;
  save_count: number;
  rating_average: number;
  rating_count: number;
  created_at: string;
  updated_at: string;
  creator?: {
    id: string;
    username: string;
    full_name: string;
    avatar_url?: string | null;
    is_verified?: boolean;
  };
}

export type SpotCategory = 'sport' | 'event' | 'business' | 'meetup' | 'route_point' | 'other';

export type SportType =
  | 'running' | 'cycling' | 'hiking' | 'climbing' | 'swimming'
  | 'surfing' | 'skiing' | 'skateboarding' | 'yoga' | 'fitness'
  | 'basketball' | 'football' | 'tennis' | 'other';

export type DifficultyLevel = 'easy' | 'medium' | 'hard' | 'expert';

export interface RoutePoint {
  lat: number;
  lon: number;
  order: number;
  name?: string;
}

export interface SpotSave {
  id: string;
  user_id: string;
  spot_id: string;
  created_at: string;
}

export interface SpotReview {
  id: string;
  user_id: string;
  spot_id: string;
  rating: number;
  comment?: string;
  images?: string[];
  created_at: string;
  updated_at: string;
  user?: {
    id: string;
    username: string;
    full_name: string;
    avatar_url?: string | null;
  };
}

export interface CreateSpotData {
  name: string;
  description?: string;
  latitude: number;
  longitude: number;
  address?: string;
  city?: string;
  country?: string;
  category: SpotCategory;
  sport_type?: SportType;
  cover_image_url?: string;
  images?: string[];
  difficulty_level?: DifficultyLevel;
  estimated_duration?: number;
  distance?: number;
  elevation_gain?: number;
  is_route?: boolean;
  route_points?: RoutePoint[];
  visibility?: 'public' | 'private' | 'followers';
}

export interface NearbySpot {
  id: string;
  name: string;
  description?: string;
  latitude: number;
  longitude: number;
  category: SpotCategory;
  sport_type?: SportType;
  cover_image_url?: string;
  distance_km: number;
  rating_average: number;
  creator_id: string;
}

// ============================================
// PEAK TYPES
// ============================================

export interface Peak {
  id: string;
  user_id: string;
  media_url: string;
  media_type: 'image' | 'video';
  duration?: number;
  caption?: string;
  reactions?: Record<string, number>;
  views_count?: number;
  created_at: string;
  createdAt?: string; // Alias for compatibility
  expires_at?: string;
  user?: {
    id: string;
    username: string;
    full_name: string;
    avatar_url?: string | null;
    is_verified?: boolean;
  };
}

// ============================================
// NAVIGATION TYPES
// ============================================

export type MainStackParamList = {
  // Tab Navigator
  Tabs: { screen?: string } | undefined;

  // Main Tabs
  Home: undefined;
  Peaks: undefined;
  CreateTab: undefined;
  Notifications: undefined;
  Profile: { userId?: string } | undefined;

  // Auth
  Login: undefined;
  Signup: undefined;
  ForgotPassword: undefined;
  CheckEmail: { email: string };
  ResetCode: { email: string };
  NewPassword: { email?: string; code?: string } | undefined;
  PasswordSuccess: undefined;
  VerifyCode: { email: string; [key: string]: unknown };

  // Onboarding
  AccountType: { email: string; password: string; name?: string };
  TellUsAboutYou: { accountType: 'fan' | 'creator' | 'personal' | 'pro_creator' | 'pro_local'; [key: string]: unknown };
  CreatorInfo: { [key: string]: unknown };
  CreatorOptionalInfo: { [key: string]: unknown };
  BusinessCategory: { [key: string]: unknown };
  BusinessInfo: { [key: string]: unknown };
  Profession: undefined;
  Interests: { [key: string]: unknown } | undefined;
  Expertise: { [key: string]: unknown } | undefined;
  Guidelines: { [key: string]: unknown } | undefined;
  OnboardingSuccess: undefined;
  Success: undefined;

  // Search & Messages
  Search: undefined;
  Messages: undefined;
  NewMessage: undefined;
  Chat: {
    conversationId?: string;
    userId?: string;
    otherUser?: {
      id: string;
      username?: string;
      full_name?: string;
      avatar_url?: string;
      is_verified?: boolean;
      account_type?: string;
    };
  };

  // Details
  UserProfile: { userId: string };
  PostDetailFanFeed: { postId: string; post?: Post; fanFeedPosts?: Post[] };
  PostDetailVibesFeed: { postId: string; post?: any; startCondensed?: boolean };
  PostDetailProfile: { postId: string; post?: Post; profilePosts?: Post[] };
  FansList: { userId?: string; fansCount?: number; type?: 'fans' | 'following' };

  // Create
  CreatePost: { fromProfile?: boolean } | undefined;
  AddPostDetails: { mediaAssets: MediaAsset[]; fromProfile?: boolean };
  PostSuccess: { postId?: string; mediaType?: string } | undefined;

  // Peaks
  PeakView: { peakId?: string; peakData?: Peak[]; initialIndex?: number };
  CreatePeak: { replyToPeak?: Peak } | undefined;
  PeakPreview: { mediaUri: string; mediaType: 'image' | 'video'; duration?: number; replyToPeakId?: string };

  // Settings
  Settings: undefined;
  EditProfile: undefined;
  PasswordManager: undefined;
  AccountSettings: undefined;
  PrivacySettings: undefined;
  NotificationSettings: undefined;
  ReportProblem: undefined;
  TermsPolicies: undefined;
  FacialRecognition: undefined;

  // Payments & Subscriptions
  CreatorWallet: undefined;
  PlatformSubscription: undefined;
  ChannelSubscription: { creatorId: string; creatorName?: string; creatorAvatar?: string; creatorUsername?: string; subscriberCount?: number; tier?: string };
  IdentityVerification: undefined;

  // WebView (for Stripe checkout)
  WebView: { url: string; title?: string };
};

// Alias for backward compatibility
export type RootStackParamList = MainStackParamList;

// ============================================
// REACT NAVIGATION GLOBAL TYPE DECLARATION
// ============================================

declare global {
  namespace ReactNavigation {
    interface RootParamList extends MainStackParamList {}
  }
}

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

// ============================================
// RE-EXPORTS FROM OTHER TYPE FILES
// ============================================

// Profile types for UI normalization
export {
  ProfileDataSource,
  UserProfile as NormalizedUserProfile,
  INITIAL_USER_PROFILE,
  isEmailDerivedName,
  resolveProfile,
} from './profile';

// Database types (for API/service layer)
// Note: Use these for database operations
export type {
  Profile as DbProfile,
  Post as DbPost,
  Comment as DbComment,
  Like as DbLike,
  Follow as DbFollow,
  FollowRequest as DbFollowRequest,
  FollowResult,
  BlockedUser,
  MutedUser,
  Message as DbMessage,
  Conversation as DbConversation,
} from '../services/database';

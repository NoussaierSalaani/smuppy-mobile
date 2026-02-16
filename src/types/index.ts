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
  accountType: 'personal' | 'pro_creator' | 'pro_business';
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
  visibility: 'public' | 'fans' | 'private' | 'subscribers';
  likes: number;
  comments: number;
  shares: number;
  duration?: string;
  videoDuration?: number;
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
  accountType?: 'personal' | 'pro_creator' | 'pro_business';
  businessName?: string;
}

export interface CreatePostData {
  media: MediaAsset[];
  description: string;
  location?: string;
  visibility: 'public' | 'fans' | 'private' | 'subscribers';
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
  accountType?: 'personal' | 'pro_creator' | 'pro_business';
  businessName?: string;
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
  accountType?: 'personal' | 'pro_creator' | 'pro_business';
  businessName?: string;
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
  accountType: 'personal' | 'pro_creator' | 'pro_business';
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

export type SpotCategory = 'coaches' | 'gyms' | 'wellness' | 'sports' | 'food' | 'stores' | 'events' | 'spots' | 'other';

export type SportType =
  | 'running' | 'cycling' | 'hiking' | 'climbing' | 'swimming'
  | 'surfing' | 'skiing' | 'skateboarding' | 'yoga' | 'fitness'
  | 'basketball' | 'football' | 'tennis' | 'other';

export type DifficultyLevel = 'easy' | 'medium' | 'hard' | 'expert';

export type RouteProfile = 'walking' | 'cycling';

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
// GROUP ACTIVITY TYPES
// ============================================

export interface GroupActivity {
  id: string;
  creator_id: string;
  name: string;
  description?: string;
  category: SpotCategory;
  subcategory: string;
  sport_type?: SportType;
  latitude: number;
  longitude: number;
  address?: string;
  cover_image_url?: string;
  starts_at: string;
  ends_at?: string;
  timezone?: string;
  max_participants?: number;
  current_participants: number;
  is_free: boolean;
  price?: number;
  currency?: string;
  is_public: boolean;
  is_fans_only: boolean;
  // Route (for running, cycling, hiking groups)
  isRoute: boolean;
  routeStart?: { lat: number; lng: number };
  routeEnd?: { lat: number; lng: number };
  routeWaypoints?: { lat: number; lng: number }[];
  routeGeojson?: object;
  routeProfile?: RouteProfile;
  routeDistanceKm?: number;
  routeDurationMin?: number;
  routeElevationGain?: number;
  difficulty?: DifficultyLevel;
  // Status
  status: 'upcoming' | 'active' | 'ended' | 'cancelled';
  created_at: string;
  updated_at: string;
  creator?: {
    id: string;
    username: string;
    full_name: string;
    avatar_url?: string | null;
    is_verified?: boolean;
    account_type?: string;
  };
}

// ============================================
// LIVE PIN TYPES (Pro Creator Premium + Pro Business Premium)
// ============================================

export interface LivePin {
  id: string;
  user_id: string;
  channel_name: string;
  title?: string;
  latitude: number;
  longitude: number;
  viewer_count: number;
  started_at: string;
  user?: {
    id: string;
    username: string;
    full_name: string;
    avatar_url?: string | null;
    is_verified?: boolean;
  };
}

// ============================================
// DYNAMIC SUBCATEGORY TYPES
// ============================================

export interface Subcategory {
  id: string;
  parent_category: SpotCategory;
  name: string;
  status: 'official' | 'pending';
  spot_count: number;
  suggested_by: string;
  created_at: string;
}

// ============================================
// SPOT QUALITIES (per category)
// ============================================

export const SPOT_QUALITIES: Record<string, string[]> = {
  hiking: ['Shade', 'Water Source', 'Trail Markers', 'Parking', 'Dogs Allowed', 'Panoramic View', 'Restrooms'],
  running: ['Lighting', 'Asphalt', 'Dirt', 'Mixed Surface', 'Fountains', 'Restrooms', 'Flat', 'Hilly'],
  cycling: ['Separated Lane', 'Lighting', 'Repair Stations', 'Smooth Surface', 'Scenic'],
  outdoor_gym: ['Pull-up Bars', 'Parallel Bars', 'Dip Station', 'Lighting', 'Rubber Surface'],
  wellness: ['Quiet', 'Nature', 'Accessible', 'Indoor', 'Outdoor'],
  food: ['Terrace', 'Vegan Options', 'Gluten Free', 'Parking', 'Delivery'],
  general: ['Wheelchair Accessible', 'Parking', 'Public Transit', 'Free', 'Kid Friendly'],
};

// ============================================
// MAP MARKER TYPES (unified for XplorerFeed)
// ============================================

export interface MapMarker {
  id: string;
  type: SpotCategory | 'live';
  subcategory: string;
  entity_type: 'user' | 'business' | 'event' | 'group' | 'spot' | 'live';
  name: string;
  avatar?: string;
  cover_image?: string;
  latitude: number;
  longitude: number;
  // Optional fields depending on entity_type
  address?: string;
  hours?: string;
  expertise?: string[];
  bio?: string;
  fans?: number;
  posts?: number;
  rating?: number;
  review_count?: number;
  // Route info
  isRoute?: boolean;
  routeGeojson?: object;
  routeDistanceKm?: number;
  difficulty?: DifficultyLevel;
  // Live specific
  viewer_count?: number;
  channel_name?: string;
  // Event/Group specific
  starts_at?: string;
  ends_at?: string;
  participant_count?: number;
  max_participants?: number;
  // Relationship
  is_fan?: boolean;
  is_subscribed?: boolean;
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
    account_type?: string;
    business_name?: string;
  };
  // Like status (from API when authenticated)
  isLiked?: boolean;
  // Challenge fields (a Peak can optionally be a Challenge)
  isChallenge?: boolean;
  challengeId?: string;
  challengeTitle?: string;
  challengeRules?: string;
  challengeEndsAt?: string;
  challengeResponseCount?: number;
  // Filter & overlay metadata (rendered as UI overlays during playback)
  filterId?: string;
  filterIntensity?: number;
  overlays?: Array<{ id: string; type: string; position: { x: number; y: number; scale: number; rotation: number }; params: Record<string, unknown> }>;
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
  PostDetailFanFeed: { postId: string; post?: Post; fanFeedPosts?: Array<{ id: string; type: 'video' | 'image' | 'carousel'; media: string; allMedia?: string[]; thumbnail: string; description: string; likes: number; views?: number; comments?: number; location?: string | null; taggedUsers?: Array<{ id: string; username: string; fullName?: string | null; avatarUrl?: string | null }>; user: { id: string; name: string; avatar: string; followsMe?: boolean } }> };
  PostDetailVibesFeed: { postId: string; post?: unknown; startCondensed?: boolean };
  PostDetailProfile: { postId: string; post?: Post; profilePosts?: Post[] };
  FansList: { userId?: string; fansCount?: number; type?: 'fans' | 'following' };
  PostLikers: { postId: string };

  // Create
  CreatePost: { fromProfile?: boolean } | undefined;
  VideoRecorder: undefined;
  AddPostDetails: { media: MediaAsset[]; postType?: string; fromProfile?: boolean };
  PostSuccess: {
    media?: MediaAsset[];
    postType?: string;
    postId?: string;
    description?: string;
    visibility?: string;
    location?: string;
    taggedPeople?: { id: string; name?: string; full_name?: string; avatar?: string | null; avatar_url?: string | null }[];
    fromProfile?: boolean;
  } | undefined;

  // Peaks
  PeakView: { peaks?: Peak[]; peakId?: string; peakData?: Peak[]; initialIndex?: number };
  CreatePeak: {
    replyTo?: string;
    originalPeak?: { id: string; user?: { id: string; name: string; avatar: string } };
    challengeId?: string;
    challengeTitle?: string;
  } | undefined;
  PeakPreview: {
    videoUri: string;
    duration: number;
    replyTo?: string;
    originalPeak?: { id: string; user?: { id: string; name: string; avatar: string } };
    challengeId?: string;
    challengeTitle?: string;
    filterId?: string;
    filterIntensity?: number;
    overlays?: Array<{ id: string; type: string; position: { x: number; y: number; scale: number; rotation: number }; params: Record<string, unknown> }>;
  };
  Challenges: undefined;

  // Vibe
  Prescriptions: undefined;
  ActivePrescription: { prescriptionId: string };
  PrescriptionPreferences: undefined;

  // Settings
  Settings: undefined;
  EditProfile: undefined;
  EditInterests: { currentInterests?: string[]; returnTo?: string } | undefined;
  EditExpertise: { currentExpertise?: string[]; returnTo?: string; includeBusinessCategories?: boolean } | undefined;
  EditBusinessCategory: { currentCategory?: string; returnTo?: string } | undefined;
  PasswordManager: undefined;
  NotificationSettings: undefined;
  ReportProblem: undefined;
  TermsPolicies: undefined;
  DataExport: undefined;
  BlockedUsers: undefined;
  MutedUsers: undefined;
  FollowRequests: undefined;

  // Payments & Subscriptions
  CreatorWallet: undefined;
  PlatformSubscription: undefined;
  ChannelSubscription: { creatorId: string; creatorName?: string; creatorAvatar?: string; creatorUsername?: string; subscriberCount?: number; tier?: string };
  IdentityVerification: undefined;
  PaymentMethods: undefined;

  // Dispute Center
  DisputeCenter: undefined;
  CreateDispute: undefined;
  DisputeDetail: { disputeId: string };

  // Admin
  AdminDisputes: undefined;

  // Private Sessions - Fan
  MySessions: undefined;
  SessionDetail: { sessionId: string };
  BookSession: { creatorId: string; fromPack?: boolean; creator?: { id: string; name: string; avatar: string; specialty?: string } };
  SessionPayment: { creatorId: string; sessionId?: string; date: string; time: string; duration: number; price: number };
  SessionBooked: { sessionId: string; creatorName: string; date: string; time: string };
  WaitingRoom: { sessionId: string };
  PrivateCall: { sessionId: string; creator?: { id: string; name: string; avatar: string | null }; myUserId?: string; isIncoming?: boolean };
  SessionEnded: { sessionId: string; duration: number; creatorName: string };

  // Creator Offerings & Checkout (Fan)
  CreatorOfferings: { creatorId: string };
  PackPurchase: { creatorId: string; pack: { id: string; name: string; description: string; sessionsIncluded: number; sessionDuration: number; validityDays: number; price: number; savings: number } };
  PackPurchaseSuccess: { pack: { id: string; name: string; sessionsIncluded: number; sessionDuration: number; validityDays: number; price: number }; creator: { id: string; name: string; username: string } };
  ChannelSubscribe: { creatorId: string; tier: { id: string; name: string; price: number; perks: string[]; popular?: boolean } };
  SubscriptionSuccess: { tier: { id: string; name: string; price: number; perks: string[] }; creator: { id: string; name: string; username: string; avatar: string } };

  // Creator Dashboard
  PrivateSessionsManage: undefined;
  CreatorEarnings: undefined;

  // WebView (for Stripe checkout)
  WebView: { url: string; title?: string };

  // Live Streaming
  GoLiveIntro: undefined;
  GoLive: { title?: string } | undefined;
  LiveStreaming: { channelName?: string; title?: string; audience?: string; isPrivate?: boolean; hostId?: string; hostName?: string; hostAvatar?: string | null } | undefined;
  LiveEnded: { duration?: number; viewerCount?: number; peakViewers?: number } | undefined;
  ViewerLiveStream: { channelName: string; hostUserId?: string; creatorId?: string; hostName?: string; creatorName?: string; hostAvatar?: string | null; creatorAvatar?: string | null; liveTitle?: string; viewerCount?: number };

  // Live Battles
  BattleLobby: { battleId: string };
  BattleStream: { battleId: string; agoraToken?: string; agoraUid?: number };
  BattleResults: { battleId: string; winner?: { id: string; user_id: string; username: string; display_name?: string; avatar_url?: string; profile_picture_url?: string; is_verified: boolean; tips_received: number; tip_count: number; is_host: boolean }; participants: { id: string; user_id: string; username: string; display_name?: string; avatar_url?: string; profile_picture_url?: string; is_verified: boolean; tips_received: number; tip_count: number; is_host: boolean }[] };
  InviteToBattle: { battleId: string };

  // Events (Xplorer)
  EventList: undefined;
  EventManage: { eventId: string };

  // Activities (unified)
  CreateActivity: { lockedLocation?: { lat: number; lng: number }; initialMode?: 'event' | 'group' } | undefined;
  ActivityDetail: { activityId: string; activityType: 'event' | 'group' };

  // Spots
  SuggestSpot: undefined;
  SpotDetail: { spotId: string };

  // Find Friends (standalone popup)
  FindFriends: undefined;

  // Account Upgrade
  UpgradeToPro: undefined;

  // Business (Pro Local) - User Screens
  BusinessDiscovery: undefined;
  BusinessProfile: { businessId: string };
  BusinessBooking: { businessId: string; serviceId?: string };
  BusinessSubscription: { businessId: string; serviceId?: string };
  BusinessBookingSuccess: {
    bookingId: string;
    businessName: string;
    serviceName: string;
    date: string;
    time: string;
  };
  BusinessSubscriptionSuccess: {
    subscriptionId: string;
    businessName: string;
    planName: string;
    period: 'weekly' | 'monthly' | 'yearly';
    trialDays?: number;
  };
  MySubscriptions: undefined;
  MemberAccess: {
    subscriptionId: string;
    businessId: string;
    businessName: string;
  };

  // Business (Pro Local) - Owner Screens
  BusinessDashboard: undefined;
  BusinessServicesManage: undefined;
  BusinessProgram: { tab?: 'activities' | 'schedule' | 'tags' } | undefined;
  BusinessScheduleUpload: undefined;
  BusinessScanner: undefined;
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

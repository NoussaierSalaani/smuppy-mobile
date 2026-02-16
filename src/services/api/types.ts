/**
 * Exported API Types
 *
 * All public interfaces consumed by screens, stores, and components.
 * Extracted from aws-api.ts for maintainability — re-exported from there
 * so all 76+ importing files continue working with zero changes.
 */

export interface TaggedUser {
  id: string;
  username: string;
  fullName: string | null;
  avatarUrl: string | null;
}

export interface MediaMeta {
  width?: number;
  height?: number;
  blurhash?: string;
  variants?: { large?: string; medium?: string; thumb?: string };
  optimizedAt?: string;
}

export interface Post {
  id: string;
  authorId: string;
  content: string;
  mediaUrls: string[];
  mediaType: 'image' | 'video' | 'multiple' | null;
  mediaMeta?: MediaMeta;
  visibility?: 'public' | 'fans' | 'private' | 'subscribers';
  isPeak?: boolean;
  location?: string | null;
  tags?: string[];
  taggedUsers?: TaggedUser[];
  likesCount: number;
  commentsCount: number;
  viewsCount?: number;
  createdAt: string;
  isLiked?: boolean;
  isSaved?: boolean;
  videoStatus?: 'uploaded' | 'processing' | 'ready' | 'failed' | null;
  hlsUrl?: string | null;
  thumbnailUrl?: string | null;
  videoVariants?: Record<string, string> | null;
  videoDuration?: number | null;
  author: Profile;
}

export interface Profile {
  id: string;
  username: string;
  fullName: string | null;
  displayName?: string | null;
  avatarUrl: string | null;
  coverUrl?: string | null;
  bio: string | null;
  website?: string | null;
  isVerified: boolean;
  isPremium?: boolean;
  isPrivate: boolean;
  accountType: 'personal' | 'pro_creator' | 'pro_business';
  followersCount: number;
  followingCount: number;
  postsCount: number;
  peaksCount?: number;
  isFollowing?: boolean;
  isFollowedBy?: boolean;
  // Profile extras
  gender?: string;
  dateOfBirth?: string;
  interests?: string[];
  expertise?: string[];
  socialLinks?: Record<string, string>;
  onboardingCompleted?: boolean;
  // Business fields
  businessName?: string;
  businessCategory?: string;
  businessAddress?: string;
  businessLatitude?: number;
  businessLongitude?: number;
  businessPhone?: string;
  locationsMode?: string;
}

export interface PeakChallenge {
  id: string;
  title: string;
  rules: string | null;
  status: string;
  responseCount: number;
}

export interface Peak {
  id: string;
  authorId: string;
  videoUrl: string;
  thumbnailUrl: string | null;
  caption: string | null;
  duration: number;
  replyToPeakId: string | null;
  likesCount: number;
  commentsCount: number;
  viewsCount: number;
  createdAt: string;
  filterId: string | null;
  filterIntensity: number | null;
  overlays: Array<{ id: string; type: string; position: { x: number; y: number; scale: number; rotation: number }; params: Record<string, unknown> }> | null;
  expiresAt: string | null;
  savedToProfile: boolean | null;
  hlsUrl?: string | null;
  videoStatus?: 'uploaded' | 'processing' | 'ready' | 'failed' | null;
  videoVariants?: Record<string, string> | null;
  videoDuration?: number | null;
  isLiked?: boolean;
  isViewed?: boolean;
  author: Profile;
  challenge: PeakChallenge | null;
}

export interface Comment {
  id: string;
  postId: string;
  authorId: string;
  content: string;
  likesCount: number;
  repliesCount: number;
  createdAt: string;
  author: Profile;
  replies?: Comment[];
}

export interface Notification {
  id: string;
  type: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
  read: boolean;
  createdAt: string;
}

export interface NotificationPreferences {
  likes: boolean;
  comments: boolean;
  follows: boolean;
  messages: boolean;
  mentions: boolean;
  live: boolean;
}

export interface CreatePostInput {
  content?: string;
  mediaUrls?: string[];
  mediaType?: 'image' | 'video' | 'multiple';
  visibility?: 'public' | 'fans' | 'private' | 'subscribers';
  location?: string | null;
  taggedUsers?: string[];
  videoDuration?: number;
  isPeak?: boolean;
  tags?: string[];
}

export interface CreatePeakInput {
  videoUrl: string;
  thumbnailUrl?: string;
  caption?: string;
  duration: number;
  replyToPeakId?: string;
  hashtags?: string[];
  filterId?: string;
  filterIntensity?: number;
  overlays?: Array<{ id: string; type: string; position: { x: number; y: number; scale: number; rotation: number }; params: Record<string, unknown> }>;
  feedDuration?: 24 | 48;
  saveToProfile?: boolean;
}

export interface UpdateProfileInput {
  username?: string;
  fullName?: string;
  bio?: string;
  avatarUrl?: string;
  coverUrl?: string;
  isPrivate?: boolean;
  accountType?: 'personal' | 'pro_creator' | 'pro_business';
  gender?: string;
  dateOfBirth?: string;
  displayName?: string;
  website?: string;
  socialLinks?: Record<string, string>;
  interests?: string[];
  expertise?: string[];
  businessName?: string;
  businessCategory?: string;
  businessAddress?: string;
  businessLatitude?: number;
  businessLongitude?: number;
  businessPhone?: string;
  locationsMode?: string;
  onboardingCompleted?: boolean;
}

export interface Conversation {
  id: string;
  participantIds: string[];
  participants: Profile[];
  lastMessage: Message | null;
  lastMessageAt: string | null;
  unreadCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  messageType: 'text' | 'image' | 'video' | 'audio';
  mediaUrl: string | null;
  readAt: string | null;
  createdAt: string;
  sender?: Profile;
}

export interface Payment {
  id: string;
  stripePaymentIntentId: string;
  buyerId: string;
  creatorId: string;
  amount: number;
  currency: string;
  platformFee: number;
  status: 'pending' | 'succeeded' | 'failed' | 'refunded';
  createdAt: string;
}

export interface Subscription {
  id: string;
  subscriberId: string;
  creatorId: string;
  stripeSubscriptionId: string;
  status: 'active' | 'canceling' | 'canceled' | 'past_due' | 'paused';
  currentPeriodStart: string;
  currentPeriodEnd: string;
  createdAt: string;
  // Joined fields
  username?: string;
  full_name?: string;
  avatar_url?: string;
}

export interface SubscriptionTier {
  id: string;
  creatorId: string;
  stripePriceId: string;
  name: string;
  description: string;
  priceCents: number;
  currency: string;
  benefits: string[];
  isActive: boolean;
  subscriberCount: number;
}

export interface WalletTransaction {
  id: string;
  type: 'session' | 'pack' | 'subscription' | 'tip' | 'payout';
  amount: number;
  currency: string;
  status: 'pending' | 'completed' | 'failed';
  description: string;
  createdAt: string;
  buyerName?: string;
  buyerAvatar?: string;
}

export interface Session {
  id: string;
  status: 'pending' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled' | 'no_show';
  scheduledAt: string;
  duration: number;
  price: number;
  notes?: string;
  creator: {
    id: string;
    name: string;
    username: string;
    avatar: string;
    verified?: boolean;
    bio?: string;
  };
  fan: {
    id: string;
    name: string;
    username: string;
    avatar: string;
  };
  isCreator: boolean;
  agoraChannel?: string;
  startedAt?: string;
  endedAt?: string;
  createdAt: string;
}

export interface SessionPack {
  id: string;
  name: string;
  description?: string;
  sessionsIncluded: number;
  sessionDuration: number;
  validityDays: number;
  price: number;
  savings?: number;
  isActive?: boolean;
  creator?: {
    id: string;
    name: string;
    username: string;
    avatar: string;
    verified?: boolean;
  };
}

export interface UserSessionPack {
  id: string;
  packId: string;
  name: string;
  description?: string;
  sessionsIncluded: number;
  sessionsRemaining: number;
  sessionDuration: number;
  expiresAt: string;
  creator: {
    id: string;
    name: string;
    username: string;
    avatar: string;
  };
  purchasedAt: string;
}

export interface ActivityItem {
  activityType: 'post_like' | 'peak_like' | 'follow' | 'comment' | 'peak_comment';
  createdAt: string;
  targetData: {
    postId?: string;
    peakId?: string;
    mediaUrl?: string;
    thumbnailUrl?: string;
    content?: string;
    text?: string;
  } | null;
  targetUser: {
    id: string;
    username: string;
    fullName: string;
    avatarUrl: string;
  };
}

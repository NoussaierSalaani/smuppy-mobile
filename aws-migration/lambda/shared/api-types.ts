/**
 * Shared API Response Types for Lambda Handlers
 *
 * Core contract types that define what Lambda handlers return.
 * Mobile client expects camelCase keys — these types enforce that convention.
 *
 * Adoption is incremental: handlers can import these instead of inline interfaces.
 */

// ============================================
// Generic Response Envelopes
// ============================================

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  message?: string;
}

export interface PaginatedApiResponse<T> {
  success: boolean;
  data: T[];
  nextCursor: string | null;
  hasMore: boolean;
  total?: number;
}

export interface ApiErrorResponse {
  success: false;
  error: string;
  code?: string;
}

// ============================================
// Entity Types (camelCase — matches mobile client)
// ============================================

export interface ApiProfile {
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
  gender?: string;
  dateOfBirth?: string;
  interests?: string[];
  expertise?: string[];
  socialLinks?: Record<string, string>;
  onboardingCompleted?: boolean;
  businessName?: string;
  businessCategory?: string;
  businessAddress?: string;
  businessLatitude?: number;
  businessLongitude?: number;
  businessPhone?: string;
  locationsMode?: string;
}

export interface ApiPost {
  id: string;
  authorId: string;
  content: string;
  mediaUrls: string[];
  mediaType: 'image' | 'video' | 'multiple' | null;
  visibility?: 'public' | 'fans' | 'private' | 'subscribers';
  isPeak?: boolean;
  location?: string | null;
  tags?: string[];
  taggedUsers?: Array<{ id: string; username: string; fullName: string | null; avatarUrl: string | null }>;
  likesCount: number;
  commentsCount: number;
  viewsCount?: number;
  createdAt: string;
  isLiked?: boolean;
  author: ApiProfile;
}

export interface ApiPeakChallenge {
  id: string;
  title: string;
  rules: string | null;
  status: string;
  responseCount: number;
}

export interface ApiPeak {
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
  overlays: Array<{
    id: string;
    type: string;
    position: { x: number; y: number; scale: number; rotation: number };
    params: Record<string, unknown>;
  }> | null;
  expiresAt: string | null;
  savedToProfile: boolean | null;
  isLiked?: boolean;
  author: ApiProfile;
  challenge: ApiPeakChallenge | null;
}

export interface ApiComment {
  id: string;
  postId: string;
  authorId: string;
  content: string;
  likesCount: number;
  repliesCount: number;
  createdAt: string;
  author: ApiProfile;
  replies?: ApiComment[];
}

export interface ApiNotification {
  id: string;
  type: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
  read: boolean;
  createdAt: string;
}

export interface ApiConversation {
  id: string;
  participantIds: string[];
  participants: ApiProfile[];
  lastMessage: ApiMessage | null;
  lastMessageAt: string | null;
  unreadCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ApiMessage {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  messageType: 'text' | 'image' | 'video' | 'audio';
  mediaUrl: string | null;
  readAt: string | null;
  createdAt: string;
  sender?: ApiProfile;
}

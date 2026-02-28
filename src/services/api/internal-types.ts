/**
 * Internal API Types
 *
 * Private interfaces used only within AWSAPIService methods.
 * Not exported to consumers — imported only by aws-api.ts.
 */

export interface RequestOptions {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  headers?: Record<string, string>;
  authenticated?: boolean;
  timeout?: number;
  /** Observability-only metadata — never sent to the server. */
  meta?: {
    feature?: string;
    action?: string;
  };
}

export interface PaginatedResponse<T> {
  data: T[];
  nextCursor: string | null;
  hasMore: boolean;
  total: number;
}

export interface ApiPagination {
  limit: number;
  hasMore: boolean;
  nextCursor?: string | null;
  offset?: number;
}

export interface DeviceSession {
  id: string;
  deviceType: string;
  platform: string;
  lastActiveAt: string;
  createdAt: string;
}

export interface TipEntry {
  id: string;
  senderId: string;
  receiverId: string;
  amount: number;
  currency: string;
  contextType: string;
  contextId?: string;
  message?: string;
  createdAt: string;
  sender?: { id: string; username: string; displayName?: string; avatarUrl?: string };
  receiver?: { id: string; username: string; displayName?: string; avatarUrl?: string };
}

export interface LeaderboardEntry {
  rank: number;
  userId: string;
  username: string;
  displayName?: string;
  avatarUrl?: string;
  totalAmount: number;
  tipCount: number;
}

export interface ApiChallenge {
  id: string;
  peakId: string;
  creatorId: string;
  title: string;
  description?: string;
  rules?: string;
  endsAt?: string;
  isPublic?: boolean;
  maxParticipants?: number;
  responseCount?: number;
  status?: string;
  createdAt: string;
  creator?: { id: string; username: string; displayName?: string; avatarUrl?: string; isVerified?: boolean };
}

export interface ChallengeResponseEntry {
  id: string;
  challengeId: string;
  userId: string;
  peakId: string;
  score?: number;
  timeSeconds?: number;
  rank?: number;
  voteCount?: number;
  status?: string;
  createdAt: string;
  user?: { id: string; username: string; displayName?: string; avatarUrl?: string; isVerified?: boolean };
  peak?: { id: string; thumbnailUrl?: string; videoUrl?: string; duration?: number; viewsCount?: number };
}

export interface ApiBattle {
  id: string;
  hostId: string;
  title?: string;
  description?: string;
  battleType: string;
  status: string;
  maxParticipants?: number;
  durationMinutes?: number;
  scheduledAt?: string;
  startedAt?: string;
  endedAt?: string;
  createdAt: string;
  agoraChannelName?: string;
  participants?: BattleParticipant[];
}

export interface BattleParticipant {
  id: string;
  userId: string;
  username: string;
  displayName?: string;
  avatarUrl?: string;
  isVerified?: boolean;
  tipsReceived: number;
  tipCount: number;
  isHost: boolean;
  status?: string;
}

export interface BattleTip {
  id: string;
  senderId: string;
  recipientId: string;
  amount: number;
  senderUsername?: string;
  createdAt: string;
}

export interface BattleComment {
  id: string;
  userId: string;
  text: string;
  username?: string;
  createdAt: string;
}

export interface ApiEvent {
  id: string;
  creatorId: string;
  title: string;
  description?: string;
  categorySlug: string;
  locationName: string;
  address?: string;
  latitude: number;
  longitude: number;
  startsAt: string;
  endsAt?: string;
  maxParticipants?: number;
  currentParticipants?: number;
  isFree: boolean;
  price?: number;
  currency?: string;
  isPublic?: boolean;
  coverImageUrl?: string;
  status?: string;
  createdAt: string;
  creator?: { id: string; username: string; displayName?: string; avatarUrl?: string; isVerified?: boolean };
}

export interface EventParticipant {
  id: string;
  userId: string;
  username: string;
  displayName?: string;
  avatarUrl?: string;
  isVerified?: boolean;
  joinedAt: string;
}

export interface BusinessSummary {
  id: string;
  name: string;
  description?: string;
  category: string;
  coverImageUrl?: string;
  avatarUrl?: string;
  latitude: number;
  longitude: number;
  address?: string;
  rating?: number;
  reviewCount?: number;
  isOpen?: boolean;
  distance?: number;
}

export interface BusinessProfileData {
  id: string;
  userId: string;
  name: string;
  description?: string;
  category: string;
  coverImageUrl?: string;
  avatarUrl?: string;
  latitude: number;
  longitude: number;
  address?: string;
  phone?: string;
  website?: string;
  email?: string;
  rating?: number;
  reviewCount?: number;
  followerCount?: number;
  isFollowing?: boolean;
  hours?: Record<string, unknown>;
  createdAt: string;
}

export interface BusinessServiceData {
  id: string;
  name: string;
  description?: string;
  category: string;
  priceCents: number;
  durationMinutes?: number;
  isSubscription: boolean;
  subscriptionPeriod?: string;
  trialDays?: number;
  maxCapacity?: number;
  isActive: boolean;
}

export interface BusinessActivityData {
  id: string;
  name: string;
  description?: string;
  dayOfWeek?: number;
  startTime?: string;
  endTime?: string;
  category?: string;
  maxCapacity?: number;
  createdAt?: string;
}

export interface BusinessReviewData {
  id: string;
  userId: string;
  rating: number;
  comment?: string;
  createdAt: string;
  user?: { id: string; username: string; displayName?: string; avatarUrl?: string };
}

export interface BookingSlotData {
  id: string;
  startTime: string;
  endTime: string;
  isAvailable: boolean;
}

export interface BusinessBookingData {
  id: string;
  businessId: string;
  userId: string;
  serviceId: string;
  date: string;
  slotId: string;
  status: string;
  amount: number;
  currency: string;
  createdAt: string;
}

export interface SubscriptionPlanData {
  id: string;
  name: string;
  description?: string;
  priceCents: number;
  period: string;
  trialDays?: number;
  features?: string[];
  isActive: boolean;
}

export interface BusinessSubscriptionData {
  id: string;
  businessId: string;
  userId: string;
  planId: string;
  status: string;
  currentPeriodStart?: string;
  currentPeriodEnd?: string;
  cancelledAt?: string;
  createdAt: string;
}

export interface BusinessScheduleSlotData {
  id: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  activityId?: string;
  maxCapacity?: number;
}

export interface BusinessTagData {
  id: string;
  name: string;
  category: string;
  createdAt?: string;
}

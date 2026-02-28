import type { AWSAPIService } from '../aws-api';
import type { Profile, Peak, CreatePeakInput } from './types';
import type { PaginatedResponse, ApiPagination, ApiChallenge, ChallengeResponseEntry } from './internal-types';
import { withMediaReadyRetry } from './helpers';

// ---------------------------------------------------------------------------
// Local helpers (not exported)
// ---------------------------------------------------------------------------

function normalizePeakAuthor(raw: unknown, fallbackId = ''): Profile {
  const rec = (raw && typeof raw === 'object') ? raw as Record<string, unknown> : {};
  return {
    id: (rec.id as string | undefined) || (rec.user_id as string | undefined) || fallbackId,
    username: (rec.username as string | undefined) || (rec.user_name as string | undefined) || '',
    fullName: (rec.fullName as string | undefined) || (rec.full_name as string | undefined) || null,
    displayName: (rec.displayName as string | undefined) || (rec.display_name as string | undefined) || null,
    avatarUrl:
      (rec.avatarUrl as string | undefined) ||
      (rec.avatar_url as string | undefined) ||
      (rec.avatar as string | undefined) ||
      null,
    coverUrl: (rec.coverUrl as string | undefined) || (rec.cover_url as string | undefined) || null,
    bio: (rec.bio as string | undefined) || null,
    website: (rec.website as string | undefined) || null,
    isVerified: Boolean((rec.isVerified as boolean | undefined) ?? (rec.is_verified as boolean | undefined)),
    isPremium: Boolean((rec.isPremium as boolean | undefined) ?? (rec.is_premium as boolean | undefined)),
    isPrivate: Boolean((rec.isPrivate as boolean | undefined) ?? (rec.is_private as boolean | undefined)),
    accountType: ((rec.accountType as string | undefined) || (rec.account_type as string | undefined) || 'personal') as Profile['accountType'],
    followersCount: Number((rec.followersCount as number | undefined) ?? (rec.followers_count as number | undefined) ?? 0),
    followingCount: Number((rec.followingCount as number | undefined) ?? (rec.following_count as number | undefined) ?? 0),
    postsCount: Number((rec.postsCount as number | undefined) ?? (rec.posts_count as number | undefined) ?? 0),
    peaksCount: Number((rec.peaksCount as number | undefined) ?? (rec.peaks_count as number | undefined) ?? 0),
    isFollowing: (rec.isFollowing as boolean | undefined) ?? (rec.is_following as boolean | undefined),
    isFollowedBy: (rec.isFollowedBy as boolean | undefined) ?? (rec.is_followed_by as boolean | undefined),
    interests: Array.isArray(rec.interests) ? rec.interests as string[] : undefined,
    expertise: Array.isArray(rec.expertise) ? rec.expertise as string[] : undefined,
    socialLinks: rec.socialLinks as Record<string, string> | undefined,
    onboardingCompleted: (rec.onboardingCompleted as boolean | undefined) ?? (rec.onboarding_completed as boolean | undefined),
    businessName: (rec.businessName as string | undefined) || (rec.business_name as string | undefined),
    businessCategory: (rec.businessCategory as string | undefined) || (rec.business_category as string | undefined),
    businessAddress: (rec.businessAddress as string | undefined) || (rec.business_address as string | undefined),
    businessLatitude: (rec.businessLatitude as number | undefined) ?? (rec.business_latitude as number | undefined),
    businessLongitude: (rec.businessLongitude as number | undefined) ?? (rec.business_longitude as number | undefined),
    businessPhone: (rec.businessPhone as string | undefined) || (rec.business_phone as string | undefined),
    locationsMode: (rec.locationsMode as string | undefined) || (rec.locations_mode as string | undefined),
    gender: rec.gender as string | undefined,
    dateOfBirth: (rec.dateOfBirth as string | undefined) || (rec.date_of_birth as string | undefined),
  };
}

function normalizePeak(raw: Peak | Record<string, unknown>): Peak {
  const rec = raw as Record<string, unknown>;
  const authorId =
    (rec.authorId as string | undefined) ||
    (rec.author_id as string | undefined) ||
    ((rec.author as Record<string, unknown> | undefined)?.id as string | undefined) ||
    '';
  const challengeRaw = (rec.challenge && typeof rec.challenge === 'object')
    ? rec.challenge as Record<string, unknown>
    : null;

  return {
    ...(raw as Peak),
    id: (rec.id as string | undefined) || '',
    authorId,
    videoUrl:
      (rec.videoUrl as string | undefined) ||
      (rec.video_url as string | undefined) ||
      (rec.mediaUrl as string | undefined) ||
      (rec.media_url as string | undefined) ||
      '',
    thumbnailUrl:
      (rec.thumbnailUrl as string | undefined) ||
      (rec.thumbnail_url as string | undefined) ||
      (rec.posterUrl as string | undefined) ||
      (rec.poster_url as string | undefined) ||
      null,
    caption: (rec.caption as string | undefined) || (rec.content as string | undefined) || null,
    duration: Number((rec.duration as number | undefined) ?? (rec.video_duration as number | undefined) ?? 0),
    replyToPeakId:
      (rec.replyToPeakId as string | undefined) ||
      (rec.reply_to_peak_id as string | undefined) ||
      null,
    likesCount: Number((rec.likesCount as number | undefined) ?? (rec.likes_count as number | undefined) ?? (rec.likes as number | undefined) ?? 0),
    commentsCount: Number((rec.commentsCount as number | undefined) ?? (rec.comments_count as number | undefined) ?? (rec.comments as number | undefined) ?? 0),
    viewsCount: Number((rec.viewsCount as number | undefined) ?? (rec.views_count as number | undefined) ?? (rec.views as number | undefined) ?? 0),
    createdAt: (rec.createdAt as string | undefined) || (rec.created_at as string | undefined) || new Date().toISOString(),
    filterId: (rec.filterId as string | undefined) || (rec.filter_id as string | undefined) || null,
    filterIntensity: (rec.filterIntensity as number | undefined) ?? (rec.filter_intensity as number | undefined) ?? null,
    overlays: Array.isArray(rec.overlays) ? rec.overlays as Peak['overlays'] : null,
    expiresAt: (rec.expiresAt as string | undefined) || (rec.expires_at as string | undefined) || null,
    savedToProfile: (rec.savedToProfile as boolean | undefined) ?? (rec.saved_to_profile as boolean | undefined) ?? null,
    hlsUrl: (rec.hlsUrl as string | undefined) || (rec.hls_url as string | undefined) || null,
    videoStatus: (rec.videoStatus as Peak['videoStatus']) || (rec.video_status as Peak['videoStatus']) || null,
    videoVariants: (rec.videoVariants as Record<string, string> | undefined) || (rec.video_variants as Record<string, string> | undefined) || null,
    videoDuration: (rec.videoDuration as number | undefined) ?? (rec.video_duration as number | undefined) ?? null,
    isLiked: (rec.isLiked as boolean | undefined) ?? (rec.is_liked as boolean | undefined),
    isViewed: (rec.isViewed as boolean | undefined) ?? (rec.is_viewed as boolean | undefined),
    author: normalizePeakAuthor(rec.author, authorId),
    challenge: challengeRaw ? {
      id: (challengeRaw.id as string | undefined) || '',
      title: (challengeRaw.title as string | undefined) || '',
      rules: (challengeRaw.rules as string | undefined) || null,
      status: (challengeRaw.status as string | undefined) || '',
      responseCount: Number((challengeRaw.responseCount as number | undefined) ?? (challengeRaw.response_count as number | undefined) ?? 0),
    } : null,
  };
}

// ---------------------------------------------------------------------------
// Exported API functions
// ---------------------------------------------------------------------------

export async function getPeaks(
  api: AWSAPIService,
  params?: { limit?: number; cursor?: string; userId?: string },
): Promise<PaginatedResponse<Peak>> {
  const queryParams = new URLSearchParams();
  if (params?.limit) queryParams.set('limit', params.limit.toString());
  if (params?.cursor) queryParams.set('cursor', params.cursor);
  if (params?.userId) {
    // Support both camelCase and snake_case author filters (some gateways expect one or the other)
    queryParams.set('authorId', params.userId);
    queryParams.set('author_id', params.userId);
  }
  const query = queryParams.toString();
  const response = await api.request<{ data?: Peak[]; peaks?: Peak[]; nextCursor?: string | null; hasMore?: boolean; items?: Peak[] }>(`/peaks${query ? `?${query}` : ''}`);
  const raw = response.data || response.peaks || response.items || [];
  return {
    data: raw.map((item) => normalizePeak(item)),
    nextCursor: response.nextCursor || null,
    hasMore: !!response.hasMore,
    total: raw.length,
  };
}

export async function getPeak(api: AWSAPIService, id: string): Promise<Peak> {
  const peak = await api.request<Peak | { data?: Peak; peak?: Peak }>(`/peaks/${id}`);
  const payload = (peak as { data?: Peak; peak?: Peak }).data || (peak as { data?: Peak; peak?: Peak }).peak || peak;
  return normalizePeak(payload as Peak);
}

export async function createPeak(api: AWSAPIService, data: CreatePeakInput): Promise<Peak> {
  return withMediaReadyRetry(() => api.request('/peaks', {
    method: 'POST',
    body: data,
  }));
}

export async function likePeak(api: AWSAPIService, id: string): Promise<void> {
  return api.request(`/peaks/${id}/like`, {
    method: 'POST',
  });
}

export async function reactToPeak(
  api: AWSAPIService,
  id: string,
  reaction: string,
): Promise<{
  success: boolean;
  reaction: string;
  reactionCounts: Record<string, number>;
}> {
  return api.request(`/peaks/${id}/react`, {
    method: 'POST',
    body: { reaction },
  });
}

export async function removeReactionFromPeak(
  api: AWSAPIService,
  id: string,
): Promise<{ success: boolean }> {
  return api.request(`/peaks/${id}/react`, {
    method: 'DELETE',
  });
}

export async function tagFriendOnPeak(
  api: AWSAPIService,
  peakId: string,
  friendId: string,
): Promise<{
  success: boolean;
  tag: {
    id: string;
    taggedUser: {
      id: string;
      username: string;
      displayName: string;
      avatarUrl: string;
    };
    taggedBy: string;
    createdAt: string;
  };
}> {
  return api.request(`/peaks/${peakId}/tags`, {
    method: 'POST',
    body: { friendId },
  });
}

export async function getPeakTags(
  api: AWSAPIService,
  peakId: string,
): Promise<{
  success: boolean;
  tags: Array<{
    id: string;
    userId: string;
    username: string;
    displayName?: string;
    avatarUrl?: string;
    taggedBy: string;
    createdAt: string;
  }>;
}> {
  return api.request(`/peaks/${peakId}/tags`);
}

export async function hidePeak(
  api: AWSAPIService,
  id: string,
  reason: 'not_interested' | 'seen_too_often' | 'irrelevant' | 'other' = 'not_interested',
): Promise<{
  success: boolean;
  message: string;
  reason: string;
}> {
  return api.request(`/peaks/${id}/hide`, {
    method: 'POST',
    body: { reason },
  });
}

export async function getPeakComments(
  api: AWSAPIService,
  peakId: string,
  params?: { limit?: number; cursor?: string },
): Promise<{
  success: boolean;
  data: Array<{
    id: string;
    text: string;
    createdAt: string;
    author: { id: string; username: string; fullName: string; avatarUrl: string; isVerified: boolean };
  }>;
  nextCursor: string | null;
  hasMore: boolean;
}> {
  const query = new URLSearchParams();
  if (params?.limit) query.set('limit', String(params.limit));
  if (params?.cursor) query.set('cursor', params.cursor);
  const qs = query.toString();
  return api.request(`/peaks/${peakId}/comments${qs ? `?${qs}` : ''}`);
}

export async function commentOnPeak(
  api: AWSAPIService,
  peakId: string,
  text: string,
): Promise<{
  success: boolean;
  comment: {
    id: string;
    text: string;
    createdAt: string;
    author: { id: string; username: string; fullName: string; avatarUrl: string; isVerified: boolean };
  };
}> {
  return api.request(`/peaks/${peakId}/comments`, {
    method: 'POST',
    body: { text },
  });
}

export async function deletePeak(
  api: AWSAPIService,
  id: string,
): Promise<{ success: boolean }> {
  return api.request(`/peaks/${id}`, { method: 'DELETE' });
}

export async function getExpiredPeaks(
  api: AWSAPIService,
): Promise<{ data: Peak[]; total: number }> {
  return api.request('/peaks/expired');
}

export async function savePeakDecision(
  api: AWSAPIService,
  id: string,
  action: 'save_to_profile' | 'dismiss',
): Promise<{ success: boolean }> {
  return api.request(`/peaks/${id}/save-decision`, {
    method: 'POST',
    body: { action },
  });
}

// ---------------------------------------------------------------------------
// Challenges
// ---------------------------------------------------------------------------

export async function createChallenge(
  api: AWSAPIService,
  data: {
    peakId: string;
    title: string;
    description?: string;
    rules?: string;
    challengeTypeId?: string;
    challengeTypeSlug?: string;
    durationSeconds?: number;
    endsAt?: string;
    isPublic?: boolean;
    allowAnyone?: boolean;
    maxParticipants?: number;
    taggedUserIds?: string[];
    hasPrize?: boolean;
    prizeDescription?: string;
    prizeAmount?: number;
    tipsEnabled?: boolean;
  },
): Promise<{ success: boolean; challenge?: ApiChallenge; message?: string }> {
  return api.request('/challenges', {
    method: 'POST',
    body: data,
  });
}

export async function getChallenges(
  api: AWSAPIService,
  params?: {
    filter?: 'trending' | 'new' | 'ending_soon' | 'created' | 'tagged' | 'responded';
    creatorId?: string;
    category?: string;
    status?: string;
    limit?: number;
    cursor?: string;
  },
): Promise<{ success: boolean; challenges?: ApiChallenge[]; pagination?: ApiPagination }> {
  const query = new URLSearchParams();
  if (params?.filter) query.append('filter', params.filter);
  if (params?.creatorId) query.append('creatorId', params.creatorId);
  if (params?.category) query.append('category', params.category);
  if (params?.status) query.append('status', params.status);
  if (params?.limit) query.append('limit', params.limit.toString());
  if (params?.cursor) query.append('cursor', params.cursor);
  return api.request(`/challenges?${query.toString()}`);
}

export async function getChallengeDetail(
  api: AWSAPIService,
  challengeId: string,
): Promise<{
  success: boolean;
  challenge?: ApiChallenge;
  message?: string;
}> {
  return api.request(`/challenges/${challengeId}`, { method: 'GET' });
}

export async function getChallengeResponses(
  api: AWSAPIService,
  challengeId: string,
  params?: {
    sortBy?: 'recent' | 'popular';
    limit?: number;
    cursor?: string;
  },
): Promise<{
  success: boolean;
  responses?: ChallengeResponseEntry[];
  nextCursor?: string | null;
  hasMore?: boolean;
}> {
  const query = new URLSearchParams();
  if (params?.sortBy) query.append('sortBy', params.sortBy);
  if (params?.limit) query.append('limit', params.limit.toString());
  if (params?.cursor) query.append('cursor', params.cursor);
  return api.request(`/challenges/${challengeId}/responses?${query.toString()}`, { method: 'GET' });
}

export async function respondToChallenge(
  api: AWSAPIService,
  challengeId: string,
  data: {
    peakId: string;
    score?: number;
    timeSeconds?: number;
  },
): Promise<{ success: boolean; response?: ChallengeResponseEntry; message?: string }> {
  return api.request(`/challenges/${challengeId}/respond`, {
    method: 'POST',
    body: data,
  });
}

export async function voteChallengeResponse(
  api: AWSAPIService,
  challengeId: string,
  responseId: string,
): Promise<{
  success: boolean;
  voted?: boolean;
  voteCount?: number;
  message?: string;
}> {
  return api.request(`/challenges/${challengeId}/responses/${responseId}/vote`, {
    method: 'POST',
  });
}

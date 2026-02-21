// ============================================
// SMUPPY - DATABASE SERVICES
// Frontend <-> AWS Backend connection
// ============================================
//
// RULE: Do NOT gate API calls with getCurrentUser().
// awsAPI.request() handles auth internally (token + 401 retry).
// Only use getCurrentUser() when user.id is needed in request body/response.

import { awsAuth } from './aws-auth';
import { awsAPI, Profile as AWSProfile, Post as AWSPost, Comment as AWSComment, Peak as AWSPeak, Notification as AWSNotification } from './aws-api';
import type {
  Spot as SpotType,
  SpotReview as SpotReviewType,
} from '../types';
import { filterContent } from '../utils/contentFilters';
import { normalizeCdnUrl } from '../utils/cdnUrl';
import { sanitizeDisplayText } from '../utils/sanitize';
import { ACCOUNT_TYPE } from '../config/accountTypes';

/** Extract message from an unknown error */
const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  if (typeof error === 'object' && error !== null && 'message' in error) {
    return String((error as { message: unknown }).message);
  }
  return String(error);
};

/** Extract statusCode from an unknown error */
const getErrorStatusCode = (error: unknown): number | undefined => {
  if (typeof error === 'object' && error !== null && 'statusCode' in error) {
    return (error as { statusCode: number }).statusCode;
  }
  return undefined;
};

/** UUID validation pattern */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Get current authenticated user ID
 */
export const getCurrentUserId = async (): Promise<string | null> => {
  const user = await awsAuth.getCurrentUser();
  return user?.id || null;
};

// ============================================
// TYPE DEFINITIONS
// ============================================

export interface Profile {
  id: string;
  username: string;
  full_name: string;
  display_name?: string;
  avatar_url?: string | null;
  cover_url?: string | null;
  bio?: string;
  location?: string;
  website?: string;
  account_type?: 'personal' | 'pro_creator' | 'pro_business';
  is_verified?: boolean;
  is_premium?: boolean;
  is_private?: boolean;
  gender?: string;
  date_of_birth?: string;
  interests?: string[];
  expertise?: string[];
  social_links?: Record<string, string>;
  business_name?: string;
  business_category?: string;
  business_address?: string;
  business_latitude?: number;
  business_longitude?: number;
  business_phone?: string;
  locations_mode?: string;
  onboarding_completed?: boolean;
  created_at?: string;
  updated_at?: string;
  // Stats
  fan_count?: number;
  following_count?: number;
  post_count?: number;
  peak_count?: number;
  // Bot/Team flags
  is_bot?: boolean;
  is_team?: boolean;
  // Follow status (populated when viewing another user's profile)
  is_following?: boolean;
  is_followed_by?: boolean;
}

export interface Post {
  id: string;
  author_id: string;
  // Content - support both 'content' and 'caption' for compatibility
  content?: string;
  caption?: string;
  // Media - support both 'media_urls' (array) and 'media_url' (string)
  media_urls?: string[];
  media_url?: string;
  media_type?: 'image' | 'video' | 'multiple' | 'photo'; // 'photo' for legacy support
  media_meta?: {
    width?: number;
    height?: number;
    blurhash?: string;
    variants?: { large?: string; medium?: string; thumb?: string };
    optimizedAt?: string;
  };
  visibility: 'public' | 'private' | 'fans' | 'subscribers';
  likes_count?: number;
  comments_count?: number;
  views_count?: number;
  location?: string | null;
  tags?: string[]; // Interest tags for filtering (e.g., ['Fitness', 'Yoga'])
  is_peak?: boolean;
  peak_duration?: number;
  peak_expires_at?: string;
  save_to_profile?: boolean;
  tagged_users?: Array<string | { id: string; username: string; fullName?: string | null; avatarUrl?: string | null }>;
  video_status?: 'uploaded' | 'processing' | 'ready' | 'failed' | null;
  hls_url?: string | null;
  thumbnail_url?: string | null;
  video_variants?: Record<string, string> | null;
  video_duration?: number | null;
  created_at: string;
  author?: Profile;
  [key: string]: unknown; // Allow additional properties for store compatibility
}

export interface Comment {
  id: string;
  user_id: string;
  post_id: string;
  text: string;
  parent_comment_id?: string | null;
  created_at: string;
  user?: Profile;
}

export interface Like {
  id: string;
  user_id: string;
  post_id: string;
  created_at: string;
}

export interface Follow {
  id: string;
  follower_id: string;
  following_id: string;
  created_at: string;
  follower?: Profile;
  following?: Profile;
}

export interface FollowRequest {
  id: string;
  requester_id: string;
  target_id: string;
  status: 'pending' | 'accepted' | 'declined';
  created_at: string;
  updated_at: string;
  requester?: Profile;
  target?: Profile;
}

export type FollowResult = {
  success: boolean;
  type: 'followed' | 'request_created' | 'already_following' | 'already_requested' | 'error';
  error?: string;
};

export interface Interest {
  id: string;
  name: string;
  icon?: string;
}

export interface Expertise {
  id: string;
  name: string;
  icon?: string;
}

interface DbResponse<T> {
  data: T | null;
  error: string | null;
}

interface DbResponseWithCreated<T> extends DbResponse<T> {
  created?: boolean;
}

// Helper to convert AWS API Profile to local Profile format
const convertProfile = (p: AWSProfile | null): Profile | null => {
  if (!p) return null;
  // Business accounts use businessName as their display name
  const isBusiness = p.accountType === ACCOUNT_TYPE.PRO_BUSINESS;
  const businessDisplayName = isBusiness && p.businessName ? p.businessName : null;
  // If fullName equals username, treat as empty (legacy data issue)
  const effectiveFullName = p.fullName && p.fullName !== p.username ? p.fullName : '';

  // Follow flags come back in mixed casing depending on the backend handler.
  // Normalize to our snake_case fields to keep React Query caches consistent.
  const isFollowing = p.isFollowing ?? (p as unknown as Record<string, unknown>)?.is_following as boolean | undefined;
  const isFollowedBy = p.isFollowedBy ?? (p as unknown as Record<string, unknown>)?.is_followed_by as boolean | undefined;

  return {
    id: p.id,
    username: p.username,
    full_name: businessDisplayName || effectiveFullName,
    display_name: businessDisplayName || p.displayName || undefined,
    avatar_url: normalizeCdnUrl(p.avatarUrl || (p as unknown as Record<string, unknown>)?.avatar_url as string | undefined),
    cover_url: normalizeCdnUrl(p.coverUrl || (p as unknown as Record<string, unknown>)?.cover_url as string | undefined),
    bio: p.bio || undefined,
    website: p.website || undefined,
    is_verified: p.isVerified,
    is_premium: p.isPremium,
    is_private: p.isPrivate,
    account_type: p.accountType,
    gender: p.gender,
    date_of_birth: p.dateOfBirth,
    interests: p.interests,
    expertise: p.expertise,
    social_links: p.socialLinks,
    onboarding_completed: p.onboardingCompleted,
    business_name: p.businessName,
    business_category: p.businessCategory,
    business_address: p.businessAddress,
    business_latitude: p.businessLatitude,
    business_longitude: p.businessLongitude,
    business_phone: p.businessPhone,
    locations_mode: p.locationsMode,
    fan_count: p.followersCount,
    following_count: p.followingCount,
    post_count: p.postsCount,
    peak_count: p.peaksCount,
    // Follow status from API
    is_following: isFollowing,
    is_followed_by: isFollowedBy,
  };
};

// Helper to convert AWS API Post to local Post format
const convertPost = (p: AWSPost): Post => {
  const pRec = p as unknown as Record<string, unknown>;
  const rawMedia = p.mediaUrls || pRec?.media_urls || pRec?.mediaUrl || pRec?.media_url || [];
  let mediaArray: string[];
  if (Array.isArray(rawMedia)) mediaArray = rawMedia as string[];
  else if (rawMedia) mediaArray = [rawMedia as string];
  else mediaArray = [];

  return {
    id: p.id,
    author_id: p.authorId,
    content: p.content,
    media_urls: mediaArray,
    media_type: (p.mediaType || pRec?.media_type || (mediaArray.length > 1 ? 'multiple' : undefined)) as Post['media_type'],
    is_peak: (pRec?.is_peak as boolean) ?? p.isPeak ?? false,
    visibility: (p.visibility || pRec?.visibility || 'public') as Post['visibility'],
    location: (p.location || pRec?.location || null) as string | null,
    tagged_users: (p.taggedUsers || pRec?.tagged_users || []) as Post['tagged_users'],
    likes_count: p.likesCount,
    comments_count: p.commentsCount,
    views_count: (p.viewsCount || pRec?.views_count || 0) as number,
    tags: p.tags || [],
    created_at: p.createdAt,
    author: p.author
      ? convertProfile(p.author) || undefined
      : pRec?.author_profile
        ? convertProfile(pRec.author_profile as AWSProfile) || undefined
        : undefined,
  };
};

// ============================================
// PROFILES
// ============================================

/**
 * Get current user's profile
 */
export const getCurrentProfile = async (autoCreate = true): Promise<DbResponse<Profile>> => {
  const user = await awsAuth.getCurrentUser();
  if (!user) return { data: null, error: 'Not authenticated' };

  try {
    const profile = await awsAPI.getProfile(user.id);
    return { data: convertProfile(profile), error: null };
  } catch (error_: unknown) {
    if (autoCreate && getErrorStatusCode(error_) === 404) {
      // Profile doesn't exist, create one
      const username = user.email?.split('@')[0]?.toLowerCase().replaceAll(/[^a-z0-9]/g, '') || `user_${Date.now()}`;
      try {
        const newProfile = await awsAPI.updateProfile({
          username,
          fullName: user.attributes?.name || '',
        });
        return { data: convertProfile(newProfile), error: null };
      } catch (error_: unknown) {
        return { data: null, error: getErrorMessage(error_) };
      }
    }
    return { data: null, error: getErrorMessage(error_) };
  }
};

/**
 * Get a profile by user ID
 */
export const getProfileById = async (userId: string): Promise<DbResponse<Profile>> => {
  try {
    const profile = await awsAPI.getProfile(userId);
    return { data: convertProfile(profile), error: null };
  } catch (error_: unknown) {
    return { data: null, error: getErrorMessage(error_) };
  }
};

/**
 * Get a profile by username
 */
export const getProfileByUsername = async (username: string): Promise<DbResponse<Profile>> => {
  try {
    const profile = await awsAPI.getProfileByUsername(username);
    return { data: convertProfile(profile), error: null };
  } catch (error_: unknown) {
    return { data: null, error: getErrorMessage(error_) };
  }
};

/**
 * Update current user's profile (creates if doesn't exist)
 */
export const updateProfile = async (updates: Partial<Profile>): Promise<DbResponse<Profile>> => {
  const user = await awsAuth.getCurrentUser();
  if (!user) return { data: null, error: 'Not authenticated' };

  try {
    const updateData: Record<string, unknown> = {};

    // Basic profile fields
    if (updates.username) updateData.username = updates.username;
    if (updates.full_name) updateData.fullName = updates.full_name;
    if (updates.bio) updateData.bio = updates.bio;
    if (updates.avatar_url !== undefined) updateData.avatarUrl = updates.avatar_url || null;
    if (updates.cover_url !== undefined) updateData.coverUrl = updates.cover_url || null;
    if (updates.is_private !== undefined) updateData.isPrivate = updates.is_private;

    // Account type
    if (updates.account_type) updateData.accountType = updates.account_type;

    // Personal info
    if (updates.gender) updateData.gender = updates.gender;
    if (updates.date_of_birth) updateData.dateOfBirth = updates.date_of_birth;

    // Pro creator fields
    if (updates.display_name) updateData.displayName = updates.display_name;
    if (updates.website) updateData.website = updates.website;
    if (updates.social_links) updateData.socialLinks = updates.social_links;
    if (updates.interests) updateData.interests = updates.interests;
    if (updates.expertise) updateData.expertise = updates.expertise;

    // Business fields
    if (updates.business_name) updateData.businessName = updates.business_name;
    if (updates.business_category) updateData.businessCategory = updates.business_category;
    if (updates.business_address) updateData.businessAddress = updates.business_address;
    if (updates.business_latitude != null) updateData.businessLatitude = updates.business_latitude;
    if (updates.business_longitude != null) updateData.businessLongitude = updates.business_longitude;
    if (updates.business_phone) updateData.businessPhone = updates.business_phone;
    if (updates.locations_mode) updateData.locationsMode = updates.locations_mode;

    // Onboarding flag
    if (updates.onboarding_completed !== undefined) updateData.onboardingCompleted = updates.onboarding_completed;

    if (__DEV__) console.log('[Database] updateProfile', Object.keys(updateData));
    const profile = await awsAPI.updateProfile(updateData);
    return { data: convertProfile(profile), error: null };
  } catch (error_: unknown) {
    if (__DEV__) console.warn('[Database] updateProfile error:', error_);
    return { data: null, error: getErrorMessage(error_) };
  }
};

/**
 * Create profile for new user
 */
export const createProfile = async (profileData: Partial<Profile>): Promise<DbResponse<Profile>> => {
  return updateProfile(profileData);
};

/**
 * Extended Profile type with follow status
 */
export interface ProfileWithFollowStatus extends Profile {
  is_following?: boolean;
}

/**
 * Search profiles by username or full_name
 */
export const searchProfiles = async (
  query: string,
  limit = 20,
  cursor?: string
): Promise<DbResponse<Profile[]> & { nextCursor?: string | null; hasMore?: boolean }> => {
  try {
    const result = await awsAPI.searchProfiles(query, limit, cursor);
    return {
      data: result.data.map(p => convertProfile(p)).filter(Boolean) as Profile[],
      error: null,
      nextCursor: result.nextCursor || null,
      hasMore: !!result.hasMore,
    };
  } catch (error_: unknown) {
    return { data: [], error: getErrorMessage(error_) };
  }
};

/**
 * Search posts by content/caption
 */
export const searchPosts = async (
  query: string,
  limit = 20,
  cursor?: string
): Promise<DbResponse<Post[]> & { nextCursor?: string | null; hasMore?: boolean }> => {
  if (!query || query.trim().length === 0) {
    return { data: [], error: null };
  }

  try {
    const params = new URLSearchParams({ q: query, limit: String(limit) });
    if (cursor) params.set('cursor', cursor);
    const result = await awsAPI.request<{ data: AWSPost[]; nextCursor?: string | null; hasMore?: boolean }>(`/posts/search?${params.toString()}`);
    return { data: result.data.map(convertPost), error: null, nextCursor: result.nextCursor, hasMore: result.hasMore };
  } catch (error_: unknown) {
    return { data: [], error: getErrorMessage(error_) };
  }
};

/**
 * Search peaks by content/caption
 */
export const searchPeaks = async (
  query: string,
  limit = 20,
  cursor?: string
): Promise<DbResponse<Post[]> & { nextCursor?: string | null; hasMore?: boolean }> => {
  if (!query || query.trim().length === 0) {
    return { data: [], error: null };
  }

  try {
    const params = new URLSearchParams({ q: query, limit: String(limit) });
    if (cursor) params.set('cursor', cursor);
    const result = await awsAPI.request<{ data: AWSPost[]; nextCursor?: string | null; hasMore?: boolean }>(`/peaks/search?${params.toString()}`);
    return { data: result.data.map(convertPost), error: null, nextCursor: result.nextCursor, hasMore: result.hasMore };
  } catch (error_: unknown) {
    return { data: [], error: getErrorMessage(error_) };
  }
};

/**
 * Search hashtags - returns posts that contain the hashtag
 */
export const searchByHashtag = async (
  hashtag: string,
  limit = 20,
  cursor?: string
): Promise<DbResponse<Post[]> & { nextCursor?: string | null; hasMore?: boolean }> => {
  if (!hashtag || hashtag.trim().length === 0) {
    return { data: [], error: null };
  }

  const tag = hashtag.trim().replace(/^#/, '').toLowerCase();

  try {
    // Use posts search with hashtag prefix — ILIKE fallback will match #tag in content
    const params = new URLSearchParams({ q: '#' + tag, limit: String(limit) });
    if (cursor) params.set('cursor', cursor);
    const result = await awsAPI.request<{ data: AWSPost[]; nextCursor?: string | null; hasMore?: boolean }>(`/posts/search?${params.toString()}`);
    return { data: result.data.map(convertPost), error: null, nextCursor: result.nextCursor, hasMore: result.hasMore };
  } catch (error_: unknown) {
    return { data: [], error: getErrorMessage(error_) };
  }
};

/**
 * Get trending hashtags
 */
export const getTrendingHashtags = async (limit = 10): Promise<DbResponse<{ tag: string; count: number }[]>> => {
  try {
    const result = await awsAPI.request<{ data: { tag: string; count: number }[] }>(`/hashtags/trending?limit=${limit}`);
    return { data: result.data, error: null };
  } catch (error_: unknown) {
    return { data: [], error: getErrorMessage(error_) };
  }
};

/**
 * Get suggested profiles (for discovery/explore)
 */
export const getSuggestedProfiles = async (limit = 10, cursor?: string): Promise<DbResponse<Profile[]> & { nextCursor?: string | null; hasMore?: boolean }> => {
  try {
    // Try suggested endpoint first with pagination
    const params = new URLSearchParams({ limit: String(limit) });
    if (cursor) params.set('cursor', cursor);
    const result = await awsAPI.request<{ profiles?: AWSProfile[]; data?: AWSProfile[]; nextCursor?: string | null; hasMore?: boolean }>(`/profiles/suggested?${params.toString()}`);
    const profiles = result.profiles || result.data || [];
    return { data: profiles.map((p: AWSProfile) => convertProfile(p)).filter(Boolean) as Profile[], error: null, nextCursor: result.nextCursor, hasMore: result.hasMore };
  } catch {
    // Fallback: use search for popular profiles
    try {
      const result = await awsAPI.searchProfiles('', limit);
      return { data: result.data.map((p: AWSProfile) => convertProfile(p)).filter(Boolean) as Profile[], error: null };
    } catch (error_: unknown) {
      return { data: [], error: getErrorMessage(error_) };
    }
  }
};

/**
 * Ensure profile exists - create if it doesn't
 */
export const ensureProfile = async (): Promise<DbResponseWithCreated<Profile>> => {
  const user = await awsAuth.getCurrentUser();
  if (!user) return { data: null, error: 'Not authenticated' };

  try {
    const profile = await awsAPI.getProfile(user.id);
    return { data: convertProfile(profile), error: null, created: false };
  } catch (error_: unknown) {
    if (getErrorStatusCode(error_) === 404) {
      // Create new profile
      const username = user.email?.split('@')[0]?.toLowerCase().replaceAll(/[^a-z0-9]/g, '') || `user_${Date.now()}`;
      try {
        const newProfile = await awsAPI.updateProfile({
          username,
          fullName: user.attributes?.name || '',
        });
        return { data: convertProfile(newProfile), error: null, created: true };
      } catch (error_: unknown) {
        return { data: null, error: getErrorMessage(error_) };
      }
    }
    return { data: null, error: getErrorMessage(error_) };
  }
};

// ============================================
// POSTS
// ============================================

/**
 * Extended Post type with pre-computed interaction status
 */
export interface PostWithStatus extends Post {
  has_liked?: boolean;
  has_saved?: boolean;
}

/**
 * Get posts feed with pagination
 */
export const getFeedPosts = async (_page = 0, limit = 10): Promise<DbResponse<Post[]>> => {
  try {
    const result = await awsAPI.getPosts({ limit, type: 'all' });
    return { data: result.data.map(convertPost), error: null };
  } catch (error_: unknown) {
    return { data: null, error: getErrorMessage(error_) };
  }
};

/**
 * Get optimized feed with likes/saves status included
 */
export const getOptimizedFeed = async (cursor?: string, limit = 20): Promise<DbResponse<PostWithStatus[]> & { nextCursor?: string | null; hasMore?: boolean }> => {
  try {
    const params = new URLSearchParams({ limit: String(limit) });
    if (cursor) params.set('cursor', cursor);
    const result = await awsAPI.request<{ data: (AWSPost & { isLiked?: boolean; has_liked?: boolean; isSaved?: boolean; has_saved?: boolean })[]; nextCursor?: string | null; hasMore?: boolean }>(`/feed/optimized?${params.toString()}`);
    const posts: PostWithStatus[] = result.data.map((p: AWSPost & { isLiked?: boolean; has_liked?: boolean; isSaved?: boolean; has_saved?: boolean }) => ({
      ...convertPost(p),
      has_liked: p.isLiked || p.has_liked,
      has_saved: p.isSaved || p.has_saved,
    }));
    return { data: posts, error: null, nextCursor: result.nextCursor, hasMore: result.hasMore };
  } catch {
    // Fallback to regular feed — has_liked/has_saved default to false (batch check handles sync later)
    const fallback = await getFeedPosts(0, limit);
    const postsWithStatus: PostWithStatus[] | null = fallback.data
      ? fallback.data.map(p => ({ ...p, has_liked: false, has_saved: false }))
      : null;
    return { data: postsWithStatus, error: fallback.error };
  }
};

/**
 * Get posts by user ID (supports cursor-based pagination)
 */
export const getPostsByUser = async (userId: string, _page = 0, limit = 10, cursor?: string): Promise<DbResponse<Post[]> & { nextCursor?: string | null; hasMore?: boolean }> => {
  try {
    const result = await awsAPI.getPosts({ userId, limit, cursor });
    return { data: result.data.map(convertPost), error: null, nextCursor: result.nextCursor, hasMore: result.hasMore };
  } catch (error_: unknown) {
    return { data: null, error: getErrorMessage(error_) };
  }
};

// Clear cache when user follows/unfollows someone (no-op, cache removed)
export const clearFollowCache = () => {
  // Intentionally empty — legacy cache was removed
};

/**
 * Get posts from followed users (FanFeed) — cursor-based pagination
 */
export const getFeedFromFollowed = async (options?: { cursor?: string; limit?: number }): Promise<{
  data: Post[] | null;
  nextCursor: string | null;
  hasMore: boolean;
  error: string | null;
}> => {
  try {
    const result = await awsAPI.getPosts({
      type: 'following',
      limit: options?.limit ?? 10,
      cursor: options?.cursor,
    });
    return {
      data: result.data.map(convertPost),
      nextCursor: result.nextCursor,
      hasMore: result.hasMore,
      error: null,
    };
  } catch (error_: unknown) {
    return { data: null, nextCursor: null, hasMore: false, error: getErrorMessage(error_) };
  }
};

/**
 * Get discovery feed filtered by interests (VibesFeed)
 */
export const getDiscoveryFeed = async (
  selectedInterests: string[] = [],
  userInterests: string[] = [],
  cursor?: string,
  limit = 20
): Promise<DbResponse<Post[]> & { nextCursor?: string | null; hasMore?: boolean }> => {
  try {
    const interests = selectedInterests.length > 0 ? selectedInterests : userInterests;
    const params = new URLSearchParams({ limit: String(limit) });
    if (cursor) params.set('cursor', cursor);
    if (interests.length > 0) params.set('interests', interests.join(','));
    const result = await awsAPI.request<{ posts?: AWSPost[]; data?: AWSPost[]; nextCursor?: string | null; hasMore?: boolean }>(`/feed/discover?${params.toString()}`);
    const posts = result.posts || result.data || [];

    // If interests filter returned empty results on first page, retry without interests
    if (posts.length === 0 && interests.length > 0 && !cursor) {
      const fallbackParams = new URLSearchParams({ limit: String(limit) });
      const fallbackResult = await awsAPI.request<{ posts?: AWSPost[]; data?: AWSPost[]; nextCursor?: string | null; hasMore?: boolean }>(`/feed/discover?${fallbackParams.toString()}`);
      const fallbackPosts = fallbackResult.posts || fallbackResult.data || [];
      return { data: fallbackPosts.map(convertPost), error: null, nextCursor: fallbackResult.nextCursor, hasMore: fallbackResult.hasMore };
    }

    return { data: posts.map(convertPost), error: null, nextCursor: result.nextCursor, hasMore: result.hasMore };
  } catch (error_: unknown) {
    // Fallback to explore
    try {
      const result = await awsAPI.getPosts({ type: 'explore', limit });
      return { data: result.data.map(convertPost), error: null };
    } catch {
      return { data: [], error: getErrorMessage(error_) };
    }
  }
};

/**
 * Get posts by specific tags/interests
 */
export const getPostsByTags = async (
  tags: string[],
  page = 0,
  limit = 10
): Promise<DbResponse<Post[]>> => {
  try {
    const result = await awsAPI.request<{ data: AWSPost[] }>(`/posts/tags?tags=${encodeURIComponent(tags.join(','))}&limit=${limit}&page=${page}`);
    return { data: result.data.map(convertPost), error: null };
  } catch (error_: unknown) {
    return { data: null, error: getErrorMessage(error_) };
  }
};

/**
 * Create a new post
 */
export const createPost = async (postData: Partial<Post>): Promise<DbResponse<Post>> => {
  const user = await awsAuth.getCurrentUser();
  if (!user) return { data: null, error: 'Not authenticated' };

  try {
    const createData: Record<string, unknown> = {
      content: postData.content || postData.caption,
      mediaUrls: postData.media_urls,
      mediaType: postData.media_type,
      visibility: postData.visibility,
      location: postData.location || null,
      ...(postData.videoDuration != null && { videoDuration: postData.videoDuration }),
    };

    // Handle peak-specific fields
    if (postData.is_peak) {
      createData.isPeak = true;
      createData.peakDuration = postData.peak_duration;
      createData.peakExpiresAt = postData.peak_expires_at;
      createData.saveToProfile = postData.save_to_profile;
    }

    if (postData.tags) {
      createData.tags = postData.tags;
    }

    if (postData.tagged_users) {
      createData.taggedUsers = postData.tagged_users;
    }

    const post = await awsAPI.createPost(createData);
    return { data: convertPost(post), error: null };
  } catch (error_: unknown) {
    return { data: null, error: getErrorMessage(error_) };
  }
};

/**
 * Delete a post
 */
export const deletePost = async (postId: string): Promise<{ error: string | null }> => {
  try {
    await awsAPI.deletePost(postId);
    return { error: null };
  } catch (error_: unknown) {
    return { error: getErrorMessage(error_) };
  }
};

// ============================================
// LIKES
// ============================================

/**
 * Like a post
 */
export const likePost = async (postId: string): Promise<DbResponse<Like>> => {
  const user = await awsAuth.getCurrentUser();
  if (!user) return { data: null, error: 'Not authenticated' };

  try {
    await awsAPI.likePost(postId);
    return { data: { id: '', user_id: user.id, post_id: postId, created_at: new Date().toISOString() }, error: null };
  } catch (error_: unknown) {
    return { data: null, error: getErrorMessage(error_) };
  }
};

/**
 * Check if current user liked a post
 */
export const hasLikedPost = async (postId: string): Promise<{ hasLiked: boolean }> => {
  const user = await awsAuth.getCurrentUser();
  if (!user) return { hasLiked: false };

  try {
    const result = await awsAPI.request<{ hasLiked: boolean }>(`/posts/${postId}/liked`);
    return { hasLiked: result.hasLiked };
  } catch {
    return { hasLiked: false };
  }
};

/**
 * Check if current user liked multiple posts at once (batch operation)
 */
export const hasLikedPostsBatch = async (postIds: string[]): Promise<Map<string, boolean>> => {
  const buildMap = (record?: Record<string, boolean>) =>
    new Map(postIds.map(id => [id, record?.[id] ?? false]));

  const user = await awsAuth.getCurrentUser();

  if (!user || postIds.length === 0) {
    return buildMap();
  }

  try {
    const result = await awsAPI.request<{ likes: Record<string, boolean> }>('/posts/likes/batch', {
      method: 'POST',
      body: { postIds },
    });
    if (result.likes && typeof result.likes === 'object') {
      return buildMap(result.likes);
    }
    if (__DEV__) console.warn('[hasLikedPostsBatch] Unexpected response:', result);
    return buildMap();
  } catch (error_: unknown) {
    if (__DEV__) console.warn('[hasLikedPostsBatch] Error:', error_);
    return buildMap();
  }
};

// ============================================
// POST SAVES (Bookmarks/Collections)
// ============================================

/**
 * Save a post (bookmark)
 */
export const savePost = async (postId: string): Promise<DbResponse<{ id: string }>> => {
  const user = await awsAuth.getCurrentUser();
  if (!user) return { data: null, error: 'Not authenticated' };

  try {
    await awsAPI.request(`/posts/${postId}/save`, { method: 'POST' });
    return { data: { id: postId }, error: null };
  } catch (error_: unknown) {
    return { data: null, error: getErrorMessage(error_) };
  }
};

/**
 * Unsave a post (remove bookmark)
 */
export const unsavePost = async (postId: string): Promise<{ error: string | null }> => {
  const user = await awsAuth.getCurrentUser();
  if (!user) return { error: 'Not authenticated' };

  try {
    await awsAPI.request(`/posts/${postId}/save`, { method: 'DELETE' });
    return { error: null };
  } catch (error_: unknown) {
    return { error: getErrorMessage(error_) };
  }
};

/**
 * Check if current user saved a post
 */
export const hasSavedPost = async (postId: string): Promise<{ saved: boolean }> => {
  const user = await awsAuth.getCurrentUser();
  if (!user) return { saved: false };

  try {
    const result = await awsAPI.request<{ saved: boolean }>(`/posts/${postId}/saved`);
    return { saved: result.saved };
  } catch {
    return { saved: false };
  }
};

/**
 * Check if current user saved multiple posts at once (batch operation)
 */
export const hasSavedPostsBatch = async (postIds: string[]): Promise<Map<string, boolean>> => {
  const buildMap = (record?: Record<string, boolean>) =>
    new Map(postIds.map(id => [id, record?.[id] ?? false]));

  const user = await awsAuth.getCurrentUser();

  if (!user || postIds.length === 0) {
    return buildMap();
  }

  try {
    const result = await awsAPI.request<{ saves: Record<string, boolean> }>(
      '/posts/saves/batch',
      {
        method: 'POST',
        body: { postIds },
      }
    );

    if (result.saves && typeof result.saves === 'object') {
      return buildMap(result.saves);
    }
    if (__DEV__) {
      console.warn('[hasSavedPostsBatch] Unexpected response:', result);
    }
    return buildMap();
  } catch (error_: unknown) {
    if (__DEV__) {
      console.warn('[hasSavedPostsBatch] Error:', error_);
    }
    return buildMap();
  }
};

/**
 * Get user's saved posts (collections)
 */
export const getSavedPosts = async (cursor?: string, limit = 20): Promise<DbResponse<Post[]> & { nextCursor?: string | null; hasMore?: boolean }> => {
  try {
    const params = new URLSearchParams({ limit: String(limit) });
    if (cursor) params.set('cursor', cursor);
    const result = await awsAPI.request<{ data: AWSPost[]; nextCursor?: string | null; hasMore?: boolean }>(`/posts/saved?${params.toString()}`);
    return { data: result.data.map(convertPost), error: null, nextCursor: result.nextCursor, hasMore: result.hasMore };
  } catch (error_: unknown) {
    return { data: null, error: getErrorMessage(error_) };
  }
};

// ============================================
// FOLLOWS
// ============================================

/**
 * Follow a user
 * Returns cooldown info if user is blocked from following (7 days after 2+ unfollows)
 */
export const followUser = async (userIdToFollow: string): Promise<DbResponse<Follow> & {
  requestCreated?: boolean;
  cooldown?: { blocked: boolean; until: string; daysRemaining: number };
}> => {
  const user = await awsAuth.getCurrentUser();

  clearFollowCache();
  // Mark feed cache as stale so next load fetches fresh data (without wiping optimistic state)
  const { useFeedStore } = require('../stores');
  useFeedStore.getState().setFeedCache([]);

  try {
    const result = await awsAPI.followUser(userIdToFollow);

    // Check for cooldown block
    if (result.cooldown?.blocked) {
      return {
        data: null,
        error: result.message,
        cooldown: result.cooldown,
      };
    }

    return {
      data: {
        id: '',
        follower_id: user?.id ?? '',
        following_id: userIdToFollow,
        created_at: new Date().toISOString(),
      },
      error: null,
      requestCreated: result.type === 'request_created',
    };
  } catch (error_: unknown) {
    // Extract cooldown data from APIError (429 responses include cooldown info in error data)
    const apiErr = error_ as { data?: { cooldown?: { blocked: boolean; until: string; daysRemaining: number } } };
    if (apiErr.data?.cooldown) {
      return { data: null, error: getErrorMessage(error_), cooldown: apiErr.data.cooldown };
    }
    return { data: null, error: getErrorMessage(error_) };
  }
};

/**
 * Unfollow a user
 * Returns cooldown info if user will be blocked from re-following (7 days after 2+ unfollows)
 */
export const unfollowUser = async (userIdToUnfollow: string): Promise<{
  error: string | null;
  cooldown?: { blocked: boolean; until: string; message: string };
}> => {
  clearFollowCache();
  // Mark feed cache as stale so next load fetches fresh data (without wiping optimistic state)
  const { useFeedStore } = require('../stores');
  useFeedStore.getState().setFeedCache([]);

  try {
    const result = await awsAPI.unfollowUser(userIdToUnfollow);
    return {
      error: null,
      cooldown: result.cooldown,
    };
  } catch (error_: unknown) {
    return { error: getErrorMessage(error_) };
  }
};

/**
 * Check if current user is following another user
 */
export const isFollowing = async (targetUserId: string): Promise<{ isFollowing: boolean; following: boolean }> => {
  const user = await awsAuth.getCurrentUser();
  if (!user) return { isFollowing: false, following: false };

  try {
    const result = await awsAPI.request<{ isFollowing: boolean }>(`/profiles/${targetUserId}/is-following`);
    return { isFollowing: result.isFollowing, following: result.isFollowing };
  } catch {
    return { isFollowing: false, following: false };
  }
};

/**
 * Get followers of a user
 */
export const getFollowers = async (userId: string, cursor?: string, limit = 20): Promise<DbResponse<Profile[]> & { nextCursor?: string | null; hasMore?: boolean }> => {
  try {
    const result = await awsAPI.getFollowers(userId, { limit, cursor });
    return {
      data: result.data.map(p => convertProfile(p)).filter(Boolean) as Profile[],
      error: null,
      nextCursor: result.nextCursor || null,
      hasMore: !!result.hasMore,
    };
  } catch (error_: unknown) {
    return { data: null, error: getErrorMessage(error_), nextCursor: null, hasMore: false };
  }
};

/**
 * Get users that a user is following
 */
export const getFollowing = async (userId: string, cursor?: string, limit = 20): Promise<DbResponse<Profile[]> & { nextCursor?: string | null; hasMore?: boolean }> => {
  try {
    const result = await awsAPI.getFollowing(userId, { limit, cursor });
    return {
      data: result.data.map(p => convertProfile(p)).filter(Boolean) as Profile[],
      error: null,
      nextCursor: result.nextCursor || null,
      hasMore: !!result.hasMore,
    };
  } catch (error_: unknown) {
    return { data: null, error: getErrorMessage(error_), nextCursor: null, hasMore: false };
  }
};

/**
 * Get followers count
 */
export const getFollowersCount = async (userId: string): Promise<{ count: number }> => {
  try {
    const profile = await awsAPI.getProfile(userId);
    return { count: profile.followersCount ?? 0 };
  } catch {
    return { count: 0 };
  }
};

/**
 * Get following count
 */
export const getFollowingCount = async (userId: string): Promise<{ count: number }> => {
  try {
    const profile = await awsAPI.getProfile(userId);
    return { count: profile.followingCount ?? 0 };
  } catch {
    return { count: 0 };
  }
};

// ============================================
// POST LIKERS
// ============================================

/**
 * Get users who liked a post (with pagination support)
 */
export const getPostLikers = async (
  postId: string,
  cursor?: string,
  limit = 20
): Promise<DbResponse<Profile[]> & { nextCursor: string | null; hasMore: boolean }> => {
  try {
    const result = await awsAPI.getPostLikers(postId, { limit, cursor });
    return {
      data: result.data.map(p => convertProfile(p)).filter(Boolean) as Profile[],
      error: null,
      nextCursor: result.nextCursor || null,
      hasMore: !!result.hasMore,
    };
  } catch (error_: unknown) {
    return { data: null, error: getErrorMessage(error_), nextCursor: null, hasMore: false };
  }
};

// ============================================
// COMMENTS
// ============================================

/**
 * Get comments for a post
 */
export const getComments = async (postId: string, cursor?: string, limit = 20): Promise<DbResponse<Comment[]> & { nextCursor?: string | null; hasMore?: boolean }> => {
  try {
    const result = await awsAPI.getComments(postId, { limit, cursor });
    const comments: Comment[] = result.data.map((c: AWSComment & { parentId?: string }) => ({
      id: c.id,
      user_id: c.authorId,
      post_id: c.postId,
      text: c.content,
      parent_comment_id: c.parentId,
      created_at: c.createdAt,
      user: c.author ? convertProfile(c.author) || undefined : undefined,
    }));
    return {
      data: comments,
      error: null,
      nextCursor: result.nextCursor || null,
      hasMore: !!result.hasMore,
    };
  } catch (error_: unknown) {
    return { data: null, error: getErrorMessage(error_), nextCursor: null, hasMore: false };
  }
};

/**
 * Add a comment to a post
 */
export const addComment = async (postId: string, text: string, parentId?: string): Promise<DbResponse<Comment>> => {
  const user = await awsAuth.getCurrentUser();
  if (!user) return { data: null, error: 'Not authenticated' };

  // Client-side content filtering (backend also validates)
  const filterResult = filterContent(text, { context: 'comment' });
  if (!filterResult.clean && ['critical', 'high'].includes(filterResult.severity)) {
    return { data: null, error: filterResult.reason || 'Comment violates community guidelines.' };
  }

  try {
    const result = await awsAPI.createComment(postId, text, parentId);
    const comment: Comment = {
      id: result.id,
      user_id: result.authorId,
      post_id: result.postId,
      text: result.content,
      parent_comment_id: parentId || null,
      created_at: result.createdAt,
    };
    return { data: comment, error: null };
  } catch (error_: unknown) {
    return { data: null, error: getErrorMessage(error_) };
  }
};

/**
 * Delete a comment
 */
export const deleteComment = async (commentId: string): Promise<{ error: string | null }> => {
  try {
    await awsAPI.deleteComment(commentId);
    return { error: null };
  } catch (error_: unknown) {
    return { error: getErrorMessage(error_) };
  }
};

// ============================================
// PEAKS (Short Videos)
// ============================================

/**
 * Get peaks feed
 */
export const getPeaks = async (_page = 0, limit = 10): Promise<DbResponse<Post[]>> => {
  try {
    const result = await awsAPI.getPeaks({ limit });
    const posts: Post[] = result.data.map((p: AWSPeak) => ({
      id: p.id,
      author_id: p.authorId,
      content: p.caption ?? undefined,
      media_urls: [p.videoUrl],
      media_type: 'video' as const,
      visibility: 'public' as const,
      is_peak: true,
      peak_duration: p.duration,
      likes_count: p.likesCount,
      comments_count: p.commentsCount,
      views_count: p.viewsCount,
      created_at: p.createdAt,
      author: p.author ? convertProfile(p.author) || undefined : undefined,
    }));
    return { data: posts, error: null };
  } catch (error_: unknown) {
    return { data: null, error: getErrorMessage(error_) };
  }
};

/**
 * Get peaks by user ID
 */
export const getPeaksByUser = async (userId: string, _page = 0, limit = 10): Promise<DbResponse<Post[]>> => {
  try {
    const result = await awsAPI.getPeaks({ userId, limit });
    const posts: Post[] = result.data.map((p: AWSPeak) => ({
      id: p.id,
      author_id: p.authorId,
      content: p.caption ?? undefined,
      media_urls: [p.videoUrl],
      media_type: 'video' as const,
      visibility: 'public' as const,
      is_peak: true,
      peak_duration: p.duration,
      likes_count: p.likesCount,
      comments_count: p.commentsCount,
      views_count: p.viewsCount,
      created_at: p.createdAt,
      author: p.author ? convertProfile(p.author) || undefined : undefined,
    }));
    return { data: posts, error: null };
  } catch (error_: unknown) {
    return { data: null, error: getErrorMessage(error_) };
  }
};

/**
 * Get a single peak by ID
 */
export const getPeakById = async (peakId: string): Promise<DbResponse<Post>> => {
  try {
    const p = await awsAPI.getPeak(peakId);
    const post: Post = {
      id: p.id,
      author_id: p.authorId,
      content: p.caption || '',
      media_urls: [p.videoUrl],
      media_type: 'video',
      visibility: 'public',
      is_peak: true,
      peak_duration: p.duration,
      likes_count: p.likesCount,
      comments_count: p.commentsCount,
      views_count: p.viewsCount,
      created_at: p.createdAt,
      author: p.author ? convertProfile(p.author) || undefined : undefined,
    };
    return { data: post, error: null };
  } catch (error_: unknown) {
    return { data: null, error: getErrorMessage(error_) };
  }
};

/**
 * Get single post by ID
 */
export const getPostById = async (postId: string): Promise<DbResponse<Post>> => {
  try {
    const post = await awsAPI.getPost(postId);
    return { data: convertPost(post), error: null };
  } catch (error_: unknown) {
    return { data: null, error: getErrorMessage(error_) };
  }
};

// ============================================
// NOTIFICATIONS
// ============================================

/**
 * Get notifications for current user
 */
export const getNotifications = async (_page = 0, limit = 20): Promise<DbResponse<AWSNotification[]>> => {
  const user = await awsAuth.getCurrentUser();
  if (!user) return { data: null, error: 'Not authenticated' };

  try {
    const result = await awsAPI.getNotifications({ limit });
    return { data: result.data, error: null };
  } catch (error_: unknown) {
    return { data: null, error: getErrorMessage(error_) };
  }
};

/**
 * Mark notification as read
 */
export const markNotificationRead = async (notificationId: string): Promise<{ error: string | null }> => {
  try {
    await awsAPI.markNotificationRead(notificationId);
    return { error: null };
  } catch (error_: unknown) {
    return { error: getErrorMessage(error_) };
  }
};

/**
 * Mark all notifications as read
 */
export const markAllNotificationsRead = async (): Promise<{ error: string | null }> => {
  try {
    await awsAPI.markAllNotificationsRead();
    return { error: null };
  } catch (error_: unknown) {
    return { error: getErrorMessage(error_) };
  }
};

/**
 * Get unread notification count
 */
export const getUnreadNotificationCount = async (): Promise<{ count: number }> => {
  try {
    const result = await awsAPI.getUnreadCount();
    return { count: result.unreadCount ?? 0 };
  } catch {
    return { count: 0 };
  }
};

// ============================================
// INTERESTS
// ============================================

/**
 * Get all available interests
 */
export const getInterests = async (): Promise<DbResponse<Interest[]>> => {
  try {
    const result = await awsAPI.request<{ data: Interest[] }>('/interests');
    return { data: result.data, error: null };
  } catch (error_: unknown) {
    return { data: [], error: getErrorMessage(error_) };
  }
};

/**
 * Get all available expertise
 */
export const getExpertise = async (): Promise<DbResponse<Expertise[]>> => {
  try {
    const result = await awsAPI.request<{ data: Expertise[] }>('/expertise');
    return { data: result.data, error: null };
  } catch (error_: unknown) {
    return { data: [], error: getErrorMessage(error_) };
  }
};

// ============================================
// SPOTS (Gyms/Locations)
// ============================================

export type Spot = SpotType;
export type SpotReview = SpotReviewType;

/**
 * Get spots near a location
 */
export const getSpotsNearLocation = async (
  lat: number,
  lng: number,
  radius = 10000,
  limit = 50
): Promise<DbResponse<Spot[]>> => {
  try {
    const result = await awsAPI.request<{ data: Spot[] }>(`/spots/nearby?lat=${lat}&lng=${lng}&radius=${radius}&limit=${limit}`);
    return { data: result.data, error: null };
  } catch (error_: unknown) {
    return { data: [], error: getErrorMessage(error_) };
  }
};

/**
 * Get spot by ID
 */
export const getSpotById = async (spotId: string): Promise<DbResponse<Spot>> => {
  try {
    const result = await awsAPI.request<Spot>(`/spots/${spotId}`);
    return { data: result, error: null };
  } catch (error_: unknown) {
    return { data: null, error: getErrorMessage(error_) };
  }
};

/**
 * Create a new spot
 */
export const createSpot = async (spotData: Partial<Spot>): Promise<DbResponse<Spot>> => {
  const user = await awsAuth.getCurrentUser();
  if (!user) return { data: null, error: 'Not authenticated' };

  try {
    const result = await awsAPI.request<Spot>('/spots', {
      method: 'POST',
      body: spotData,
    });
    return { data: result, error: null };
  } catch (error_: unknown) {
    return { data: null, error: getErrorMessage(error_) };
  }
};

/**
 * Get reviews for a spot
 */
export const getSpotReviews = async (spotId: string, page = 0, limit = 20): Promise<DbResponse<SpotReview[]>> => {
  try {
    const result = await awsAPI.request<{ data: SpotReview[] }>(`/spots/${spotId}/reviews?page=${page}&limit=${limit}`);
    return { data: result.data, error: null };
  } catch (error_: unknown) {
    return { data: [], error: getErrorMessage(error_) };
  }
};

/**
 * Add a review to a spot
 */
export const addSpotReview = async (
  spotId: string,
  rating: number,
  comment?: string,
  photos?: string[]
): Promise<DbResponse<SpotReview>> => {
  const user = await awsAuth.getCurrentUser();
  if (!user) return { data: null, error: 'Not authenticated' };

  try {
    const result = await awsAPI.request<SpotReview>(`/spots/${spotId}/reviews`, {
      method: 'POST',
      body: { rating, comment, photos },
    });
    return { data: result, error: null };
  } catch (error_: unknown) {
    return { data: null, error: getErrorMessage(error_) };
  }
};

// ============================================
// MESSAGES
// ============================================

/**
 * Get conversations for current user
 */
export const getConversations = async (limit = 20): Promise<DbResponse<Conversation[]>> => {
  const user = await awsAuth.getCurrentUser();
  if (!user) return { data: null, error: 'Not authenticated' };

  try {
    // Lambda returns { conversations: [...], nextCursor, hasMore } with snake_case fields
    const result = await awsAPI.request<{ conversations: Array<{
      id: string;
      created_at: string;
      last_message: { id: string; content: string; media_type?: string; created_at: string; sender_id: string } | null;
      unread_count: number;
      other_participant: { id: string; username: string; full_name?: string; display_name?: string; avatar_url: string; is_verified: boolean; account_type?: string } | null;
    }> }>(`/conversations?limit=${limit}`);
    const conversations: Conversation[] = (result.conversations || []).map((c) => {
      const op = c.other_participant;
      const otherUser: Profile | undefined = op ? {
        id: op.id, username: op.username,
        full_name: op.full_name || op.display_name || '',
        display_name: op.display_name || op.full_name || '',
        avatar_url: op.avatar_url, is_verified: op.is_verified,
        account_type: op.account_type,
      } as Profile : undefined;
      return {
        id: c.id,
        participant_ids: [],
        participants: otherUser ? [otherUser] : [],
        other_user: otherUser,
        last_message_at: c.last_message?.created_at ?? c.created_at,
        last_message_preview: c.last_message?.media_type === 'audio' || c.last_message?.media_type === 'voice'
          ? 'Voice message'
          : c.last_message?.content?.match(/^\[shared_post:[0-9a-f-]+\]$/i) ? 'Shared a post'
          : c.last_message?.content?.match(/^\[shared_peak:[0-9a-f-]+\]$/i) ? 'Shared a peak'
          : c.last_message?.content,
        updated_at: c.created_at,
        unread_count: c.unread_count ?? 0,
      };
    });
    return { data: conversations, error: null };
  } catch (error_: unknown) {
    return { data: null, error: getErrorMessage(error_) };
  }
};

/**
 * Get messages in a conversation
 */
export const getMessages = async (conversationId: string, _page = 0, limit = 50, markAsRead = false): Promise<DbResponse<Message[]>> => {
  try {
    // Lambda returns { messages: [...], nextCursor, hasMore } with snake_case fields
    const url = `/conversations/${conversationId}/messages?limit=${limit}${markAsRead ? '&markAsRead=true' : ''}`;
    const result = await awsAPI.request<{ messages: Array<{
      id: string; content: string; media_url?: string; media_type?: string;
      sender_id: string; read: boolean; created_at: string;
      shared_post_id?: string; shared_peak_id?: string; is_deleted?: boolean;
      sender: { id: string; username: string; display_name: string; avatar_url: string } | null;
      reply_to_message_id?: string;
      reply_to_message?: {
        id: string; content: string; sender_id: string;
        sender: { id: string; username: string; display_name: string; avatar_url: string } | null;
      } | null;
      reactions?: Array<{
        id: string; message_id: string; user_id: string; emoji: string; created_at: string;
        user?: { id: string; username: string; display_name: string; avatar_url: string } | null;
      }>;
      read_by?: Array<{
        message_id: string; user_id: string; read_at: string;
        user?: { id: string; username: string; display_name: string; avatar_url: string } | null;
      }>;
      is_read?: boolean;
    }> }>(url);
    const messages: Message[] = (result.messages || []).map((m) => ({
      id: m.id,
      conversation_id: conversationId,
      sender_id: m.sender_id,
      content: m.content,
      media_url: m.media_url,
      media_type: m.media_type as Message['media_type'],
      shared_post_id: m.shared_post_id,
      shared_peak_id: m.shared_peak_id,
      is_deleted: m.is_deleted,
      created_at: m.created_at,
      sender: m.sender ? {
        id: m.sender.id, username: m.sender.username, full_name: m.sender.display_name || '',
        display_name: m.sender.display_name, avatar_url: m.sender.avatar_url,
      } as Profile : undefined,
      reply_to_message_id: m.reply_to_message_id,
      reply_to_message: m.reply_to_message ? {
        id: m.reply_to_message.id,
        conversation_id: conversationId,
        sender_id: m.reply_to_message.sender_id,
        content: m.reply_to_message.content,
        created_at: (m.reply_to_message as { created_at?: string }).created_at || m.created_at,
        sender: m.reply_to_message.sender ? {
          id: m.reply_to_message.sender.id,
          username: m.reply_to_message.sender.username,
          full_name: m.reply_to_message.sender.display_name || '',
          display_name: m.reply_to_message.sender.display_name,
          avatar_url: m.reply_to_message.sender.avatar_url,
        } as Profile : undefined,
      } as Message : undefined,
      reactions: (m.reactions || []).map((r) => ({
        id: r.id,
        message_id: r.message_id,
        user_id: r.user_id,
        emoji: r.emoji,
        created_at: r.created_at,
        user: r.user ? {
          id: r.user.id,
          username: r.user.username,
          full_name: r.user.display_name || '',
          display_name: r.user.display_name,
          avatar_url: r.user.avatar_url,
        } as Profile : undefined,
      })),
      read_by: (m.read_by || []).map((rb) => ({
        message_id: rb.message_id,
        user_id: rb.user_id,
        read_at: rb.read_at,
        user: rb.user ? {
          id: rb.user.id,
          username: rb.user.username,
          full_name: rb.user.display_name || '',
          display_name: rb.user.display_name,
          avatar_url: rb.user.avatar_url,
        } as Profile : undefined,
      })),
      is_read: m.is_read ?? m.read,
    }));
    return { data: messages, error: null };
  } catch (error_: unknown) {
    return { data: null, error: getErrorMessage(error_) };
  }
};

/**
 * Send a message
 */
export const sendMessage = async (
  conversationId: string,
  content: string,
  mediaUrl?: string,
  mediaType?: 'image' | 'video' | 'voice' | 'audio',
  replyToMessageId?: string,
  voiceDuration?: number
): Promise<DbResponse<Message>> => {
  if (!UUID_PATTERN.test(conversationId)) {
    return { data: null, error: 'Invalid conversation ID' };
  }

  const user = await awsAuth.getCurrentUser();
  if (!user) return { data: null, error: 'Not authenticated' };

  // Sanitize content: strip HTML and control characters
  const sanitizedContent = sanitizeDisplayText(content);
  if (!sanitizedContent) return { data: null, error: 'Message content is required' };

  // Generate client-side idempotency key for network retry dedup
  const clientMessageId = `${Date.now()}-${Math.random().toString(36).substring(2, 10)}`; // NOSONAR

  try {
    // Lambda returns { message: {...} } with snake_case fields
    const result = await awsAPI.request<{ message: {
      id: string; content: string; media_url?: string; media_type?: string; voice_duration_seconds?: number;
      sender_id: string; recipient_id: string; read: boolean; created_at: string;
      sender: { id: string; username: string; display_name: string; avatar_url: string };
      reply_to_message_id?: string;
      reply_to_message?: {
        id: string; content: string; sender_id: string;
        sender: { id: string; username: string; display_name: string; avatar_url: string };
      };
    } }>(`/conversations/${conversationId}/messages`, {
      method: 'POST',
      body: { content: sanitizedContent, mediaUrl, mediaType, replyToMessageId, voiceDuration, clientMessageId },
    });
    const m = result.message;
    return { data: {
      id: m.id,
      conversation_id: conversationId,
      sender_id: m.sender_id,
      content: m.content,
      media_url: m.media_url,
      media_type: m.media_type as Message['media_type'],
      voice_duration_seconds: m.voice_duration_seconds,
      reply_to_message_id: m.reply_to_message_id,
      reply_to_message: m.reply_to_message ? {
        id: m.reply_to_message.id,
        conversation_id: conversationId,
        sender_id: m.reply_to_message.sender_id,
        content: m.reply_to_message.content,
        created_at: (m.reply_to_message as { created_at?: string }).created_at || m.created_at,
        sender: m.reply_to_message.sender ? {
          id: m.reply_to_message.sender.id,
          username: m.reply_to_message.sender.username,
          full_name: m.reply_to_message.sender.display_name || '',
          display_name: m.reply_to_message.sender.display_name,
          avatar_url: m.reply_to_message.sender.avatar_url,
        } as Profile : undefined,
      } as Message : undefined,
      created_at: m.created_at,
      sender: m.sender ? {
        id: m.sender.id, username: m.sender.username, full_name: m.sender.display_name || '',
        display_name: m.sender.display_name, avatar_url: m.sender.avatar_url,
      } as Profile : undefined,
    }, error: null };
  } catch (error_: unknown) {
    return { data: null, error: getErrorMessage(error_) };
  }
};

// ============================================
// REPORTS
// ============================================

/**
 * Report a post
 */
export const reportPost = async (postId: string, reason: string, details?: string): Promise<{ data: { id: string } | null; error: string | null }> => {
  const user = await awsAuth.getCurrentUser();
  if (!user) return { data: null, error: 'Not authenticated' };

  try {
    const result = await awsAPI.request<{ id: string }>('/reports/post', {
      method: 'POST',
      body: { postId, reason, details },
    });
    return { data: result, error: null };
  } catch (error_: unknown) {
    if (getErrorMessage(error_)?.includes('already')) {
      return { data: null, error: 'already_reported' };
    }
    return { data: null, error: getErrorMessage(error_) };
  }
};

/**
 * Report a comment
 */
export const reportComment = async (commentId: string, reason: string, details?: string): Promise<{ data: { id: string } | null; error: string | null }> => {
  const user = await awsAuth.getCurrentUser();
  if (!user) return { data: null, error: 'Not authenticated' };

  try {
    const result = await awsAPI.request<{ id: string }>('/reports/comment', {
      method: 'POST',
      body: { commentId, reason, details },
    });
    return { data: result, error: null };
  } catch (error_: unknown) {
    if (getErrorMessage(error_)?.includes('already')) {
      return { data: null, error: 'already_reported' };
    }
    return { data: null, error: getErrorMessage(error_) };
  }
};

/**
 * Report a peak
 */
export const reportPeak = async (peakId: string, reason: string, details?: string): Promise<{ data: { id: string } | null; error: string | null }> => {
  const user = await awsAuth.getCurrentUser();
  if (!user) return { data: null, error: 'Not authenticated' };

  try {
    const result = await awsAPI.request<{ id: string }>('/reports/peak', {
      method: 'POST',
      body: { peakId, reason, details },
    });
    return { data: result, error: null };
  } catch (error_: unknown) {
    if (getErrorMessage(error_)?.includes('already')) {
      return { data: null, error: 'already_reported' };
    }
    return { data: null, error: getErrorMessage(error_) };
  }
};

/**
 * Report a user
 */
export const reportUser = async (userId: string, reason: string, details?: string): Promise<{ data: { id: string } | null; error: string | null }> => {
  const user = await awsAuth.getCurrentUser();
  if (!user) return { data: null, error: 'Not authenticated' };

  try {
    const result = await awsAPI.request<{ id: string }>('/reports/user', {
      method: 'POST',
      body: { userId, reason, details },
    });
    return { data: result, error: null };
  } catch (error_: unknown) {
    if (getErrorMessage(error_)?.includes('already')) {
      return { data: null, error: 'already_reported' };
    }
    return { data: null, error: getErrorMessage(error_) };
  }
};

/**
 * Report a live stream
 */
export const reportLivestream = async (liveStreamId: string, reason: string, details?: string): Promise<{ data: { id: string } | null; error: string | null }> => {
  const user = await awsAuth.getCurrentUser();
  if (!user) return { data: null, error: 'Not authenticated' };

  try {
    const result = await awsAPI.request<{ id: string }>('/reports/livestream', {
      method: 'POST',
      body: { liveStreamId, reason, details },
    });
    return { data: result, error: null };
  } catch (error_: unknown) {
    if (getErrorMessage(error_)?.includes('already')) {
      return { data: null, error: 'already_reported' };
    }
    return { data: null, error: getErrorMessage(error_) };
  }
};

/**
 * Report a message
 */
export const reportMessage = async (messageId: string, conversationId: string, reason: string, details?: string): Promise<{ data: { id: string } | null; error: string | null }> => {
  const user = await awsAuth.getCurrentUser();
  if (!user) return { data: null, error: 'Not authenticated' };

  try {
    const result = await awsAPI.request<{ id: string }>('/reports/message', {
      method: 'POST',
      body: { messageId, conversationId, reason, details },
    });
    return { data: result, error: null };
  } catch (error_: unknown) {
    if (getErrorMessage(error_)?.includes('already')) {
      return { data: null, error: 'already_reported' };
    }
    return { data: null, error: getErrorMessage(error_) };
  }
};

/**
 * Block a user
 */
export const blockUser = async (userId: string): Promise<{ data: BlockedUser | null; error: string | null }> => {
  const user = await awsAuth.getCurrentUser();
  if (!user) return { data: null, error: 'Not authenticated' };

  try {
    const raw = await awsAPI.request<Record<string, unknown>>(`/profiles/${userId}/block`, { method: 'POST' });
    const data: BlockedUser = {
      id: raw.id as string,
      blocked_user_id: (raw.blockedUserId || raw.blocked_user_id) as string,
      blocked_at: (raw.blockedAt || raw.blocked_at) as string,
      blocked_user: raw.blockedUser
        ? convertProfile(raw.blockedUser as AWSProfile) as Profile
        : raw.blocked_user as Profile,
    };
    return { data, error: null };
  } catch (error_: unknown) {
    return { data: null, error: getErrorMessage(error_) };
  }
};

/**
 * Unblock a user
 */
export const unblockUser = async (userId: string): Promise<{ data: { success: boolean } | null; error: string | null }> => {
  const user = await awsAuth.getCurrentUser();
  if (!user) return { data: null, error: 'Not authenticated' };

  try {
    await awsAPI.request(`/profiles/${userId}/unblock`, { method: 'POST' });
    return { data: { success: true }, error: null };
  } catch (error_: unknown) {
    return { data: null, error: getErrorMessage(error_) };
  }
};

/**
 * Get blocked users
 */
export const getBlockedUsers = async (): Promise<DbResponse<BlockedUser[]>> => {
  const user = await awsAuth.getCurrentUser();
  if (!user) return { data: null, error: 'Not authenticated' };

  try {
    const result = await awsAPI.request<{ data: Record<string, unknown>[] }>('/profiles/blocked');
    const data: BlockedUser[] = (result.data || []).map((raw) => ({
      id: raw.id as string,
      blocked_user_id: (raw.blockedUserId || raw.blocked_user_id) as string,
      blocked_at: (raw.blockedAt || raw.blocked_at) as string,
      blocked_user: raw.blockedUser
        ? convertProfile(raw.blockedUser as AWSProfile) as Profile
        : raw.blocked_user as Profile,
    }));
    return { data, error: null };
  } catch (error_: unknown) {
    return { data: [], error: getErrorMessage(error_) };
  }
};

// ============================================
// ADDITIONAL TYPES
// ============================================

export interface BlockedUser {
  id: string;
  blocked_user_id: string;
  blocked_at: string;
  blocked_user: Profile;
}

export interface MutedUser {
  id: string;
  muted_user_id: string;
  muted_at: string;
  muted_user: Profile;
}

export interface MessageReaction {
  id: string;
  message_id: string;
  user_id: string;
  emoji: string;
  created_at: string;
  user?: Profile;
}

export interface MessageReadReceipt {
  message_id: string;
  user_id: string;
  read_at: string;
  user?: Profile;
}

export interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  media_url?: string;
  media_type?: 'image' | 'video' | 'voice' | 'audio';
  voice_duration_seconds?: number;
  shared_post_id?: string;
  shared_peak_id?: string;
  is_deleted?: boolean;
  created_at: string;
  read_at?: string;
  sender?: Profile;
  // Reply/Quote functionality
  reply_to_message_id?: string;
  reply_to_message?: Message;
  // Reactions
  reactions?: MessageReaction[];
  // Read receipts (for read indicators)
  read_by?: MessageReadReceipt[];
  is_read?: boolean;
}

export interface Conversation {
  id: string;
  participant_ids: string[];
  last_message?: Message;
  last_message_at?: string;
  last_message_preview?: string;
  updated_at: string;
  unread_count: number;
  participants?: Profile[];
  other_user?: Profile;
}

// ============================================
// MUTE FUNCTIONS
// ============================================

/**
 * Mute a user
 */
export const muteUser = async (userId: string): Promise<{ data: MutedUser | null; error: string | null }> => {
  const user = await awsAuth.getCurrentUser();
  if (!user) return { data: null, error: 'Not authenticated' };

  try {
    const raw = await awsAPI.request<Record<string, unknown>>(`/profiles/${userId}/mute`, { method: 'POST' });
    const data: MutedUser = {
      id: raw.id as string,
      muted_user_id: (raw.mutedUserId || raw.muted_user_id) as string,
      muted_at: (raw.mutedAt || raw.muted_at) as string,
      muted_user: raw.mutedUser
        ? convertProfile(raw.mutedUser as AWSProfile) as Profile
        : raw.muted_user as Profile,
    };
    return { data, error: null };
  } catch (error_: unknown) {
    return { data: null, error: getErrorMessage(error_) };
  }
};

/**
 * Unmute a user
 */
export const unmuteUser = async (userId: string): Promise<{ data: { success: boolean } | null; error: string | null }> => {
  const user = await awsAuth.getCurrentUser();
  if (!user) return { data: null, error: 'Not authenticated' };

  try {
    await awsAPI.request(`/profiles/${userId}/unmute`, { method: 'POST' });
    return { data: { success: true }, error: null };
  } catch (error_: unknown) {
    return { data: null, error: getErrorMessage(error_) };
  }
};

/**
 * Get muted users
 */
export const getMutedUsers = async (): Promise<DbResponse<MutedUser[]>> => {
  const user = await awsAuth.getCurrentUser();
  if (!user) return { data: null, error: 'Not authenticated' };

  try {
    const result = await awsAPI.request<{ data: Record<string, unknown>[] }>('/profiles/muted');
    const data: MutedUser[] = (result.data || []).map((raw) => ({
      id: raw.id as string,
      muted_user_id: (raw.mutedUserId || raw.muted_user_id) as string,
      muted_at: (raw.mutedAt || raw.muted_at) as string,
      muted_user: raw.mutedUser
        ? convertProfile(raw.mutedUser as AWSProfile) as Profile
        : raw.muted_user as Profile,
    }));
    return { data, error: null };
  } catch (error_: unknown) {
    return { data: [], error: getErrorMessage(error_) };
  }
};

// ============================================
// FOLLOW REQUESTS
// ============================================

/**
 * Get pending follow requests
 */
export const getPendingFollowRequests = async (): Promise<DbResponse<FollowRequest[]>> => {
  const user = await awsAuth.getCurrentUser();
  if (!user) return { data: null, error: 'Not authenticated' };

  try {
    const result = await awsAPI.request<{ requests: FollowRequest[] }>('/follow-requests');
    return { data: result.requests || [], error: null };
  } catch (error_: unknown) {
    return { data: [], error: getErrorMessage(error_) };
  }
};

/**
 * Accept a follow request
 */
export const acceptFollowRequest = async (requestId: string): Promise<{ error: string | null }> => {
  try {
    await awsAPI.request(`/follow-requests/${requestId}/accept`, { method: 'POST' });
    return { error: null };
  } catch (error_: unknown) {
    return { error: getErrorMessage(error_) };
  }
};

/**
 * Decline a follow request
 */
export const declineFollowRequest = async (requestId: string): Promise<{ error: string | null }> => {
  try {
    await awsAPI.request(`/follow-requests/${requestId}/decline`, { method: 'POST' });
    return { error: null };
  } catch (error_: unknown) {
    return { error: getErrorMessage(error_) };
  }
};

/**
 * Get pending follow requests count
 */
export const getPendingFollowRequestsCount = async (): Promise<number> => {
  try {
    const result = await awsAPI.request<{ count: number }>('/follow-requests/count');
    return result.count;
  } catch {
    return 0;
  }
};

/**
 * Check if there's a pending follow request to a user
 */
export const hasPendingFollowRequest = async (targetUserId: string): Promise<{ pending: boolean; hasPending: boolean }> => {
  try {
    const result = await awsAPI.request<{ hasPending: boolean }>(`/follow-requests/pending/${targetUserId}`);
    return { pending: result.hasPending, hasPending: result.hasPending };
  } catch {
    return { pending: false, hasPending: false };
  }
};

/**
 * Cancel a follow request
 */
export const cancelFollowRequest = async (targetUserId: string): Promise<{ error: string | null }> => {
  try {
    await awsAPI.request(`/follow-requests/${targetUserId}/cancel`, { method: 'POST' });
    return { error: null };
  } catch (error_: unknown) {
    return { error: getErrorMessage(error_) };
  }
};

// ============================================
// REPORT CHECKS
// ============================================

/**
 * Check if current user has reported a post
 */
export const hasReportedPost = async (postId: string): Promise<{ reported: boolean; hasReported: boolean }> => {
  try {
    const result = await awsAPI.request<{ hasReported: boolean }>(`/posts/${postId}/reported`);
    return { reported: result.hasReported, hasReported: result.hasReported };
  } catch {
    return { reported: false, hasReported: false };
  }
};

/**
 * Check if current user has reported a user
 */
export const hasReportedUser = async (userId: string): Promise<{ reported: boolean; hasReported: boolean }> => {
  try {
    const result = await awsAPI.request<{ hasReported: boolean }>(`/profiles/${userId}/reported`);
    return { reported: result.hasReported, hasReported: result.hasReported };
  } catch {
    return { reported: false, hasReported: false };
  }
};

// ============================================
// INTERESTS
// ============================================

/**
 * Save user interests
 */
export const saveUserInterests = async (interests: string[]): Promise<{ error: string | null }> => {
  try {
    await awsAPI.updateProfile({ interests } as Record<string, unknown>);
    return { error: null };
  } catch (error_: unknown) {
    return { error: getErrorMessage(error_) };
  }
};

// ============================================
// COMMENTS (additional)
// ============================================

/**
 * Get post comments (alias for getComments)
 */
export const getPostComments = getComments;

// ============================================
// SPOTS (additional functions)
// ============================================

/**
 * Get all spots
 */
export const getSpots = async (page = 0, limit = 50): Promise<DbResponse<Spot[]>> => {
  try {
    const result = await awsAPI.request<{ data: Spot[] }>(`/spots?page=${page}&limit=${limit}`);
    return { data: result.data, error: null };
  } catch (error_: unknown) {
    return { data: [], error: getErrorMessage(error_) };
  }
};

/**
 * Get spots by creator
 */
export const getSpotsByCreator = async (creatorId: string, page = 0, limit = 50): Promise<DbResponse<Spot[]>> => {
  try {
    const result = await awsAPI.request<{ data: Spot[] }>(`/spots?creatorId=${creatorId}&page=${page}&limit=${limit}`);
    return { data: result.data, error: null };
  } catch (error_: unknown) {
    return { data: [], error: getErrorMessage(error_) };
  }
};

/**
 * Get spots by category
 */
export const getSpotsByCategory = async (category: string, page = 0, limit = 50): Promise<DbResponse<Spot[]>> => {
  try {
    const result = await awsAPI.request<{ data: Spot[] }>(`/spots?category=${encodeURIComponent(category)}&page=${page}&limit=${limit}`);
    return { data: result.data, error: null };
  } catch (error_: unknown) {
    return { data: [], error: getErrorMessage(error_) };
  }
};

/**
 * Get spots by sport type
 */
export const getSpotsBySportType = async (sportType: string, page = 0, limit = 50): Promise<DbResponse<Spot[]>> => {
  try {
    const result = await awsAPI.request<{ data: Spot[] }>(`/spots?sportType=${encodeURIComponent(sportType)}&page=${page}&limit=${limit}`);
    return { data: result.data, error: null };
  } catch (error_: unknown) {
    return { data: [], error: getErrorMessage(error_) };
  }
};

/**
 * Find nearby spots
 */
export const findNearbySpots = getSpotsNearLocation;

/**
 * Update a spot
 */
export const updateSpot = async (spotId: string, updates: Partial<Spot>): Promise<DbResponse<Spot>> => {
  try {
    const result = await awsAPI.request<Spot>(`/spots/${spotId}`, {
      method: 'PATCH',
      body: updates,
    });
    return { data: result, error: null };
  } catch (error_: unknown) {
    return { data: null, error: getErrorMessage(error_) };
  }
};

/**
 * Delete a spot
 */
export const deleteSpot = async (spotId: string): Promise<{ error: string | null }> => {
  try {
    await awsAPI.request(`/spots/${spotId}`, { method: 'DELETE' });
    return { error: null };
  } catch (error_: unknown) {
    return { error: getErrorMessage(error_) };
  }
};

/**
 * Check if user has saved a spot
 */
export const hasSavedSpot = async (spotId: string): Promise<{ saved: boolean }> => {
  try {
    const result = await awsAPI.request<{ saved: boolean }>(`/spots/${spotId}/saved`);
    return { saved: result.saved };
  } catch {
    return { saved: false };
  }
};

/**
 * Get saved spots
 */
export const getSavedSpots = async (page = 0, limit = 50): Promise<DbResponse<Spot[]>> => {
  try {
    const result = await awsAPI.request<{ data: Spot[] }>(`/spots/saved?page=${page}&limit=${limit}`);
    return { data: result.data, error: null };
  } catch (error_: unknown) {
    return { data: [], error: getErrorMessage(error_) };
  }
};

/**
 * Save a spot
 */
export const saveSpot = async (spotId: string): Promise<{ error: string | null }> => {
  try {
    await awsAPI.request(`/spots/${spotId}/save`, { method: 'POST' });
    return { error: null };
  } catch (error_: unknown) {
    return { error: getErrorMessage(error_) };
  }
};

/**
 * Unsave a spot
 */
export const unsaveSpot = async (spotId: string): Promise<{ error: string | null }> => {
  try {
    await awsAPI.request(`/spots/${spotId}/save`, { method: 'DELETE' });
    return { error: null };
  } catch (error_: unknown) {
    return { error: getErrorMessage(error_) };
  }
};

/**
 * Delete a spot review
 */
export const deleteSpotReview = async (reviewId: string): Promise<{ error: string | null }> => {
  try {
    await awsAPI.request(`/spots/reviews/${reviewId}`, { method: 'DELETE' });
    return { error: null };
  } catch (error_: unknown) {
    return { error: getErrorMessage(error_) };
  }
};

// ============================================
// MESSAGES (additional functions)
// ============================================

/**
 * Get or create a conversation with a user
 * Returns the conversation ID as a string
 */
export const getOrCreateConversation = async (otherUserId: string): Promise<DbResponse<string>> => {
  const user = await awsAuth.getCurrentUser();
  if (!user) return { data: null, error: 'Not authenticated' };

  try {
    // Lambda returns { conversation: { id, ... }, created: boolean }
    // Some backends may return { id } directly instead of nested { conversation: { id } }
    const result = await awsAPI.request<{ conversation?: { id: string }; id?: string }>('/conversations', {
      method: 'POST',
      body: { participantId: otherUserId },
    });
    const conversationId = result.conversation?.id || result.id;
    if (!conversationId) {
      return { data: null, error: 'Invalid conversation response' };
    }
    return { data: conversationId, error: null };
  } catch (error_: unknown) {
    if (__DEV__) console.warn('[getOrCreateConversation] ERROR:', getErrorMessage(error_));
    return { data: null, error: getErrorMessage(error_) };
  }
};

/**
 * Share a post with a user via DM.
 * Finds or creates a conversation with the recipient, then sends the shared post.
 */
export const sharePostToUser = async (postId: string, recipientUserId: string): Promise<{ error: string | null }> => {
  // Validate UUIDs before making API calls
  if (!UUID_PATTERN.test(postId)) return { error: 'Invalid post ID' };
  if (!UUID_PATTERN.test(recipientUserId)) return { error: 'Invalid user ID' };

  try {
    // Step 1: Get or create conversation with recipient
    const { data: conversationId, error: convError } = await getOrCreateConversation(recipientUserId);
    if (convError || !conversationId) {
      return { error: convError || 'Could not start conversation' };
    }

    // Step 2: Send the shared post as a message
    await awsAPI.request(`/conversations/${conversationId}/messages`, {
      method: 'POST',
      body: { content: `[shared_post:${postId}]`, messageType: 'text' },
    });
    return { error: null };
  } catch (error_: unknown) {
    return { error: getErrorMessage(error_) };
  }
};

/**
 * @deprecated Use sharePostToUser instead — accepts userId and resolves conversation internally.
 */
export const sharePostToConversation = sharePostToUser;

/**
 * Share a peak with a user via in-app messaging
 */
export const sharePeakToUser = async (peakId: string, recipientUserId: string): Promise<{ error: string | null }> => {
  if (!UUID_PATTERN.test(peakId)) return { error: 'Invalid peak ID' };
  if (!UUID_PATTERN.test(recipientUserId)) return { error: 'Invalid user ID' };

  try {
    const { data: conversationId, error: convError } = await getOrCreateConversation(recipientUserId);
    if (convError || !conversationId) {
      return { error: convError || 'Could not start conversation' };
    }

    await awsAPI.request(`/conversations/${conversationId}/messages`, {
      method: 'POST',
      body: { content: `[shared_peak:${peakId}]`, messageType: 'text' },
    });
    return { error: null };
  } catch (error_: unknown) {
    return { error: getErrorMessage(error_) };
  }
};

/**
 * Share a profile with a user via in-app messaging
 */
export const shareProfileToUser = async (profileId: string, recipientUserId: string): Promise<{ error: string | null }> => {
  if (!UUID_PATTERN.test(profileId)) return { error: 'Invalid profile ID' };
  if (!UUID_PATTERN.test(recipientUserId)) return { error: 'Invalid user ID' };

  try {
    const { data: conversationId, error: convError } = await getOrCreateConversation(recipientUserId);
    if (convError || !conversationId) {
      return { error: convError || 'Could not start conversation' };
    }

    await awsAPI.request(`/conversations/${conversationId}/messages`, {
      method: 'POST',
      body: { content: `[shared_profile:${profileId}]`, messageType: 'text' },
    });
    return { error: null };
  } catch (error_: unknown) {
    return { error: getErrorMessage(error_) };
  }
};

/**
 * Share a text message with a user via in-app messaging
 */
export const shareTextToUser = async (text: string, recipientUserId: string): Promise<{ error: string | null }> => {
  if (!text || text.trim().length === 0) return { error: 'Empty message' };
  if (!UUID_PATTERN.test(recipientUserId)) return { error: 'Invalid user ID' };

  try {
    const { data: conversationId, error: convError } = await getOrCreateConversation(recipientUserId);
    if (convError || !conversationId) {
      return { error: convError || 'Could not start conversation' };
    }

    await awsAPI.request(`/conversations/${conversationId}/messages`, {
      method: 'POST',
      body: { content: text.trim().substring(0, 1000), messageType: 'text' },
    });
    return { error: null };
  } catch (error_: unknown) {
    return { error: getErrorMessage(error_) };
  }
};

/**
 * Mark conversation as read
 */
export const markConversationAsRead = async (conversationId: string): Promise<{ error: string | null }> => {
  try {
    await awsAPI.request(`/conversations/${conversationId}/messages?limit=1&markAsRead=true`);
    return { error: null };
  } catch (error_: unknown) {
    return { error: getErrorMessage(error_) };
  }
};

/**
 * Upload a voice message
 * Per CLAUDE.md: validate all user input including file size and format
 */
const MAX_VOICE_MESSAGE_SIZE = 5 * 1024 * 1024; // 5 MB max
const VALID_AUDIO_EXTENSIONS = ['.m4a', '.mp4', '.mp3', '.wav', '.aac', '.caf', '.webm', '.ogg'];

export const uploadVoiceMessage = async (audioUri: string, conversationId: string): Promise<DbResponse<string>> => {
  try {
    // Validate audio file extension/format — strip query params before checking
    const uriPath = audioUri.split('?')[0].toLowerCase();
    const hasValidExtension = VALID_AUDIO_EXTENSIONS.some(ext => uriPath.endsWith(ext));
    if (!hasValidExtension) {
      if (__DEV__) console.warn('[uploadVoiceMessage] Invalid audio format:', audioUri);
      return { data: null, error: 'Invalid audio format' };
    }

    // Step 1: Verify audio file exists, is non-empty, and within size limit
    const fs = await import('expo-file-system/legacy');
    const fileCheckResult = await fs.getInfoAsync(audioUri);

    if (!fileCheckResult.exists) {
      if (__DEV__) console.warn('[uploadVoiceMessage] Audio file does not exist:', audioUri);
      return { data: null, error: 'Recording file not found' };
    }

    // Validate file size before upload
    if ('size' in fileCheckResult && typeof fileCheckResult.size === 'number') {
      if (fileCheckResult.size === 0) {
        if (__DEV__) console.warn('[uploadVoiceMessage] Audio file is empty (0 bytes):', audioUri);
        return { data: null, error: 'Recording file is empty' };
      }
      if (fileCheckResult.size > MAX_VOICE_MESSAGE_SIZE) {
        if (__DEV__) console.warn('[uploadVoiceMessage] Audio file too large:', fileCheckResult.size);
        return { data: null, error: 'Voice message too large (max 5MB)' };
      }
    }

    // Step 2: Get presigned URL (after file validation passes)
    // Send fileSize so the backend enforces ContentLength in the presigned URL
    const voiceFileSize = ('size' in fileCheckResult && typeof fileCheckResult.size === 'number') ? fileCheckResult.size : undefined;
    const presignedResult = await awsAPI.request<{ url: string; key: string; cdnUrl?: string; fileUrl?: string }>('/media/upload-voice', {
      method: 'POST',
      body: { conversationId, fileSize: voiceFileSize },
    });

    // Step 2: Upload the audio file to S3 (retry up to 3 times with backoff)
    const { uploadWithFileSystem } = await import('./mediaUpload');
    let uploadSuccess = false;
    for (let attempt = 1; attempt <= 3; attempt++) {
      uploadSuccess = await uploadWithFileSystem(audioUri, presignedResult.url, 'audio/mp4');
      if (uploadSuccess) break;
      if (attempt < 3) await new Promise(r => setTimeout(r, 1000 * attempt));
    }
    if (!uploadSuccess) {
      return { data: null, error: 'Failed to upload voice message after 3 attempts' };
    }

    // Step 3: Return the best playback URL available (prefer CDN over S3 direct URL)
    const resolvedUrl = presignedResult.cdnUrl || awsAPI.getCDNUrl(presignedResult.key) || presignedResult.fileUrl;
    if (!resolvedUrl) {
      return { data: null, error: 'Failed to resolve voice message URL' };
    }
    return { data: resolvedUrl, error: null };
  } catch (error_: unknown) {
    return { data: null, error: getErrorMessage(error_) };
  }
};


// ============================================
// MESSAGE REACTIONS
// ============================================

/**
 * Available emoji reactions
 */
export const AVAILABLE_REACTIONS = ['❤️', '😂', '👍', '😮', '😢', '🙏'] as const;

/**
 * Add or toggle a reaction on a message
 */
export const addMessageReaction = async (
  messageId: string,
  emoji: string
): Promise<{ data: MessageReaction | null; error: string | null }> => {
  const user = await awsAuth.getCurrentUser();
  if (!user) return { data: null, error: 'Not authenticated' };

  try {
    // Toggle behavior: if the user already reacted with this emoji, the backend
    // removes the reaction (ON CONFLICT). No client-side dedup needed.
    const result = await awsAPI.request<{ reaction: {
      id: string;
      message_id: string;
      user_id: string;
      emoji: string;
      created_at: string;
      user?: { id: string; username: string; display_name: string; avatar_url: string };
    } }>(`/messages/${messageId}/reactions`, {
      method: 'POST',
      body: { emoji },
    });

    return {
      data: {
        id: result.reaction.id,
        message_id: result.reaction.message_id,
        user_id: result.reaction.user_id,
        emoji: result.reaction.emoji,
        created_at: result.reaction.created_at,
        user: result.reaction.user ? {
          id: result.reaction.user.id,
          username: result.reaction.user.username,
          full_name: result.reaction.user.display_name || '',
          display_name: result.reaction.user.display_name,
          avatar_url: result.reaction.user.avatar_url,
        } as Profile : undefined,
      },
      error: null,
    };
  } catch (error_: unknown) {
    return { data: null, error: getErrorMessage(error_) };
  }
};

/**
 * Remove a reaction from a message
 */
export const removeMessageReaction = async (
  messageId: string,
  emoji: string
): Promise<{ success: boolean; error: string | null }> => {
  const user = await awsAuth.getCurrentUser();
  if (!user) return { success: false, error: 'Not authenticated' };

  try {
    await awsAPI.request(`/messages/${messageId}/reactions`, {
      method: 'DELETE',
      body: { emoji },
    });
    return { success: true, error: null };
  } catch (error_: unknown) {
    return { success: false, error: getErrorMessage(error_) };
  }
};

/**
 * Get reactions for a message
 */
export const getMessageReactions = async (
  messageId: string
): Promise<{ data: MessageReaction[]; error: string | null }> => {
  try {
    const result = await awsAPI.request<{ reactions: Array<{
      id: string;
      message_id: string;
      user_id: string;
      emoji: string;
      created_at: string;
      user?: { id: string; username: string; display_name: string; avatar_url: string };
    }> }>(`/messages/${messageId}/reactions`);

    const reactions: MessageReaction[] = (result.reactions || []).map((r) => ({
      id: r.id,
      message_id: r.message_id,
      user_id: r.user_id,
      emoji: r.emoji,
      created_at: r.created_at,
      user: r.user ? {
        id: r.user.id,
        username: r.user.username,
        full_name: r.user.display_name || '',
        display_name: r.user.display_name,
        avatar_url: r.user.avatar_url,
      } as Profile : undefined,
    }));

    return { data: reactions, error: null };
  } catch (error_: unknown) {
    return { data: [], error: getErrorMessage(error_) };
  }
};

// ============================================
// MESSAGE DELETION
// ============================================

/**
 * Delete a message (for everyone, within 15 minutes)
 */
export const deleteMessage = async (
  messageId: string
): Promise<{ success: boolean; error: string | null }> => {
  const user = await awsAuth.getCurrentUser();
  if (!user) return { success: false, error: 'Not authenticated' };

  try {
    await awsAPI.request(`/messages/${messageId}`, {
      method: 'DELETE',
    });
    return { success: true, error: null };
  } catch (error_: unknown) {
    return { success: false, error: getErrorMessage(error_) };
  }
};

// ============================================
// MESSAGE FORWARDING
// ============================================

/**
 * Forward a message to another conversation
 */
export const forwardMessage = async (
  messageId: string,
  targetConversationId: string
): Promise<{ data: Message | null; error: string | null }> => {
  const user = await awsAuth.getCurrentUser();
  if (!user) return { data: null, error: 'Not authenticated' };

  try {
    const result = await awsAPI.request<{ message: {
      id: string; content: string; media_url?: string; media_type?: string;
      sender_id: string; created_at: string;
      sender: { id: string; username: string; display_name: string; avatar_url: string };
    } }>(`/messages/${messageId}/forward`, {
      method: 'POST',
      body: { targetConversationId },
    });

    const m = result.message;
    return {
      data: {
        id: m.id,
        conversation_id: targetConversationId,
        sender_id: m.sender_id,
        content: m.content,
        media_url: m.media_url,
        media_type: m.media_type as Message['media_type'],
        created_at: m.created_at,
        sender: m.sender ? {
          id: m.sender.id,
          username: m.sender.username,
          full_name: m.sender.display_name || '',
          display_name: m.sender.display_name,
          avatar_url: m.sender.avatar_url,
        } as Profile : undefined,
      },
      error: null,
    };
  } catch (error_: unknown) {
    return { data: null, error: getErrorMessage(error_) };
  }
};

// ============================================
// DISCOVER & RECENT PEAKS
// ============================================

/**
 * Get discover posts for the search default view
 */
export const getDiscoverPosts = async (
  limit = 20,
  cursor?: string
): Promise<DbResponse<Post[]> & { nextCursor?: string | null; hasMore?: boolean }> => {
  try {
    const params = new URLSearchParams({ limit: String(limit) });
    if (cursor) params.set('cursor', cursor);
    const result = await awsAPI.request<{ data: AWSPost[]; nextCursor?: string | null; hasMore?: boolean }>(`/feed/discover?${params.toString()}`);
    return { data: (result.data || []).map(convertPost), error: null, nextCursor: result.nextCursor, hasMore: result.hasMore };
  } catch (error_: unknown) {
    return { data: [], error: getErrorMessage(error_) };
  }
};

/**
 * Get recent peaks for the search default view
 */
export const getRecentPeaks = async (
  limit = 20,
  cursor?: string
): Promise<DbResponse<Post[]> & { nextCursor?: string | null; hasMore?: boolean }> => {
  try {
    const params = new URLSearchParams({ limit: String(limit) });
    if (cursor) params.set('cursor', cursor);
    const result = await awsAPI.request<{ data: AWSPost[]; nextCursor?: string | null; hasMore?: boolean }>(`/peaks?${params.toString()}`);
    return { data: (result.data || []).map(convertPost), error: null, nextCursor: result.nextCursor, hasMore: result.hasMore };
  } catch (error_: unknown) {
    return { data: [], error: getErrorMessage(error_) };
  }
};

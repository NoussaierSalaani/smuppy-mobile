// ============================================
// SMUPPY - DATABASE SERVICES
// Connexion frontend <-> AWS Backend
// ============================================

import { awsAuth } from './aws-auth';
import { awsAPI, Profile as AWSProfile, Post as AWSPost, Comment as AWSComment, Peak as AWSPeak, Notification as AWSNotification } from './aws-api';
import type {
  Spot as SpotType,
  SpotReview as SpotReviewType,
} from '../types';

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
  const isBusiness = p.accountType === 'pro_business';
  const businessDisplayName = isBusiness && p.businessName ? p.businessName : null;
  // If fullName equals username, treat as empty (legacy data issue)
  const effectiveFullName = p.fullName && p.fullName !== p.username ? p.fullName : '';
  return {
    id: p.id,
    username: p.username,
    full_name: businessDisplayName || effectiveFullName,
    display_name: businessDisplayName || p.displayName || undefined,
    avatar_url: p.avatarUrl || (p as any)?.avatar_url,
    cover_url: p.coverUrl || (p as any)?.cover_url || undefined,
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
    // Follow status from API
    is_following: p.isFollowing,
    is_followed_by: p.isFollowedBy,
  };
};

// Helper to convert AWS API Post to local Post format
const convertPost = (p: AWSPost): Post => {
  const rawMedia = p.mediaUrls || (p as any)?.media_urls || (p as any)?.mediaUrl || (p as any)?.media_url || [];
  const mediaArray = Array.isArray(rawMedia) ? rawMedia : rawMedia ? [rawMedia] : [];

  return {
    id: p.id,
    author_id: p.authorId,
    content: p.content,
    media_urls: mediaArray,
    media_type: p.mediaType || (p as any)?.media_type || (mediaArray.length > 1 ? 'multiple' : undefined),
    is_peak: (p as any)?.is_peak ?? p.isPeak ?? false,
    visibility: 'public',
    location: p.location || (p as any)?.location || null,
    tagged_users: p.taggedUsers || (p as any)?.tagged_users || [],
    likes_count: p.likesCount,
    comments_count: p.commentsCount,
    views_count: p.viewsCount || (p as any)?.views_count || 0,
    created_at: p.createdAt,
    author: p.author
      ? convertProfile(p.author) || undefined
      : (p as any)?.author_profile
        ? convertProfile((p as any).author_profile) || undefined
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
  } catch (error: unknown) {
    if (autoCreate && getErrorStatusCode(error) === 404) {
      // Profile doesn't exist, create one
      const username = user.email?.split('@')[0]?.toLowerCase().replace(/[^a-z0-9]/g, '') || `user_${Date.now()}`;
      try {
        const newProfile = await awsAPI.updateProfile({
          username,
          fullName: user.attributes?.name || '',
        });
        return { data: convertProfile(newProfile), error: null };
      } catch (createError: unknown) {
        return { data: null, error: getErrorMessage(createError) };
      }
    }
    return { data: null, error: getErrorMessage(error) };
  }
};

/**
 * Get a profile by user ID
 */
export const getProfileById = async (userId: string): Promise<DbResponse<Profile>> => {
  try {
    const profile = await awsAPI.getProfile(userId);
    return { data: convertProfile(profile), error: null };
  } catch (error: unknown) {
    return { data: null, error: getErrorMessage(error) };
  }
};

/**
 * Get a profile by username
 */
export const getProfileByUsername = async (username: string): Promise<DbResponse<Profile>> => {
  try {
    const profile = await awsAPI.getProfileByUsername(username);
    return { data: convertProfile(profile), error: null };
  } catch (error: unknown) {
    return { data: null, error: getErrorMessage(error) };
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
  } catch (error: unknown) {
    if (__DEV__) console.warn('[Database] updateProfile error:', error);
    return { data: null, error: getErrorMessage(error) };
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
  _offset = 0
): Promise<DbResponse<Profile[]>> => {
  if (!query || query.trim().length === 0) {
    return { data: [], error: null };
  }

  try {
    const profiles = await awsAPI.searchProfiles(query, limit);
    return { data: profiles.map(p => convertProfile(p)).filter(Boolean) as Profile[], error: null };
  } catch (error: unknown) {
    return { data: [], error: getErrorMessage(error) };
  }
};

/**
 * Search posts by content/caption
 */
export const searchPosts = async (
  query: string,
  limit = 20,
  offset = 0
): Promise<DbResponse<Post[]>> => {
  if (!query || query.trim().length === 0) {
    return { data: [], error: null };
  }

  try {
    const result = await awsAPI.request<{ data: AWSPost[] }>(`/posts/search?q=${encodeURIComponent(query)}&limit=${limit}&offset=${offset}`);
    return { data: result.data.map(convertPost), error: null };
  } catch (error: unknown) {
    return { data: [], error: getErrorMessage(error) };
  }
};

/**
 * Search peaks by content/caption
 */
export const searchPeaks = async (
  query: string,
  limit = 20,
  offset = 0
): Promise<DbResponse<Post[]>> => {
  if (!query || query.trim().length === 0) {
    return { data: [], error: null };
  }

  try {
    const result = await awsAPI.request<{ data: AWSPost[] }>(`/peaks/search?q=${encodeURIComponent(query)}&limit=${limit}&offset=${offset}`);
    return { data: result.data.map(convertPost), error: null };
  } catch (error: unknown) {
    return { data: [], error: getErrorMessage(error) };
  }
};

/**
 * Search hashtags - returns posts that contain the hashtag
 */
export const searchByHashtag = async (
  hashtag: string,
  limit = 20,
  offset = 0
): Promise<DbResponse<Post[]>> => {
  if (!hashtag || hashtag.trim().length === 0) {
    return { data: [], error: null };
  }

  const tag = hashtag.trim().replace(/^#/, '').toLowerCase();

  try {
    const result = await awsAPI.request<{ data: AWSPost[] }>(`/posts/hashtag/${encodeURIComponent(tag)}?limit=${limit}&offset=${offset}`);
    return { data: result.data.map(convertPost), error: null };
  } catch (error: unknown) {
    return { data: [], error: getErrorMessage(error) };
  }
};

/**
 * Get trending hashtags
 */
export const getTrendingHashtags = async (limit = 10): Promise<DbResponse<{ tag: string; count: number }[]>> => {
  try {
    const result = await awsAPI.request<{ data: { tag: string; count: number }[] }>(`/hashtags/trending?limit=${limit}`);
    return { data: result.data, error: null };
  } catch (error: unknown) {
    return { data: [], error: getErrorMessage(error) };
  }
};

/**
 * Get suggested profiles (for discovery/explore)
 */
export const getSuggestedProfiles = async (limit = 10, offset = 0): Promise<DbResponse<Profile[]>> => {
  const user = await awsAuth.getCurrentUser();
  if (!user) return { data: [], error: 'Not authenticated' };

  try {
    // Try suggested endpoint first with pagination
    const result = await awsAPI.request<{ profiles?: AWSProfile[]; data?: AWSProfile[] }>(`/profiles/suggested?limit=${limit}&offset=${offset}`);
    const profiles = result.profiles || result.data || [];
    return { data: profiles.map((p: AWSProfile) => convertProfile(p)).filter(Boolean) as Profile[], error: null };
  } catch {
    // Fallback: use search for popular profiles
    try {
      const profiles = await awsAPI.searchProfiles('', limit);
      return { data: profiles.map((p: AWSProfile) => convertProfile(p)).filter(Boolean) as Profile[], error: null };
    } catch {
      return { data: [], error: null };
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
  } catch (error: unknown) {
    if (getErrorStatusCode(error) === 404) {
      // Create new profile
      const username = user.email?.split('@')[0]?.toLowerCase().replace(/[^a-z0-9]/g, '') || `user_${Date.now()}`;
      try {
        const newProfile = await awsAPI.updateProfile({
          username,
          fullName: user.attributes?.name || '',
        });
        return { data: convertProfile(newProfile), error: null, created: true };
      } catch (createError: unknown) {
        return { data: null, error: getErrorMessage(createError) };
      }
    }
    return { data: null, error: getErrorMessage(error) };
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
  } catch (error: unknown) {
    return { data: null, error: getErrorMessage(error) };
  }
};

/**
 * Get optimized feed with likes/saves status included
 */
export const getOptimizedFeed = async (page = 0, limit = 20): Promise<DbResponse<PostWithStatus[]>> => {
  const user = await awsAuth.getCurrentUser();
  if (!user) return { data: null, error: 'Not authenticated' };

  try {
    const result = await awsAPI.request<{ data: (AWSPost & { isLiked?: boolean; has_liked?: boolean; isSaved?: boolean; has_saved?: boolean })[] }>(`/feed/optimized?limit=${limit}&page=${page}`);
    const posts: PostWithStatus[] = result.data.map((p: AWSPost & { isLiked?: boolean; has_liked?: boolean; isSaved?: boolean; has_saved?: boolean }) => ({
      ...convertPost(p),
      has_liked: p.isLiked || p.has_liked,
      has_saved: p.isSaved || p.has_saved,
    }));
    return { data: posts, error: null };
  } catch {
    // Fallback to regular feed
    const fallback = await getFeedPosts(page, limit);
    return { data: fallback.data as PostWithStatus[] | null, error: fallback.error };
  }
};

/**
 * Get posts by user ID
 */
export const getPostsByUser = async (userId: string, _page = 0, limit = 10): Promise<DbResponse<Post[]>> => {
  try {
    const result = await awsAPI.getPosts({ userId, limit });
    return { data: result.data.map(convertPost), error: null };
  } catch (error: unknown) {
    return { data: null, error: getErrorMessage(error) };
  }
};

// Clear cache when user follows/unfollows someone (no-op, cache removed)
export const clearFollowCache = () => {
  // Intentionally empty — legacy cache was removed
};

/**
 * Get posts from followed users (FanFeed)
 */
export const getFeedFromFollowed = async (_page = 0, limit = 10): Promise<DbResponse<Post[]>> => {
  const user = await awsAuth.getCurrentUser();
  if (!user) return { data: null, error: 'Not authenticated' };

  try {
    const result = await awsAPI.getPosts({ type: 'following', limit });
    return { data: result.data.map(convertPost), error: null };
  } catch (error: unknown) {
    return { data: null, error: getErrorMessage(error) };
  }
};

/**
 * Get optimized FanFeed with likes/saves status included
 */
export const getOptimizedFanFeed = async (page = 0, limit = 20): Promise<DbResponse<PostWithStatus[]>> => {
  const user = await awsAuth.getCurrentUser();
  if (!user) return { data: null, error: 'Not authenticated' };

  try {
    const result = await awsAPI.request<{ data: (AWSPost & { isLiked?: boolean; has_liked?: boolean; isSaved?: boolean; has_saved?: boolean })[] }>(`/feed/following?limit=${limit}&page=${page}`);
    const posts: PostWithStatus[] = result.data.map((p: AWSPost & { isLiked?: boolean; has_liked?: boolean; isSaved?: boolean; has_saved?: boolean }) => ({
      ...convertPost(p),
      has_liked: p.isLiked || p.has_liked,
      has_saved: p.isSaved || p.has_saved,
    }));
    return { data: posts, error: null };
  } catch {
    const fallback = await getFeedFromFollowed(page, limit);
    return { data: fallback.data as PostWithStatus[] | null, error: fallback.error };
  }
};

/**
 * Get discovery feed filtered by interests (VibesFeed)
 */
export const getDiscoveryFeed = async (
  selectedInterests: string[] = [],
  userInterests: string[] = [],
  page = 0,
  limit = 20
): Promise<DbResponse<Post[]>> => {
  try {
    const interests = selectedInterests.length > 0 ? selectedInterests : userInterests;
    const interestsParam = interests.length > 0 ? `&interests=${encodeURIComponent(interests.join(','))}` : '';
    const result = await awsAPI.request<{ posts?: AWSPost[]; data?: AWSPost[] }>(`/feed/discover?limit=${limit}&page=${page}${interestsParam}`);
    const posts = result.posts || result.data || [];

    // If interests filter returned empty results, retry without interests
    if (posts.length === 0 && interestsParam && page === 0) {
      const fallbackResult = await awsAPI.request<{ posts?: AWSPost[]; data?: AWSPost[] }>(`/feed/discover?limit=${limit}&page=${page}`);
      const fallbackPosts = fallbackResult.posts || fallbackResult.data || [];
      return { data: fallbackPosts.map(convertPost), error: null };
    }

    return { data: posts.map(convertPost), error: null };
  } catch (error: unknown) {
    // Fallback to explore
    try {
      const result = await awsAPI.getPosts({ type: 'explore', limit });
      return { data: result.data.map(convertPost), error: null };
    } catch {
      return { data: [], error: getErrorMessage(error) };
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
  } catch (error: unknown) {
    return { data: null, error: getErrorMessage(error) };
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
  } catch (error: unknown) {
    return { data: null, error: getErrorMessage(error) };
  }
};

/**
 * Delete a post
 */
export const deletePost = async (postId: string): Promise<{ error: string | null }> => {
  try {
    await awsAPI.deletePost(postId);
    return { error: null };
  } catch (error: unknown) {
    return { error: getErrorMessage(error) };
  }
};

// ============================================
// VIEWS
// ============================================

/**
 * Record a view on a post
 */
export const recordPostView = async (postId: string): Promise<{ error: string | null }> => {
  const user = await awsAuth.getCurrentUser();
  if (!user) return { error: 'Not authenticated' };

  try {
    await awsAPI.recordPostView(postId);
    return { error: null };
  } catch {
    // Silently fail - view tracking is non-critical
    return { error: null };
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
  } catch (error: unknown) {
    return { data: null, error: getErrorMessage(error) };
  }
};

/**
 * Unlike a post
 */
export const unlikePost = async (postId: string): Promise<{ error: string | null }> => {
  const user = await awsAuth.getCurrentUser();
  if (!user) return { error: 'Not authenticated' };

  try {
    await awsAPI.unlikePost(postId);
    return { error: null };
  } catch (error: unknown) {
    return { error: getErrorMessage(error) };
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
  const resultMap = new Map<string, boolean>();
  const user = await awsAuth.getCurrentUser();

  if (!user || postIds.length === 0) {
    postIds.forEach(id => resultMap.set(id, false));
    return resultMap;
  }

  try {
    const result = await awsAPI.request<{ likes: Record<string, boolean> }>('/posts/likes/batch', {
      method: 'POST',
      body: { postIds },
    });
    postIds.forEach(id => resultMap.set(id, result.likes[id] || false));
  } catch {
    postIds.forEach(id => resultMap.set(id, false));
  }

  return resultMap;
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
  } catch (error: unknown) {
    return { data: null, error: getErrorMessage(error) };
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
  } catch (error: unknown) {
    return { error: getErrorMessage(error) };
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
  const resultMap = new Map<string, boolean>();
  const user = await awsAuth.getCurrentUser();

  if (!user || postIds.length === 0) {
    postIds.forEach(id => resultMap.set(id, false));
    return resultMap;
  }

  try {
    const result = await awsAPI.request<{ saves: Record<string, boolean> }>('/posts/saves/batch', {
      method: 'POST',
      body: { postIds },
    });
    postIds.forEach(id => resultMap.set(id, result.saves[id] || false));
  } catch {
    postIds.forEach(id => resultMap.set(id, false));
  }

  return resultMap;
};

/**
 * Get user's saved posts (collections)
 */
export const getSavedPosts = async (page = 0, limit = 20): Promise<DbResponse<Post[]>> => {
  const user = await awsAuth.getCurrentUser();
  if (!user) return { data: null, error: 'Not authenticated' };

  try {
    const result = await awsAPI.request<{ data: AWSPost[] }>(`/posts/saved?limit=${limit}&page=${page}`);
    return { data: result.data.map(convertPost), error: null };
  } catch (error: unknown) {
    return { data: null, error: getErrorMessage(error) };
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
  // Invalidate feed cache so new follow's posts appear on next load
  // Lazy import to avoid circular dependency (database → stores → contentStore → database)
  const { useFeedStore } = require('../stores');
  useFeedStore.getState().clearFeed();

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
  } catch (error: unknown) {
    // Extract cooldown data from APIError (429 responses include cooldown info in error data)
    const apiErr = error as { data?: { cooldown?: { blocked: boolean; until: string; daysRemaining: number } } };
    if (apiErr.data?.cooldown) {
      return { data: null, error: getErrorMessage(error), cooldown: apiErr.data.cooldown };
    }
    return { data: null, error: getErrorMessage(error) };
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
  // Invalidate feed cache so unfollowed user's posts are removed on next load
  const { useFeedStore } = require('../stores');
  useFeedStore.getState().clearFeed();

  try {
    const result = await awsAPI.unfollowUser(userIdToUnfollow);
    return {
      error: null,
      cooldown: result.cooldown,
    };
  } catch (error: unknown) {
    return { error: getErrorMessage(error) };
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
export const getFollowers = async (userId: string, _page = 0, limit = 20): Promise<DbResponse<Profile[]>> => {
  try {
    const result = await awsAPI.getFollowers(userId, { limit });
    return { data: result.data.map(p => convertProfile(p)).filter(Boolean) as Profile[], error: null };
  } catch (error: unknown) {
    return { data: null, error: getErrorMessage(error) };
  }
};

/**
 * Get users that a user is following
 */
export const getFollowing = async (userId: string, _page = 0, limit = 20): Promise<DbResponse<Profile[]>> => {
  try {
    const result = await awsAPI.getFollowing(userId, { limit });
    return { data: result.data.map(p => convertProfile(p)).filter(Boolean) as Profile[], error: null };
  } catch (error: unknown) {
    return { data: null, error: getErrorMessage(error) };
  }
};

/**
 * Get followers count
 */
export const getFollowersCount = async (userId: string): Promise<{ count: number }> => {
  try {
    const profile = await awsAPI.getProfile(userId);
    return { count: profile.followersCount || 0 };
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
    return { count: profile.followingCount || 0 };
  } catch {
    return { count: 0 };
  }
};

// ============================================
// POST LIKERS
// ============================================

/**
 * Get users who liked a post
 */
export const getPostLikers = async (postId: string, cursor?: string, limit = 20): Promise<DbResponse<Profile[]>> => {
  try {
    const result = await awsAPI.getPostLikers(postId, { limit, cursor });
    return { data: result.data.map(p => convertProfile(p)).filter(Boolean) as Profile[], error: null };
  } catch (error: unknown) {
    return { data: null, error: getErrorMessage(error) };
  }
};

// ============================================
// COMMENTS
// ============================================

/**
 * Get comments for a post
 */
export const getComments = async (postId: string, _page = 0, limit = 20): Promise<DbResponse<Comment[]>> => {
  try {
    const result = await awsAPI.getComments(postId, { limit });
    const comments: Comment[] = result.data.map((c: AWSComment & { parentId?: string }) => ({
      id: c.id,
      user_id: c.authorId,
      post_id: c.postId,
      text: c.content,
      parent_comment_id: c.parentId,
      created_at: c.createdAt,
      user: c.author ? convertProfile(c.author) || undefined : undefined,
    }));
    return { data: comments, error: null };
  } catch (error: unknown) {
    return { data: null, error: getErrorMessage(error) };
  }
};

/**
 * Add a comment to a post
 */
export const addComment = async (postId: string, text: string, parentId?: string): Promise<DbResponse<Comment>> => {
  const user = await awsAuth.getCurrentUser();
  if (!user) return { data: null, error: 'Not authenticated' };

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
  } catch (error: unknown) {
    return { data: null, error: getErrorMessage(error) };
  }
};

/**
 * Delete a comment
 */
export const deleteComment = async (commentId: string): Promise<{ error: string | null }> => {
  try {
    await awsAPI.deleteComment(commentId);
    return { error: null };
  } catch (error: unknown) {
    return { error: getErrorMessage(error) };
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
  } catch (error: unknown) {
    return { data: null, error: getErrorMessage(error) };
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
  } catch (error: unknown) {
    return { data: null, error: getErrorMessage(error) };
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
  } catch (error: unknown) {
    return { data: null, error: getErrorMessage(error) };
  }
};

/**
 * Get single post by ID
 */
export const getPostById = async (postId: string): Promise<DbResponse<Post>> => {
  try {
    const post = await awsAPI.getPost(postId);
    return { data: convertPost(post), error: null };
  } catch (error: unknown) {
    return { data: null, error: getErrorMessage(error) };
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
  } catch (error: unknown) {
    return { data: null, error: getErrorMessage(error) };
  }
};

/**
 * Mark notification as read
 */
export const markNotificationRead = async (notificationId: string): Promise<{ error: string | null }> => {
  try {
    await awsAPI.markNotificationRead(notificationId);
    return { error: null };
  } catch (error: unknown) {
    return { error: getErrorMessage(error) };
  }
};

/**
 * Mark all notifications as read
 */
export const markAllNotificationsRead = async (): Promise<{ error: string | null }> => {
  try {
    await awsAPI.markAllNotificationsRead();
    return { error: null };
  } catch (error: unknown) {
    return { error: getErrorMessage(error) };
  }
};

/**
 * Get unread notification count
 */
export const getUnreadNotificationCount = async (): Promise<{ count: number }> => {
  try {
    const result = await awsAPI.getUnreadCount();
    return { count: result.count };
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
  } catch (error: unknown) {
    return { data: [], error: getErrorMessage(error) };
  }
};

/**
 * Get all available expertise
 */
export const getExpertise = async (): Promise<DbResponse<Expertise[]>> => {
  try {
    const result = await awsAPI.request<{ data: Expertise[] }>('/expertise');
    return { data: result.data, error: null };
  } catch (error: unknown) {
    return { data: [], error: getErrorMessage(error) };
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
  } catch (error: unknown) {
    return { data: [], error: getErrorMessage(error) };
  }
};

/**
 * Get spot by ID
 */
export const getSpotById = async (spotId: string): Promise<DbResponse<Spot>> => {
  try {
    const result = await awsAPI.request<Spot>(`/spots/${spotId}`);
    return { data: result, error: null };
  } catch (error: unknown) {
    return { data: null, error: getErrorMessage(error) };
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
  } catch (error: unknown) {
    return { data: null, error: getErrorMessage(error) };
  }
};

/**
 * Get reviews for a spot
 */
export const getSpotReviews = async (spotId: string, page = 0, limit = 20): Promise<DbResponse<SpotReview[]>> => {
  try {
    const result = await awsAPI.request<{ data: SpotReview[] }>(`/spots/${spotId}/reviews?page=${page}&limit=${limit}`);
    return { data: result.data, error: null };
  } catch (error: unknown) {
    return { data: [], error: getErrorMessage(error) };
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
  } catch (error: unknown) {
    return { data: null, error: getErrorMessage(error) };
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
      last_message: { id: string; content: string; created_at: string; sender_id: string } | null;
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
        last_message_preview: c.last_message?.content,
        updated_at: c.created_at,
        unread_count: c.unread_count ?? 0,
      };
    });
    return { data: conversations, error: null };
  } catch (error: unknown) {
    return { data: null, error: getErrorMessage(error) };
  }
};

/**
 * Get messages in a conversation
 */
export const getMessages = async (conversationId: string, _page = 0, limit = 50): Promise<DbResponse<Message[]>> => {
  try {
    // Lambda returns { messages: [...], nextCursor, hasMore } with snake_case fields
    const result = await awsAPI.request<{ messages: Array<{
      id: string; content: string; sender_id: string; read: boolean; created_at: string;
      sender: { id: string; username: string; display_name: string; avatar_url: string } | null;
    }> }>(`/conversations/${conversationId}/messages?limit=${limit}`);
    const messages: Message[] = (result.messages || []).map((m) => ({
      id: m.id,
      conversation_id: conversationId,
      sender_id: m.sender_id,
      content: m.content,
      created_at: m.created_at,
      sender: m.sender ? {
        id: m.sender.id, username: m.sender.username, full_name: m.sender.display_name || '',
        display_name: m.sender.display_name, avatar_url: m.sender.avatar_url,
      } as Profile : undefined,
    }));
    return { data: messages, error: null };
  } catch (error: unknown) {
    return { data: null, error: getErrorMessage(error) };
  }
};

/**
 * Send a message
 */
export const sendMessage = async (
  conversationId: string,
  content: string,
  mediaUrl?: string,
  mediaType?: 'image' | 'video' | 'voice' | 'audio'
): Promise<DbResponse<Message>> => {
  const user = await awsAuth.getCurrentUser();
  if (!user) return { data: null, error: 'Not authenticated' };

  // Sanitize content: strip HTML and control characters
  // eslint-disable-next-line no-control-regex
  const sanitizedContent = content.trim().replace(/<[^>]*>/g, '').replace(/[\u0000-\u001F\u007F]/g, '');
  if (!sanitizedContent) return { data: null, error: 'Message content is required' };

  try {
    // Lambda returns { message: {...} } with snake_case fields
    const result = await awsAPI.request<{ message: {
      id: string; content: string; sender_id: string; recipient_id: string; read: boolean; created_at: string;
      sender: { id: string; username: string; display_name: string; avatar_url: string };
    } }>(`/conversations/${conversationId}/messages`, {
      method: 'POST',
      body: { content: sanitizedContent, mediaUrl, mediaType },
    });
    const m = result.message;
    return { data: {
      id: m.id,
      conversation_id: conversationId,
      sender_id: m.sender_id,
      content: m.content,
      created_at: m.created_at,
      sender: m.sender ? {
        id: m.sender.id, username: m.sender.username, full_name: m.sender.display_name || '',
        display_name: m.sender.display_name, avatar_url: m.sender.avatar_url,
      } as Profile : undefined,
    }, error: null };
  } catch (error: unknown) {
    return { data: null, error: getErrorMessage(error) };
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
  } catch (error: unknown) {
    if (getErrorMessage(error)?.includes('already')) {
      return { data: null, error: 'already_reported' };
    }
    return { data: null, error: getErrorMessage(error) };
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
  } catch (error: unknown) {
    if (getErrorMessage(error)?.includes('already')) {
      return { data: null, error: 'already_reported' };
    }
    return { data: null, error: getErrorMessage(error) };
  }
};

/**
 * Block a user
 */
export const blockUser = async (userId: string): Promise<{ data: BlockedUser | null; error: string | null }> => {
  const user = await awsAuth.getCurrentUser();
  if (!user) return { data: null, error: 'Not authenticated' };

  try {
    const result = await awsAPI.request<BlockedUser>(`/profiles/${userId}/block`, { method: 'POST' });
    return { data: result, error: null };
  } catch (error: unknown) {
    return { data: null, error: getErrorMessage(error) };
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
  } catch (error: unknown) {
    return { data: null, error: getErrorMessage(error) };
  }
};

/**
 * Get blocked users
 */
export const getBlockedUsers = async (): Promise<DbResponse<BlockedUser[]>> => {
  const user = await awsAuth.getCurrentUser();
  if (!user) return { data: null, error: 'Not authenticated' };

  try {
    const result = await awsAPI.request<{ data: BlockedUser[] }>('/profiles/blocked');
    return { data: result.data, error: null };
  } catch (error: unknown) {
    return { data: [], error: getErrorMessage(error) };
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

export interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  media_url?: string;
  media_type?: 'image' | 'video' | 'voice' | 'audio';
  shared_post_id?: string;
  is_deleted?: boolean;
  created_at: string;
  read_at?: string;
  sender?: Profile;
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
    const result = await awsAPI.request<MutedUser>(`/profiles/${userId}/mute`, { method: 'POST' });
    return { data: result, error: null };
  } catch (error: unknown) {
    return { data: null, error: getErrorMessage(error) };
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
  } catch (error: unknown) {
    return { data: null, error: getErrorMessage(error) };
  }
};

/**
 * Get muted users
 */
export const getMutedUsers = async (): Promise<DbResponse<MutedUser[]>> => {
  const user = await awsAuth.getCurrentUser();
  if (!user) return { data: null, error: 'Not authenticated' };

  try {
    const result = await awsAPI.request<{ data: MutedUser[] }>('/profiles/muted');
    return { data: result.data, error: null };
  } catch (error: unknown) {
    return { data: [], error: getErrorMessage(error) };
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
  } catch (error: unknown) {
    return { data: [], error: getErrorMessage(error) };
  }
};

/**
 * Accept a follow request
 */
export const acceptFollowRequest = async (requestId: string): Promise<{ error: string | null }> => {
  try {
    await awsAPI.request(`/follow-requests/${requestId}/accept`, { method: 'POST' });
    return { error: null };
  } catch (error: unknown) {
    return { error: getErrorMessage(error) };
  }
};

/**
 * Decline a follow request
 */
export const declineFollowRequest = async (requestId: string): Promise<{ error: string | null }> => {
  try {
    await awsAPI.request(`/follow-requests/${requestId}/decline`, { method: 'POST' });
    return { error: null };
  } catch (error: unknown) {
    return { error: getErrorMessage(error) };
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
  } catch (error: unknown) {
    return { error: getErrorMessage(error) };
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
  } catch (error: unknown) {
    return { error: getErrorMessage(error) };
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
  } catch (error: unknown) {
    return { data: [], error: getErrorMessage(error) };
  }
};

/**
 * Get spots by creator
 */
export const getSpotsByCreator = async (creatorId: string, page = 0, limit = 50): Promise<DbResponse<Spot[]>> => {
  try {
    const result = await awsAPI.request<{ data: Spot[] }>(`/spots?creatorId=${creatorId}&page=${page}&limit=${limit}`);
    return { data: result.data, error: null };
  } catch (error: unknown) {
    return { data: [], error: getErrorMessage(error) };
  }
};

/**
 * Get spots by category
 */
export const getSpotsByCategory = async (category: string, page = 0, limit = 50): Promise<DbResponse<Spot[]>> => {
  try {
    const result = await awsAPI.request<{ data: Spot[] }>(`/spots?category=${encodeURIComponent(category)}&page=${page}&limit=${limit}`);
    return { data: result.data, error: null };
  } catch (error: unknown) {
    return { data: [], error: getErrorMessage(error) };
  }
};

/**
 * Get spots by sport type
 */
export const getSpotsBySportType = async (sportType: string, page = 0, limit = 50): Promise<DbResponse<Spot[]>> => {
  try {
    const result = await awsAPI.request<{ data: Spot[] }>(`/spots?sportType=${encodeURIComponent(sportType)}&page=${page}&limit=${limit}`);
    return { data: result.data, error: null };
  } catch (error: unknown) {
    return { data: [], error: getErrorMessage(error) };
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
  } catch (error: unknown) {
    return { data: null, error: getErrorMessage(error) };
  }
};

/**
 * Delete a spot
 */
export const deleteSpot = async (spotId: string): Promise<{ error: string | null }> => {
  try {
    await awsAPI.request(`/spots/${spotId}`, { method: 'DELETE' });
    return { error: null };
  } catch (error: unknown) {
    return { error: getErrorMessage(error) };
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
  } catch (error: unknown) {
    return { data: [], error: getErrorMessage(error) };
  }
};

/**
 * Save a spot
 */
export const saveSpot = async (spotId: string): Promise<{ error: string | null }> => {
  try {
    await awsAPI.request(`/spots/${spotId}/save`, { method: 'POST' });
    return { error: null };
  } catch (error: unknown) {
    return { error: getErrorMessage(error) };
  }
};

/**
 * Unsave a spot
 */
export const unsaveSpot = async (spotId: string): Promise<{ error: string | null }> => {
  try {
    await awsAPI.request(`/spots/${spotId}/save`, { method: 'DELETE' });
    return { error: null };
  } catch (error: unknown) {
    return { error: getErrorMessage(error) };
  }
};

/**
 * Delete a spot review
 */
export const deleteSpotReview = async (reviewId: string): Promise<{ error: string | null }> => {
  try {
    await awsAPI.request(`/spots/reviews/${reviewId}`, { method: 'DELETE' });
    return { error: null };
  } catch (error: unknown) {
    return { error: getErrorMessage(error) };
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
    const result = await awsAPI.request<{ conversation: { id: string } }>('/conversations', {
      method: 'POST',
      body: { participantId: otherUserId },
    });
    return { data: result.conversation.id, error: null };
  } catch (error: unknown) {
    if (__DEV__) console.warn('[getOrCreateConversation] ERROR:', getErrorMessage(error));
    return { data: null, error: getErrorMessage(error) };
  }
};

/**
 * Share a post to a conversation
 */
export const sharePostToConversation = async (postId: string, conversationId: string): Promise<{ error: string | null }> => {
  try {
    // Send the shared post as a message with a special content format
    await awsAPI.request(`/conversations/${conversationId}/messages`, {
      method: 'POST',
      body: { content: `[shared_post:${postId}]`, messageType: 'text' },
    });
    return { error: null };
  } catch (error: unknown) {
    return { error: getErrorMessage(error) };
  }
};

/**
 * Mark conversation as read
 */
export const markConversationAsRead = async (conversationId: string): Promise<{ error: string | null }> => {
  try {
    // Mark-as-read is handled automatically when fetching messages (GET /conversations/{id}/messages)
    // No-op here since no dedicated endpoint exists; reading messages triggers the mark-as-read.
    await awsAPI.request(`/conversations/${conversationId}/messages?limit=1`);
    return { error: null };
  } catch (error: unknown) {
    return { error: getErrorMessage(error) };
  }
};

/**
 * Upload a voice message
 */
export const uploadVoiceMessage = async (audioUri: string, conversationId: string): Promise<DbResponse<string>> => {
  const user = await awsAuth.getCurrentUser();
  if (!user) return { data: null, error: 'Not authenticated' };

  try {
    // Step 1: Get presigned upload URL from Lambda
    const { url: presignedUrl, key } = await awsAPI.request<{ url: string; key: string }>('/media/upload-voice', {
      method: 'POST',
      body: { conversationId },
    });

    // Step 2: Upload the audio file to S3 using the presigned URL
    const { uploadWithFileSystem } = await import('./mediaUpload');
    const uploadSuccess = await uploadWithFileSystem(audioUri, presignedUrl, 'audio/mp4');
    if (!uploadSuccess) {
      return { data: null, error: 'Failed to upload voice message' };
    }

    // Step 3: Return the CDN URL for the uploaded file
    const cdnUrl = awsAPI.getCDNUrl(key);
    return { data: cdnUrl, error: null };
  } catch (error: unknown) {
    return { data: null, error: getErrorMessage(error) };
  }
};

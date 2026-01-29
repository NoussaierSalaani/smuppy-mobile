// ============================================
// SMUPPY - DATABASE SERVICES
// Connexion frontend <-> AWS Backend
// ============================================

import { awsAuth } from './aws-auth';
import { awsAPI, Profile as AWSProfile, Post as AWSPost } from './aws-api';
import { useFeedStore } from '../stores';
import type {
  Spot as SpotType,
  SpotReview as SpotReviewType,
} from '../types';

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
  business_phone?: string;
  locations_mode?: string;
  onboarding_completed?: boolean;
  created_at?: string;
  updated_at?: string;
  // Stats
  fan_count?: number;
  post_count?: number;
  // Bot/Team flags
  is_bot?: boolean;
  is_team?: boolean;
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
  tagged_users?: string[];
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
  return {
    id: p.id,
    username: p.username,
    full_name: p.fullName || '',
    display_name: p.displayName || undefined,
    avatar_url: p.avatarUrl,
    cover_url: p.coverUrl || undefined,
    bio: p.bio || undefined,
    website: p.website || undefined,
    is_verified: p.isVerified,
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
    business_phone: p.businessPhone,
    locations_mode: p.locationsMode,
    fan_count: p.followersCount,
    post_count: p.postsCount,
  };
};

// Helper to convert AWS API Post to local Post format
const convertPost = (p: AWSPost): Post => {
  return {
    id: p.id,
    author_id: p.authorId,
    content: p.content,
    media_urls: p.mediaUrls,
    media_type: p.mediaType || undefined,
    visibility: 'public',
    likes_count: p.likesCount,
    comments_count: p.commentsCount,
    created_at: p.createdAt,
    author: p.author ? convertProfile(p.author) || undefined : undefined,
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
  } catch (error: any) {
    if (autoCreate && error.statusCode === 404) {
      // Profile doesn't exist, create one
      const username = user.email?.split('@')[0]?.toLowerCase().replace(/[^a-z0-9]/g, '') || `user_${Date.now()}`;
      try {
        const newProfile = await awsAPI.updateProfile({
          username,
          fullName: user.attributes?.name || username,
        });
        return { data: convertProfile(newProfile), error: null };
      } catch (createError: any) {
        return { data: null, error: createError.message };
      }
    }
    return { data: null, error: error.message };
  }
};

/**
 * Get a profile by user ID
 */
export const getProfileById = async (userId: string): Promise<DbResponse<Profile>> => {
  try {
    const profile = await awsAPI.getProfile(userId);
    return { data: convertProfile(profile), error: null };
  } catch (error: any) {
    return { data: null, error: error.message };
  }
};

/**
 * Get a profile by username
 */
export const getProfileByUsername = async (username: string): Promise<DbResponse<Profile>> => {
  try {
    const profile = await awsAPI.getProfileByUsername(username);
    return { data: convertProfile(profile), error: null };
  } catch (error: any) {
    return { data: null, error: error.message };
  }
};

/**
 * Update current user's profile (creates if doesn't exist)
 */
export const updateProfile = async (updates: Partial<Profile>): Promise<DbResponse<Profile>> => {
  const user = await awsAuth.getCurrentUser();
  if (!user) return { data: null, error: 'Not authenticated' };

  try {
    const updateData: any = {};

    // Basic profile fields
    if (updates.username) updateData.username = updates.username;
    if (updates.full_name) updateData.fullName = updates.full_name;
    if (updates.bio) updateData.bio = updates.bio;
    if (updates.avatar_url) updateData.avatarUrl = updates.avatar_url;
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
    if (updates.business_phone) updateData.businessPhone = updates.business_phone;
    if (updates.locations_mode) updateData.locationsMode = updates.locations_mode;

    // Onboarding flag
    if (updates.onboarding_completed !== undefined) updateData.onboardingCompleted = updates.onboarding_completed;

    if (process.env.NODE_ENV === 'development') console.log('[Database] updateProfile');
    const profile = await awsAPI.updateProfile(updateData);
    return { data: convertProfile(profile), error: null };
  } catch (error: any) {
    console.error('[Database] updateProfile error:', error);
    return { data: null, error: error.message };
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
  } catch (error: any) {
    return { data: [], error: error.message };
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
  } catch (error: any) {
    return { data: [], error: error.message };
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
  } catch (error: any) {
    return { data: [], error: error.message };
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
  } catch (error: any) {
    return { data: [], error: error.message };
  }
};

/**
 * Get trending hashtags
 */
export const getTrendingHashtags = async (limit = 10): Promise<DbResponse<{ tag: string; count: number }[]>> => {
  try {
    const result = await awsAPI.request<{ data: { tag: string; count: number }[] }>(`/hashtags/trending?limit=${limit}`);
    return { data: result.data, error: null };
  } catch (error: any) {
    return { data: [], error: error.message };
  }
};

/**
 * Optimized profile search with follow status included
 */
export const searchProfilesOptimized = async (
  query: string,
  limit = 20
): Promise<DbResponse<ProfileWithFollowStatus[]>> => {
  return searchProfiles(query, limit) as Promise<DbResponse<ProfileWithFollowStatus[]>>;
};

/**
 * Get suggested profiles (for discovery/explore)
 */
export const getSuggestedProfiles = async (limit = 10, offset = 0): Promise<DbResponse<Profile[]>> => {
  const user = await awsAuth.getCurrentUser();
  if (!user) return { data: [], error: 'Not authenticated' };

  try {
    // Try suggested endpoint first with pagination
    const result = await awsAPI.request<any>(`/profiles/suggested?limit=${limit}&offset=${offset}`);
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
  } catch (error: any) {
    if (error.statusCode === 404) {
      // Create new profile
      const username = user.email?.split('@')[0]?.toLowerCase().replace(/[^a-z0-9]/g, '') || `user_${Date.now()}`;
      try {
        const newProfile = await awsAPI.updateProfile({
          username,
          fullName: user.attributes?.name || username,
        });
        return { data: convertProfile(newProfile), error: null, created: true };
      } catch (createError: any) {
        return { data: null, error: createError.message };
      }
    }
    return { data: null, error: error.message };
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
  } catch (error: any) {
    return { data: null, error: error.message };
  }
};

/**
 * Get optimized feed with likes/saves status included
 */
export const getOptimizedFeed = async (page = 0, limit = 20): Promise<DbResponse<PostWithStatus[]>> => {
  const user = await awsAuth.getCurrentUser();
  if (!user) return { data: null, error: 'Not authenticated' };

  try {
    const result = await awsAPI.request<{ data: any[] }>(`/feed/optimized?limit=${limit}&page=${page}`);
    const posts: PostWithStatus[] = result.data.map((p: any) => ({
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
  } catch (error: any) {
    return { data: null, error: error.message };
  }
};

// Shared cache for followed user IDs
 
let _followedUsersCacheShared: { ids: string[]; timestamp: number; userId: string | null } = {
  ids: [],
  timestamp: 0,
  userId: null,
};
 
const _CACHE_DURATION_SHARED = 2 * 60 * 1000; // 2 minutes

// Clear cache when user follows/unfollows someone
export const clearFollowCache = () => {
  _followedUsersCacheShared = { ids: [], timestamp: 0, userId: null };
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
  } catch (error: any) {
    return { data: null, error: error.message };
  }
};

/**
 * Get optimized FanFeed with likes/saves status included
 */
export const getOptimizedFanFeed = async (page = 0, limit = 20): Promise<DbResponse<PostWithStatus[]>> => {
  const user = await awsAuth.getCurrentUser();
  if (!user) return { data: null, error: 'Not authenticated' };

  try {
    const result = await awsAPI.request<{ data: any[] }>(`/feed/following?limit=${limit}&page=${page}`);
    const posts: PostWithStatus[] = result.data.map((p: any) => ({
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
    const result = await awsAPI.request<any>(`/feed/discover?limit=${limit}&page=${page}${interestsParam}`);
    const posts = result.posts || result.data || [];
    return { data: posts.map(convertPost), error: null };
  } catch (error: any) {
    // Fallback to explore
    try {
      const result = await awsAPI.getPosts({ type: 'explore', limit });
      return { data: result.data.map(convertPost), error: null };
    } catch {
      return { data: [], error: error.message };
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
    const result = await awsAPI.request<{ data: any[] }>(`/posts/tags?tags=${encodeURIComponent(tags.join(','))}&limit=${limit}&page=${page}`);
    return { data: result.data.map(convertPost), error: null };
  } catch (error: any) {
    return { data: null, error: error.message };
  }
};

/**
 * Create a new post
 */
export const createPost = async (postData: Partial<Post>): Promise<DbResponse<Post>> => {
  const user = await awsAuth.getCurrentUser();
  if (!user) return { data: null, error: 'Not authenticated' };

  try {
    const createData: any = {
      content: postData.content || postData.caption,
      mediaUrls: postData.media_urls,
      mediaType: postData.media_type,
      visibility: postData.visibility,
    };

    // Handle peak-specific fields
    if (postData.is_peak) {
      createData.isPeak = true;
      createData.peakDuration = postData.peak_duration;
      createData.peakExpiresAt = postData.peak_expires_at;
      createData.saveToProfile = postData.save_to_profile;
      createData.location = postData.location;
    }

    if (postData.tags) {
      createData.tags = postData.tags;
    }

    if (postData.tagged_users) {
      createData.taggedUsers = postData.tagged_users;
    }

    const post = await awsAPI.createPost(createData);
    return { data: convertPost(post), error: null };
  } catch (error: any) {
    return { data: null, error: error.message };
  }
};

/**
 * Delete a post
 */
export const deletePost = async (postId: string): Promise<{ error: string | null }> => {
  try {
    await awsAPI.deletePost(postId);
    return { error: null };
  } catch (error: any) {
    return { error: error.message };
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
  } catch (error: any) {
    return { data: null, error: error.message };
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
  } catch (error: any) {
    return { error: error.message };
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
  } catch (error: any) {
    return { data: null, error: error.message };
  }
};

/**
 * Unsave a post (remove bookmark)
 */
export const unsavePost = async (postId: string): Promise<{ error: string | null }> => {
  const user = await awsAuth.getCurrentUser();
  if (!user) return { error: 'Not authenticated' };

  try {
    await awsAPI.request(`/posts/${postId}/unsave`, { method: 'POST' });
    return { error: null };
  } catch (error: any) {
    return { error: error.message };
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
    const result = await awsAPI.request<{ data: any[] }>(`/posts/saved?limit=${limit}&page=${page}`);
    return { data: result.data.map(convertPost), error: null };
  } catch (error: any) {
    return { data: null, error: error.message };
  }
};

// ============================================
// FOLLOWS
// ============================================

/**
 * Follow a user
 */
export const followUser = async (userIdToFollow: string): Promise<DbResponse<Follow> & { requestCreated?: boolean }> => {
  const user = await awsAuth.getCurrentUser();
  if (!user) return { data: null, error: 'Not authenticated' };

  clearFollowCache();
  // Invalidate feed cache so new follow's posts appear on next load
  useFeedStore.getState().clearFeed();

  try {
    await awsAPI.followUser(userIdToFollow);
    return {
      data: {
        id: '',
        follower_id: user.id,
        following_id: userIdToFollow,
        created_at: new Date().toISOString(),
      },
      error: null,
    };
  } catch (error: any) {
    return { data: null, error: error.message };
  }
};

/**
 * Unfollow a user
 */
export const unfollowUser = async (userIdToUnfollow: string): Promise<{ error: string | null }> => {
  const user = await awsAuth.getCurrentUser();
  if (!user) return { error: 'Not authenticated' };

  clearFollowCache();
  // Invalidate feed cache so unfollowed user's posts are removed on next load
  useFeedStore.getState().clearFeed();

  try {
    await awsAPI.unfollowUser(userIdToUnfollow);
    return { error: null };
  } catch (error: any) {
    return { error: error.message };
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
  } catch (error: any) {
    return { data: null, error: error.message };
  }
};

/**
 * Get users that a user is following
 */
export const getFollowing = async (userId: string, _page = 0, limit = 20): Promise<DbResponse<Profile[]>> => {
  try {
    const result = await awsAPI.getFollowing(userId, { limit });
    return { data: result.data.map(p => convertProfile(p)).filter(Boolean) as Profile[], error: null };
  } catch (error: any) {
    return { data: null, error: error.message };
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
// COMMENTS
// ============================================

/**
 * Get comments for a post
 */
export const getComments = async (postId: string, _page = 0, limit = 20): Promise<DbResponse<Comment[]>> => {
  try {
    const result = await awsAPI.getComments(postId, { limit });
    const comments: Comment[] = result.data.map((c: any) => ({
      id: c.id,
      user_id: c.authorId,
      post_id: c.postId,
      text: c.content,
      parent_comment_id: c.parentId,
      created_at: c.createdAt,
      user: c.author ? convertProfile(c.author) || undefined : undefined,
    }));
    return { data: comments, error: null };
  } catch (error: any) {
    return { data: null, error: error.message };
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
  } catch (error: any) {
    return { data: null, error: error.message };
  }
};

/**
 * Delete a comment
 */
export const deleteComment = async (commentId: string): Promise<{ error: string | null }> => {
  try {
    await awsAPI.deleteComment(commentId);
    return { error: null };
  } catch (error: any) {
    return { error: error.message };
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
    const posts: Post[] = result.data.map((p: any) => ({
      id: p.id,
      author_id: p.authorId,
      content: p.caption,
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
    }));
    return { data: posts, error: null };
  } catch (error: any) {
    return { data: null, error: error.message };
  }
};

/**
 * Get peaks by user ID
 */
export const getPeaksByUser = async (userId: string, _page = 0, limit = 10): Promise<DbResponse<Post[]>> => {
  try {
    const result = await awsAPI.getPeaks({ userId, limit });
    const posts: Post[] = result.data.map((p: any) => ({
      id: p.id,
      author_id: p.authorId,
      content: p.caption,
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
    }));
    return { data: posts, error: null };
  } catch (error: any) {
    return { data: null, error: error.message };
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
  } catch (error: any) {
    return { data: null, error: error.message };
  }
};

/**
 * Get single post by ID
 */
export const getPostById = async (postId: string): Promise<DbResponse<Post>> => {
  try {
    const post = await awsAPI.getPost(postId);
    return { data: convertPost(post), error: null };
  } catch (error: any) {
    return { data: null, error: error.message };
  }
};

// ============================================
// NOTIFICATIONS
// ============================================

/**
 * Get notifications for current user
 */
export const getNotifications = async (_page = 0, limit = 20): Promise<DbResponse<any[]>> => {
  const user = await awsAuth.getCurrentUser();
  if (!user) return { data: null, error: 'Not authenticated' };

  try {
    const result = await awsAPI.getNotifications({ limit });
    return { data: result.data, error: null };
  } catch (error: any) {
    return { data: null, error: error.message };
  }
};

/**
 * Mark notification as read
 */
export const markNotificationRead = async (notificationId: string): Promise<{ error: string | null }> => {
  try {
    await awsAPI.markNotificationRead(notificationId);
    return { error: null };
  } catch (error: any) {
    return { error: error.message };
  }
};

/**
 * Mark all notifications as read
 */
export const markAllNotificationsRead = async (): Promise<{ error: string | null }> => {
  try {
    await awsAPI.markAllNotificationsRead();
    return { error: null };
  } catch (error: any) {
    return { error: error.message };
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
  } catch (error: any) {
    return { data: [], error: error.message };
  }
};

/**
 * Get all available expertise
 */
export const getExpertise = async (): Promise<DbResponse<Expertise[]>> => {
  try {
    const result = await awsAPI.request<{ data: Expertise[] }>('/expertise');
    return { data: result.data, error: null };
  } catch (error: any) {
    return { data: [], error: error.message };
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
  } catch (error: any) {
    return { data: [], error: error.message };
  }
};

/**
 * Get spot by ID
 */
export const getSpotById = async (spotId: string): Promise<DbResponse<Spot>> => {
  try {
    const result = await awsAPI.request<Spot>(`/spots/${spotId}`);
    return { data: result, error: null };
  } catch (error: any) {
    return { data: null, error: error.message };
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
  } catch (error: any) {
    return { data: null, error: error.message };
  }
};

/**
 * Get reviews for a spot
 */
export const getSpotReviews = async (spotId: string, page = 0, limit = 20): Promise<DbResponse<SpotReview[]>> => {
  try {
    const result = await awsAPI.request<{ data: SpotReview[] }>(`/spots/${spotId}/reviews?page=${page}&limit=${limit}`);
    return { data: result.data, error: null };
  } catch (error: any) {
    return { data: [], error: error.message };
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
  } catch (error: any) {
    return { data: null, error: error.message };
  }
};

// ============================================
// MESSAGES
// ============================================

/**
 * Get conversations for current user
 */
export const getConversations = async (limit = 20): Promise<DbResponse<any[]>> => {
  const user = await awsAuth.getCurrentUser();
  if (!user) return { data: null, error: 'Not authenticated' };

  try {
    const result = await awsAPI.request<{ data: any[] }>(`/messages/conversations?limit=${limit}`);
    return { data: result.data, error: null };
  } catch (error: any) {
    return { data: null, error: error.message };
  }
};

/**
 * Get messages in a conversation
 */
export const getMessages = async (conversationId: string, page = 0, limit = 50): Promise<DbResponse<Message[]>> => {
  try {
    const result = await awsAPI.request<{ data: Message[] }>(`/messages/conversations/${conversationId}?page=${page}&limit=${limit}`);
    return { data: result.data, error: null };
  } catch (error: any) {
    return { data: null, error: error.message };
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

  try {
    const result = await awsAPI.request<Message>('/messages', {
      method: 'POST',
      body: { conversationId, content, mediaUrl, mediaType },
    });
    return { data: result, error: null };
  } catch (error: any) {
    return { data: null, error: error.message };
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
  } catch (error: any) {
    if (error.message?.includes('already')) {
      return { data: null, error: 'already_reported' };
    }
    return { data: null, error: error.message };
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
  } catch (error: any) {
    if (error.message?.includes('already')) {
      return { data: null, error: 'already_reported' };
    }
    return { data: null, error: error.message };
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
  } catch (error: any) {
    return { data: null, error: error.message };
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
  } catch (error: any) {
    return { data: null, error: error.message };
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
  } catch (error: any) {
    return { data: [], error: error.message };
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
  } catch (error: any) {
    return { data: null, error: error.message };
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
  } catch (error: any) {
    return { data: null, error: error.message };
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
  } catch (error: any) {
    return { data: [], error: error.message };
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
    const result = await awsAPI.request<{ data: FollowRequest[] }>('/follows/requests/pending');
    return { data: result.data, error: null };
  } catch (error: any) {
    return { data: [], error: error.message };
  }
};

/**
 * Accept a follow request
 */
export const acceptFollowRequest = async (requestId: string): Promise<{ error: string | null }> => {
  try {
    await awsAPI.request(`/follows/requests/${requestId}/accept`, { method: 'POST' });
    return { error: null };
  } catch (error: any) {
    return { error: error.message };
  }
};

/**
 * Decline a follow request
 */
export const declineFollowRequest = async (requestId: string): Promise<{ error: string | null }> => {
  try {
    await awsAPI.request(`/follows/requests/${requestId}/decline`, { method: 'POST' });
    return { error: null };
  } catch (error: any) {
    return { error: error.message };
  }
};

/**
 * Get pending follow requests count
 */
export const getPendingFollowRequestsCount = async (): Promise<number> => {
  try {
    const result = await awsAPI.request<{ count: number }>('/follows/requests/count');
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
    const result = await awsAPI.request<{ hasPending: boolean }>(`/follows/requests/pending/${targetUserId}`);
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
    await awsAPI.request(`/follows/requests/${targetUserId}/cancel`, { method: 'POST' });
    return { error: null };
  } catch (error: any) {
    return { error: error.message };
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
    await awsAPI.updateProfile({ interests } as any);
    return { error: null };
  } catch (error: any) {
    return { error: error.message };
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
  } catch (error: any) {
    return { data: [], error: error.message };
  }
};

/**
 * Get spots by creator
 */
export const getSpotsByCreator = async (creatorId: string, page = 0, limit = 50): Promise<DbResponse<Spot[]>> => {
  try {
    const result = await awsAPI.request<{ data: Spot[] }>(`/spots?creatorId=${creatorId}&page=${page}&limit=${limit}`);
    return { data: result.data, error: null };
  } catch (error: any) {
    return { data: [], error: error.message };
  }
};

/**
 * Get spots by category
 */
export const getSpotsByCategory = async (category: string, page = 0, limit = 50): Promise<DbResponse<Spot[]>> => {
  try {
    const result = await awsAPI.request<{ data: Spot[] }>(`/spots?category=${encodeURIComponent(category)}&page=${page}&limit=${limit}`);
    return { data: result.data, error: null };
  } catch (error: any) {
    return { data: [], error: error.message };
  }
};

/**
 * Get spots by sport type
 */
export const getSpotsBySportType = async (sportType: string, page = 0, limit = 50): Promise<DbResponse<Spot[]>> => {
  try {
    const result = await awsAPI.request<{ data: Spot[] }>(`/spots?sportType=${encodeURIComponent(sportType)}&page=${page}&limit=${limit}`);
    return { data: result.data, error: null };
  } catch (error: any) {
    return { data: [], error: error.message };
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
  } catch (error: any) {
    return { data: null, error: error.message };
  }
};

/**
 * Delete a spot
 */
export const deleteSpot = async (spotId: string): Promise<{ error: string | null }> => {
  try {
    await awsAPI.request(`/spots/${spotId}`, { method: 'DELETE' });
    return { error: null };
  } catch (error: any) {
    return { error: error.message };
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
  } catch (error: any) {
    return { data: [], error: error.message };
  }
};

/**
 * Save a spot
 */
export const saveSpot = async (spotId: string): Promise<{ error: string | null }> => {
  try {
    await awsAPI.request(`/spots/${spotId}/save`, { method: 'POST' });
    return { error: null };
  } catch (error: any) {
    return { error: error.message };
  }
};

/**
 * Unsave a spot
 */
export const unsaveSpot = async (spotId: string): Promise<{ error: string | null }> => {
  try {
    await awsAPI.request(`/spots/${spotId}/unsave`, { method: 'POST' });
    return { error: null };
  } catch (error: any) {
    return { error: error.message };
  }
};

/**
 * Delete a spot review
 */
export const deleteSpotReview = async (reviewId: string): Promise<{ error: string | null }> => {
  try {
    await awsAPI.request(`/spots/reviews/${reviewId}`, { method: 'DELETE' });
    return { error: null };
  } catch (error: any) {
    return { error: error.message };
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
    const result = await awsAPI.request<Conversation>('/messages/conversations', {
      method: 'POST',
      body: { participantId: otherUserId },
    });
    return { data: result.id, error: null };
  } catch (error: any) {
    return { data: null, error: error.message };
  }
};

/**
 * Share a post to a conversation
 */
export const sharePostToConversation = async (postId: string, conversationId: string): Promise<{ error: string | null }> => {
  try {
    await awsAPI.request('/messages/share', {
      method: 'POST',
      body: { postId, conversationId },
    });
    return { error: null };
  } catch (error: any) {
    return { error: error.message };
  }
};

/**
 * Mark conversation as read
 */
export const markConversationAsRead = async (conversationId: string): Promise<{ error: string | null }> => {
  try {
    await awsAPI.request(`/messages/conversations/${conversationId}/read`, { method: 'POST' });
    return { error: null };
  } catch (error: any) {
    return { error: error.message };
  }
};

/**
 * Upload a voice message
 */
export const uploadVoiceMessage = async (audioUri: string, conversationId: string): Promise<DbResponse<string>> => {
  const user = await awsAuth.getCurrentUser();
  if (!user) return { data: null, error: 'Not authenticated' };

  try {
    // Upload the voice file to S3 and get the URL
    const result = await awsAPI.request<{ url: string }>('/media/upload-voice', {
      method: 'POST',
      body: { audioUri, conversationId },
    });
    return { data: result.url, error: null };
  } catch (error: any) {
    return { data: null, error: error.message };
  }
};

/**
 * Subscribe to messages (real-time - returns unsubscribe function)
 * Note: Real-time subscriptions require WebSocket, this returns a mock unsubscribe
 */
export const subscribeToMessages = (
  _conversationId: string,
  _callback: (message: Message) => void
): (() => void) => {
  // Real-time subscriptions would need WebSocket implementation
  // For now, return a no-op unsubscribe function
  if (process.env.NODE_ENV === 'development') console.log('[Database] subscribeToMessages called - WebSocket not implemented');
  return () => {};
};

/**
 * Subscribe to conversations (real-time - returns unsubscribe function)
 * Note: Real-time subscriptions require WebSocket, this returns a mock unsubscribe
 */
export const subscribeToConversations = (
  _callback: (conversations: Conversation[]) => void
): (() => void) => {
  // Real-time subscriptions would need WebSocket implementation
  if (process.env.NODE_ENV === 'development') console.log('[Database] subscribeToConversations called - WebSocket not implemented');
  return () => {}
};

// ============================================
// SMUPPY - DATABASE SERVICES
// Connexion frontend <-> Supabase
// ============================================

import { supabase } from '../config/supabase';
import type {
  Spot as SpotType,
  SpotReview as SpotReviewType,
  CreateSpotData,
} from '../types';

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
  account_type?: 'personal' | 'pro_creator' | 'pro_local';
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
  visibility: 'public' | 'private' | 'fans';
  likes_count?: number;
  comments_count?: number;
  views_count?: number;
  location?: string | null;
  tags?: string[]; // Interest tags for filtering (e.g., ['Fitness', 'Yoga'])
  is_peak?: boolean;
  peak_duration?: number;
  peak_expires_at?: string;
  save_to_profile?: boolean;
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

// ============================================
// PROFILES
// ============================================

/**
 * Get current user's profile
 */
export const getCurrentProfile = async (autoCreate = true): Promise<DbResponse<Profile>> => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { data: null, error: 'Not authenticated' };

  const result = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .maybeSingle();

  const { data, error } = result as { data: Profile | null; error: { message: string } | null };

  // If no profile exists and autoCreate is enabled, create one
  if (!data && !error && autoCreate) {
    if (__DEV__) console.log('[getCurrentProfile] No profile found, creating one...');
    const profileData = {
      id: user.id,
      full_name: user.user_metadata?.full_name || user.email?.split('@')[0] || 'User',
      username: user.email?.split('@')[0]?.toLowerCase().replace(/[^a-z0-9]/g, '') || `user_${Date.now()}`,
      avatar_url: user.user_metadata?.avatar_url || null,
    };
    if (__DEV__) console.log('[getCurrentProfile] Profile data:', profileData);

    const insertResult = await supabase
      .from('profiles')
      .insert(profileData)
      .select()
      .single();

    const { data: newProfile, error: createError } = insertResult as { data: Profile | null; error: { message: string } | null };

    if (createError) {
      if (__DEV__) console.error('[getCurrentProfile] Failed to create profile:', createError);
    } else {
      if (__DEV__) console.log('[getCurrentProfile] Profile created successfully');
    }

    return { data: newProfile, error: createError?.message || null };
  }

  return { data, error: error?.message || null };
};

/**
 * Get a profile by user ID
 */
export const getProfileById = async (userId: string): Promise<DbResponse<Profile>> => {
  const result = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle();

  const { data, error } = result as { data: Profile | null; error: { message: string } | null };
  return { data, error: error?.message || null };
};

/**
 * Get a profile by username
 */
export const getProfileByUsername = async (username: string): Promise<DbResponse<Profile>> => {
  const result = await supabase
    .from('profiles')
    .select('*')
    .eq('username', username)
    .maybeSingle();

  const { data, error } = result as { data: Profile | null; error: { message: string } | null };
  return { data, error: error?.message || null };
};

/**
 * Update current user's profile (creates if doesn't exist)
 */
export const updateProfile = async (updates: Partial<Profile>): Promise<DbResponse<Profile>> => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { data: null, error: 'Not authenticated' };

  if (__DEV__) console.log('[updateProfile] Updating profile with:', JSON.stringify(updates));

  // First, try to update existing profile
  const updateResult = await supabase
    .from('profiles')
    .update(updates)
    .eq('id', user.id)
    .select();

  const { data: updateData, error: updateError } = updateResult as {
    data: Profile[] | null;
    error: { message: string } | null
  };

  if (__DEV__) console.log('[updateProfile] Result - data:', updateData?.length, 'error:', updateError?.message);

  // If update succeeded and returned data, return it
  if (updateData && updateData.length > 0) {
    if (__DEV__) console.log('[updateProfile] Success! Returning updated profile');
    return { data: updateData[0], error: null };
  }

  // If no rows updated (profile doesn't exist), create one
  if (!updateError && (!updateData || updateData.length === 0)) {
    if (__DEV__) console.log('[updateProfile] No profile found, creating one...');

    const username = user.email?.split('@')[0]?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'user';
    const uniqueUsername = `${username}_${Math.floor(Math.random() * 10000)}`;

    const insertResult = await supabase
      .from('profiles')
      .insert({
        id: user.id,
        username: uniqueUsername,
        full_name: user.user_metadata?.full_name || user.email?.split('@')[0] || 'User',
        ...updates,
      })
      .select()
      .single();

    const { data: insertData, error: insertError } = insertResult as {
      data: Profile | null;
      error: { message: string } | null
    };

    return { data: insertData, error: insertError?.message || null };
  }

  return { data: null, error: updateError?.message || 'Unknown error' };
};

/**
 * Create profile for new user
 */
export const createProfile = async (profileData: Partial<Profile>): Promise<DbResponse<Profile>> => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { data: null, error: 'Not authenticated' };

  // Use upsert to handle race condition where profile may already exist
  const result = await supabase
    .from('profiles')
    .upsert({
      id: user.id,
      ...profileData
    }, {
      onConflict: 'id',
      ignoreDuplicates: false, // Update if exists
    })
    .select()
    .single();

  const { data, error } = result as { data: Profile | null; error: { message: string } | null };

  // Also update user_metadata for consistency
  if (data && profileData.full_name) {
    await supabase.auth.updateUser({
      data: { full_name: profileData.full_name }
    });
  }

  return { data, error: error?.message || null };
};

/**
 * Search profiles by username or full_name
 * Results are sorted with verified accounts first
 */
export const searchProfiles = async (
  query: string,
  limit = 20
): Promise<DbResponse<Profile[]>> => {
  if (!query || query.trim().length === 0) {
    return { data: [], error: null };
  }

  const searchTerm = query.trim().toLowerCase();

  const result = await supabase
    .from('profiles')
    .select('*')
    .or(`username.ilike.%${searchTerm}%,full_name.ilike.%${searchTerm}%`)
    .order('is_verified', { ascending: false }) // Verified accounts (bots) first
    .order('created_at', { ascending: false })
    .limit(limit);

  const { data, error } = result as { data: Profile[] | null; error: { message: string } | null };
  return { data: data || [], error: error?.message || null };
};

/**
 * Get suggested profiles (for discovery/explore)
 * Prioritizes verified accounts (Smuppy Team bots) to ensure visibility
 */
export const getSuggestedProfiles = async (limit = 10): Promise<DbResponse<Profile[]>> => {
  const { data: { user } } = await supabase.auth.getUser();

  // Get verified profiles first (Smuppy Team bots) - randomized for variety
  // This ensures bot accounts are always suggested
  const verifiedResult = await supabase
    .from('profiles')
    .select('*')
    .neq('id', user?.id || '')
    .eq('is_verified', true)
    .limit(Math.ceil(limit * 0.7)); // 70% verified accounts

  const verifiedProfiles = (verifiedResult.data || []) as Profile[];

  // Shuffle verified profiles for variety each time
  const shuffledVerified = verifiedProfiles.sort(() => Math.random() - 0.5);

  const verifiedIds = shuffledVerified.map(p => p.id);
  const remainingLimit = limit - shuffledVerified.length;

  // Fill with other non-verified profiles
  if (remainingLimit > 0) {
    const otherResult = await supabase
      .from('profiles')
      .select('*')
      .neq('id', user?.id || '')
      .eq('is_verified', false)
      .not('id', 'in', `(${verifiedIds.length > 0 ? verifiedIds.join(',') : '00000000-0000-0000-0000-000000000000'})`)
      .order('created_at', { ascending: false })
      .limit(remainingLimit);

    const otherProfiles = (otherResult.data || []) as Profile[];
    return { data: [...shuffledVerified, ...otherProfiles], error: null };
  }

  return { data: shuffledVerified, error: verifiedResult.error?.message || null };
};

/**
 * Ensure profile exists - create if it doesn't
 * Call this after login/signup to guarantee profile exists
 */
export const ensureProfile = async (): Promise<DbResponseWithCreated<Profile>> => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { data: null, error: 'Not authenticated' };

  // Check if profile exists
  const existingResult = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .maybeSingle();

  const { data: existingProfile } = existingResult as { data: Profile | null };

  if (existingProfile) {
    return { data: existingProfile, error: null, created: false };
  }

  // Create new profile with defaults from auth user
  const insertResult = await supabase
    .from('profiles')
    .insert({
      id: user.id,
      full_name: user.user_metadata?.full_name || user.email?.split('@')[0] || 'User',
      username: user.email?.split('@')[0]?.toLowerCase().replace(/[^a-z0-9]/g, '') || `user_${Date.now()}`,
      avatar_url: user.user_metadata?.avatar_url || null,
    })
    .select()
    .single();

  const { data: newProfile, error } = insertResult as { data: Profile | null; error: { message: string } | null };
  return { data: newProfile, error: error?.message || null, created: true };
};

// ============================================
// POSTS
// ============================================

/**
 * Get posts feed with pagination
 */
export const getFeedPosts = async (page = 0, limit = 10): Promise<DbResponse<Post[]>> => {
  const from = page * limit;
  const to = from + limit - 1;

  const result = await supabase
    .from('posts')
    .select(`
      *,
      author:profiles!posts_author_id_fkey(id, username, full_name, avatar_url, is_verified)
    `)
    .eq('visibility', 'public')
    .order('created_at', { ascending: false })
    .range(from, to);

  const { data, error } = result as { data: Post[] | null; error: { message: string } | null };
  return { data, error: error?.message || null };
};

/**
 * Get posts by user ID
 */
export const getPostsByUser = async (userId: string, page = 0, limit = 10): Promise<DbResponse<Post[]>> => {
  const from = page * limit;
  const to = from + limit - 1;

  const result = await supabase
    .from('posts')
    .select(`
      *,
      author:profiles!posts_author_id_fkey(id, username, full_name, avatar_url, is_verified)
    `)
    .eq('author_id', userId)
    .order('created_at', { ascending: false })
    .range(from, to);

  const { data, error } = result as { data: Post[] | null; error: { message: string } | null };
  return { data, error: error?.message || null };
};

/**
 * Get posts from followed users (FanFeed)
 * Returns posts from users that the current user follows
 */
export const getFeedFromFollowed = async (page = 0, limit = 10): Promise<DbResponse<Post[]>> => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { data: null, error: 'Not authenticated' };

  const from = page * limit;
  const to = from + limit - 1;

  // First get the list of followed user IDs
  const followsResult = await supabase
    .from('follows')
    .select('following_id')
    .eq('follower_id', user.id);

  const { data: follows, error: followsError } = followsResult as {
    data: Array<{ following_id: string }> | null;
    error: { message: string } | null
  };

  if (followsError) {
    return { data: null, error: followsError.message };
  }

  // If not following anyone, return empty array
  if (!follows || follows.length === 0) {
    return { data: [], error: null };
  }

  const followedIds = follows.map(f => f.following_id);

  // Get posts from followed users
  const result = await supabase
    .from('posts')
    .select(`
      *,
      author:profiles!posts_author_id_fkey(id, username, full_name, avatar_url, is_verified)
    `)
    .in('author_id', followedIds)
    .in('visibility', ['public', 'fans'])
    .order('created_at', { ascending: false })
    .range(from, to);

  const { data, error } = result as { data: Post[] | null; error: { message: string } | null };
  return { data, error: error?.message || null };
};

/**
 * Get discovery feed filtered by interests (VibesFeed)
 * Logic:
 * 1. Prioritize posts matching user interests (shown first)
 * 2. Fill with popular/recent posts to ensure feed is never empty
 * 3. Mix interests posts with discovery posts for variety
 *
 * @param selectedInterests - Currently active interest filters
 * @param userInterests - All interests the user has selected in profile
 * @param page - Pagination page number
 * @param limit - Number of posts per page
 */
export const getDiscoveryFeed = async (
  selectedInterests: string[] = [],
  userInterests: string[] = [],
  page = 0,
  limit = 20
): Promise<DbResponse<Post[]>> => {
  const from = page * limit;
  const to = from + limit - 1;

  const { data: { user } } = await supabase.auth.getUser();
  const currentUserId = user?.id;

  // If specific interests are selected, filter by those
  if (selectedInterests.length > 0) {
    // Get posts matching selected interests
    const interestResult = await supabase
      .from('posts')
      .select(`
        *,
        author:profiles!posts_author_id_fkey(id, username, full_name, avatar_url, is_verified)
      `)
      .eq('visibility', 'public')
      .neq('author_id', currentUserId || '')
      .overlaps('tags', selectedInterests)
      .order('likes_count', { ascending: false })
      .order('created_at', { ascending: false })
      .range(from, to);

    const interestPosts = (interestResult.data || []) as Post[];

    // If we have enough interest posts, return them
    if (interestPosts.length >= limit / 2) {
      return { data: interestPosts, error: interestResult.error?.message || null };
    }

    // If not enough, fill with popular posts (excluding already fetched)
    const fetchedIds = interestPosts.map(p => p.id);
    const fillCount = limit - interestPosts.length;

    const fillResult = await supabase
      .from('posts')
      .select(`
        *,
        author:profiles!posts_author_id_fkey(id, username, full_name, avatar_url, is_verified)
      `)
      .eq('visibility', 'public')
      .neq('author_id', currentUserId || '')
      .not('id', 'in', `(${fetchedIds.length > 0 ? fetchedIds.join(',') : '00000000-0000-0000-0000-000000000000'})`)
      .order('likes_count', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(fillCount);

    const fillPosts = (fillResult.data || []) as Post[];
    return { data: [...interestPosts, ...fillPosts], error: null };
  }

  // No specific filter: mix user interests posts with popular posts
  if (userInterests.length > 0 && page === 0) {
    // First page: prioritize user interests then fill with popular
    const interestResult = await supabase
      .from('posts')
      .select(`
        *,
        author:profiles!posts_author_id_fkey(id, username, full_name, avatar_url, is_verified)
      `)
      .eq('visibility', 'public')
      .neq('author_id', currentUserId || '')
      .overlaps('tags', userInterests)
      .order('likes_count', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(Math.ceil(limit * 0.6)); // 60% from interests

    const interestPosts = (interestResult.data || []) as Post[];
    const fetchedIds = interestPosts.map(p => p.id);
    const remainingCount = limit - interestPosts.length;

    // Fill with popular posts
    const popularResult = await supabase
      .from('posts')
      .select(`
        *,
        author:profiles!posts_author_id_fkey(id, username, full_name, avatar_url, is_verified)
      `)
      .eq('visibility', 'public')
      .neq('author_id', currentUserId || '')
      .not('id', 'in', `(${fetchedIds.length > 0 ? fetchedIds.join(',') : '00000000-0000-0000-0000-000000000000'})`)
      .order('likes_count', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(remainingCount);

    const popularPosts = (popularResult.data || []) as Post[];
    return { data: [...interestPosts, ...popularPosts], error: null };
  }

  // Default: all public posts ordered by popularity
  const result = await supabase
    .from('posts')
    .select(`
      *,
      author:profiles!posts_author_id_fkey(id, username, full_name, avatar_url, is_verified)
    `)
    .eq('visibility', 'public')
    .neq('author_id', currentUserId || '')
    .order('likes_count', { ascending: false })
    .order('created_at', { ascending: false })
    .range(from, to);

  const { data, error } = result as { data: Post[] | null; error: { message: string } | null };
  return { data, error: error?.message || null };
};

/**
 * Get posts by specific tags/interests
 */
export const getPostsByTags = async (
  tags: string[],
  page = 0,
  limit = 10
): Promise<DbResponse<Post[]>> => {
  const from = page * limit;
  const to = from + limit - 1;

  const result = await supabase
    .from('posts')
    .select(`
      *,
      author:profiles!posts_author_id_fkey(id, username, full_name, avatar_url, is_verified)
    `)
    .eq('visibility', 'public')
    .overlaps('tags', tags)
    .order('created_at', { ascending: false })
    .range(from, to);

  const { data, error } = result as { data: Post[] | null; error: { message: string } | null };
  return { data, error: error?.message || null };
};

/**
 * Create a new post
 */
export const createPost = async (postData: Partial<Post>): Promise<DbResponse<Post>> => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { data: null, error: 'Not authenticated' };

  const result = await supabase
    .from('posts')
    .insert({
      author_id: user.id,
      ...postData
    })
    .select(`
      *,
      author:profiles!posts_author_id_fkey(id, username, full_name, avatar_url, is_verified)
    `)
    .single();

  const { data, error } = result as { data: Post | null; error: { message: string } | null };
  return { data, error: error?.message || null };
};

/**
 * Delete a post
 */
export const deletePost = async (postId: string): Promise<{ error: string | null }> => {
  const result = await supabase
    .from('posts')
    .delete()
    .eq('id', postId);

  const { error } = result as { error: { message: string } | null };
  return { error: error?.message || null };
};

// ============================================
// LIKES
// ============================================

/**
 * Like a post
 */
export const likePost = async (postId: string): Promise<DbResponse<Like>> => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { data: null, error: 'Not authenticated' };

  const result = await supabase
    .from('likes')
    .insert({
      user_id: user.id,
      post_id: postId
    })
    .select()
    .single();

  const { data, error } = result as { data: Like | null; error: { message: string } | null };
  return { data, error: error?.message || null };
};

/**
 * Unlike a post
 */
export const unlikePost = async (postId: string): Promise<{ error: string | null }> => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const result = await supabase
    .from('likes')
    .delete()
    .match({
      user_id: user.id,
      post_id: postId
    });

  const { error } = result as { error: { message: string } | null };
  return { error: error?.message || null };
};

/**
 * Check if current user liked a post
 */
export const hasLikedPost = async (postId: string): Promise<{ hasLiked: boolean }> => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { hasLiked: false };

  const result = await supabase
    .from('likes')
    .select('id')
    .match({
      user_id: user.id,
      post_id: postId
    })
    .single();

  const { data } = result as { data: { id: string } | null };
  return { hasLiked: !!data };
};

// ============================================
// POST SAVES (Bookmarks/Collections)
// ============================================

/**
 * Save a post (bookmark)
 */
export const savePost = async (postId: string): Promise<DbResponse<{ id: string }>> => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { data: null, error: 'Not authenticated' };

  const result = await supabase
    .from('post_saves')
    .insert({
      user_id: user.id,
      post_id: postId
    })
    .select('id')
    .single();

  const { data, error } = result as { data: { id: string } | null; error: { message: string } | null };
  return { data, error: error?.message || null };
};

/**
 * Unsave a post (remove bookmark)
 */
export const unsavePost = async (postId: string): Promise<{ error: string | null }> => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const result = await supabase
    .from('post_saves')
    .delete()
    .match({
      user_id: user.id,
      post_id: postId
    });

  const { error } = result as { error: { message: string } | null };
  return { error: error?.message || null };
};

/**
 * Check if current user saved a post
 */
export const hasSavedPost = async (postId: string): Promise<{ saved: boolean }> => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { saved: false };

  const result = await supabase
    .from('post_saves')
    .select('id')
    .match({
      user_id: user.id,
      post_id: postId
    })
    .single();

  const { data } = result as { data: { id: string } | null };
  return { saved: !!data };
};

/**
 * Get user's saved posts (collections)
 */
export const getSavedPosts = async (page = 0, limit = 20): Promise<DbResponse<Post[]>> => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { data: null, error: 'Not authenticated' };

  const from = page * limit;
  const to = from + limit - 1;

  const result = await supabase
    .from('post_saves')
    .select(`
      post:posts(
        *,
        author:profiles!posts_author_id_fkey(id, username, full_name, avatar_url, is_verified)
      )
    `)
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .range(from, to);

  const { data, error } = result as { data: Array<{ post: Post }> | null; error: { message: string } | null };
  return { data: data?.map(d => d.post) || null, error: error?.message || null };
};

// ============================================
// FOLLOWS
// ============================================

/**
 * Follow a user
 */
export const followUser = async (userIdToFollow: string): Promise<DbResponse<Follow>> => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { data: null, error: 'Not authenticated' };

  const result = await supabase
    .from('follows')
    .insert({
      follower_id: user.id,
      following_id: userIdToFollow
    })
    .select()
    .single();

  const { data, error } = result as { data: Follow | null; error: { message: string } | null };
  return { data, error: error?.message || null };
};

/**
 * Unfollow a user
 */
export const unfollowUser = async (userIdToUnfollow: string): Promise<{ error: string | null }> => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const result = await supabase
    .from('follows')
    .delete()
    .match({
      follower_id: user.id,
      following_id: userIdToUnfollow
    });

  const { error } = result as { error: { message: string } | null };
  return { error: error?.message || null };
};

/**
 * Check if current user follows a user
 */
export const isFollowing = async (userId: string): Promise<{ following: boolean }> => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { following: false };

  const result = await supabase
    .from('follows')
    .select('follower_id')
    .match({
      follower_id: user.id,
      following_id: userId
    })
    .single();

  const { data } = result as { data: { follower_id: string } | null };
  return { following: !!data };
};

/**
 * Get followers of a user
 */
export const getFollowers = async (userId: string, page = 0, limit = 20): Promise<DbResponse<Profile[]>> => {
  const from = page * limit;
  const to = from + limit - 1;

  const result = await supabase
    .from('follows')
    .select(`
      follower:profiles!follows_follower_id_fkey(id, username, full_name, avatar_url, is_verified)
    `)
    .eq('following_id', userId)
    .range(from, to);

  const { data, error } = result as { data: Array<{ follower: Profile }> | null; error: { message: string } | null };
  return { data: data?.map(d => d.follower) || null, error: error?.message || null };
};

/**
 * Get users that a user is following
 */
export const getFollowing = async (userId: string, page = 0, limit = 20): Promise<DbResponse<Profile[]>> => {
  const from = page * limit;
  const to = from + limit - 1;

  const result = await supabase
    .from('follows')
    .select(`
      following:profiles!follows_following_id_fkey(id, username, full_name, avatar_url, is_verified)
    `)
    .eq('follower_id', userId)
    .range(from, to);

  const { data, error } = result as { data: Array<{ following: Profile }> | null; error: { message: string } | null };
  return { data: data?.map(d => d.following) || null, error: error?.message || null };
};

// ============================================
// COMMENTS
// ============================================

/**
 * Get comments for a post
 */
export const getPostComments = async (postId: string, page = 0, limit = 20): Promise<DbResponse<Comment[]>> => {
  const from = page * limit;
  const to = from + limit - 1;

  const result = await supabase
    .from('comments')
    .select(`
      *,
      user:profiles(id, username, full_name, avatar_url, is_verified)
    `)
    .eq('post_id', postId)
    .is('parent_comment_id', null)
    .order('created_at', { ascending: true })
    .range(from, to);

  const { data, error } = result as { data: Comment[] | null; error: { message: string } | null };
  return { data, error: error?.message || null };
};

/**
 * Add a comment to a post
 */
export const addComment = async (postId: string, text: string): Promise<DbResponse<Comment>> => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { data: null, error: 'Not authenticated' };

  const result = await supabase
    .from('comments')
    .insert({
      user_id: user.id,
      post_id: postId,
      text
    })
    .select(`
      *,
      user:profiles(id, username, full_name, avatar_url, is_verified)
    `)
    .single();

  const { data, error } = result as { data: Comment | null; error: { message: string } | null };
  return { data, error: error?.message || null };
};

// ============================================
// INTERESTS & EXPERTISE
// ============================================

/**
 * Get all interests
 */
export const getInterests = async (): Promise<DbResponse<Interest[]>> => {
  const result = await supabase
    .from('interests')
    .select('*')
    .order('name');

  const { data, error } = result as { data: Interest[] | null; error: { message: string } | null };
  return { data, error: error?.message || null };
};

/**
 * Get all expertise
 */
export const getExpertise = async (): Promise<DbResponse<Expertise[]>> => {
  const result = await supabase
    .from('expertise')
    .select('*')
    .order('name');

  const { data, error } = result as { data: Expertise[] | null; error: { message: string } | null };
  return { data, error: error?.message || null };
};

/**
 * Save user interests
 */
export const saveUserInterests = async (interestIds: string[]): Promise<{ error: string | null }> => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  // Delete existing interests
  await supabase
    .from('user_interests')
    .delete()
    .eq('user_id', user.id);

  // Insert new interests
  const result = await supabase
    .from('user_interests')
    .insert(
      interestIds.map(interestId => ({
        user_id: user.id,
        interest_id: interestId
      }))
    );

  const { error } = result as { error: { message: string } | null };
  return { error: error?.message || null };
};

// ============================================
// SPOTS (Custom locations by pro creators)
// Types imported from ../types
// ============================================

export type Spot = SpotType;
export type SpotReview = SpotReviewType;
export type { CreateSpotData };

/**
 * Get spots feed with pagination
 */
export const getSpots = async (page = 0, limit = 20): Promise<DbResponse<Spot[]>> => {
  const from = page * limit;
  const to = from + limit - 1;

  const result = await supabase
    .from('spots')
    .select(`
      *,
      creator:profiles(id, username, full_name, avatar_url, is_verified)
    `)
    .eq('visibility', 'public')
    .order('created_at', { ascending: false })
    .range(from, to);

  const { data, error } = result as { data: Spot[] | null; error: { message: string } | null };
  return { data, error: error?.message || null };
};

/**
 * Get a single spot by ID
 */
export const getSpotById = async (spotId: string): Promise<DbResponse<Spot>> => {
  const result = await supabase
    .from('spots')
    .select(`
      *,
      creator:profiles(id, username, full_name, avatar_url, is_verified)
    `)
    .eq('id', spotId)
    .single();

  const { data, error } = result as { data: Spot | null; error: { message: string } | null };
  return { data, error: error?.message || null };
};

/**
 * Get spots by creator
 */
export const getSpotsByCreator = async (creatorId: string, page = 0, limit = 20): Promise<DbResponse<Spot[]>> => {
  const from = page * limit;
  const to = from + limit - 1;

  const result = await supabase
    .from('spots')
    .select(`
      *,
      creator:profiles(id, username, full_name, avatar_url, is_verified)
    `)
    .eq('creator_id', creatorId)
    .order('created_at', { ascending: false })
    .range(from, to);

  const { data, error } = result as { data: Spot[] | null; error: { message: string } | null };
  return { data, error: error?.message || null };
};

/**
 * Get spots by category
 */
export const getSpotsByCategory = async (category: string, page = 0, limit = 20): Promise<DbResponse<Spot[]>> => {
  const from = page * limit;
  const to = from + limit - 1;

  const result = await supabase
    .from('spots')
    .select(`
      *,
      creator:profiles(id, username, full_name, avatar_url, is_verified)
    `)
    .eq('category', category)
    .eq('visibility', 'public')
    .order('created_at', { ascending: false })
    .range(from, to);

  const { data, error } = result as { data: Spot[] | null; error: { message: string } | null };
  return { data, error: error?.message || null };
};

/**
 * Get spots by sport type
 */
export const getSpotsBySportType = async (sportType: string, page = 0, limit = 20): Promise<DbResponse<Spot[]>> => {
  const from = page * limit;
  const to = from + limit - 1;

  const result = await supabase
    .from('spots')
    .select(`
      *,
      creator:profiles(id, username, full_name, avatar_url, is_verified)
    `)
    .eq('sport_type', sportType)
    .eq('visibility', 'public')
    .order('created_at', { ascending: false })
    .range(from, to);

  const { data, error } = result as { data: Spot[] | null; error: { message: string } | null };
  return { data, error: error?.message || null };
};

/**
 * Find nearby spots using the database function
 */
export const findNearbySpots = async (
  latitude: number,
  longitude: number,
  radiusKm = 10,
  limit = 20
): Promise<DbResponse<Spot[]>> => {
  const result = await supabase
    .rpc('find_nearby_spots', {
      user_lat: latitude,
      user_lon: longitude,
      radius_km: radiusKm,
      limit_count: limit
    });

  const { data, error } = result as { data: Spot[] | null; error: { message: string } | null };
  return { data, error: error?.message || null };
};

/**
 * Create a new spot
 */
export const createSpot = async (spotData: Partial<Spot>): Promise<DbResponse<Spot>> => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { data: null, error: 'Not authenticated' };

  const result = await supabase
    .from('spots')
    .insert({
      creator_id: user.id,
      ...spotData
    })
    .select(`
      *,
      creator:profiles(id, username, full_name, avatar_url, is_verified)
    `)
    .single();

  const { data, error } = result as { data: Spot | null; error: { message: string } | null };
  return { data, error: error?.message || null };
};

/**
 * Update a spot
 */
export const updateSpot = async (spotId: string, updates: Partial<Spot>): Promise<DbResponse<Spot>> => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { data: null, error: 'Not authenticated' };

  const result = await supabase
    .from('spots')
    .update(updates)
    .eq('id', spotId)
    .eq('creator_id', user.id)
    .select(`
      *,
      creator:profiles(id, username, full_name, avatar_url, is_verified)
    `)
    .single();

  const { data, error } = result as { data: Spot | null; error: { message: string } | null };
  return { data, error: error?.message || null };
};

/**
 * Delete a spot
 */
export const deleteSpot = async (spotId: string): Promise<{ error: string | null }> => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const result = await supabase
    .from('spots')
    .delete()
    .eq('id', spotId)
    .eq('creator_id', user.id);

  const { error } = result as { error: { message: string } | null };
  return { error: error?.message || null };
};

// ============================================
// SPOT SAVES (Bookmarks)
// ============================================

/**
 * Save a spot
 */
export const saveSpot = async (spotId: string): Promise<DbResponse<{ id: string }>> => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { data: null, error: 'Not authenticated' };

  const result = await supabase
    .from('spot_saves')
    .insert({
      user_id: user.id,
      spot_id: spotId
    })
    .select('id')
    .single();

  const { data, error } = result as { data: { id: string } | null; error: { message: string } | null };
  return { data, error: error?.message || null };
};

/**
 * Unsave a spot
 */
export const unsaveSpot = async (spotId: string): Promise<{ error: string | null }> => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const result = await supabase
    .from('spot_saves')
    .delete()
    .match({
      user_id: user.id,
      spot_id: spotId
    });

  const { error } = result as { error: { message: string } | null };
  return { error: error?.message || null };
};

/**
 * Check if current user saved a spot
 */
export const hasSavedSpot = async (spotId: string): Promise<{ saved: boolean }> => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { saved: false };

  const result = await supabase
    .from('spot_saves')
    .select('id')
    .match({
      user_id: user.id,
      spot_id: spotId
    })
    .single();

  const { data } = result as { data: { id: string } | null };
  return { saved: !!data };
};

/**
 * Get user's saved spots
 */
export const getSavedSpots = async (page = 0, limit = 20): Promise<DbResponse<Spot[]>> => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { data: null, error: 'Not authenticated' };

  const from = page * limit;
  const to = from + limit - 1;

  const result = await supabase
    .from('spot_saves')
    .select(`
      spot:spots(
        *,
        creator:profiles(id, username, full_name, avatar_url, is_verified)
      )
    `)
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .range(from, to);

  const { data, error } = result as { data: Array<{ spot: Spot }> | null; error: { message: string } | null };
  return { data: data?.map(d => d.spot) || null, error: error?.message || null };
};

// ============================================
// SPOT REVIEWS
// ============================================

/**
 * Get reviews for a spot
 */
export const getSpotReviews = async (spotId: string, page = 0, limit = 20): Promise<DbResponse<SpotReview[]>> => {
  const from = page * limit;
  const to = from + limit - 1;

  const result = await supabase
    .from('spot_reviews')
    .select(`
      *,
      user:profiles(id, username, full_name, avatar_url, is_verified)
    `)
    .eq('spot_id', spotId)
    .order('created_at', { ascending: false })
    .range(from, to);

  const { data, error } = result as { data: SpotReview[] | null; error: { message: string } | null };
  return { data, error: error?.message || null };
};

/**
 * Add a review to a spot
 */
export const addSpotReview = async (
  spotId: string,
  rating: number,
  comment?: string,
  images?: string[]
): Promise<DbResponse<SpotReview>> => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { data: null, error: 'Not authenticated' };

  const result = await supabase
    .from('spot_reviews')
    .insert({
      user_id: user.id,
      spot_id: spotId,
      rating,
      comment,
      images
    })
    .select(`
      *,
      user:profiles(id, username, full_name, avatar_url, is_verified)
    `)
    .single();

  const { data, error } = result as { data: SpotReview | null; error: { message: string } | null };
  return { data, error: error?.message || null };
};

/**
 * Update a review
 */
export const updateSpotReview = async (
  spotId: string,
  updates: { rating?: number; comment?: string; images?: string[] }
): Promise<DbResponse<SpotReview>> => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { data: null, error: 'Not authenticated' };

  const result = await supabase
    .from('spot_reviews')
    .update(updates)
    .match({
      user_id: user.id,
      spot_id: spotId
    })
    .select(`
      *,
      user:profiles(id, username, full_name, avatar_url, is_verified)
    `)
    .single();

  const { data, error } = result as { data: SpotReview | null; error: { message: string } | null };
  return { data, error: error?.message || null };
};

/**
 * Delete a review
 */
export const deleteSpotReview = async (spotId: string): Promise<{ error: string | null }> => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const result = await supabase
    .from('spot_reviews')
    .delete()
    .match({
      user_id: user.id,
      spot_id: spotId
    });

  const { error } = result as { error: { message: string } | null };
  return { error: error?.message || null };
};

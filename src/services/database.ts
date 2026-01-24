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

// Export supabase for direct access when needed
export { supabase };

/**
 * Get current authenticated user ID
 */
export const getCurrentUserId = async (): Promise<string | null> => {
  const { data: { user } } = await supabase.auth.getUser();
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
 * Extended Profile type with follow status
 */
export interface ProfileWithFollowStatus extends Profile {
  is_following?: boolean;
}

/**
 * Search profiles by username or full_name
 * Results are sorted with verified accounts first
 */
export const searchProfiles = async (
  query: string,
  limit = 20,
  offset = 0
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
    .range(offset, offset + limit - 1);

  const { data, error } = result as { data: Profile[] | null; error: { message: string } | null };
  return { data: data || [], error: error?.message || null };
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

  const searchTerm = query.trim().toLowerCase();

  const result = await supabase
    .from('posts')
    .select(`
      *,
      author:profiles!posts_author_id_fkey(
        id, username, full_name, avatar_url, is_verified, account_type, is_bot
      )
    `)
    .or(`content.ilike.%${searchTerm}%,caption.ilike.%${searchTerm}%`)
    .eq('visibility', 'public')
    .is('is_peak', false)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  const { data, error } = result as { data: Post[] | null; error: { message: string } | null };
  return { data: data || [], error: error?.message || null };
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

  const searchTerm = query.trim().toLowerCase();

  const result = await supabase
    .from('posts')
    .select(`
      *,
      author:profiles!posts_author_id_fkey(
        id, username, full_name, avatar_url, is_verified, account_type, is_bot
      )
    `)
    .or(`content.ilike.%${searchTerm}%,caption.ilike.%${searchTerm}%`)
    .eq('visibility', 'public')
    .eq('is_peak', true)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  const { data, error } = result as { data: Post[] | null; error: { message: string } | null };
  return { data: data || [], error: error?.message || null };
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

  // Remove # if present and lowercase
  const tag = hashtag.trim().replace(/^#/, '').toLowerCase();

  const result = await supabase
    .from('posts')
    .select(`
      *,
      author:profiles!posts_author_id_fkey(
        id, username, full_name, avatar_url, is_verified, account_type, is_bot
      )
    `)
    .or(`content.ilike.%#${tag}%,caption.ilike.%#${tag}%`)
    .eq('visibility', 'public')
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  const { data, error } = result as { data: Post[] | null; error: { message: string } | null };
  return { data: data || [], error: error?.message || null };
};

/**
 * Get trending hashtags
 */
export const getTrendingHashtags = async (limit = 10): Promise<DbResponse<{ tag: string; count: number }[]>> => {
  // Get recent posts and extract hashtags
  const { data: posts, error } = await supabase
    .from('posts')
    .select('content, caption')
    .eq('visibility', 'public')
    .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()) // Last 7 days
    .limit(500);

  if (error) {
    return { data: [], error: error.message };
  }

  // Extract and count hashtags
  const hashtagCounts: Record<string, number> = {};
  const hashtagRegex = /#(\w+)/g;

  (posts || []).forEach(post => {
    const text = (post.content || '') + ' ' + (post.caption || '');
    let match;
    while ((match = hashtagRegex.exec(text)) !== null) {
      const tag = match[1].toLowerCase();
      hashtagCounts[tag] = (hashtagCounts[tag] || 0) + 1;
    }
  });

  // Sort by count and return top hashtags
  const trending = Object.entries(hashtagCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([tag, count]) => ({ tag, count }));

  return { data: trending, error: null };
};

/**
 * Optimized profile search with follow status included
 * Uses trigram index for fast fuzzy matching
 */
export const searchProfilesOptimized = async (
  query: string,
  limit = 20
): Promise<DbResponse<ProfileWithFollowStatus[]>> => {
  if (!query || query.trim().length === 0) {
    return { data: [], error: null };
  }

  const { data: { user } } = await supabase.auth.getUser();
  const searchTerm = query.trim();

  // Try optimized RPC function first
  if (user) {
    const { data: rpcData, error: rpcError } = await supabase
      .rpc('search_profiles_optimized', {
        p_search_term: searchTerm,
        p_current_user_id: user.id,
        p_limit: limit
      });

    if (!rpcError && rpcData) {
      const profiles: ProfileWithFollowStatus[] = (rpcData as Array<Record<string, unknown>>).map(row => ({
        id: row.id as string,
        username: row.username as string,
        full_name: row.full_name as string,
        avatar_url: row.avatar_url as string | null,
        is_verified: row.is_verified as boolean,
        account_type: row.account_type as 'personal' | 'pro_creator' | 'pro_local',
        fan_count: row.fan_count as number,
        is_following: row.is_following as boolean,
      }));
      return { data: profiles, error: null };
    }
  }

  // Fallback to regular search
  const { data, error } = await searchProfiles(query, limit);
  return { data: data as ProfileWithFollowStatus[], error };
};

/**
 * Get suggested profiles (for discovery/explore)
 * Smart algorithm that prioritizes:
 * 1. Mutual connections (friends of friends)
 * 2. Common interests
 * 3. Verified accounts
 */
export const getSuggestedProfiles = async (limit = 10, offset = 0): Promise<DbResponse<Profile[]>> => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { data: [], error: 'Not authenticated' };

  // Get current user's profile for interests
  const { data: currentProfile } = await supabase
    .from('profiles')
    .select('interests')
    .eq('id', user.id)
    .single();

  const userInterests = currentProfile?.interests || [];

  // Get list of users the current user already follows
  const followsResult = await supabase
    .from('follows')
    .select('following_id')
    .eq('follower_id', user.id);

  const followedIds = (followsResult.data || []).map(f => f.following_id);
  const excludeIds = [user.id, ...followedIds];
  const excludeIdsStr = excludeIds.length > 0 ? excludeIds.join(',') : '00000000-0000-0000-0000-000000000000';

  // Get friends of friends (mutual connections)
  // People followed by people you follow
  let mutualProfiles: Profile[] = [];
  if (followedIds.length > 0) {
    const mutualResult = await supabase
      .from('follows')
      .select('following_id')
      .in('follower_id', followedIds)
      .not('following_id', 'in', `(${excludeIdsStr})`);

    const mutualIds = [...new Set((mutualResult.data || []).map(f => f.following_id))];

    if (mutualIds.length > 0) {
      const mutualProfilesResult = await supabase
        .from('profiles')
        .select('*')
        .in('id', mutualIds)
        .limit(Math.ceil(limit * 0.4)); // 40% mutual connections

      mutualProfiles = (mutualProfilesResult.data || []) as Profile[];
    }
  }

  const usedIds = [...excludeIds, ...mutualProfiles.map(p => p.id)];
  const usedIdsStr = usedIds.length > 0 ? usedIds.join(',') : '00000000-0000-0000-0000-000000000000';
  const remainingAfterMutual = limit - mutualProfiles.length;

  // Get profiles with common interests
  let interestProfiles: Profile[] = [];
  if (userInterests.length > 0 && remainingAfterMutual > 0) {
    const interestResult = await supabase
      .from('profiles')
      .select('*')
      .not('id', 'in', `(${usedIdsStr})`)
      .overlaps('interests', userInterests)
      .limit(Math.ceil(remainingAfterMutual * 0.5)); // 50% of remaining

    interestProfiles = (interestResult.data || []) as Profile[];
  }

  const usedIds2 = [...usedIds, ...interestProfiles.map(p => p.id)];
  const usedIdsStr2 = usedIds2.length > 0 ? usedIds2.join(',') : '00000000-0000-0000-0000-000000000000';
  const remainingAfterInterests = limit - mutualProfiles.length - interestProfiles.length;

  // Fill remaining with verified profiles
  let verifiedProfiles: Profile[] = [];
  if (remainingAfterInterests > 0) {
    const verifiedResult = await supabase
      .from('profiles')
      .select('*')
      .not('id', 'in', `(${usedIdsStr2})`)
      .eq('is_verified', true)
      .limit(remainingAfterInterests);

    verifiedProfiles = (verifiedResult.data || []) as Profile[];
  }

  const usedIds3 = [...usedIds2, ...verifiedProfiles.map(p => p.id)];
  const usedIdsStr3 = usedIds3.length > 0 ? usedIds3.join(',') : '00000000-0000-0000-0000-000000000000';
  const finalRemaining = limit - mutualProfiles.length - interestProfiles.length - verifiedProfiles.length;

  // Fill any remaining spots with other profiles
  let otherProfiles: Profile[] = [];
  if (finalRemaining > 0) {
    const otherResult = await supabase
      .from('profiles')
      .select('*')
      .not('id', 'in', `(${usedIdsStr3})`)
      .order('fan_count', { ascending: false })
      .limit(finalRemaining);

    otherProfiles = (otherResult.data || []) as Profile[];
  }

  // Combine all and shuffle for variety
  const allSuggestions = [...mutualProfiles, ...interestProfiles, ...verifiedProfiles, ...otherProfiles];

  // For pagination with offset > 0, fetch additional profiles sorted by fan_count
  if (offset > 0) {
    const paginatedResult = await supabase
      .from('profiles')
      .select('*')
      .not('id', 'eq', user.id)
      .not('id', 'in', `(${[...followedIds, user.id].join(',') || '00000000-0000-0000-0000-000000000000'})`)
      .order('fan_count', { ascending: false })
      .range(offset, offset + limit - 1);

    const paginatedData = (paginatedResult.data || []) as Profile[];
    return { data: paginatedData, error: null };
  }

  // First page: shuffle for variety
  const shuffled = allSuggestions.sort(() => Math.random() - 0.5);
  return { data: shuffled.slice(0, limit), error: null };
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
 * Extended Post type with pre-computed interaction status
 */
export interface PostWithStatus extends Post {
  has_liked?: boolean;
  has_saved?: boolean;
}

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
 * Get optimized feed with likes/saves status included (single query!)
 * Uses PostgreSQL function for maximum performance
 */
export const getOptimizedFeed = async (page = 0, limit = 20): Promise<DbResponse<PostWithStatus[]>> => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { data: null, error: 'Not authenticated' };

  const offset = page * limit;

  // Try optimized RPC function first
  const { data: rpcData, error: rpcError } = await supabase
    .rpc('get_optimized_feed', {
      p_user_id: user.id,
      p_limit: limit,
      p_offset: offset
    });

  if (!rpcError && rpcData) {
    // Transform RPC result to Post format
    const posts: PostWithStatus[] = (rpcData as Array<Record<string, unknown>>).map(row => ({
      id: row.id as string,
      author_id: row.author_id as string,
      content: row.content as string,
      media_urls: row.media_urls as string[],
      tags: row.tags as string[],
      visibility: row.visibility as 'public' | 'private' | 'fans',
      is_peak: row.is_peak as boolean,
      likes_count: row.likes_count as number,
      comments_count: row.comments_count as number,
      views_count: row.views_count as number,
      created_at: row.created_at as string,
      has_liked: row.has_liked as boolean,
      has_saved: row.has_saved as boolean,
      author: {
        id: row.author_id as string,
        username: row.author_username as string,
        full_name: row.author_full_name as string,
        avatar_url: row.author_avatar_url as string | null,
        is_verified: row.author_is_verified as boolean,
        account_type: row.author_account_type as 'personal' | 'pro_creator' | 'pro_local' | undefined,
      }
    }));
    return { data: posts, error: null };
  }

  // Fallback to regular query + batch check
  const { data: posts, error } = await getFeedPosts(page, limit);
  if (error || !posts) return { data: null, error };

  // Batch check likes and saves
  const postIds = posts.map(p => p.id);
  const [likedMap, savedMap] = await Promise.all([
    hasLikedPostsBatch(postIds),
    hasSavedPostsBatch(postIds)
  ]);

  const postsWithStatus: PostWithStatus[] = posts.map(post => ({
    ...post,
    has_liked: likedMap.get(post.id) || false,
    has_saved: savedMap.get(post.id) || false,
  }));

  return { data: postsWithStatus, error: null };
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
// Shared cache for followed user IDs (used by both FanFeed and VibesFeed)
let followedUsersCacheShared: { ids: string[]; timestamp: number; userId: string | null } = {
  ids: [],
  timestamp: 0,
  userId: null,
};
const CACHE_DURATION_SHARED = 2 * 60 * 1000; // 2 minutes

// Helper to get followed user IDs with caching
const getFollowedUserIds = async (userId: string): Promise<string[]> => {
  const now = Date.now();

  // Use cache if valid
  if (
    followedUsersCacheShared.userId === userId &&
    now - followedUsersCacheShared.timestamp < CACHE_DURATION_SHARED &&
    followedUsersCacheShared.ids.length > 0
  ) {
    return followedUsersCacheShared.ids;
  }

  // Fetch fresh data
  const { data: followsData } = await supabase
    .from('follows')
    .select('following_id')
    .eq('follower_id', userId);

  const ids = followsData?.map(f => f.following_id) || [];

  // Update cache
  followedUsersCacheShared = {
    ids,
    timestamp: now,
    userId,
  };

  return ids;
};

// Clear cache when user follows/unfollows someone
export const clearFollowCache = () => {
  followedUsersCacheShared = { ids: [], timestamp: 0, userId: null };
};

export const getFeedFromFollowed = async (page = 0, limit = 10): Promise<DbResponse<Post[]>> => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { data: null, error: 'Not authenticated' };

  const from = page * limit;
  const to = from + limit - 1;

  // Get followed user IDs (cached)
  const followedIds = await getFollowedUserIds(user.id);

  // If not following anyone, return empty array
  if (followedIds.length === 0) {
    return { data: [], error: null };
  }

  // Get posts from followed users
  const result = await supabase
    .from('posts')
    .select(`
      *,
      author:profiles!posts_author_id_fkey(id, username, full_name, avatar_url, is_verified, account_type)
    `)
    .in('author_id', followedIds)
    .in('visibility', ['public', 'fans'])
    .order('created_at', { ascending: false })
    .range(from, to);

  const { data, error } = result as { data: Post[] | null; error: { message: string } | null };
  return { data, error: error?.message || null };
};

/**
 * Get optimized FanFeed with likes/saves status included (single query!)
 * Uses PostgreSQL function for maximum performance
 */
export const getOptimizedFanFeed = async (page = 0, limit = 20): Promise<DbResponse<PostWithStatus[]>> => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { data: null, error: 'Not authenticated' };

  const offset = page * limit;

  // Try optimized RPC function first
  const { data: rpcData, error: rpcError } = await supabase
    .rpc('get_fan_feed', {
      p_user_id: user.id,
      p_limit: limit,
      p_offset: offset
    });

  if (!rpcError && rpcData && Array.isArray(rpcData)) {
    // If empty, it might mean no follows yet
    if (rpcData.length === 0) {
      return { data: [], error: null };
    }

    // Transform RPC result to Post format
    const posts: PostWithStatus[] = rpcData.map((row: Record<string, unknown>) => ({
      id: row.id as string,
      author_id: row.author_id as string,
      content: row.content as string,
      media_urls: row.media_urls as string[],
      tags: row.tags as string[],
      visibility: row.visibility as 'public' | 'private' | 'fans',
      is_peak: row.is_peak as boolean,
      likes_count: row.likes_count as number,
      comments_count: row.comments_count as number,
      views_count: row.views_count as number,
      created_at: row.created_at as string,
      has_liked: row.has_liked as boolean,
      has_saved: row.has_saved as boolean,
      author: {
        id: row.author_id as string,
        username: row.author_username as string,
        full_name: row.author_full_name as string,
        avatar_url: row.author_avatar_url as string | null,
        is_verified: row.author_is_verified as boolean,
        account_type: row.author_account_type as 'personal' | 'pro_creator' | 'pro_local' | undefined,
      }
    }));
    return { data: posts, error: null };
  }

  // Fallback to regular query + batch check
  const { data: posts, error } = await getFeedFromFollowed(page, limit);
  if (error || !posts) return { data: posts as PostWithStatus[] | null, error };

  // If no posts, return empty
  if (posts.length === 0) {
    return { data: [], error: null };
  }

  // Batch check likes and saves
  const postIds = posts.map(p => p.id);
  const [likedMap, savedMap] = await Promise.all([
    hasLikedPostsBatch(postIds),
    hasSavedPostsBatch(postIds)
  ]);

  const postsWithStatus: PostWithStatus[] = posts.map(post => ({
    ...post,
    has_liked: likedMap.get(post.id) || false,
    has_saved: savedMap.get(post.id) || false,
  }));

  return { data: postsWithStatus, error: null };
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

  // Get followed user IDs using shared cache
  const followedUserIds = currentUserId ? await getFollowedUserIds(currentUserId) : [];

  // Build exclusion list (current user + followed users)
  const excludeUserIds = [currentUserId, ...followedUserIds].filter(Boolean) as string[];
  const excludeList = excludeUserIds.length > 0
    ? excludeUserIds.join(',')
    : '00000000-0000-0000-0000-000000000000';

  // If specific interests are selected, filter by those
  if (selectedInterests.length > 0) {
    // Get posts matching selected interests (excluding followed users)
    const interestResult = await supabase
      .from('posts')
      .select(`
        *,
        author:profiles!posts_author_id_fkey(id, username, full_name, avatar_url, is_verified, account_type)
      `)
      .eq('visibility', 'public')
      .not('author_id', 'in', `(${excludeList})`)
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
        author:profiles!posts_author_id_fkey(id, username, full_name, avatar_url, is_verified, account_type)
      `)
      .eq('visibility', 'public')
      .not('author_id', 'in', `(${excludeList})`)
      .not('id', 'in', `(${fetchedIds.length > 0 ? fetchedIds.join(',') : '00000000-0000-0000-0000-000000000000'})`)
      .order('likes_count', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(fillCount);

    const fillPosts = (fillResult.data || []) as Post[];
    return { data: [...interestPosts, ...fillPosts], error: null };
  }

  // No specific filter: get all public posts, prioritize those with matching interests
  if (page === 0) {
    // First, get ALL public posts (no tag filter) to ensure content is shown
    const allPostsResult = await supabase
      .from('posts')
      .select(`
        *,
        author:profiles!posts_author_id_fkey(id, username, full_name, avatar_url, is_verified, account_type)
      `)
      .eq('visibility', 'public')
      .not('author_id', 'in', `(${excludeList})`)
      .order('likes_count', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(limit);

    const allPosts = (allPostsResult.data || []) as Post[];

    // If user has interests, sort to prioritize matching posts
    if (userInterests.length > 0 && allPosts.length > 0) {
      const sortedPosts = allPosts.sort((a, b) => {
        const aMatches = a.tags?.some(tag => userInterests.includes(tag)) ? 1 : 0;
        const bMatches = b.tags?.some(tag => userInterests.includes(tag)) ? 1 : 0;
        return bMatches - aMatches; // Posts with matching interests first
      });
      return { data: sortedPosts, error: null };
    }

    return { data: allPosts, error: allPostsResult.error?.message || null };
  }

  // Default: all public posts ordered by popularity (excluding followed users)
  const result = await supabase
    .from('posts')
    .select(`
      *,
      author:profiles!posts_author_id_fkey(id, username, full_name, avatar_url, is_verified, account_type)
    `)
    .eq('visibility', 'public')
    .not('author_id', 'in', `(${excludeList})`)
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

/**
 * Check if current user liked multiple posts at once (batch operation - much faster!)
 * Returns a Map of postId -> hasLiked
 */
export const hasLikedPostsBatch = async (postIds: string[]): Promise<Map<string, boolean>> => {
  const { data: { user } } = await supabase.auth.getUser();
  const resultMap = new Map<string, boolean>();

  if (!user || postIds.length === 0) {
    postIds.forEach(id => resultMap.set(id, false));
    return resultMap;
  }

  // Try to use the optimized RPC function first
  const { data: rpcData, error: rpcError } = await supabase
    .rpc('check_likes_batch', {
      p_user_id: user.id,
      p_post_ids: postIds
    });

  if (!rpcError && rpcData) {
    // RPC function available - use optimized result
    (rpcData as Array<{ post_id: string; has_liked: boolean }>).forEach(row => {
      resultMap.set(row.post_id, row.has_liked);
    });
    return resultMap;
  }

  // Fallback: single query to get all liked posts
  const { data } = await supabase
    .from('likes')
    .select('post_id')
    .eq('user_id', user.id)
    .in('post_id', postIds);

  const likedPostIds = new Set((data || []).map(l => l.post_id));
  postIds.forEach(id => resultMap.set(id, likedPostIds.has(id)));

  return resultMap;
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
 * Check if current user saved multiple posts at once (batch operation - much faster!)
 * Returns a Map of postId -> saved
 */
export const hasSavedPostsBatch = async (postIds: string[]): Promise<Map<string, boolean>> => {
  const { data: { user } } = await supabase.auth.getUser();
  const resultMap = new Map<string, boolean>();

  if (!user || postIds.length === 0) {
    postIds.forEach(id => resultMap.set(id, false));
    return resultMap;
  }

  // Single query to get all saved posts
  const { data } = await supabase
    .from('post_saves')
    .select('post_id')
    .eq('user_id', user.id)
    .in('post_id', postIds);

  const savedPostIds = new Set((data || []).map(s => s.post_id));
  postIds.forEach(id => resultMap.set(id, savedPostIds.has(id)));

  return resultMap;
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
export const followUser = async (userIdToFollow: string): Promise<DbResponse<Follow> & { requestCreated?: boolean }> => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { data: null, error: 'Not authenticated' };

  // Clear cache when following someone
  clearFollowCache();

  // Helper to update counts after successful follow
  const updateCounts = async () => {
    // Increment fan_count for the followed user
    const { data: targetProfile } = await supabase
      .from('profiles')
      .select('fan_count')
      .eq('id', userIdToFollow)
      .single();

    if (targetProfile) {
      await supabase
        .from('profiles')
        .update({ fan_count: (targetProfile.fan_count || 0) + 1 })
        .eq('id', userIdToFollow);
    }

    // Increment following_count for current user
    const { data: myProfile } = await supabase
      .from('profiles')
      .select('following_count')
      .eq('id', user.id)
      .single();

    if (myProfile) {
      await supabase
        .from('profiles')
        .update({ following_count: (myProfile.following_count || 0) + 1 })
        .eq('id', user.id);
    }
  };

  // Use the RPC function that handles private accounts
  const { data: rpcResult, error: rpcError } = await supabase
    .rpc('create_follow_or_request', { target_user_id: userIdToFollow });

  if (rpcError) {
    // Fallback to direct insert for backwards compatibility
    const result = await supabase
      .from('follows')
      .insert({
        follower_id: user.id,
        following_id: userIdToFollow
      })
      .select()
      .single();

    const { data, error } = result as { data: Follow | null; error: { message: string } | null };

    // Update counts after successful follow
    if (!error) {
      await updateCounts();
    }

    return { data, error: error?.message || null };
  }

  const result = rpcResult as FollowResult;

  if (!result.success) {
    return { data: null, error: result.error || 'Failed to follow' };
  }

  // If a request was created (private account), return success with flag
  if (result.type === 'request_created') {
    return { data: null, error: null, requestCreated: true };
  }

  // For direct follow, update counts
  if (result.type === 'followed') {
    await updateCounts();
  }

  // For direct follow or already following, return success
  return { data: null, error: null, requestCreated: false };
};

/**
 * Unfollow a user
 */
export const unfollowUser = async (userIdToUnfollow: string): Promise<{ error: string | null }> => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  // Clear cache when unfollowing someone
  clearFollowCache();

  const result = await supabase
    .from('follows')
    .delete()
    .match({
      follower_id: user.id,
      following_id: userIdToUnfollow
    });

  const { error } = result as { error: { message: string } | null };

  // Update counts after successful unfollow
  if (!error) {
    // Decrement fan_count for the unfollowed user
    const { data: targetProfile } = await supabase
      .from('profiles')
      .select('fan_count')
      .eq('id', userIdToUnfollow)
      .single();

    if (targetProfile && (targetProfile.fan_count || 0) > 0) {
      await supabase
        .from('profiles')
        .update({ fan_count: (targetProfile.fan_count || 0) - 1 })
        .eq('id', userIdToUnfollow);
    }

    // Decrement following_count for current user
    const { data: myProfile } = await supabase
      .from('profiles')
      .select('following_count')
      .eq('id', user.id)
      .single();

    if (myProfile && (myProfile.following_count || 0) > 0) {
      await supabase
        .from('profiles')
        .update({ following_count: (myProfile.following_count || 0) - 1 })
        .eq('id', user.id);
    }
  }

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

// ============================================
// FOLLOW REQUESTS (for private accounts)
// ============================================

/**
 * Check if current user has a pending follow request to a user
 */
export const hasPendingFollowRequest = async (targetUserId: string): Promise<{ pending: boolean }> => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { pending: false };

  const { data, error } = await supabase
    .rpc('has_pending_request', { target_user_id: targetUserId });

  if (error) {
    // Fallback to direct query
    const result = await supabase
      .from('follow_requests')
      .select('id')
      .match({
        requester_id: user.id,
        target_id: targetUserId,
        status: 'pending'
      })
      .single();

    return { pending: !!result.data };
  }

  return { pending: !!data };
};

/**
 * Cancel a pending follow request
 */
export const cancelFollowRequest = async (targetUserId: string): Promise<{ error: string | null }> => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const { data, error } = await supabase
    .rpc('cancel_follow_request', { target_user_id: targetUserId });

  if (error) {
    return { error: error.message };
  }

  const result = data as { success: boolean; error?: string };
  return { error: result.success ? null : (result.error || 'Failed to cancel request') };
};

/**
 * Get pending follow requests received by current user
 */
export const getPendingFollowRequests = async (): Promise<DbResponse<FollowRequest[]>> => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { data: null, error: 'Not authenticated' };

  const result = await supabase
    .from('follow_requests')
    .select(`
      *,
      requester:profiles!follow_requests_requester_id_fkey(
        id, username, full_name, avatar_url, is_verified, account_type
      )
    `)
    .eq('target_id', user.id)
    .eq('status', 'pending')
    .order('created_at', { ascending: false });

  const { data, error } = result as { data: FollowRequest[] | null; error: { message: string } | null };
  return { data, error: error?.message || null };
};

/**
 * Get count of pending follow requests
 */
export const getPendingFollowRequestsCount = async (): Promise<number> => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return 0;

  const { data, error } = await supabase
    .rpc('get_pending_requests_count');

  if (error) {
    // Fallback to direct count
    const result = await supabase
      .from('follow_requests')
      .select('id', { count: 'exact', head: true })
      .eq('target_id', user.id)
      .eq('status', 'pending');

    return result.count || 0;
  }

  return data || 0;
};

/**
 * Accept a follow request
 */
export const acceptFollowRequest = async (requestId: string): Promise<{ error: string | null }> => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const { data, error } = await supabase
    .rpc('accept_follow_request', { request_id: requestId });

  if (error) {
    return { error: error.message };
  }

  const result = data as { success: boolean; error?: string };
  return { error: result.success ? null : (result.error || 'Failed to accept request') };
};

/**
 * Decline a follow request
 */
export const declineFollowRequest = async (requestId: string): Promise<{ error: string | null }> => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const { data, error } = await supabase
    .rpc('decline_follow_request', { request_id: requestId });

  if (error) {
    return { error: error.message };
  }

  const result = data as { success: boolean; error?: string };
  return { error: result.success ? null : (result.error || 'Failed to decline request') };
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

// ============================================
// BLOCKED USERS
// ============================================

export interface BlockedUser {
  id: string;
  user_id: string;
  blocked_user_id: string;
  created_at: string;
  blocked_user?: Profile;
}

/**
 * Block a user
 */
export const blockUser = async (userIdToBlock: string): Promise<DbResponse<BlockedUser>> => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { data: null, error: 'Not authenticated' };

  const result = await supabase
    .from('blocked_users')
    .insert({
      user_id: user.id,
      blocked_user_id: userIdToBlock
    })
    .select()
    .single();

  const { data, error } = result as { data: BlockedUser | null; error: { message: string } | null };
  return { data, error: error?.message || null };
};

/**
 * Unblock a user
 */
export const unblockUser = async (userIdToUnblock: string): Promise<{ error: string | null }> => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const result = await supabase
    .from('blocked_users')
    .delete()
    .match({
      user_id: user.id,
      blocked_user_id: userIdToUnblock
    });

  const { error } = result as { error: { message: string } | null };
  return { error: error?.message || null };
};

/**
 * Check if current user has blocked a user
 */
export const isUserBlocked = async (userId: string): Promise<{ blocked: boolean }> => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { blocked: false };

  const result = await supabase
    .from('blocked_users')
    .select('id')
    .match({
      user_id: user.id,
      blocked_user_id: userId
    })
    .single();

  const { data } = result as { data: { id: string } | null };
  return { blocked: !!data };
};

/**
 * Get all blocked users with their profiles
 */
export const getBlockedUsers = async (): Promise<DbResponse<BlockedUser[]>> => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { data: null, error: 'Not authenticated' };

  const result = await supabase
    .from('blocked_users')
    .select(`
      *,
      blocked_user:profiles!blocked_users_blocked_user_id_fkey(id, username, full_name, avatar_url, is_verified)
    `)
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  const { data, error } = result as { data: BlockedUser[] | null; error: { message: string } | null };
  return { data, error: error?.message || null };
};

// ============================================
// MUTED USERS
// ============================================

export interface MutedUser {
  id: string;
  user_id: string;
  muted_user_id: string;
  created_at: string;
  muted_user?: Profile;
}

/**
 * Mute a user
 */
export const muteUser = async (userIdToMute: string): Promise<DbResponse<MutedUser>> => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { data: null, error: 'Not authenticated' };

  const result = await supabase
    .from('muted_users')
    .insert({
      user_id: user.id,
      muted_user_id: userIdToMute
    })
    .select()
    .single();

  const { data, error } = result as { data: MutedUser | null; error: { message: string } | null };
  return { data, error: error?.message || null };
};

/**
 * Unmute a user
 */
export const unmuteUser = async (userIdToUnmute: string): Promise<{ error: string | null }> => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const result = await supabase
    .from('muted_users')
    .delete()
    .match({
      user_id: user.id,
      muted_user_id: userIdToUnmute
    });

  const { error } = result as { error: { message: string } | null };
  return { error: error?.message || null };
};

/**
 * Get all muted users with their profiles
 */
export const getMutedUsers = async (): Promise<DbResponse<MutedUser[]>> => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { data: null, error: 'Not authenticated' };

  const result = await supabase
    .from('muted_users')
    .select(`
      *,
      muted_user:profiles!muted_users_muted_user_id_fkey(id, username, full_name, avatar_url, is_verified)
    `)
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  const { data, error } = result as { data: MutedUser[] | null; error: { message: string } | null };
  return { data, error: error?.message || null };
};

// ============================================
// REPORTS
// ============================================

export type ReportType = 'post' | 'user' | 'comment' | 'message';
export type ReportStatus = 'pending' | 'under_review' | 'resolved' | 'dismissed';

export interface Report {
  id: string;
  reporter_id: string;
  reported_content_id?: string;
  reported_user_id?: string;
  report_type: ReportType;
  reason: string;
  details?: string;
  status: ReportStatus;
  created_at: string;
  updated_at: string;
}

/**
 * Report a post
 */
export const reportPost = async (postId: string, reason: string, details?: string): Promise<DbResponse<Report>> => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { data: null, error: 'Not authenticated' };

  const result = await supabase
    .from('reports')
    .insert({
      reporter_id: user.id,
      reported_content_id: postId,
      report_type: 'post',
      reason,
      details
    })
    .select()
    .single();

  const { data, error } = result as { data: Report | null; error: { message: string } | null };

  // Check for duplicate report error
  if (error?.message?.includes('duplicate') || error?.message?.includes('unique')) {
    return { data: null, error: 'already_reported' };
  }

  return { data, error: error?.message || null };
};

/**
 * Report a user
 */
export const reportUser = async (userId: string, reason: string, details?: string): Promise<DbResponse<Report>> => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { data: null, error: 'Not authenticated' };

  const result = await supabase
    .from('reports')
    .insert({
      reporter_id: user.id,
      reported_user_id: userId,
      report_type: 'user',
      reason,
      details
    })
    .select()
    .single();

  const { data, error } = result as { data: Report | null; error: { message: string } | null };

  // Check for duplicate report error
  if (error?.message?.includes('duplicate') || error?.message?.includes('unique')) {
    return { data: null, error: 'already_reported' };
  }

  return { data, error: error?.message || null };
};

/**
 * Check if user has already reported a post
 */
export const hasReportedPost = async (postId: string): Promise<{ reported: boolean }> => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { reported: false };

  const result = await supabase
    .from('reports')
    .select('id')
    .match({
      reporter_id: user.id,
      reported_content_id: postId,
      report_type: 'post'
    })
    .single();

  const { data } = result as { data: { id: string } | null };
  return { reported: !!data };
};

/**
 * Check if user has already reported a user
 */
export const hasReportedUser = async (userId: string): Promise<{ reported: boolean }> => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { reported: false };

  const result = await supabase
    .from('reports')
    .select('id')
    .match({
      reporter_id: user.id,
      reported_user_id: userId,
      report_type: 'user'
    })
    .single();

  const { data } = result as { data: { id: string } | null };
  return { reported: !!data };
};

// ============================================
// MESSAGING
// ============================================

export interface Conversation {
  id: string;
  created_at: string;
  updated_at: string;
  last_message_at: string;
  last_message_preview?: string;
  is_group: boolean;
  group_name?: string;
  group_avatar_url?: string;
  participants?: ConversationParticipant[];
  other_user?: Profile; // For direct conversations
  unread_count?: number;
}

export interface ConversationParticipant {
  id: string;
  conversation_id: string;
  user_id: string;
  joined_at: string;
  last_read_at?: string;
  is_muted: boolean;
  user?: Profile;
}

export interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  content?: string;
  media_url?: string;
  media_type?: 'image' | 'video' | 'audio';
  reply_to_id?: string;
  shared_post_id?: string;
  shared_post?: Post;
  is_deleted: boolean;
  created_at: string;
  updated_at: string;
  sender?: Profile;
  reply_to?: Message;
}

/**
 * Get all conversations for current user
 */
export const getConversations = async (): Promise<DbResponse<Conversation[]>> => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { data: null, error: 'Not authenticated' };

  // Get conversations where user is a participant
  const result = await supabase
    .from('conversation_participants')
    .select(`
      conversation:conversations(
        id,
        created_at,
        updated_at,
        last_message_at,
        last_message_preview,
        is_group,
        group_name,
        group_avatar_url
      ),
      last_read_at
    `)
    .eq('user_id', user.id)
    .order('conversation(last_message_at)', { ascending: false });

  const { data, error } = result as {
    data: Array<{
      conversation: Conversation;
      last_read_at: string | null;
    }> | null;
    error: { message: string } | null;
  };

  if (error || !data) {
    return { data: null, error: error?.message || null };
  }

  // Get other participants for each conversation
  const conversations = await Promise.all(
    data.map(async (item) => {
      const conv = item.conversation;

      // Get other participant for direct conversations
      if (!conv.is_group) {
        const { data: participants } = await supabase
          .from('conversation_participants')
          .select(`
            user:profiles(id, username, full_name, avatar_url, is_verified, account_type)
          `)
          .eq('conversation_id', conv.id)
          .neq('user_id', user.id)
          .single();

        if (participants?.user) {
          conv.other_user = participants.user as Profile;
        }
      }

      // Calculate unread count
      const { count } = await supabase
        .from('messages')
        .select('id', { count: 'exact', head: true })
        .eq('conversation_id', conv.id)
        .neq('sender_id', user.id)
        .gt('created_at', item.last_read_at || '1970-01-01');

      conv.unread_count = count || 0;

      return conv;
    })
  );

  return { data: conversations, error: null };
};

/**
 * Get or create a direct conversation with another user
 */
export const getOrCreateConversation = async (otherUserId: string): Promise<DbResponse<string>> => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { data: null, error: 'Not authenticated' };

  const { data, error } = await supabase
    .rpc('get_or_create_conversation', {
      p_user_id: user.id,
      p_other_user_id: otherUserId
    });

  if (error) {
    return { data: null, error: error.message };
  }

  return { data: data as string, error: null };
};

/**
 * Get messages for a conversation
 */
export const getMessages = async (
  conversationId: string,
  page = 0,
  limit = 50
): Promise<DbResponse<Message[]>> => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { data: null, error: 'Not authenticated' };

  const from = page * limit;
  const to = from + limit - 1;

  const result = await supabase
    .from('messages')
    .select(`
      *,
      sender:profiles!messages_sender_id_fkey(id, username, full_name, avatar_url, is_verified, account_type)
    `)
    .eq('conversation_id', conversationId)
    .eq('is_deleted', false)
    .order('created_at', { ascending: false })
    .range(from, to);

  const { data, error } = result as { data: Message[] | null; error: { message: string } | null };

  // Reverse to get oldest first for display
  const messages = data ? [...data].reverse() : null;

  return { data: messages, error: error?.message || null };
};

/**
 * Send a message
 */
export const sendMessage = async (
  conversationId: string,
  content: string,
  mediaUrl?: string,
  mediaType?: 'image' | 'video' | 'audio',
  replyToId?: string,
  sharedPostId?: string
): Promise<DbResponse<Message>> => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    console.error('[sendMessage] Not authenticated');
    return { data: null, error: 'Not authenticated' };
  }

  console.log('[sendMessage] Sending message:', { conversationId, content: content.substring(0, 50), userId: user.id });

  const result = await supabase
    .from('messages')
    .insert({
      conversation_id: conversationId,
      sender_id: user.id,
      content,
      media_url: mediaUrl,
      media_type: mediaType,
      reply_to_id: replyToId,
      shared_post_id: sharedPostId
    })
    .select(`
      *,
      sender:profiles!messages_sender_id_fkey(id, username, full_name, avatar_url, is_verified, account_type)
    `)
    .single();

  const { data, error } = result as { data: Message | null; error: { message: string; code?: string; details?: string; hint?: string } | null };

  if (error) {
    console.error('[sendMessage] Error:', JSON.stringify(error, null, 2));
  }

  return { data, error: error?.message || null };
};

/**
 * Upload voice message to storage
 */
export const uploadVoiceMessage = async (
  uri: string,
  conversationId: string
): Promise<DbResponse<string>> => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { data: null, error: 'Not authenticated' };

  try {
    // Create unique file name
    const fileName = `${conversationId}/${user.id}_${Date.now()}.m4a`;

    // Read file as blob
    const response = await fetch(uri);
    const blob = await response.blob();

    // Upload to Supabase Storage
    const { data, error } = await supabase.storage
      .from('voice-messages')
      .upload(fileName, blob, {
        contentType: 'audio/m4a',
        upsert: false
      });

    if (error) {
      return { data: null, error: error.message };
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from('voice-messages')
      .getPublicUrl(fileName);

    return { data: urlData.publicUrl, error: null };
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : 'Upload failed';
    return { data: null, error: errorMessage };
  }
};

/**
 * Share a post to a conversation
 */
export const sharePostToConversation = async (
  postId: string,
  userId: string
): Promise<DbResponse<Message>> => {
  // First get or create conversation with the user
  const { data: convId, error: convError } = await getOrCreateConversation(userId);
  if (convError || !convId) {
    return { data: null, error: convError || 'Failed to create conversation' };
  }

  // Send message with shared post
  return sendMessage(convId, '', undefined, undefined, undefined, postId);
};

/**
 * Get post by ID (for shared post preview)
 */
export const getPostById = async (postId: string): Promise<DbResponse<Post>> => {
  const result = await supabase
    .from('posts')
    .select(`
      *,
      author:profiles!posts_author_id_fkey(id, username, full_name, avatar_url, is_verified, account_type)
    `)
    .eq('id', postId)
    .single();

  const { data, error } = result as { data: Post | null; error: { message: string } | null };
  return { data, error: error?.message || null };
};

/**
 * Mark conversation as read
 */
export const markConversationAsRead = async (conversationId: string): Promise<{ error: string | null }> => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const result = await supabase
    .from('conversation_participants')
    .update({ last_read_at: new Date().toISOString() })
    .match({
      conversation_id: conversationId,
      user_id: user.id
    });

  const { error } = result as { error: { message: string } | null };
  return { error: error?.message || null };
};

/**
 * Delete a message (soft delete)
 */
export const deleteMessage = async (messageId: string): Promise<{ error: string | null }> => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const result = await supabase
    .from('messages')
    .update({ is_deleted: true, content: null, media_url: null })
    .match({
      id: messageId,
      sender_id: user.id
    });

  const { error } = result as { error: { message: string } | null };
  return { error: error?.message || null };
};

/**
 * Get total unread messages count
 */
export const getUnreadMessagesCount = async (): Promise<{ count: number }> => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { count: 0 };

  const { data, error } = await supabase
    .rpc('get_unread_messages_count', {
      p_user_id: user.id
    });

  if (error) {
    return { count: 0 };
  }

  return { count: data as number };
};

/**
 * Subscribe to new messages in a conversation (real-time)
 */
export const subscribeToMessages = (
  conversationId: string,
  onMessage: (message: Message) => void
) => {
  const channel = supabase
    .channel(`messages:${conversationId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `conversation_id=eq.${conversationId}`
      },
      async (payload) => {
        // Fetch the full message with sender info
        const { data } = await supabase
          .from('messages')
          .select(`
            *,
            sender:profiles!messages_sender_id_fkey(id, username, full_name, avatar_url, is_verified)
          `)
          .eq('id', payload.new.id)
          .single();

        if (data) {
          onMessage(data as Message);
        }
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
};

/**
 * Subscribe to conversation updates (real-time)
 */
export const subscribeToConversations = (
  onUpdate: () => void
) => {
  const channel = supabase
    .channel('conversations_updates')
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'conversations'
      },
      () => {
        onUpdate();
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
};

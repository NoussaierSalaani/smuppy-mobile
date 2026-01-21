// ============================================
// SMUPPY - DATABASE SERVICES
// Connexion frontend <-> Supabase
// ============================================

import { supabase } from '../config/supabase';

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
  fan_count?: number;
  post_count?: number;
  created_at?: string;
  updated_at?: string;
}

export interface Post {
  id: string;
  author_id: string;
  content?: string;
  media_urls?: string[];
  visibility: 'public' | 'private' | 'fans';
  likes_count?: number;
  comments_count?: number;
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
    console.log('[getCurrentProfile] No profile found, creating one...');
    const profileData = {
      id: user.id,
      full_name: user.user_metadata?.full_name || user.email?.split('@')[0] || 'User',
      username: user.email?.split('@')[0]?.toLowerCase().replace(/[^a-z0-9]/g, '') || `user_${Date.now()}`,
      avatar_url: user.user_metadata?.avatar_url || null,
    };
    console.log('[getCurrentProfile] Profile data:', profileData);

    const insertResult = await supabase
      .from('profiles')
      .insert(profileData)
      .select()
      .single();

    const { data: newProfile, error: createError } = insertResult as { data: Profile | null; error: { message: string } | null };

    if (createError) {
      console.error('[getCurrentProfile] Failed to create profile:', createError);
    } else {
      console.log('[getCurrentProfile] Profile created successfully:', newProfile);
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
 * Update current user's profile
 */
export const updateProfile = async (updates: Partial<Profile>): Promise<DbResponse<Profile>> => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { data: null, error: 'Not authenticated' };

  const result = await supabase
    .from('profiles')
    .update(updates)
    .eq('id', user.id)
    .select()
    .single();

  const { data, error } = result as { data: Profile | null; error: { message: string } | null };
  return { data, error: error?.message || null };
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
      author:profiles(id, username, full_name, avatar_url, is_verified)
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
      author:profiles(id, username, full_name, avatar_url, is_verified)
    `)
    .eq('author_id', userId)
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
      author:profiles(id, username, full_name, avatar_url, is_verified)
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
  category: string;
  sport_type?: string;
  cover_image_url?: string;
  images?: string[];
  difficulty_level?: string;
  estimated_duration?: number;
  distance?: number;
  elevation_gain?: number;
  is_route: boolean;
  route_points?: object[];
  visibility: 'public' | 'private' | 'followers';
  is_verified: boolean;
  is_featured: boolean;
  visit_count: number;
  save_count: number;
  rating_average: number;
  rating_count: number;
  created_at: string;
  updated_at: string;
  creator?: Profile;
}

export interface SpotReview {
  id: string;
  user_id: string;
  spot_id: string;
  rating: number;
  comment?: string;
  images?: string[];
  created_at: string;
  user?: Profile;
}

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

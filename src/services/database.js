// ============================================
// SMUPPY - DATABASE SERVICES
// Connexion frontend <-> Supabase
// ============================================

import { supabase } from '../config/supabase';

// ============================================
// PROFILES
// ============================================

/**
 * Get current user's profile
 */
export const getCurrentProfile = async () => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { data: null, error: 'Not authenticated' };

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  return { data, error };
};

/**
 * Get a profile by user ID
 */
export const getProfileById = async (userId) => {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();

  return { data, error };
};

/**
 * Get a profile by username
 */
export const getProfileByUsername = async (username) => {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('username', username)
    .single();

  return { data, error };
};

/**
 * Update current user's profile
 */
export const updateProfile = async (updates) => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { data: null, error: 'Not authenticated' };

  const { data, error } = await supabase
    .from('profiles')
    .update(updates)
    .eq('id', user.id)
    .select()
    .single();

  return { data, error };
};

/**
 * Create profile for new user
 */
export const createProfile = async (profileData) => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { data: null, error: 'Not authenticated' };

  const { data, error } = await supabase
    .from('profiles')
    .insert({
      id: user.id,
      ...profileData
    })
    .select()
    .single();

  return { data, error };
};

// ============================================
// POSTS
// ============================================

/**
 * Get posts feed with pagination
 */
export const getFeedPosts = async (page = 0, limit = 10) => {
  const from = page * limit;
  const to = from + limit - 1;

  const { data, error } = await supabase
    .from('posts')
    .select(`
      *,
      author:profiles(id, username, full_name, avatar_url, is_verified)
    `)
    .eq('visibility', 'public')
    .order('created_at', { ascending: false })
    .range(from, to);

  return { data, error };
};

/**
 * Get posts by user ID
 */
export const getPostsByUser = async (userId, page = 0, limit = 10) => {
  const from = page * limit;
  const to = from + limit - 1;

  const { data, error } = await supabase
    .from('posts')
    .select(`
      *,
      author:profiles(id, username, full_name, avatar_url, is_verified)
    `)
    .eq('author_id', userId)
    .order('created_at', { ascending: false })
    .range(from, to);

  return { data, error };
};

/**
 * Create a new post
 */
export const createPost = async (postData) => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { data: null, error: 'Not authenticated' };

  const { data, error } = await supabase
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

  return { data, error };
};

/**
 * Delete a post
 */
export const deletePost = async (postId) => {
  const { error } = await supabase
    .from('posts')
    .delete()
    .eq('id', postId);

  return { error };
};

// ============================================
// LIKES
// ============================================

/**
 * Like a post
 */
export const likePost = async (postId) => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { data: null, error: 'Not authenticated' };

  const { data, error } = await supabase
    .from('likes')
    .insert({
      user_id: user.id,
      post_id: postId
    })
    .select()
    .single();

  return { data, error };
};

/**
 * Unlike a post
 */
export const unlikePost = async (postId) => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { data: null, error: 'Not authenticated' };

  const { error } = await supabase
    .from('likes')
    .delete()
    .match({
      user_id: user.id,
      post_id: postId
    });

  return { error };
};

/**
 * Check if current user liked a post
 */
export const hasLikedPost = async (postId) => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { hasLiked: false };

  const { data } = await supabase
    .from('likes')
    .select('id')
    .match({
      user_id: user.id,
      post_id: postId
    })
    .single();

  return { hasLiked: !!data };
};

// ============================================
// FOLLOWS
// ============================================

/**
 * Follow a user
 */
export const followUser = async (userIdToFollow) => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { data: null, error: 'Not authenticated' };

  const { data, error } = await supabase
    .from('follows')
    .insert({
      follower_id: user.id,
      following_id: userIdToFollow
    })
    .select()
    .single();

  return { data, error };
};

/**
 * Unfollow a user
 */
export const unfollowUser = async (userIdToUnfollow) => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { data: null, error: 'Not authenticated' };

  const { error } = await supabase
    .from('follows')
    .delete()
    .match({
      follower_id: user.id,
      following_id: userIdToUnfollow
    });

  return { error };
};

/**
 * Check if current user follows a user
 */
export const isFollowing = async (userId) => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { following: false };

  const { data } = await supabase
    .from('follows')
    .select('follower_id')
    .match({
      follower_id: user.id,
      following_id: userId
    })
    .single();

  return { following: !!data };
};

/**
 * Get followers of a user
 */
export const getFollowers = async (userId, page = 0, limit = 20) => {
  const from = page * limit;
  const to = from + limit - 1;

  const { data, error } = await supabase
    .from('follows')
    .select(`
      follower:profiles!follows_follower_id_fkey(id, username, full_name, avatar_url, is_verified)
    `)
    .eq('following_id', userId)
    .range(from, to);

  return { data: data?.map(d => d.follower), error };
};

/**
 * Get users that a user is following
 */
export const getFollowing = async (userId, page = 0, limit = 20) => {
  const from = page * limit;
  const to = from + limit - 1;

  const { data, error } = await supabase
    .from('follows')
    .select(`
      following:profiles!follows_following_id_fkey(id, username, full_name, avatar_url, is_verified)
    `)
    .eq('follower_id', userId)
    .range(from, to);

  return { data: data?.map(d => d.following), error };
};

// ============================================
// COMMENTS
// ============================================

/**
 * Get comments for a post
 */
export const getPostComments = async (postId, page = 0, limit = 20) => {
  const from = page * limit;
  const to = from + limit - 1;

  const { data, error } = await supabase
    .from('comments')
    .select(`
      *,
      user:profiles(id, username, full_name, avatar_url, is_verified)
    `)
    .eq('post_id', postId)
    .is('parent_comment_id', null)
    .order('created_at', { ascending: true })
    .range(from, to);

  return { data, error };
};

/**
 * Add a comment to a post
 */
export const addComment = async (postId, text) => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { data: null, error: 'Not authenticated' };

  const { data, error } = await supabase
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

  return { data, error };
};

// ============================================
// INTERESTS & EXPERTISE
// ============================================

/**
 * Get all interests
 */
export const getInterests = async () => {
  const { data, error } = await supabase
    .from('interests')
    .select('*')
    .order('name');

  return { data, error };
};

/**
 * Get all expertise
 */
export const getExpertise = async () => {
  const { data, error } = await supabase
    .from('expertise')
    .select('*')
    .order('name');

  return { data, error };
};

/**
 * Save user interests
 */
export const saveUserInterests = async (interestIds) => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  // Delete existing interests
  await supabase
    .from('user_interests')
    .delete()
    .eq('user_id', user.id);

  // Insert new interests
  const { error } = await supabase
    .from('user_interests')
    .insert(
      interestIds.map(interestId => ({
        user_id: user.id,
        interest_id: interestId
      }))
    );

  return { error };
};
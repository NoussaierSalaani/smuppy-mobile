/**
 * Backend Service - Unified API Layer
 * Allows switching between Supabase and AWS backends
 *
 * Set USE_AWS=true to use AWS backend
 * This enables gradual migration and A/B testing
 */

import { awsAuth, AuthUser, SignUpParams, SignInParams } from './aws-auth';
import { awsAPI, Post, Profile, Peak, Comment, Notification, CreatePostInput, CreatePeakInput, UpdateProfileInput, APIError } from './aws-api';
import { supabase } from '../config/supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Feature flag for AWS migration
// Set to true to use AWS, false to use Supabase
const USE_AWS_KEY = '@smuppy/use_aws_backend';
let USE_AWS = true; // ⚡ AWS Backend ENABLED

// Initialize backend preference
export async function initializeBackend(): Promise<void> {
  USE_AWS = true;
  console.log('🚀 Backend initialized: AWS ENABLED');

  try {
    await AsyncStorage.setItem(USE_AWS_KEY, 'true');
  } catch (error) {
    console.error('Error saving backend preference:', error);
  }
}

export function setUseAWS(value: boolean): void {
  USE_AWS = value;
  AsyncStorage.setItem(USE_AWS_KEY, value.toString());
}

export function isUsingAWS(): boolean {
  return USE_AWS;
}

// ==========================================
// Authentication
// ==========================================

export interface User {
  id: string;
  email: string;
  username?: string;
}

export async function initializeAuth(): Promise<User | null> {
  if (USE_AWS) {
    const user = await awsAuth.initialize();
    return user ? { id: user.id, email: user.email, username: user.username } : null;
  } else {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) {
      return {
        id: session.user.id,
        email: session.user.email || '',
        username: session.user.user_metadata?.username,
      };
    }
    return null;
  }
}

export async function signUp(params: SignUpParams): Promise<{ user: User | null; confirmationRequired: boolean }> {
  if (USE_AWS) {
    const result = await awsAuth.signUp(params);
    return {
      user: result.user ? { id: result.user.id, email: result.user.email, username: result.user.username } : null,
      confirmationRequired: result.confirmationRequired,
    };
  } else {
    const { data, error } = await supabase.auth.signUp({
      email: params.email,
      password: params.password,
      options: {
        data: {
          username: params.username,
          full_name: params.fullName,
        },
      },
    });

    if (error) throw error;

    return {
      user: data.user ? { id: data.user.id, email: data.user.email || '', username: params.username } : null,
      confirmationRequired: !data.session,
    };
  }
}

export async function signIn(params: SignInParams): Promise<User> {
  if (USE_AWS) {
    const user = await awsAuth.signIn(params);
    return { id: user.id, email: user.email, username: user.username };
  } else {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: params.email,
      password: params.password,
    });

    if (error) throw error;
    if (!data.user) throw new Error('Sign in failed');

    return {
      id: data.user.id,
      email: data.user.email || '',
      username: data.user.user_metadata?.username,
    };
  }
}

export async function signOut(): Promise<void> {
  if (USE_AWS) {
    await awsAuth.signOut();
  } else {
    await supabase.auth.signOut();
  }
}

export async function getCurrentUser(): Promise<User | null> {
  if (USE_AWS) {
    const user = await awsAuth.getCurrentUser();
    return user ? { id: user.id, email: user.email, username: user.username } : null;
  } else {
    const { data: { user } } = await supabase.auth.getUser();
    return user ? { id: user.id, email: user.email || '', username: user.user_metadata?.username } : null;
  }
}

export async function forgotPassword(email: string): Promise<void> {
  if (USE_AWS) {
    await awsAuth.forgotPassword(email);
  } else {
    await supabase.auth.resetPasswordForEmail(email);
  }
}

export async function confirmForgotPassword(email: string, code: string, newPassword: string): Promise<void> {
  if (USE_AWS) {
    await awsAuth.confirmForgotPassword(email, code, newPassword);
  } else {
    // Supabase handles this differently through a link
    throw new Error('Use the password reset link sent to your email');
  }
}

export function onAuthStateChange(callback: (user: User | null) => void): () => void {
  if (USE_AWS) {
    return awsAuth.onAuthStateChange((authUser) => {
      callback(authUser ? { id: authUser.id, email: authUser.email, username: authUser.username } : null);
    });
  } else {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session?.user) {
        callback({
          id: session.user.id,
          email: session.user.email || '',
          username: session.user.user_metadata?.username,
        });
      } else {
        callback(null);
      }
    });
    return () => subscription.unsubscribe();
  }
}

// ==========================================
// Posts
// ==========================================

export async function getPosts(params?: { limit?: number; cursor?: string; type?: string; userId?: string }): Promise<{
  posts: Post[];
  nextCursor: string | null;
  hasMore: boolean;
}> {
  console.log(`📡 getPosts() using: ${USE_AWS ? 'AWS' : 'SUPABASE'}`);
  if (USE_AWS) {
    const result = await awsAPI.getPosts(params as any);
    console.log(`✅ AWS returned ${result.data.length} posts`);
    return { posts: result.data, nextCursor: result.nextCursor, hasMore: result.hasMore };
  } else {
    // Supabase implementation
    let query = supabase
      .from('posts')
      .select(`
        *,
        author:profiles!posts_user_id_fkey(*)
      `)
      .order('created_at', { ascending: false })
      .limit(params?.limit || 20);

    if (params?.userId) {
      query = query.eq('user_id', params.userId);
    }

    const { data, error } = await query;
    if (error) throw error;

    return {
      posts: (data || []).map(mapSupabasePost),
      nextCursor: null,
      hasMore: false,
    };
  }
}

export async function createPost(data: CreatePostInput): Promise<Post> {
  if (USE_AWS) {
    return awsAPI.createPost(data);
  } else {
    const user = await getCurrentUser();
    if (!user) throw new Error('Not authenticated');

    const { data: post, error } = await supabase
      .from('posts')
      .insert({
        user_id: user.id,
        content: data.content,
        media_urls: data.mediaUrls,
        media_type: data.mediaType,
        visibility: data.visibility || 'public',
      })
      .select(`*, author:profiles!posts_user_id_fkey(*)`)
      .single();

    if (error) throw error;
    return mapSupabasePost(post);
  }
}

export async function likePost(postId: string): Promise<void> {
  if (USE_AWS) {
    await awsAPI.likePost(postId);
  } else {
    const user = await getCurrentUser();
    if (!user) throw new Error('Not authenticated');

    await supabase.from('likes').insert({ user_id: user.id, post_id: postId });
    await supabase.rpc('increment_likes', { post_id: postId });
  }
}

export async function unlikePost(postId: string): Promise<void> {
  if (USE_AWS) {
    await awsAPI.unlikePost(postId);
  } else {
    const user = await getCurrentUser();
    if (!user) throw new Error('Not authenticated');

    await supabase.from('likes').delete().match({ user_id: user.id, post_id: postId });
    await supabase.rpc('decrement_likes', { post_id: postId });
  }
}

// ==========================================
// Profiles
// ==========================================

export async function getProfile(id: string): Promise<Profile> {
  if (USE_AWS) {
    return awsAPI.getProfile(id);
  } else {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;
    return mapSupabaseProfile(data);
  }
}

export async function updateProfile(data: UpdateProfileInput): Promise<Profile> {
  if (USE_AWS) {
    return awsAPI.updateProfile(data);
  } else {
    const user = await getCurrentUser();
    if (!user) throw new Error('Not authenticated');

    const { data: profile, error } = await supabase
      .from('profiles')
      .update({
        username: data.username,
        full_name: data.fullName,
        bio: data.bio,
        avatar_url: data.avatarUrl,
        is_private: data.isPrivate,
      })
      .eq('id', user.id)
      .select()
      .single();

    if (error) throw error;
    return mapSupabaseProfile(profile);
  }
}

export async function searchProfiles(query: string): Promise<Profile[]> {
  if (USE_AWS) {
    return awsAPI.searchProfiles(query);
  } else {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .or(`username.ilike.%${query}%,full_name.ilike.%${query}%`)
      .limit(20);

    if (error) throw error;
    return (data || []).map(mapSupabaseProfile);
  }
}

// ==========================================
// Follows
// ==========================================

export async function followUser(userId: string): Promise<void> {
  if (USE_AWS) {
    await awsAPI.followUser(userId);
  } else {
    const user = await getCurrentUser();
    if (!user) throw new Error('Not authenticated');

    // Check if target is private
    const { data: targetProfile } = await supabase
      .from('profiles')
      .select('is_private')
      .eq('id', userId)
      .single();

    if (targetProfile?.is_private) {
      // Create follow request
      await supabase.from('follow_requests').insert({
        requester_id: user.id,
        target_id: userId,
        status: 'pending',
      });
    } else {
      // Direct follow
      await supabase.from('follows').insert({
        follower_id: user.id,
        following_id: userId,
        status: 'accepted',
      });
    }
  }
}

export async function unfollowUser(userId: string): Promise<void> {
  if (USE_AWS) {
    await awsAPI.unfollowUser(userId);
  } else {
    const user = await getCurrentUser();
    if (!user) throw new Error('Not authenticated');

    await supabase.from('follows').delete().match({
      follower_id: user.id,
      following_id: userId,
    });
  }
}

// ==========================================
// Notifications
// ==========================================

export async function getNotifications(): Promise<Notification[]> {
  if (USE_AWS) {
    const result = await awsAPI.getNotifications();
    return result.data;
  } else {
    const user = await getCurrentUser();
    if (!user) throw new Error('Not authenticated');

    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) throw error;
    return (data || []).map(mapSupabaseNotification);
  }
}

// ==========================================
// Helper functions
// ==========================================

function mapSupabasePost(data: any): Post {
  return {
    id: data.id,
    authorId: data.user_id,
    content: data.content,
    mediaUrls: data.media_urls || [],
    mediaType: data.media_type,
    likesCount: data.likes_count || 0,
    commentsCount: data.comments_count || 0,
    createdAt: data.created_at,
    isLiked: data.is_liked,
    author: data.author ? mapSupabaseProfile(data.author) : null as any,
  };
}

function mapSupabaseProfile(data: any): Profile {
  return {
    id: data.id,
    username: data.username,
    fullName: data.full_name,
    avatarUrl: data.avatar_url,
    bio: data.bio,
    isVerified: data.is_verified || false,
    isPrivate: data.is_private || false,
    accountType: data.account_type || 'personal',
    followersCount: data.followers_count || 0,
    followingCount: data.following_count || 0,
    postsCount: data.posts_count || 0,
    isFollowing: data.is_following,
    isFollowedBy: data.is_followed_by,
  };
}

function mapSupabaseNotification(data: any): Notification {
  return {
    id: data.id,
    type: data.type,
    title: data.title,
    body: data.body,
    data: data.data,
    read: data.read,
    createdAt: data.created_at,
  };
}

// Export everything
export { APIError, Post, Profile, Peak, Comment, Notification, CreatePostInput, UpdateProfileInput };

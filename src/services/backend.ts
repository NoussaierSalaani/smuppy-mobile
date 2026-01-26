/**
 * Backend Service - AWS API Layer
 * All backend calls go through AWS (Cognito + API Gateway + Lambda)
 */

import { awsAuth, AuthUser, SignUpParams, SignInParams } from './aws-auth';
import { awsAPI, Post, Profile, Peak, Comment, Notification, CreatePostInput, CreatePeakInput, UpdateProfileInput, APIError } from './aws-api';

// Initialize backend
export async function initializeBackend(): Promise<void> {
  console.log('🚀 Backend initialized: AWS');
}

export function isUsingAWS(): boolean {
  return true;
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
  const user = await awsAuth.initialize();
  return user ? { id: user.id, email: user.email, username: user.username } : null;
}

export async function signUp(params: SignUpParams): Promise<{ user: User | null; confirmationRequired: boolean }> {
  const result = await awsAuth.signUp(params);
  return {
    user: result.user ? { id: result.user.id, email: result.user.email, username: result.user.username } : null,
    confirmationRequired: result.confirmationRequired,
  };
}

export async function signIn(params: SignInParams): Promise<User> {
  const user = await awsAuth.signIn(params);
  return { id: user.id, email: user.email, username: user.username };
}

export async function signOut(): Promise<void> {
  await awsAuth.signOut();
}

export async function getCurrentUser(): Promise<User | null> {
  const user = await awsAuth.getCurrentUser();
  return user ? { id: user.id, email: user.email, username: user.username } : null;
}

export async function forgotPassword(email: string): Promise<void> {
  await awsAuth.forgotPassword(email);
}

export async function confirmForgotPassword(email: string, code: string, newPassword: string): Promise<void> {
  await awsAuth.confirmForgotPassword(email, code, newPassword);
}

export async function confirmSignUp(email: string, code: string): Promise<boolean> {
  return awsAuth.confirmSignUp(email, code);
}

export async function resendConfirmationCode(email: string): Promise<boolean> {
  return awsAuth.resendConfirmationCode(email);
}

export function onAuthStateChange(callback: (user: User | null) => void): () => void {
  return awsAuth.onAuthStateChange((authUser) => {
    callback(authUser ? { id: authUser.id, email: authUser.email, username: authUser.username } : null);
  });
}

// ==========================================
// Posts
// ==========================================

export async function getPosts(params?: { limit?: number; cursor?: string; type?: string; userId?: string }): Promise<{
  posts: Post[];
  nextCursor: string | null;
  hasMore: boolean;
}> {
  console.log('📡 getPosts() using AWS');
  const result = await awsAPI.getPosts(params as any);
  console.log(`✅ AWS returned ${result.data.length} posts`);
  return { posts: result.data, nextCursor: result.nextCursor, hasMore: result.hasMore };
}

export async function createPost(data: CreatePostInput): Promise<Post> {
  return awsAPI.createPost(data);
}

export async function likePost(postId: string): Promise<void> {
  await awsAPI.likePost(postId);
}

export async function unlikePost(postId: string): Promise<void> {
  await awsAPI.unlikePost(postId);
}

// ==========================================
// Profiles
// ==========================================

export async function getProfile(id: string): Promise<Profile> {
  return awsAPI.getProfile(id);
}

export async function updateProfile(data: UpdateProfileInput): Promise<Profile> {
  return awsAPI.updateProfile(data);
}

export async function searchProfiles(query: string): Promise<Profile[]> {
  return awsAPI.searchProfiles(query);
}

// ==========================================
// Follows
// ==========================================

export async function followUser(userId: string): Promise<void> {
  await awsAPI.followUser(userId);
}

export async function unfollowUser(userId: string): Promise<void> {
  await awsAPI.unfollowUser(userId);
}

// ==========================================
// Notifications
// ==========================================

export async function getNotifications(): Promise<Notification[]> {
  const result = await awsAPI.getNotifications();
  return result.data;
}

// Export everything
export { APIError, Post, Profile, Peak, Comment, Notification, CreatePostInput, UpdateProfileInput };

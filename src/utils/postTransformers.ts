/**
 * Post Transformers - Shared utilities for transforming posts
 * Eliminates duplication across VibesFeed, FanFeed, PostDetails screens
 */

import { Post } from '../services/database';
import { resolveDisplayName } from '../types/profile';

// ============================================
// TIME UTILITIES
// ============================================

/**
 * Convert a date string to a human-readable "time ago" format
 */
export const getTimeAgo = (dateString: string): string => {
  const now = new Date();
  const date = new Date(dateString);
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  const diffWeeks = Math.floor(diffDays / 7);

  if (diffMins < 1) return 'now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffWeeks < 4) return `${diffWeeks}w ago`;
  return date.toLocaleDateString();
};

// ============================================
// MEDIA UTILITIES
// ============================================

/**
 * Normalize media type from API format to UI format
 * Handles legacy 'photo' type and converts to standard 'image'
 */
export const normalizeMediaType = (
  mediaType: string | undefined
): 'image' | 'video' | 'carousel' => {
  if (mediaType === 'video') return 'video';
  if (mediaType === 'multiple' || mediaType === 'carousel') return 'carousel';
  return 'image'; // 'photo', 'image', undefined all map to 'image'
};

/**
 * Get the primary media URL from a post
 * Supports both array (media_urls) and single string (media_url) formats
 */
export const getMediaUrl = (post: Post, fallback: string | null = null): string | null => {
  return post.media_urls?.[0] || post.media_url || fallback;
};

/**
 * Format duration in seconds to MM:SS display string
 */
export const formatDuration = (seconds: number | string | undefined): string | undefined => {
  if (seconds === undefined || seconds === null) return undefined;
  const s = typeof seconds === 'string' ? parseInt(seconds, 10) : seconds;
  if (isNaN(s) || s <= 0) return undefined;
  const mins = Math.floor(s / 60);
  const secs = s % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

/**
 * Get content text from a post
 * Supports both 'content' (new) and 'caption' (legacy) fields
 */
export const getContentText = (post: Post): string => {
  return post.content || post.caption || '';
};

// ============================================
// UI INTERFACES
// ============================================

export interface UIPostUser {
  id: string;
  name: string;
  username?: string;
  avatar: string | null;
  isVerified?: boolean;
  isBot?: boolean;
  accountType?: 'personal' | 'pro_creator' | 'pro_business';
}

export interface UITaggedUser {
  id: string;
  username: string;
  fullName?: string | null;
  avatarUrl?: string | null;
}

// ============================================
// TAG UTILITIES
// ============================================

/**
 * Normalize tagged users from API format (string IDs or objects) to UI format
 */
const normalizeTaggedUsers = (
  raw?: Array<string | { id: string; username: string; fullName?: string | null; avatarUrl?: string | null }>
): UITaggedUser[] | undefined => {
  if (!raw || raw.length === 0) return undefined;
  return raw
    .map(t => typeof t === 'string' ? { id: t, username: '' } : { id: t.id, username: t.username, fullName: t.fullName, avatarUrl: t.avatarUrl })
    .filter(t => t.id);
};

export interface UIPostBase {
  id: string;
  type: 'image' | 'video' | 'carousel';
  media: string | null;
  allMedia?: string[]; // All media URLs for carousel posts
  slideCount?: number;
  duration?: string;
  user: UIPostUser;
  likes: number;
  isLiked: boolean;
  isSaved: boolean;
  tags?: string[];
  taggedUsers?: UITaggedUser[];
}

// FanFeed post format
export interface UIFanPost extends UIPostBase {
  caption: string;
  comments: number;
  shares: number;
  saves: number;
  timeAgo: string;
  location: string | null;
}

// VibesFeed post format (masonry grid)
export interface UIVibePost extends UIPostBase {
  height: number;
  title: string;
  category: string;
}

// ============================================
// TRANSFORM FUNCTIONS
// ============================================

/**
 * Transform a Post from database to FanFeed UI format
 */
export const transformToFanPost = (
  post: Post,
  likedPostIds: Set<string>,
  savedPostIds?: Set<string>
): UIFanPost => {
  const allMedia = post.media_urls?.filter(Boolean) || [];
  return {
    id: post.id,
    type: normalizeMediaType(post.media_type),
    media: getMediaUrl(post, null),
    allMedia: allMedia.length > 0 ? allMedia : undefined,
    slideCount: post.media_type === 'multiple' || allMedia.length > 1 ? allMedia.length : undefined,
    duration: formatDuration(post.peak_duration),
    user: {
      id: post.author?.id || post.author_id,
      name: resolveDisplayName(post.author),
      username: `@${post.author?.username || 'user'}`,
      avatar: post.author?.avatar_url || null,
      isVerified: post.author?.is_verified || false,
      isBot: post.author?.is_bot || false,
      accountType: post.author?.account_type || 'personal',
    },
    caption: getContentText(post),
    likes: post.likes_count || 0,
    comments: post.comments_count || 0,
    shares: 0,
    saves: 0,
    isLiked: likedPostIds.has(post.id),
    isSaved: savedPostIds?.has(post.id) ?? false,
    timeAgo: getTimeAgo(post.created_at),
    location: post.location || null,
    tags: post.tags,
    taggedUsers: normalizeTaggedUsers(post.tagged_users),
  };
};

/**
 * Transform a Post from database to VibesFeed UI format (masonry grid)
 */
export const transformToVibePost = (
  post: Post,
  likedPostIds: Set<string>,
  savedPostIds?: Set<string>
): UIVibePost => {
  const randomHeight = getMasonryHeight(post.id);
  const allMedia = post.media_urls?.filter(Boolean) || [];

  return {
    id: post.id,
    type: normalizeMediaType(post.media_type),
    media: getMediaUrl(post),
    allMedia: allMedia.length > 0 ? allMedia : undefined,
    height: randomHeight,
    slideCount: post.media_type === 'multiple' || allMedia.length > 1 ? allMedia.length : undefined,
    user: {
      id: post.author?.id || post.author_id,
      name: resolveDisplayName(post.author),
      avatar: post.author?.avatar_url || null,
      accountType: post.author?.account_type || 'personal',
    },
    title: getContentText(post),
    likes: post.likes_count || 0,
    isLiked: likedPostIds.has(post.id),
    isSaved: savedPostIds?.has(post.id) ?? false,
    category: post.tags?.[0] || '',
    tags: post.tags || [],
    taggedUsers: normalizeTaggedUsers(post.tagged_users),
  };
};

/**
 * Deterministic masonry height based on post ID.
 * Uses first + last char code for consistent results across renders.
 */
export const getMasonryHeight = (postId: string): number => {
  const heights = [160, 200, 240, 280, 220, 180, 260];
  const mid = Math.floor(postId.length / 2);
  const charSum = Math.abs(
    postId.charCodeAt(0) + postId.charCodeAt(mid) + postId.charCodeAt(postId.length - 1)
  );
  return heights[charSum % heights.length];
};

/**
 * Batch transform posts with liked status check
 */
export const transformPostsBatch = <T extends UIPostBase>(
  posts: Post[],
  likedPostIds: Set<string>,
  transformer: (post: Post, likedIds: Set<string>) => T
): T[] => {
  return posts.map((post) => transformer(post, likedPostIds));
};

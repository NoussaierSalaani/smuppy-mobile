/**
 * Post Transformers - Shared utilities for transforming posts
 * Eliminates duplication across VibesFeed, FanFeed, PostDetails screens
 */

import { Post } from '../services/database';

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
export const getMediaUrl = (post: Post, fallback = 'https://via.placeholder.com/400x500'): string => {
  return post.media_urls?.[0] || post.media_url || fallback;
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
  avatar: string;
  isVerified?: boolean;
  isBot?: boolean;
  accountType?: 'personal' | 'pro_creator' | 'pro_local';
}

export interface UIPostBase {
  id: string;
  type: 'image' | 'video' | 'carousel';
  media: string;
  slideCount?: number;
  duration?: string;
  user: UIPostUser;
  likes: number;
  isLiked: boolean;
  isSaved: boolean;
  tags?: string[];
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
  likedPostIds: Set<string>
): UIFanPost => {
  return {
    id: post.id,
    type: normalizeMediaType(post.media_type),
    media: getMediaUrl(post, 'https://via.placeholder.com/800x1000'),
    slideCount: post.media_type === 'multiple' ? (post.media_urls?.length || 1) : undefined,
    user: {
      id: post.author?.id || post.author_id,
      name: post.author?.full_name || 'User',
      username: `@${post.author?.username || 'user'}`,
      avatar: post.author?.avatar_url || 'https://via.placeholder.com/100',
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
    isSaved: false,
    timeAgo: getTimeAgo(post.created_at),
    location: post.location || null,
    tags: post.tags,
  };
};

/**
 * Transform a Post from database to VibesFeed UI format (masonry grid)
 */
export const transformToVibePost = (
  post: Post,
  likedPostIds: Set<string>
): UIVibePost => {
  // Generate varied heights for masonry layout based on post ID
  const heights = [180, 200, 220, 240, 260, 280];
  const randomHeight = heights[Math.abs(post.id.charCodeAt(0)) % heights.length];

  return {
    id: post.id,
    type: normalizeMediaType(post.media_type),
    media: getMediaUrl(post),
    height: randomHeight,
    slideCount: post.media_type === 'multiple' ? (post.media_urls?.length || 1) : undefined,
    user: {
      id: post.author?.id || post.author_id,
      name: post.author?.full_name || post.author?.username || 'User',
      avatar: post.author?.avatar_url || 'https://via.placeholder.com/100',
    },
    title: getContentText(post),
    likes: post.likes_count || 0,
    isLiked: likedPostIds.has(post.id),
    isSaved: false,
    category: post.tags?.[0] || 'Fitness',
    tags: post.tags || [],
  };
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

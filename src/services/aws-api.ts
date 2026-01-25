/**
 * AWS API Service
 * Replaces Supabase API calls with AWS API Gateway
 */

import { AWS_CONFIG } from '../config/aws-config';
import { awsAuth } from './aws-auth';

const API_BASE_URL = AWS_CONFIG.api.restEndpoint;
const CDN_URL = AWS_CONFIG.storage.cdnDomain;

interface RequestOptions {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: any;
  headers?: Record<string, string>;
  authenticated?: boolean;
  timeout?: number;
}

interface PaginatedResponse<T> {
  data: T[];
  nextCursor: string | null;
  hasMore: boolean;
  total: number;
}

class AWSAPIService {
  private defaultTimeout = 30000;

  /**
   * Make authenticated API request
   */
  async request<T>(endpoint: string, options: RequestOptions = { method: 'GET' }): Promise<T> {
    const { method, body, headers = {}, authenticated = true, timeout = this.defaultTimeout } = options;

    const url = `${API_BASE_URL}${endpoint}`;

    const requestHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      ...headers,
    };

    // Add authentication header if needed
    if (authenticated) {
      const token = await awsAuth.getAccessToken();
      if (token) {
        requestHeaders['Authorization'] = `Bearer ${token}`;
      }
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        method,
        headers: requestHeaders,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new APIError(
          errorData.message || `Request failed with status ${response.status}`,
          response.status,
          errorData
        );
      }

      const data = await response.json();
      return data as T;
    } catch (error: any) {
      clearTimeout(timeoutId);

      if (error.name === 'AbortError') {
        throw new APIError('Request timeout', 408);
      }

      throw error;
    }
  }

  // ==========================================
  // Posts API
  // ==========================================

  async getPosts(params?: {
    limit?: number;
    cursor?: string;
    type?: 'all' | 'following' | 'explore';
    userId?: string;
  }): Promise<PaginatedResponse<Post>> {
    const queryParams = new URLSearchParams();
    if (params?.limit) queryParams.set('limit', params.limit.toString());
    if (params?.cursor) queryParams.set('cursor', params.cursor);
    if (params?.type) queryParams.set('type', params.type);
    if (params?.userId) queryParams.set('userId', params.userId);

    const query = queryParams.toString();
    return this.request(`/posts${query ? `?${query}` : ''}`);
  }

  async getPost(id: string): Promise<Post> {
    return this.request(`/posts/${id}`);
  }

  async createPost(data: CreatePostInput): Promise<Post> {
    return this.request('/posts', {
      method: 'POST',
      body: data,
    });
  }

  async updatePost(id: string, data: Partial<CreatePostInput>): Promise<Post> {
    return this.request(`/posts/${id}`, {
      method: 'PATCH',
      body: data,
    });
  }

  async deletePost(id: string): Promise<void> {
    return this.request(`/posts/${id}`, {
      method: 'DELETE',
    });
  }

  async likePost(id: string): Promise<void> {
    return this.request(`/posts/${id}/like`, {
      method: 'POST',
    });
  }

  async unlikePost(id: string): Promise<void> {
    return this.request(`/posts/${id}/unlike`, {
      method: 'POST',
    });
  }

  // ==========================================
  // Profiles API
  // ==========================================

  async getProfile(id: string): Promise<Profile> {
    return this.request(`/profiles/${id}`);
  }

  async getProfileByUsername(username: string): Promise<Profile> {
    return this.request(`/profiles/username/${username}`);
  }

  async updateProfile(data: UpdateProfileInput): Promise<Profile> {
    return this.request('/profiles/me', {
      method: 'PATCH',
      body: data,
    });
  }

  async searchProfiles(query: string, limit = 20): Promise<Profile[]> {
    return this.request(`/profiles?search=${encodeURIComponent(query)}&limit=${limit}`);
  }

  // ==========================================
  // Follows API
  // ==========================================

  async followUser(userId: string): Promise<void> {
    return this.request('/follows', {
      method: 'POST',
      body: { followingId: userId },
    });
  }

  async unfollowUser(userId: string): Promise<void> {
    return this.request(`/follows/${userId}`, {
      method: 'DELETE',
    });
  }

  async getFollowers(userId: string, params?: { limit?: number; cursor?: string }): Promise<PaginatedResponse<Profile>> {
    const queryParams = new URLSearchParams();
    if (params?.limit) queryParams.set('limit', params.limit.toString());
    if (params?.cursor) queryParams.set('cursor', params.cursor);
    const query = queryParams.toString();
    return this.request(`/profiles/${userId}/followers${query ? `?${query}` : ''}`);
  }

  async getFollowing(userId: string, params?: { limit?: number; cursor?: string }): Promise<PaginatedResponse<Profile>> {
    const queryParams = new URLSearchParams();
    if (params?.limit) queryParams.set('limit', params.limit.toString());
    if (params?.cursor) queryParams.set('cursor', params.cursor);
    const query = queryParams.toString();
    return this.request(`/profiles/${userId}/following${query ? `?${query}` : ''}`);
  }

  // ==========================================
  // Feed API
  // ==========================================

  async getFeed(params?: { limit?: number; cursor?: string }): Promise<PaginatedResponse<Post>> {
    const queryParams = new URLSearchParams();
    if (params?.limit) queryParams.set('limit', params.limit.toString());
    if (params?.cursor) queryParams.set('cursor', params.cursor);
    const query = queryParams.toString();
    return this.request(`/feed${query ? `?${query}` : ''}`);
  }

  // ==========================================
  // Peaks API
  // ==========================================

  async getPeaks(params?: { limit?: number; cursor?: string; userId?: string }): Promise<PaginatedResponse<Peak>> {
    const queryParams = new URLSearchParams();
    if (params?.limit) queryParams.set('limit', params.limit.toString());
    if (params?.cursor) queryParams.set('cursor', params.cursor);
    if (params?.userId) queryParams.set('userId', params.userId);
    const query = queryParams.toString();
    return this.request(`/peaks${query ? `?${query}` : ''}`);
  }

  async getPeak(id: string): Promise<Peak> {
    return this.request(`/peaks/${id}`);
  }

  async createPeak(data: CreatePeakInput): Promise<Peak> {
    return this.request('/peaks', {
      method: 'POST',
      body: data,
    });
  }

  async likePeak(id: string): Promise<void> {
    return this.request(`/peaks/${id}/like`, {
      method: 'POST',
    });
  }

  async unlikePeak(id: string): Promise<void> {
    return this.request(`/peaks/${id}/unlike`, {
      method: 'POST',
    });
  }

  // ==========================================
  // Comments API
  // ==========================================

  async getComments(postId: string, params?: { limit?: number; cursor?: string }): Promise<PaginatedResponse<Comment>> {
    const queryParams = new URLSearchParams();
    if (params?.limit) queryParams.set('limit', params.limit.toString());
    if (params?.cursor) queryParams.set('cursor', params.cursor);
    const query = queryParams.toString();
    return this.request(`/posts/${postId}/comments${query ? `?${query}` : ''}`);
  }

  async createComment(postId: string, content: string, parentId?: string): Promise<Comment> {
    return this.request(`/posts/${postId}/comments`, {
      method: 'POST',
      body: { content, parentId },
    });
  }

  async deleteComment(commentId: string): Promise<void> {
    return this.request(`/comments/${commentId}`, {
      method: 'DELETE',
    });
  }

  // ==========================================
  // Notifications API
  // ==========================================

  async getNotifications(params?: { limit?: number; cursor?: string }): Promise<PaginatedResponse<Notification>> {
    const queryParams = new URLSearchParams();
    if (params?.limit) queryParams.set('limit', params.limit.toString());
    if (params?.cursor) queryParams.set('cursor', params.cursor);
    const query = queryParams.toString();
    return this.request(`/notifications${query ? `?${query}` : ''}`);
  }

  async markNotificationRead(id: string): Promise<void> {
    return this.request(`/notifications/${id}/read`, {
      method: 'POST',
    });
  }

  async markAllNotificationsRead(): Promise<void> {
    return this.request('/notifications/read-all', {
      method: 'POST',
    });
  }

  async getUnreadCount(): Promise<{ count: number }> {
    return this.request('/notifications/unread-count');
  }

  // ==========================================
  // Media Upload
  // ==========================================

  async getUploadUrl(filename: string, contentType: string): Promise<{ uploadUrl: string; fileUrl: string }> {
    return this.request('/media/upload-url', {
      method: 'POST',
      body: { filename, contentType },
    });
  }

  async uploadMedia(file: Blob | File, filename: string): Promise<string> {
    const contentType = file.type || 'application/octet-stream';

    // Get presigned URL
    const { uploadUrl, fileUrl } = await this.getUploadUrl(filename, contentType);

    // Upload to S3
    const response = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': contentType,
      },
      body: file,
    });

    if (!response.ok) {
      throw new APIError('Failed to upload media', response.status);
    }

    // Return CDN URL
    return `${CDN_URL}/${fileUrl}`;
  }

  // ==========================================
  // Utility Methods
  // ==========================================

  /**
   * Get CDN URL for a media path
   */
  getCDNUrl(path: string): string {
    if (path.startsWith('http')) {
      return path;
    }
    return `${CDN_URL}/${path}`;
  }
}

// Custom API Error class
export class APIError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public data?: any
  ) {
    super(message);
    this.name = 'APIError';
  }
}

// Types
export interface Post {
  id: string;
  authorId: string;
  content: string;
  mediaUrls: string[];
  mediaType: 'image' | 'video' | null;
  likesCount: number;
  commentsCount: number;
  createdAt: string;
  isLiked?: boolean;
  author: Profile;
}

export interface Profile {
  id: string;
  username: string;
  fullName: string | null;
  avatarUrl: string | null;
  bio: string | null;
  isVerified: boolean;
  isPrivate: boolean;
  accountType: 'personal' | 'pro_creator' | 'pro_local';
  followersCount: number;
  followingCount: number;
  postsCount: number;
  isFollowing?: boolean;
  isFollowedBy?: boolean;
}

export interface Peak {
  id: string;
  authorId: string;
  videoUrl: string;
  thumbnailUrl: string | null;
  caption: string | null;
  duration: number;
  likesCount: number;
  commentsCount: number;
  viewsCount: number;
  createdAt: string;
  isLiked?: boolean;
  author: Profile;
}

export interface Comment {
  id: string;
  postId: string;
  authorId: string;
  content: string;
  likesCount: number;
  repliesCount: number;
  createdAt: string;
  author: Profile;
  replies?: Comment[];
}

export interface Notification {
  id: string;
  type: string;
  title: string;
  body: string;
  data: any;
  read: boolean;
  createdAt: string;
}

export interface CreatePostInput {
  content?: string;
  mediaUrls?: string[];
  mediaType?: 'image' | 'video';
  visibility?: 'public' | 'followers' | 'private';
}

export interface CreatePeakInput {
  videoUrl: string;
  thumbnailUrl?: string;
  caption?: string;
  duration: number;
}

export interface UpdateProfileInput {
  username?: string;
  fullName?: string;
  bio?: string;
  avatarUrl?: string;
  isPrivate?: boolean;
}

// Export singleton instance
export const awsAPI = new AWSAPIService();
export default awsAPI;

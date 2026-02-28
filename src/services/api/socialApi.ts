import type { AWSAPIService } from '../aws-api';
import type { Profile } from './types';
import type { PaginatedResponse } from './internal-types';

export async function followUser(
  api: AWSAPIService,
  userId: string
): Promise<{
  success: boolean;
  type: string;
  message: string;
  cooldown?: { blocked: boolean; until: string; daysRemaining: number };
}> {
  return api.request('/follows', {
    method: 'POST',
    body: { followingId: userId },
  });
}

export async function unfollowUser(
  api: AWSAPIService,
  userId: string
): Promise<{
  success: boolean;
  message: string;
  cooldown?: { blocked: boolean; until: string; message: string };
}> {
  return api.request(`/follows/${userId}`, {
    method: 'DELETE',
  });
}

export async function getFollowers(
  api: AWSAPIService,
  userId: string,
  params?: { limit?: number; cursor?: string }
): Promise<PaginatedResponse<Profile>> {
  const queryParams = new URLSearchParams();
  if (params?.limit) queryParams.set('limit', params.limit.toString());
  if (params?.cursor) queryParams.set('cursor', params.cursor);
  const query = queryParams.toString();
  const response = await api.request<{
    followers: Profile[];
    cursor: string | null;
    hasMore: boolean;
    totalCount: number;
  }>(`/profiles/${userId}/followers${query ? `?${query}` : ''}`);
  // Map backend response to PaginatedResponse format
  return {
    data: response.followers || [],
    nextCursor: response.cursor,
    hasMore: response.hasMore,
    total: response.totalCount ?? 0,
  };
}

export async function getFollowing(
  api: AWSAPIService,
  userId: string,
  params?: { limit?: number; cursor?: string }
): Promise<PaginatedResponse<Profile>> {
  const queryParams = new URLSearchParams();
  if (params?.limit) queryParams.set('limit', params.limit.toString());
  if (params?.cursor) queryParams.set('cursor', params.cursor);
  const query = queryParams.toString();
  const response = await api.request<{
    following: Profile[];
    cursor: string | null;
    hasMore: boolean;
    totalCount: number;
  }>(`/profiles/${userId}/following${query ? `?${query}` : ''}`);
  // Map backend response to PaginatedResponse format
  return {
    data: response.following || [],
    nextCursor: response.cursor,
    hasMore: response.hasMore,
    total: response.totalCount ?? 0,
  };
}

export async function getPostLikers(
  api: AWSAPIService,
  postId: string,
  params?: { limit?: number; cursor?: string }
): Promise<PaginatedResponse<Profile>> {
  const queryParams = new URLSearchParams();
  if (params?.limit) queryParams.set('limit', params.limit.toString());
  if (params?.cursor) queryParams.set('cursor', params.cursor);
  const query = queryParams.toString();
  const response = await api.request<{
    data: Profile[];
    nextCursor: string | null;
    hasMore: boolean;
  }>(`/posts/${postId}/likers${query ? `?${query}` : ''}`);
  return {
    data: response.data ?? [],
    nextCursor: response.nextCursor || null,
    hasMore: !!response.hasMore,
    total: response.data?.length ?? 0,
  };
}

export async function getFollowingUsers(
  api: AWSAPIService,
  userId: string,
  params?: { limit?: number }
): Promise<Profile[]> {
  const queryParams = new URLSearchParams();
  if (params?.limit) queryParams.set('limit', params.limit.toString());
  const query = queryParams.toString();
  return api.request(`/profiles/${userId}/following${query ? `?${query}` : ''}`).then((res) => {
    const result = res as { following?: Profile[]; data?: Profile[] };
    return result.following || result.data || [];
  });
}

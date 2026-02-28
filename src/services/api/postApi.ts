import type { AWSAPIService } from '../aws-api';
import type { Post, CreatePostInput } from './types';
import type { PaginatedResponse } from './internal-types';
import { withMediaReadyRetry } from './helpers';

export async function getPosts(
  api: AWSAPIService,
  params?: {
    limit?: number;
    cursor?: string;
    type?: 'all' | 'following' | 'explore';
    userId?: string;
  }
): Promise<PaginatedResponse<Post>> {
  const queryParams = new URLSearchParams();
  if (params?.limit) queryParams.set('limit', params.limit.toString());
  if (params?.cursor) queryParams.set('cursor', params.cursor);
  if (params?.type) queryParams.set('type', params.type);
  if (params?.userId) queryParams.set('userId', params.userId);

  const query = queryParams.toString();

  // Route 'following' type to /feed/following (API Gateway 3 with Cognito authorizer)
  // /posts endpoint is public (no authorizer) — JWT claims aren't passed to the Lambda
  let endpoint = `/posts${query ? `?${query}` : ''}`;
  if (params?.type === 'following') {
    const feedParams = new URLSearchParams();
    if (params.limit) feedParams.set('limit', params.limit.toString());
    if (params.cursor) feedParams.set('cursor', params.cursor);
    const feedQuery = feedParams.toString();
    endpoint = `/feed/following${feedQuery ? `?${feedQuery}` : ''}`;
  }

  const response = await api.request<{ posts?: Post[]; data?: Post[]; nextCursor?: string | null; hasMore?: boolean; total?: number }>(endpoint);

  // Map API response (posts) to expected format (data)
  let posts: Post[];
  if (Array.isArray(response.posts)) posts = response.posts;
  else if (Array.isArray(response.data)) posts = response.data;
  else posts = [];
  return {
    data: posts,
    nextCursor: response.nextCursor || null,
    hasMore: !!response.hasMore,
    total: response.total ?? 0,
  };
}

export async function getPost(api: AWSAPIService, id: string): Promise<Post> {
  return api.request(`/posts/${id}`);
}

export async function createPost(api: AWSAPIService, data: CreatePostInput): Promise<Post> {
  return withMediaReadyRetry(() => api.request('/posts', {
    method: 'POST',
    body: data,
  }));
}

export async function updatePost(api: AWSAPIService, id: string, data: Partial<CreatePostInput>): Promise<Post> {
  return api.request(`/posts/${id}`, {
    method: 'PATCH',
    body: data,
  });
}

export async function deletePost(api: AWSAPIService, id: string): Promise<void> {
  return api.request(`/posts/${id}`, {
    method: 'DELETE',
  });
}

export async function likePost(api: AWSAPIService, id: string): Promise<void> {
  return api.request(`/posts/${id}/like`, {
    method: 'POST',
  });
}

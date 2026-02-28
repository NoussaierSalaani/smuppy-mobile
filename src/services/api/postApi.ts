import type { AWSAPIService } from '../aws-api';
import type { Post, CreatePostInput } from './types';
import type { PaginatedResponse } from './internal-types';
import type { Result } from '../result';
import { ok, err } from '../result';
import { withMediaReadyRetry } from './helpers';

export async function getPosts(
  api: AWSAPIService,
  params?: {
    limit?: number;
    cursor?: string;
    type?: 'all' | 'following' | 'explore';
    userId?: string;
  }
): Promise<Result<PaginatedResponse<Post>>> {
  try {
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
    return ok({
      data: posts,
      nextCursor: response.nextCursor || null,
      hasMore: !!response.hasMore,
      total: response.total ?? 0,
    });
  } catch (_e: unknown) {
    return err('FEED_POSTS_FAILED', 'Failed to fetch posts');
  }
}

export async function getPost(api: AWSAPIService, id: string): Promise<Result<Post>> {
  try {
    const data = await api.request<Post>(`/posts/${id}`);
    return ok(data);
  } catch (_e: unknown) {
    return err('POST_DETAILS_FAILED', 'Failed to fetch post details');
  }
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

export async function likePost(api: AWSAPIService, id: string): Promise<Result<void>> {
  try {
    await api.request(`/posts/${id}/like`, {
      method: 'POST',
    });
    return ok(undefined);
  } catch (_e: unknown) {
    return err('POST_LIKE_FAILED', 'Failed to toggle like');
  }
}

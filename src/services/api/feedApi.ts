import type { AWSAPIService } from '../aws-api';
import type { Post } from './types';
import type { PaginatedResponse } from './internal-types';

export async function getFeed(
  api: AWSAPIService,
  params?: { limit?: number; cursor?: string }
): Promise<PaginatedResponse<Post>> {
  const queryParams = new URLSearchParams();
  if (params?.limit) queryParams.set('limit', params.limit.toString());
  if (params?.cursor) queryParams.set('cursor', params.cursor);
  const query = queryParams.toString();
  return api.request(`/feed${query ? `?${query}` : ''}`);
}

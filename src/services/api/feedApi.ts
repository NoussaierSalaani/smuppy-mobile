import type { AWSAPIService } from '../aws-api';
import type { Post } from './types';
import type { PaginatedResponse } from './internal-types';
import type { Result } from '../result';
import { ok, err } from '../result';

export async function getFeed(
  api: AWSAPIService,
  params?: { limit?: number; cursor?: string }
): Promise<Result<PaginatedResponse<Post>>> {
  try {
    const queryParams = new URLSearchParams();
    if (params?.limit) queryParams.set('limit', params.limit.toString());
    if (params?.cursor) queryParams.set('cursor', params.cursor);
    const query = queryParams.toString();
    const data = await api.request<PaginatedResponse<Post>>(`/feed${query ? `?${query}` : ''}`);
    return ok(data);
  } catch (_e: unknown) {
    return err('FEED_FETCH_FAILED', 'Failed to fetch feed');
  }
}

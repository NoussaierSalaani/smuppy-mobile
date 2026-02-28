import type { AWSAPIService } from '../aws-api';
import type { Profile, UpdateProfileInput } from './types';
import type { PaginatedResponse } from './internal-types';

export async function getProfile(api: AWSAPIService, id: string): Promise<Profile> {
  return api.request(`/profiles/${id}`);
}

export async function getProfileByUsername(api: AWSAPIService, username: string): Promise<Profile> {
  return api.request(`/profiles/username/${username}`);
}

export async function updateProfile(api: AWSAPIService, data: UpdateProfileInput): Promise<Profile> {
  return api.request('/profiles/me', {
    method: 'PATCH',
    body: data,
  });
}

/**
 * @deprecated Account type upgrades can ONLY happen via Stripe webhook — never via direct API call.
 * This method is retained for reference but must not be used.
 */
export async function upgradeToProCreator(): Promise<{ success: boolean; message?: string }> {
  throw new Error('Account upgrades are handled via Stripe webhook only');
}

export async function checkCreationLimits(api: AWSAPIService): Promise<{
  canCreateEvent: boolean;
  canCreateGroup: boolean;
  eventsThisMonth: number;
  groupsThisMonth: number;
  maxEventsPerMonth: number;
  maxGroupsPerMonth: number;
  nextResetDate: string;
}> {
  return api.request('/profiles/creation-limits', { method: 'GET' });
}

export async function searchProfiles(
  api: AWSAPIService,
  query: string,
  limit = 20,
  cursor?: string
): Promise<PaginatedResponse<Profile>> {
  const params = new URLSearchParams({ search: query, limit: String(limit) });
  if (cursor) params.set('cursor', cursor);
  const result = await api.request<{ data: Profile[]; nextCursor?: string | null; hasMore?: boolean }>(`/profiles?${params.toString()}`);
  return {
    data: result.data || [],
    nextCursor: result.nextCursor ?? null,
    hasMore: result.hasMore ?? false,
    total: 0,
  };
}

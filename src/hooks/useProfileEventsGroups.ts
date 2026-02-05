import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import awsAPI from '../services/aws-api';
import { useUserStore } from '../stores';

export interface EventItem {
  id: string;
  title: string;
  address?: string;
  cover_image_url?: string;
  starts_at?: string;
  current_participants: number;
  max_participants?: number;
  category?: string;
  creator_id?: string;
}

export interface GroupItem {
  id: string;
  name: string;
  address?: string;
  cover_image_url?: string;
  starts_at?: string;
  current_participants: number;
  max_participants?: number;
  category?: string;
  creator_id?: string;
}

interface UseProfileEventsGroupsResult {
  events: EventItem[];
  groups: GroupItem[];
  isLoading: boolean;
  refresh: () => Promise<void>;
}

// API response types (camelCase, nested)
interface APIEvent {
  id: string;
  title: string;
  location?: { address?: string };
  participants?: { current?: number; max?: number };
  coverImageUrl?: string;
  startsAt?: string;
  category?: { slug?: string };
  creator?: { id?: string };
}

interface APIGroup {
  id: string;
  name: string;
  address?: string;
  coverImageUrl?: string;
  startsAt?: string;
  currentParticipants?: number;
  maxParticipants?: number;
  category?: string;
  creator?: { id?: string };
}

// Query keys for cache management
const profileEventsGroupsKeys = {
  events: (userId: string) => ['profile', 'events', userId] as const,
  groups: (userId: string) => ['profile', 'groups', userId] as const,
};

// Map API response (camelCase, nested) to frontend format (snake_case, flat)
const mapEvent = (e: APIEvent): EventItem => ({
  id: e.id,
  title: e.title,
  address: e.location?.address,
  cover_image_url: e.coverImageUrl,
  starts_at: e.startsAt,
  current_participants: e.participants?.current ?? 0,
  max_participants: e.participants?.max,
  category: e.category?.slug,
  creator_id: e.creator?.id,
});

const mapGroup = (g: APIGroup): GroupItem => ({
  id: g.id,
  name: g.name,
  address: g.address,
  cover_image_url: g.coverImageUrl,
  starts_at: g.startsAt,
  current_participants: g.currentParticipants ?? 0,
  max_participants: g.maxParticipants,
  category: g.category,
  creator_id: g.creator?.id,
});

/**
 * Fetch user's events and groups with React Query caching
 * - 5 minute stale time
 * - Automatic background refetch
 * - Proper cache invalidation
 */
export const useProfileEventsGroups = (): UseProfileEventsGroupsResult => {
  const user = useUserStore((state) => state.user);
  const userId = user?.id;
  const queryClient = useQueryClient();

  // Fetch events
  const eventsQuery = useQuery({
    queryKey: profileEventsGroupsKeys.events(userId || ''),
    queryFn: async () => {
      const result = await awsAPI.getEvents({ filter: 'my-events' });
      if (result.success && result.events) {
        return result.events.map(mapEvent);
      }
      return [];
    },
    enabled: !!userId,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Fetch groups
  const groupsQuery = useQuery({
    queryKey: profileEventsGroupsKeys.groups(userId || ''),
    queryFn: async () => {
      const result = await awsAPI.getGroups({ filter: 'my-groups' });
      if (result.success && result.groups) {
        return result.groups.map(mapGroup);
      }
      return [];
    },
    enabled: !!userId,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Refresh function that invalidates both queries
  const refresh = useCallback(async () => {
    if (!userId) return;
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: profileEventsGroupsKeys.events(userId) }),
      queryClient.invalidateQueries({ queryKey: profileEventsGroupsKeys.groups(userId) }),
    ]);
  }, [queryClient, userId]);

  return {
    events: eventsQuery.data || [],
    groups: groupsQuery.data || [],
    isLoading: eventsQuery.isLoading || groupsQuery.isLoading,
    refresh,
  };
};

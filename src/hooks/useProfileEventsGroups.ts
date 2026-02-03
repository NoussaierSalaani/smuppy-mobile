import { useState, useEffect, useCallback } from 'react';
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

export const useProfileEventsGroups = (): UseProfileEventsGroupsResult => {
  const [events, setEvents] = useState<EventItem[]>([]);
  const [groups, setGroups] = useState<GroupItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const user = useUserStore((state) => state.user);

  const fetchData = useCallback(async () => {
    if (!user?.id) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const [eventsResult, groupsResult] = await Promise.allSettled([
        awsAPI.getEvents({ filter: 'my-events' }),
        awsAPI.getGroups({ filter: 'my-groups' }),
      ]);

      if (eventsResult.status === 'fulfilled' && eventsResult.value.success && eventsResult.value.events) {
        // Map API response (camelCase, nested) to frontend format (snake_case, flat)
        const mappedEvents: EventItem[] = eventsResult.value.events.map((e: APIEvent) => ({
          id: e.id,
          title: e.title,
          address: e.location?.address,
          cover_image_url: e.coverImageUrl,
          starts_at: e.startsAt,
          current_participants: e.participants?.current ?? 0,
          max_participants: e.participants?.max,
          category: e.category?.slug,
          creator_id: e.creator?.id,
        }));
        setEvents(mappedEvents);
      }
      if (groupsResult.status === 'fulfilled' && groupsResult.value.success && groupsResult.value.groups) {
        // Map API response (camelCase) to frontend format (snake_case)
        const mappedGroups: GroupItem[] = groupsResult.value.groups.map((g: APIGroup) => ({
          id: g.id,
          name: g.name,
          address: g.address,
          cover_image_url: g.coverImageUrl,
          starts_at: g.startsAt,
          current_participants: g.currentParticipants ?? 0,
          max_participants: g.maxParticipants,
          category: g.category,
          creator_id: g.creator?.id,
        }));
        setGroups(mappedGroups);
      }
    } catch (error) {
      if (__DEV__) console.warn('[useProfileEventsGroups] Failed to fetch:', error);
    } finally {
      setIsLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { events, groups, isLoading, refresh: fetchData };
};

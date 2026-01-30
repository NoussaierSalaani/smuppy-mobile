import { useState, useEffect, useCallback } from 'react';
import awsAPI from '../services/aws-api';
import { useUserStore } from '../stores';

interface EventItem {
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

interface GroupItem {
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
        setEvents(eventsResult.value.events);
      }
      if (groupsResult.status === 'fulfilled' && groupsResult.value.success && groupsResult.value.groups) {
        setGroups(groupsResult.value.groups);
      }
    } catch (error) {
      console.error('[useProfileEventsGroups] Failed to fetch:', error);
    } finally {
      setIsLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { events, groups, isLoading, refresh: fetchData };
};

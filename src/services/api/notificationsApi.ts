import type { AWSAPIService } from '../aws-api';
import type { Notification, NotificationPreferences } from './types';
import type { PaginatedResponse } from './internal-types';
import type { ActivityItem } from './types';

export async function getNotifications(
  api: AWSAPIService,
  params?: { limit?: number; cursor?: string }
): Promise<PaginatedResponse<Notification>> {
  const queryParams = new URLSearchParams();
  if (params?.limit) queryParams.set('limit', params.limit.toString());
  if (params?.cursor) queryParams.set('cursor', params.cursor);
  const query = queryParams.toString();
  const response = await api.request<{
    data?: Notification[];
    notifications?: Notification[];
    nextCursor?: string | null;
    cursor?: string | null;
    hasMore?: boolean;
  }>(`/notifications${query ? `?${query}` : ''}`);
  // Handle both new format (data/nextCursor) and old format (notifications/cursor)
  return {
    data: response.data || response.notifications || [],
    nextCursor: response.nextCursor ?? response.cursor ?? null,
    hasMore: !!response.hasMore,
    total: 0,
  };
}

export async function getActivityHistory(
  api: AWSAPIService,
  params?: { limit?: number; cursor?: string; type?: string }
): Promise<PaginatedResponse<ActivityItem>> {
  const queryParams = new URLSearchParams();
  if (params?.limit) queryParams.set('limit', params.limit.toString());
  if (params?.cursor) queryParams.set('cursor', params.cursor);
  if (params?.type) queryParams.set('type', params.type);
  const query = queryParams.toString();
  const response = await api.request<{
    data?: ActivityItem[];
    nextCursor?: string | null;
    hasMore?: boolean;
  }>(`/activity${query ? `?${query}` : ''}`);
  return {
    data: response.data ?? [],
    nextCursor: response.nextCursor ?? null,
    hasMore: !!response.hasMore,
    total: 0,
  };
}

export async function markNotificationRead(api: AWSAPIService, id: string): Promise<void> {
  return api.request(`/notifications/${id}/read`, {
    method: 'POST',
  });
}

export async function markAllNotificationsRead(api: AWSAPIService): Promise<void> {
  return api.request('/notifications/read-all', {
    method: 'POST',
  });
}

export async function getUnreadCount(api: AWSAPIService): Promise<{ unreadCount: number }> {
  return api.request('/notifications/unread-count');
}

export async function deleteNotification(api: AWSAPIService, id: string): Promise<void> {
  return api.request(`/notifications/${id}`, {
    method: 'DELETE',
  });
}

export async function registerPushToken(
  api: AWSAPIService,
  data: {
    token: string;
    platform: 'ios' | 'android';
    deviceId: string;
  }
): Promise<void> {
  return api.request('/notifications/push-token', {
    method: 'POST',
    body: data,
  });
}

export async function unregisterPushToken(api: AWSAPIService, deviceId: string): Promise<void> {
  return api.request(`/notifications/push-token/${deviceId}`, {
    method: 'DELETE',
  });
}

export async function getNotificationPreferences(api: AWSAPIService): Promise<NotificationPreferences> {
  const response = await api.request<{ success: boolean; preferences: NotificationPreferences }>(
    '/notifications/preferences'
  );
  return response.preferences;
}

export async function updateNotificationPreferences(
  api: AWSAPIService,
  prefs: Partial<NotificationPreferences>
): Promise<NotificationPreferences> {
  const response = await api.request<{ success: boolean; preferences: NotificationPreferences }>(
    '/notifications/preferences',
    { method: 'PUT', body: prefs }
  );
  return response.preferences;
}

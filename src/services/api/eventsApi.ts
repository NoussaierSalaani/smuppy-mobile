import type { AWSAPIService } from '../aws-api';
import type { GroupActivity } from '../../types';
import type { ApiPagination, ApiEvent, EventParticipant } from './internal-types';

// ---------------------------------------------------------------------------
// Events (Xplorer)
// ---------------------------------------------------------------------------

export async function createEvent(
  api: AWSAPIService,
  data: {
    title: string;
    description?: string;
    categorySlug: string;
    locationName: string;
    address?: string;
    latitude: number;
    longitude: number;
    startsAt: string;
    endsAt?: string;
    timezone?: string;
    maxParticipants?: number;
    minParticipants?: number;
    isFree?: boolean;
    price?: number;
    currency?: string;
    isPublic?: boolean;
    isFansOnly?: boolean;
    coverImageUrl?: string;
    images?: string[];
    hasRoute?: boolean;
    routeDistanceKm?: number;
    routeElevationGainM?: number;
    routeDifficulty?: 'easy' | 'moderate' | 'hard' | 'expert';
    routePolyline?: string;
    routeWaypoints?: { lat: number; lng: number; name?: string }[];
  },
): Promise<{ success: boolean; event?: ApiEvent; message?: string }> {
  return api.request('/events', {
    method: 'POST',
    body: data,
  });
}

export async function getEvents(
  api: AWSAPIService,
  params?: {
    filter?: 'upcoming' | 'nearby' | 'category' | 'my-events' | 'joined';
    latitude?: number;
    longitude?: number;
    radiusKm?: number;
    category?: string;
    startDate?: string;
    endDate?: string;
    isFree?: boolean;
    hasRoute?: boolean;
    limit?: number;
    cursor?: string;
  },
): Promise<{ success: boolean; events?: ApiEvent[]; pagination?: ApiPagination }> {
  const query = new URLSearchParams();
  if (params?.filter) query.append('filter', params.filter);
  if (params?.latitude) query.append('latitude', params.latitude.toString());
  if (params?.longitude) query.append('longitude', params.longitude.toString());
  if (params?.radiusKm) query.append('radiusKm', params.radiusKm.toString());
  if (params?.category) query.append('category', params.category);
  if (params?.startDate) query.append('startDate', params.startDate);
  if (params?.endDate) query.append('endDate', params.endDate);
  if (params?.isFree !== undefined) query.append('isFree', params.isFree.toString());
  if (params?.hasRoute !== undefined) query.append('hasRoute', params.hasRoute.toString());
  if (params?.limit) query.append('limit', params.limit.toString());
  if (params?.cursor) query.append('cursor', params.cursor);
  return api.request(`/events?${query.toString()}`);
}

export async function getEventDetail(
  api: AWSAPIService,
  eventId: string,
): Promise<{
  success: boolean;
  event?: ApiEvent;
  message?: string;
}> {
  return api.request(`/events/${eventId}`);
}

export async function getEventParticipants(
  api: AWSAPIService,
  eventId: string,
  params?: {
    limit?: number;
    offset?: number;
  },
): Promise<{
  success: boolean;
  participants?: EventParticipant[];
  total?: number;
  message?: string;
}> {
  const query = new URLSearchParams();
  if (params?.limit) query.append('limit', params.limit.toString());
  if (params?.offset) query.append('offset', params.offset.toString());
  return api.request(`/events/${eventId}/participants?${query.toString()}`);
}

export async function joinEvent(
  api: AWSAPIService,
  eventId: string,
): Promise<{
  success: boolean;
  message?: string;
}> {
  return api.request(`/events/${eventId}/join`, {
    method: 'POST',
    body: { action: 'join' },
  });
}

export async function leaveEvent(
  api: AWSAPIService,
  eventId: string,
): Promise<{
  success: boolean;
  message?: string;
}> {
  return api.request(`/events/${eventId}/leave`, {
    method: 'POST',
  });
}

export async function createEventPayment(
  api: AWSAPIService,
  data: {
    eventId: string;
    amount: number;
    currency: string;
  },
): Promise<{
  success: boolean;
  clientSecret?: string;
  paymentIntentId?: string;
  checkoutUrl?: string;
  sessionId?: string;
  message?: string;
}> {
  return api.request(`/events/${data.eventId}/payment`, {
    method: 'POST',
    body: { amount: data.amount, currency: data.currency },
  });
}

export async function confirmEventPayment(
  api: AWSAPIService,
  data: {
    eventId: string;
    paymentIntentId: string;
  },
): Promise<{
  success: boolean;
  message?: string;
}> {
  return api.request(`/events/${data.eventId}/payment/confirm`, {
    method: 'POST',
    body: { paymentIntentId: data.paymentIntentId },
  });
}

export async function updateEvent(
  api: AWSAPIService,
  eventId: string,
  data: {
    title?: string;
    description?: string;
    price_cents?: number;
    max_participants?: number;
    location_name?: string;
    address?: string;
  },
): Promise<{
  success: boolean;
  event?: ApiEvent;
  message?: string;
}> {
  return api.request(`/events/${eventId}`, {
    method: 'PUT',
    body: data,
  });
}

export async function cancelEvent(
  api: AWSAPIService,
  eventId: string,
): Promise<{
  success: boolean;
  message?: string;
  refundsIssued?: number;
}> {
  return api.request(`/events/${eventId}/cancel`, {
    method: 'POST',
  });
}

export async function removeEventParticipant(
  api: AWSAPIService,
  eventId: string,
  userId: string,
): Promise<{
  success: boolean;
  message?: string;
  refundIssued?: boolean;
}> {
  return api.request(`/events/${eventId}/participants/${userId}`, {
    method: 'DELETE',
  });
}

export async function eventAction(
  api: AWSAPIService,
  eventId: string,
  action: 'register' | 'cancel' | 'interested',
  notes?: string,
): Promise<{
  success: boolean;
  message?: string;
  participationStatus?: string;
  currentParticipants?: number;
  spotsLeft?: number;
  requiresPayment?: boolean;
  price?: number;
  currency?: string;
}> {
  return api.request(`/events/${eventId}/join`, {
    method: 'POST',
    body: { action, notes },
  });
}

// ---------------------------------------------------------------------------
// Group Activities
// ---------------------------------------------------------------------------

export async function createGroup(
  api: AWSAPIService,
  data: {
    name: string;
    description?: string;
    category: string;
    subcategory: string;
    sport_type?: string;
    latitude: number;
    longitude: number;
    address?: string;
    cover_image_url?: string;
    starts_at: string;
    ends_at?: string;
    timezone?: string;
    max_participants?: number;
    is_free: boolean;
    price?: number;
    currency?: string;
    is_public: boolean;
    is_fans_only: boolean;
    is_route: boolean;
    route_start?: { lat: number; lng: number };
    route_end?: { lat: number; lng: number };
    route_waypoints?: { lat: number; lng: number }[];
    route_geojson?: object;
    route_profile?: string;
    route_distance_km?: number;
    route_duration_min?: number;
    route_elevation_gain?: number;
    difficulty?: string;
  },
): Promise<{ success: boolean; group?: GroupActivity; message?: string }> {
  return api.request('/groups', { method: 'POST', body: data });
}

export async function getGroups(
  api: AWSAPIService,
  params: {
    filter?: 'upcoming' | 'nearby' | 'my-groups' | 'joined';
    latitude?: number;
    longitude?: number;
    radiusKm?: number;
    category?: string;
    limit?: number;
    cursor?: string;
  },
): Promise<{ success: boolean; groups?: GroupActivity[]; pagination?: ApiPagination }> {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => { if (v !== undefined) query.set(k, String(v)); });
  return api.request(`/groups?${query.toString()}`);
}

export async function getGroup(api: AWSAPIService, groupId: string): Promise<{ success: boolean; group?: GroupActivity }> {
  return api.request(`/groups/${groupId}`);
}

export async function joinGroup(api: AWSAPIService, groupId: string): Promise<{ success: boolean; message?: string }> {
  return api.request(`/groups/${groupId}/join`, { method: 'POST' });
}

export async function leaveGroup(api: AWSAPIService, groupId: string): Promise<{ success: boolean; message?: string }> {
  return api.request(`/groups/${groupId}/leave`, { method: 'DELETE' });
}

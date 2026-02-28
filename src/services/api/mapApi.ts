import type { AWSAPIService } from '../aws-api';
import type { Spot, SpotReview, MapMarker, LivePin, Subcategory } from '../../types';
import type { ApiPagination } from './internal-types';

// ---------------------------------------------------------------------------
// Spots
// ---------------------------------------------------------------------------

export async function createSpot(
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
    images?: string[];
    tags?: string[];
    qualities?: string[];
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
    initial_rating?: number;
    initial_review?: string;
  },
): Promise<{ success: boolean; spot?: Spot; message?: string }> {
  return api.request('/spots', { method: 'POST', body: data });
}

export async function getSpot(api: AWSAPIService, spotId: string): Promise<{ success: boolean; spot?: Spot }> {
  return api.request(`/spots/${spotId}`);
}

export async function getNearbySpots(
  api: AWSAPIService,
  params: {
    latitude: number;
    longitude: number;
    radiusKm?: number;
    category?: string;
    limit?: number;
  },
): Promise<{ success: boolean; data?: Spot[] }> {
  const query = new URLSearchParams();
  query.set('lat', String(params.latitude));
  query.set('lng', String(params.longitude));
  if (params.radiusKm) query.set('radius', String(Math.round(params.radiusKm * 1000)));
  if (params.category) query.set('category', params.category);
  if (params.limit) query.set('limit', String(params.limit));
  return api.request(`/spots/nearby?${query.toString()}`);
}

// ---------------------------------------------------------------------------
// Reviews
// ---------------------------------------------------------------------------

export async function createReview(
  api: AWSAPIService,
  data: {
    target_id: string;
    target_type: 'spot' | 'business' | 'event' | 'live';
    rating: number;
    comment?: string;
    photos?: string[];
    qualities?: string[];
  },
): Promise<{ success: boolean; review?: SpotReview; message?: string }> {
  return api.request('/reviews', { method: 'POST', body: data });
}

export async function getReviews(
  api: AWSAPIService,
  params: {
    target_id: string;
    target_type: string;
    limit?: number;
    offset?: number;
  },
): Promise<{ success: boolean; reviews?: SpotReview[]; pagination?: ApiPagination }> {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => { if (v !== undefined) query.set(k, String(v)); });
  return api.request(`/reviews?${query.toString()}`);
}

// ---------------------------------------------------------------------------
// Dynamic Categories
// ---------------------------------------------------------------------------

export async function getCategories(api: AWSAPIService): Promise<{ success: boolean; categories?: Subcategory[] }> {
  return api.request('/categories');
}

export async function suggestSubcategory(
  api: AWSAPIService,
  data: {
    parent_category: string;
    name: string;
  },
): Promise<{ success: boolean; subcategory?: Subcategory; message?: string }> {
  return api.request('/categories/suggest', { method: 'POST', body: data });
}

// ---------------------------------------------------------------------------
// Live Pins
// ---------------------------------------------------------------------------

export async function createLivePin(
  api: AWSAPIService,
  data: {
    channel_name: string;
    title?: string;
    latitude: number;
    longitude: number;
  },
): Promise<{ success: boolean; livePin?: LivePin }> {
  return api.request('/map/live-pin', { method: 'POST', body: data });
}

export async function deleteLivePin(api: AWSAPIService): Promise<{ success: boolean }> {
  return api.request('/map/live-pin', { method: 'DELETE' });
}

export async function getNearbyLivePins(
  api: AWSAPIService,
  params: {
    latitude: number;
    longitude: number;
    radiusKm?: number;
  },
): Promise<{ success: boolean; livePins?: LivePin[] }> {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => { if (v !== undefined) query.set(k, String(v)); });
  return api.request(`/map/live-pins?${query.toString()}`);
}

// ---------------------------------------------------------------------------
// Live Streams
// ---------------------------------------------------------------------------

export async function startLiveStream(api: AWSAPIService, title?: string): Promise<{ success: boolean; data?: { id: string; channelName: string; title: string; startedAt: string } }> {
  return api.request('/live-streams/start', { method: 'POST', body: title ? { title } : {} });
}

export async function endLiveStream(api: AWSAPIService): Promise<{ success: boolean; data?: { id: string; durationSeconds: number; maxViewers: number; totalComments: number; totalReactions: number } }> {
  return api.request('/live-streams/end', { method: 'POST' });
}

export async function getActiveLiveStreams(api: AWSAPIService): Promise<{ success: boolean; data?: Array<{ id: string; channelName: string; title: string; startedAt: string; viewerCount: number; host: { id: string; username: string; displayName: string; avatarUrl: string } }> }> {
  return api.request('/live-streams/active');
}

// ---------------------------------------------------------------------------
// Map Markers
// ---------------------------------------------------------------------------

export async function getMapMarkers(
  api: AWSAPIService,
  params: {
    latitude: number;
    longitude: number;
    radiusKm?: number;
    filters?: string;
    subcategories?: string;
    limit?: number;
  },
): Promise<{ success: boolean; markers?: MapMarker[] }> {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => { if (v !== undefined) query.set(k, String(v)); });
  return api.request(`/map/markers?${query.toString()}`);
}

// ---------------------------------------------------------------------------
// Map Search
// ---------------------------------------------------------------------------

export async function searchMap(
  api: AWSAPIService,
  params: {
    query: string;
    latitude?: number;
    longitude?: number;
    radiusKm?: number;
    limit?: number;
  },
): Promise<{ success: boolean; results?: MapMarker[] }> {
  const queryParams = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => { if (v !== undefined) queryParams.set(k, String(v)); });
  return api.request(`/search/map?${queryParams.toString()}`);
}

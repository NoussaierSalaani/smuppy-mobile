/**
 * Mapbox Directions Service
 * Calculates optimized routes for activities (running, cycling, hiking)
 * Uses Mapbox Directions API with appropriate profiles
 */

import Constants from 'expo-constants';
import type { RouteProfile, DifficultyLevel } from '../types';

const MAPBOX_TOKEN = Constants.expoConfig?.extra?.mapboxAccessToken || '';
const BASE_URL = 'https://api.mapbox.com/directions/v5/mapbox';

// ============================================
// TYPES
// ============================================

export interface Coordinate {
  lat: number;
  lng: number;
}

export interface RouteResult {
  geojson: { type: 'LineString'; coordinates: number[][] };
  distanceKm: number;
  durationMin: number;
  elevationGain: number;
  difficulty: DifficultyLevel;
  steps: RouteStep[];
}

export interface RouteStep {
  instruction: string;
  distanceM: number;
  durationSec: number;
}

interface DirectionsResponse {
  routes: Array<{
    geometry: { type: 'LineString'; coordinates: number[][] };
    distance: number; // meters
    duration: number; // seconds
    legs: Array<{
      steps: Array<{
        maneuver: { instruction: string };
        distance: number;
        duration: number;
      }>;
    }>;
  }>;
  code: string;
  message?: string;
}

// ============================================
// PROFILE MAPPING
// ============================================

const ACTIVITY_TO_PROFILE: Record<string, RouteProfile> = {
  running: 'walking',
  hiking: 'walking',
  marathon: 'walking',
  trail: 'walking',
  walking: 'walking',
  cycling: 'cycling',
  velo: 'cycling',
  biking: 'cycling',
};

/**
 * Get the Mapbox routing profile for an activity type
 */
export function getRouteProfile(activityOrSportType: string): RouteProfile {
  const key = activityOrSportType.toLowerCase();
  return ACTIVITY_TO_PROFILE[key] || 'walking';
}

// ============================================
// DIFFICULTY CALCULATION
// ============================================

function calculateDifficulty(distanceKm: number, elevationGain: number): DifficultyLevel {
  // Score based on distance + elevation
  const score = distanceKm * 1.0 + elevationGain * 0.01;

  if (score < 5) return 'easy';
  if (score < 15) return 'medium';
  if (score < 30) return 'hard';
  return 'expert';
}

// ============================================
// MAIN API
// ============================================

/**
 * Calculate a route between two or more points using Mapbox Directions API
 *
 * @param start - Starting coordinate
 * @param end - Ending coordinate
 * @param waypoints - Optional intermediate waypoints
 * @param profile - Route profile ('walking' | 'cycling')
 * @returns RouteResult with GeoJSON, distance, duration, difficulty
 */
export async function calculateRoute(
  start: Coordinate,
  end: Coordinate,
  waypoints: Coordinate[] = [],
  profile: RouteProfile = 'walking',
): Promise<RouteResult> {
  if (!MAPBOX_TOKEN) {
    throw new Error('Mapbox access token not configured');
  }

  // Build coordinates string: start;waypoint1;waypoint2;...;end
  const allPoints = [start, ...waypoints, end];
  const coordsString = allPoints
    .map(p => `${p.lng},${p.lat}`)
    .join(';');

  const url = `${BASE_URL}/${profile}/${coordsString}?` +
    `geometries=geojson&overview=full&steps=true&access_token=${MAPBOX_TOKEN}`;

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Mapbox Directions API error: ${response.status}`);
  }

  const data: DirectionsResponse = await response.json();

  if (data.code !== 'Ok' || !data.routes.length) {
    throw new Error(data.message || 'No route found');
  }

  const route = data.routes[0];
  const distanceKm = route.distance / 1000;
  const durationMin = route.duration / 60;

  // Estimate elevation gain from geometry (rough approximation)
  // For accurate elevation, use Mapbox Tilequery API
  const elevationGain = estimateElevationGain(distanceKm, profile);

  const steps: RouteStep[] = route.legs.flatMap(leg =>
    leg.steps.map(step => ({
      instruction: step.maneuver.instruction,
      distanceM: step.distance,
      durationSec: step.duration,
    }))
  );

  return {
    geojson: route.geometry,
    distanceKm: Math.round(distanceKm * 100) / 100,
    durationMin: Math.round(durationMin),
    elevationGain: Math.round(elevationGain),
    difficulty: calculateDifficulty(distanceKm, elevationGain),
    steps,
  };
}

/**
 * Rough elevation gain estimation based on distance and profile
 * Replace with Mapbox Tilequery API for accuracy
 */
function estimateElevationGain(distanceKm: number, profile: RouteProfile): number {
  // Average elevation gain per km for urban/suburban routes
  const avgGainPerKm = profile === 'cycling' ? 8 : 12;
  return distanceKm * avgGainPerKm;
}

/**
 * Format distance for display
 */
export function formatDistance(km: number, useImperial = false): string {
  if (useImperial) {
    const miles = km * 0.621371;
    return miles < 0.1 ? `${Math.round(miles * 5280)} ft` : `${miles.toFixed(1)} mi`;
  }
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
}

/**
 * Format duration for display
 */
export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${Math.round(minutes)} min`;
  const hours = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  return mins > 0 ? `${hours}h ${mins}min` : `${hours}h`;
}

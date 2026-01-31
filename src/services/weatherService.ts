/**
 * Weather Service — OpenWeatherMap API with 30min cache
 *
 * Provides current conditions for Vibe Prescriptions context-awareness.
 * Uses expo-location for coordinates.
 */

import * as Location from 'expo-location';

// ============================================================================
// TYPES
// ============================================================================

export interface WeatherData {
  temp: number;            // Celsius
  condition: string;       // 'clear' | 'clouds' | 'rain' | 'snow' | 'thunderstorm' | 'drizzle' | 'mist' | 'unknown'
  description: string;     // Human-readable (e.g., "light rain")
  isOutdoorFriendly: boolean;
  humidity: number;        // 0-100
  windSpeed: number;       // m/s
  icon: string;            // OpenWeatherMap icon code
  fetchedAt: number;       // Timestamp
}

// ============================================================================
// CONSTANTS
// ============================================================================

const CACHE_DURATION_MS = 30 * 60 * 1000; // 30 minutes
const API_TIMEOUT_MS = 8000;
const OPENWEATHERMAP_API_KEY = process.env.EXPO_PUBLIC_OPENWEATHERMAP_API_KEY || '';
const OPENWEATHERMAP_URL = 'https://api.openweathermap.org/data/2.5/weather';

// Conditions where outdoor activities are not recommended
const UNFRIENDLY_CONDITIONS = new Set([
  'thunderstorm', 'rain', 'snow', 'drizzle',
]);

// ============================================================================
// CACHE
// ============================================================================

let cachedWeather: WeatherData | null = null;

// ============================================================================
// SERVICE
// ============================================================================

/**
 * Get current weather. Returns cached data if fresh (< 30min).
 * Falls back to a default if location/API unavailable.
 */
export async function getWeather(): Promise<WeatherData> {
  // Return cache if fresh
  if (cachedWeather && Date.now() - cachedWeather.fetchedAt < CACHE_DURATION_MS) {
    return cachedWeather;
  }

  // No API key → return fallback
  if (!OPENWEATHERMAP_API_KEY) {
    return getDefaultWeather();
  }

  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      return getDefaultWeather();
    }

    const location = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Low, // Fastest
    });

    const { latitude, longitude } = location.coords;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

    const url = `${OPENWEATHERMAP_URL}?lat=${latitude}&lon=${longitude}&units=metric&appid=${OPENWEATHERMAP_API_KEY}`;
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);

    if (!response.ok) {
      if (__DEV__) console.error('[WeatherService] API error:', response.status);
      return getDefaultWeather();
    }

    const data = await response.json();
    const condition = (data.weather?.[0]?.main || 'unknown').toLowerCase();
    const temp = data.main?.temp ?? 20;
    const isOutdoorFriendly = !UNFRIENDLY_CONDITIONS.has(condition) && temp > 5 && temp < 40;

    cachedWeather = {
      temp: Math.round(temp),
      condition,
      description: data.weather?.[0]?.description || condition,
      isOutdoorFriendly,
      humidity: data.main?.humidity ?? 50,
      windSpeed: data.wind?.speed ?? 0,
      icon: data.weather?.[0]?.icon || '01d',
      fetchedAt: Date.now(),
    };

    return cachedWeather;
  } catch (error) {
    if (__DEV__) console.error('[WeatherService] Fetch error:', error);
    return cachedWeather || getDefaultWeather();
  }
}

/**
 * Clear the weather cache (for testing or location change).
 */
export function clearWeatherCache(): void {
  cachedWeather = null;
}

// ============================================================================
// FALLBACK
// ============================================================================

function getDefaultWeather(): WeatherData {
  return {
    temp: 20,
    condition: 'clear',
    description: 'Weather unavailable',
    isOutdoorFriendly: true,
    humidity: 50,
    windSpeed: 0,
    icon: '01d',
    fetchedAt: Date.now(),
  };
}

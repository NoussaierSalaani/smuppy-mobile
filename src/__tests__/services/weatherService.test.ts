/**
 * Weather Service Tests
 *
 * Tests the weather API integration with caching and fallbacks.
 */

// ---------------------------------------------------------------------------
// Mocks — must be declared before imports
// ---------------------------------------------------------------------------

const mockRequestForegroundPermissionsAsync = jest.fn();
const mockGetCurrentPositionAsync = jest.fn();

jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: mockRequestForegroundPermissionsAsync,
  getCurrentPositionAsync: mockGetCurrentPositionAsync,
  Accuracy: { Low: 1 },
}));

(global as Record<string, unknown>).__DEV__ = false;

// Mock fetch
const originalFetch = global.fetch;
const mockFetch = jest.fn();
global.fetch = mockFetch;

// Set up env var for API key
const originalEnv = process.env;
process.env = { ...originalEnv, EXPO_PUBLIC_OPENWEATHERMAP_API_KEY: 'test-api-key' };

// ---------------------------------------------------------------------------
// Imports — after mocks
// ---------------------------------------------------------------------------

import { getWeather, clearWeatherCache, WeatherData } from '../../services/weatherService';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('weatherService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearWeatherCache();
  });

  afterAll(() => {
    global.fetch = originalFetch;
    process.env = originalEnv;
  });

  // =========================================================================
  // getWeather
  // =========================================================================

  describe('getWeather', () => {
    it('should fetch weather data and return parsed result', async () => {
      mockRequestForegroundPermissionsAsync.mockResolvedValue({ status: 'granted' });
      mockGetCurrentPositionAsync.mockResolvedValue({
        coords: { latitude: 48.8566, longitude: 2.3522 },
      });

      const weatherData = {
        weather: [{ main: 'Clear', description: 'clear sky', icon: '01d' }],
        main: { temp: 22.5, humidity: 45 },
        wind: { speed: 3.2 },
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => weatherData,
      });

      const result = await getWeather();

      expect(result.temp).toBe(23); // Math.round(22.5)
      expect(result.condition).toBe('clear');
      expect(result.description).toBe('clear sky');
      expect(result.isOutdoorFriendly).toBe(true);
      expect(result.humidity).toBe(45);
      expect(result.windSpeed).toBe(3.2);
      expect(result.icon).toBe('01d');
      expect(result.fetchedAt).toBeGreaterThan(0);
    });

    it('should return cached data when fresh', async () => {
      mockRequestForegroundPermissionsAsync.mockResolvedValue({ status: 'granted' });
      mockGetCurrentPositionAsync.mockResolvedValue({
        coords: { latitude: 48.8566, longitude: 2.3522 },
      });

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          weather: [{ main: 'Clear', description: 'clear', icon: '01d' }],
          main: { temp: 20, humidity: 50 },
          wind: { speed: 0 },
        }),
      });

      // First call
      await getWeather();
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Second call should use cache
      await getWeather();
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should return default weather on location permission denied', async () => {
      mockRequestForegroundPermissionsAsync.mockResolvedValue({ status: 'denied' });

      const result = await getWeather();

      expect(result.temp).toBe(20);
      expect(result.condition).toBe('clear');
      expect(result.description).toContain('Location permission');
    });

    it('should return default weather on API error', async () => {
      mockRequestForegroundPermissionsAsync.mockResolvedValue({ status: 'granted' });
      mockGetCurrentPositionAsync.mockResolvedValue({
        coords: { latitude: 0, longitude: 0 },
      });

      mockFetch.mockResolvedValue({ ok: false, status: 500 });

      const result = await getWeather();

      expect(result.temp).toBe(20);
      expect(result.condition).toBe('clear');
    });

    it('should return default weather on network error', async () => {
      mockRequestForegroundPermissionsAsync.mockResolvedValue({ status: 'granted' });
      mockGetCurrentPositionAsync.mockResolvedValue({
        coords: { latitude: 0, longitude: 0 },
      });

      mockFetch.mockRejectedValue(new Error('Network error'));

      const result = await getWeather();

      expect(result.temp).toBe(20);
    });

    it('should mark rainy weather as not outdoor-friendly', async () => {
      mockRequestForegroundPermissionsAsync.mockResolvedValue({ status: 'granted' });
      mockGetCurrentPositionAsync.mockResolvedValue({
        coords: { latitude: 0, longitude: 0 },
      });

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          weather: [{ main: 'Rain', description: 'light rain', icon: '10d' }],
          main: { temp: 15, humidity: 80 },
          wind: { speed: 5 },
        }),
      });

      const result = await getWeather();
      expect(result.isOutdoorFriendly).toBe(false);
    });

    it('should mark extreme cold as not outdoor-friendly', async () => {
      mockRequestForegroundPermissionsAsync.mockResolvedValue({ status: 'granted' });
      mockGetCurrentPositionAsync.mockResolvedValue({
        coords: { latitude: 0, longitude: 0 },
      });

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          weather: [{ main: 'Clear', description: 'clear', icon: '01d' }],
          main: { temp: 2, humidity: 30 },
          wind: { speed: 1 },
        }),
      });

      const result = await getWeather();
      expect(result.isOutdoorFriendly).toBe(false);
    });

    it('should mark extreme heat as not outdoor-friendly', async () => {
      mockRequestForegroundPermissionsAsync.mockResolvedValue({ status: 'granted' });
      mockGetCurrentPositionAsync.mockResolvedValue({
        coords: { latitude: 0, longitude: 0 },
      });

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          weather: [{ main: 'Clear', description: 'clear', icon: '01d' }],
          main: { temp: 42, humidity: 20 },
          wind: { speed: 1 },
        }),
      });

      const result = await getWeather();
      expect(result.isOutdoorFriendly).toBe(false);
    });
  });

  // =========================================================================
  // clearWeatherCache
  // =========================================================================

  describe('clearWeatherCache', () => {
    it('should force fresh fetch after clearing', async () => {
      mockRequestForegroundPermissionsAsync.mockResolvedValue({ status: 'granted' });
      mockGetCurrentPositionAsync.mockResolvedValue({
        coords: { latitude: 0, longitude: 0 },
      });

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          weather: [{ main: 'Clear', description: 'clear', icon: '01d' }],
          main: { temp: 20, humidity: 50 },
          wind: { speed: 0 },
        }),
      });

      await getWeather();
      clearWeatherCache();
      await getWeather();

      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });
});

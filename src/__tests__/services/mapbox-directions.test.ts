/**
 * Mapbox Directions Service Tests
 *
 * Tests route profile mapping, difficulty calculation, route calculation,
 * and display formatting functions.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(global as any).__DEV__ = true;

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

jest.mock('../../config/env', () => ({
  ENV: {
    MAPBOX_ACCESS_TOKEN: 'pk.test_token_12345',
  },
}));

jest.mock('../../lib/sentry', () => ({
  captureException: jest.fn(),
  captureMessage: jest.fn(),
}));

const mockFetch = jest.fn();
global.fetch = mockFetch;

// Mock AbortController
class MockAbortController {
  signal = {};
  abort = jest.fn();
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(global as any).AbortController = MockAbortController;

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

import {
  getRouteProfile,
  calculateRoute,
  formatDistance,
  formatDuration,
} from '../../services/mapbox-directions';

import type { Coordinate } from '../../services/mapbox-directions';

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const PARIS: Coordinate = { lat: 48.8566, lng: 2.3522 };
const LYON: Coordinate = { lat: 45.764, lng: 4.8357 };
const WAYPOINT: Coordinate = { lat: 47.0, lng: 3.5 };

function createDirectionsResponse(overrides: Record<string, unknown> = {}) {
  return {
    code: 'Ok',
    routes: [
      {
        geometry: {
          type: 'LineString',
          coordinates: [
            [2.3522, 48.8566],
            [3.5, 47.0],
            [4.8357, 45.764],
          ],
        },
        distance: 465000, // meters (~465 km)
        duration: 18000, // seconds (~5 hours)
        legs: [
          {
            steps: [
              {
                maneuver: { instruction: 'Head south' },
                distance: 200000,
                duration: 8000,
              },
              {
                maneuver: { instruction: 'Continue on A6' },
                distance: 265000,
                duration: 10000,
              },
            ],
          },
        ],
      },
    ],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('mapbox-directions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // =========================================================================
  // getRouteProfile
  // =========================================================================
  describe('getRouteProfile', () => {
    it('maps running to walking', () => {
      expect(getRouteProfile('running')).toBe('walking');
    });

    it('maps hiking to walking', () => {
      expect(getRouteProfile('hiking')).toBe('walking');
    });

    it('maps marathon to walking', () => {
      expect(getRouteProfile('marathon')).toBe('walking');
    });

    it('maps trail to walking', () => {
      expect(getRouteProfile('trail')).toBe('walking');
    });

    it('maps walking to walking', () => {
      expect(getRouteProfile('walking')).toBe('walking');
    });

    it('maps cycling to cycling', () => {
      expect(getRouteProfile('cycling')).toBe('cycling');
    });

    it('maps velo to cycling', () => {
      expect(getRouteProfile('velo')).toBe('cycling');
    });

    it('maps biking to cycling', () => {
      expect(getRouteProfile('biking')).toBe('cycling');
    });

    it('defaults to walking for unknown activity', () => {
      expect(getRouteProfile('swimming')).toBe('walking');
    });

    it('is case insensitive', () => {
      expect(getRouteProfile('RUNNING')).toBe('walking');
      expect(getRouteProfile('Cycling')).toBe('cycling');
    });
  });

  // =========================================================================
  // calculateRoute
  // =========================================================================
  describe('calculateRoute', () => {
    it('calls Mapbox API with correct URL and returns parsed result', async () => {
      const response = createDirectionsResponse();
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(response),
      });

      const resultPromise = calculateRoute(PARIS, LYON);
      jest.runAllTimers();
      const result = await resultPromise;

      // Verify URL construction
      const fetchUrl = mockFetch.mock.calls[0][0] as string;
      expect(fetchUrl).toContain('https://api.mapbox.com/directions/v5/mapbox/walking/');
      expect(fetchUrl).toContain(`${PARIS.lng},${PARIS.lat}`);
      expect(fetchUrl).toContain(`${LYON.lng},${LYON.lat}`);
      expect(fetchUrl).toContain('access_token=pk.test_token_12345');
      expect(fetchUrl).toContain('geometries=geojson');
      expect(fetchUrl).toContain('overview=full');
      expect(fetchUrl).toContain('steps=true');

      // Verify result structure
      expect(result.geojson).toEqual(response.routes[0].geometry);
      expect(result.distanceKm).toBe(465); // 465000m / 1000, rounded
      expect(result.durationMin).toBe(300); // 18000s / 60, rounded
      expect(result.steps).toHaveLength(2);
      expect(result.steps[0].instruction).toBe('Head south');
      expect(result.steps[0].distanceM).toBe(200000);
      expect(result.steps[0].durationSec).toBe(8000);
      expect(result.difficulty).toBeDefined();
      expect(result.elevationGain).toBeGreaterThan(0);
    });

    it('includes waypoints in URL', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(createDirectionsResponse()),
      });

      const promise = calculateRoute(PARIS, LYON, [WAYPOINT], 'walking');
      jest.runAllTimers();
      await promise;

      const fetchUrl = mockFetch.mock.calls[0][0] as string;
      expect(fetchUrl).toContain(`${WAYPOINT.lng},${WAYPOINT.lat}`);
      // Order should be: start;waypoint;end
      const coordsPart = fetchUrl.split('/walking/')[1].split('?')[0];
      const points = coordsPart.split(';');
      expect(points).toHaveLength(3);
    });

    it('uses cycling profile when specified', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(createDirectionsResponse()),
      });

      const promise = calculateRoute(PARIS, LYON, [], 'cycling');
      jest.runAllTimers();
      await promise;

      const fetchUrl = mockFetch.mock.calls[0][0] as string;
      expect(fetchUrl).toContain('/cycling/');
    });

    it('throws when Mapbox token is not configured', async () => {
      // Re-mock with empty token
      jest.resetModules();
      jest.doMock('../../config/env', () => ({
        ENV: { MAPBOX_ACCESS_TOKEN: '' },
      }));
      jest.doMock('../../lib/sentry', () => ({
        captureException: jest.fn(),
        captureMessage: jest.fn(),
      }));

      const { calculateRoute: calcRoute } = require('../../services/mapbox-directions');

      await expect(calcRoute(PARIS, LYON)).rejects.toThrow('Mapbox access token not configured');

      // Restore original mock
      jest.resetModules();
    });

    it('throws on network error', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      const promise = calculateRoute(PARIS, LYON);
      jest.runAllTimers();
      await expect(promise).rejects.toThrow('Route calculation failed');
    });

    it('throws on non-200 response', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 429,
        json: () => Promise.resolve({}),
      });

      const promise = calculateRoute(PARIS, LYON);
      jest.runAllTimers();
      await expect(promise).rejects.toThrow('Mapbox Directions API error: 429');
    });

    it('throws when no routes found', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ code: 'Ok', routes: [] }),
      });

      const promise = calculateRoute(PARIS, LYON);
      jest.runAllTimers();
      await expect(promise).rejects.toThrow('No route found');
    });

    it('throws with message when API returns error code', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            code: 'NoRoute',
            routes: [],
            message: 'No route possible between those points',
          }),
      });

      const promise = calculateRoute(PARIS, LYON);
      jest.runAllTimers();
      await expect(promise).rejects.toThrow('No route possible between those points');
    });

    it('calculates difficulty based on distance and elevation', async () => {
      // Short route => easy
      const shortResponse = createDirectionsResponse();
      shortResponse.routes[0].distance = 3000; // 3km
      shortResponse.routes[0].duration = 1800;

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(shortResponse),
      });

      const promise = calculateRoute(PARIS, LYON);
      jest.runAllTimers();
      const result = await promise;

      expect(result.difficulty).toBe('easy');
    });

    it('returns medium difficulty for moderate distances', async () => {
      const medResponse = createDirectionsResponse();
      medResponse.routes[0].distance = 10000; // 10km
      medResponse.routes[0].duration = 6000;

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(medResponse),
      });

      const promise = calculateRoute(PARIS, LYON);
      jest.runAllTimers();
      const result = await promise;

      expect(result.difficulty).toBe('medium');
    });

    it('uses lower elevation gain per km for cycling', async () => {
      const response = createDirectionsResponse();
      response.routes[0].distance = 50000; // 50km

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(response),
      });

      const promise = calculateRoute(PARIS, LYON, [], 'cycling');
      jest.runAllTimers();
      const result = await promise;

      // cycling: 8m/km * 50km = 400m, walking would be 12m/km * 50km = 600m
      expect(result.elevationGain).toBe(400);
    });
  });

  // =========================================================================
  // formatDistance
  // =========================================================================
  describe('formatDistance', () => {
    it('formats km for distances >= 1km (metric)', () => {
      expect(formatDistance(5.3)).toBe('5.3 km');
    });

    it('formats meters for distances < 1km (metric)', () => {
      expect(formatDistance(0.5)).toBe('500 m');
    });

    it('formats exact 1km', () => {
      expect(formatDistance(1)).toBe('1.0 km');
    });

    it('formats miles for distances >= 0.1mi (imperial)', () => {
      expect(formatDistance(5, true)).toBe('3.1 mi');
    });

    it('formats feet for very short distances (imperial)', () => {
      expect(formatDistance(0.05, true)).toBe('164 ft');
    });

    it('rounds meters to nearest integer', () => {
      expect(formatDistance(0.123)).toBe('123 m');
    });
  });

  // =========================================================================
  // formatDuration
  // =========================================================================
  describe('formatDuration', () => {
    it('formats minutes for durations < 60min', () => {
      expect(formatDuration(45)).toBe('45 min');
    });

    it('formats hours and minutes for durations >= 60min', () => {
      expect(formatDuration(90)).toBe('1h 30min');
    });

    it('formats hours only when minutes are 0', () => {
      expect(formatDuration(120)).toBe('2h');
    });

    it('rounds minutes', () => {
      expect(formatDuration(45.7)).toBe('46 min');
    });

    it('handles single-digit minutes with hours', () => {
      expect(formatDuration(65)).toBe('1h 5min');
    });

    it('handles exactly 60 minutes', () => {
      expect(formatDuration(60)).toBe('1h');
    });
  });
});

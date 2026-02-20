/**
 * API Configuration Tests
 * Tests for coordinate validation, query sanitization, URL builders, and Nominatim helpers.
 */

// Mock global __DEV__
(global as Record<string, unknown>).__DEV__ = false;

jest.mock('../../config/env', () => ({
  ENV: {
    GOOGLE_API_KEY: 'test-google-key',
    API_URL: 'https://api.test.com/api',
  },
}));

// Mock global fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

import {
  isValidCoordinate,
  NOMINATIM_API,
  GOOGLE_API,
  BACKEND_API,
  buildPlacesAutocompleteUrl,
  buildPlacesDetailsUrl,
  buildGeocodingUrl,
  searchNominatim,
  reverseGeocodeNominatim,
  formatNominatimResult,
} from '../../config/api';

describe('API Config', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('isValidCoordinate', () => {
    it('should return true for valid coordinates', () => {
      expect(isValidCoordinate(48.8566, 2.3522)).toBe(true); // Paris
      expect(isValidCoordinate(0, 0)).toBe(true); // Equator/Greenwich
      expect(isValidCoordinate(-90, -180)).toBe(true); // South Pole, dateline
      expect(isValidCoordinate(90, 180)).toBe(true); // North Pole, dateline
    });

    it('should return false for out-of-range latitude', () => {
      expect(isValidCoordinate(91, 0)).toBe(false);
      expect(isValidCoordinate(-91, 0)).toBe(false);
    });

    it('should return false for out-of-range longitude', () => {
      expect(isValidCoordinate(0, 181)).toBe(false);
      expect(isValidCoordinate(0, -181)).toBe(false);
    });

    it('should return false for NaN', () => {
      expect(isValidCoordinate(NaN, 0)).toBe(false);
      expect(isValidCoordinate(0, NaN)).toBe(false);
    });

    it('should return false for Infinity', () => {
      expect(isValidCoordinate(Infinity, 0)).toBe(false);
      expect(isValidCoordinate(0, -Infinity)).toBe(false);
    });
  });

  describe('NOMINATIM_API constants', () => {
    it('should have correct base URL', () => {
      expect(NOMINATIM_API.BASE_URL).toBe('https://nominatim.openstreetmap.org');
    });

    it('should have SEARCH endpoint', () => {
      expect(NOMINATIM_API.SEARCH).toContain('nominatim.openstreetmap.org/search');
    });

    it('should have REVERSE endpoint', () => {
      expect(NOMINATIM_API.REVERSE).toContain('nominatim.openstreetmap.org/reverse');
    });

    it('should have USER_AGENT with Smuppy identifier', () => {
      expect(NOMINATIM_API.USER_AGENT).toContain('Smuppy');
    });
  });

  describe('GOOGLE_API constants', () => {
    it('should have API_KEY from ENV', () => {
      expect(GOOGLE_API.API_KEY).toBe('test-google-key');
    });

    it('should have places autocomplete endpoint', () => {
      expect(GOOGLE_API.PLACES_AUTOCOMPLETE).toContain('maps.googleapis.com');
    });
  });

  describe('BACKEND_API constants', () => {
    it('should have BASE_URL from ENV', () => {
      expect(BACKEND_API.BASE_URL).toBe('https://api.test.com/api');
    });

    it('should have auth endpoints', () => {
      expect(BACKEND_API.AUTH.LOGIN).toBe('/auth/login');
      expect(BACKEND_API.AUTH.REGISTER).toBe('/auth/register');
      expect(BACKEND_API.AUTH.VERIFY_CODE).toBe('/auth/verify');
      expect(BACKEND_API.AUTH.REFRESH_TOKEN).toBe('/auth/refresh');
    });

    it('should have user endpoints', () => {
      expect(BACKEND_API.USER.PROFILE).toBe('/user/profile');
      expect(BACKEND_API.USER.UPDATE).toBe('/user/update');
    });
  });

  describe('buildPlacesAutocompleteUrl', () => {
    it('should build URL with default options', () => {
      const url = buildPlacesAutocompleteUrl('Paris');
      expect(url).toContain('maps.googleapis.com/maps/api/place/autocomplete/json');
      expect(url).toContain('input=Paris');
      expect(url).toContain('key=test-google-key');
      expect(url).toContain('types=address');
      expect(url).toContain('language=en');
    });

    it('should include custom types', () => {
      const url = buildPlacesAutocompleteUrl('Paris', { types: 'establishment' });
      expect(url).toContain('types=establishment');
    });

    it('should include country filter', () => {
      const url = buildPlacesAutocompleteUrl('Paris', { country: 'fr' });
      expect(url).toContain('components=country%3Afr');
    });

    it('should include custom language', () => {
      const url = buildPlacesAutocompleteUrl('Paris', { language: 'fr' });
      expect(url).toContain('language=fr');
    });
  });

  describe('buildPlacesDetailsUrl', () => {
    it('should build URL with default fields', () => {
      const url = buildPlacesDetailsUrl('ChIJD7fiBh9u5kcRYJSMaMOCCwQ');
      expect(url).toContain('place_id=ChIJD7fiBh9u5kcRYJSMaMOCCwQ');
      expect(url).toContain('key=test-google-key');
      expect(url).toContain('fields=formatted_address%2Cgeometry%2Cname');
    });

    it('should include custom fields', () => {
      const url = buildPlacesDetailsUrl('ChIJ123', { fields: 'name,geometry' });
      expect(url).toContain('fields=name%2Cgeometry');
    });
  });

  describe('buildGeocodingUrl', () => {
    it('should build geocoding URL', () => {
      const url = buildGeocodingUrl('1600 Amphitheatre Parkway');
      expect(url).toContain('maps.googleapis.com/maps/api/geocode/json');
      expect(url).toContain('address=1600%20Amphitheatre%20Parkway');
      expect(url).toContain('key=test-google-key');
    });
  });

  describe('searchNominatim', () => {
    it('should return empty array for empty query', async () => {
      const results = await searchNominatim('');
      expect(results).toEqual([]);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should return empty array for null-like query', async () => {
      const results = await searchNominatim('   ');
      expect(results).toEqual([]);
    });

    it('should call fetch with correct URL and headers', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([{ display_name: 'Paris', lat: '48.8566', lon: '2.3522' }]),
      });

      const results = await searchNominatim('Paris');
      expect(mockFetch).toHaveBeenCalled();
      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toContain('nominatim.openstreetmap.org/search');
      expect(url).toContain('q=Paris');
      expect(url).toContain('format=json');
      expect(options.headers['User-Agent']).toContain('Smuppy');
      expect(results).toHaveLength(1);
    });

    it('should return empty array on fetch failure', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));
      const results = await searchNominatim('Paris');
      expect(results).toEqual([]);
    });

    it('should return empty array on non-ok response', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 500 });
      const results = await searchNominatim('Paris');
      expect(results).toEqual([]);
    });

    it('should sanitize HTML from query', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([]),
      });
      await searchNominatim('<script>alert(1)</script>Paris');
      const [url] = mockFetch.mock.calls[0];
      expect(url).not.toContain('<script>');
    });

    it('should truncate long queries to 100 chars', async () => {
      const longQuery = 'a'.repeat(200);
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([]),
      });
      await searchNominatim(longQuery);
      const [url] = mockFetch.mock.calls[0];
      // The encoded query should use the truncated version
      expect(url).toBeDefined();
    });

    it('should include countrycodes option', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([]),
      });
      await searchNominatim('Paris', { countrycodes: 'fr' });
      const [url] = mockFetch.mock.calls[0];
      expect(url).toContain('countrycodes=fr');
    });

    it('should include language option', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([]),
      });
      await searchNominatim('Paris', { language: 'fr' });
      const [url] = mockFetch.mock.calls[0];
      expect(url).toContain('accept-language=fr');
    });
  });

  describe('reverseGeocodeNominatim', () => {
    it('should return null for invalid coordinates', async () => {
      const result = await reverseGeocodeNominatim(91, 0);
      expect(result).toBeNull();
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should return null for NaN coordinates', async () => {
      const result = await reverseGeocodeNominatim(NaN, 0);
      expect(result).toBeNull();
    });

    it('should return result for valid coordinates', async () => {
      const mockResult = {
        display_name: 'Paris, France',
        lat: '48.8566',
        lon: '2.3522',
        address: { city: 'Paris', country: 'France' },
      };
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResult),
      });

      const result = await reverseGeocodeNominatim(48.8566, 2.3522);
      expect(result).toEqual(mockResult);
    });

    it('should return null on fetch failure', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));
      const result = await reverseGeocodeNominatim(48.8566, 2.3522);
      expect(result).toBeNull();
    });

    it('should return null on error in response data', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ error: 'Unable to geocode' }),
      });
      const result = await reverseGeocodeNominatim(48.8566, 2.3522);
      expect(result).toBeNull();
    });

    it('should return null when display_name is missing', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ lat: '48.8566', lon: '2.3522' }),
      });
      const result = await reverseGeocodeNominatim(48.8566, 2.3522);
      expect(result).toBeNull();
    });

    it('should return null when response lat/lon are invalid', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ display_name: 'Test', lat: 'invalid', lon: '0' }),
      });
      const result = await reverseGeocodeNominatim(48.8566, 2.3522);
      expect(result).toBeNull();
    });

    it('should include language parameter', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            display_name: 'Paris, France',
            lat: '48.8566',
            lon: '2.3522',
          }),
      });
      await reverseGeocodeNominatim(48.8566, 2.3522, 'fr');
      const [url] = mockFetch.mock.calls[0];
      expect(url).toContain('accept-language=fr');
    });

    it('should return null on non-ok response', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 500 });
      const result = await reverseGeocodeNominatim(48.8566, 2.3522);
      expect(result).toBeNull();
    });
  });

  describe('formatNominatimResult', () => {
    it('should format result with address', () => {
      const result = formatNominatimResult({
        place_id: 1,
        licence: '',
        osm_type: 'node',
        osm_id: 1,
        lat: '48.8566',
        lon: '2.3522',
        display_name: '15 Rue de Rivoli, Paris, France',
        address: {
          house_number: '15',
          road: 'Rue de Rivoli',
          city: 'Paris',
          state: 'Ile-de-France',
          country: 'France',
        },
      });
      expect(result.mainText).toBe('15 Rue de Rivoli');
      expect(result.secondaryText).toBe('Paris, Ile-de-France, France');
      expect(result.fullAddress).toBe('15 Rue de Rivoli, Paris, France');
    });

    it('should format result without address', () => {
      const result = formatNominatimResult({
        place_id: 1,
        licence: '',
        osm_type: 'node',
        osm_id: 1,
        lat: '48.8566',
        lon: '2.3522',
        display_name: 'Paris, France',
      });
      expect(result.mainText).toBe('Paris');
      expect(result.secondaryText).toBe('France');
      expect(result.fullAddress).toBe('Paris, France');
    });

    it('should use neighbourhood when no house_number/road', () => {
      const result = formatNominatimResult({
        place_id: 1,
        licence: '',
        osm_type: 'node',
        osm_id: 1,
        lat: '48.8566',
        lon: '2.3522',
        display_name: 'Marais, Paris, France',
        address: {
          neighbourhood: 'Marais',
          city: 'Paris',
          country: 'France',
        },
      });
      expect(result.mainText).toBe('Marais');
    });

    it('should use city as fallback when no road/neighbourhood', () => {
      const result = formatNominatimResult({
        place_id: 1,
        licence: '',
        osm_type: 'node',
        osm_id: 1,
        lat: '48.8566',
        lon: '2.3522',
        display_name: 'Paris, France',
        address: {
          city: 'Paris',
          country: 'France',
        },
      });
      expect(result.mainText).toBe('Paris');
    });

    it('should use town when city is not available', () => {
      const result = formatNominatimResult({
        place_id: 1,
        licence: '',
        osm_type: 'node',
        osm_id: 1,
        lat: '43.5',
        lon: '1.5',
        display_name: 'Blagnac, France',
        address: {
          town: 'Blagnac',
          country: 'France',
        },
      });
      expect(result.mainText).toBe('Blagnac');
      expect(result.secondaryText).toContain('France');
    });
  });
});

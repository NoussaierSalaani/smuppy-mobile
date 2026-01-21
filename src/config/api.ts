/**
 * External API Configuration
 *
 * API keys are loaded from environment variables via ENV config.
 * See .env.example for required variables.
 */
import { ENV } from './env';

// ============================================
// NOMINATIM API (OpenStreetMap - FREE)
// ============================================
export const NOMINATIM_API = {
  // Base URL - using public endpoint (for production, consider self-hosting)
  BASE_URL: 'https://nominatim.openstreetmap.org',

  // Endpoints
  SEARCH: 'https://nominatim.openstreetmap.org/search',
  REVERSE: 'https://nominatim.openstreetmap.org/reverse',

  // User agent required by Nominatim ToS
  USER_AGENT: 'Smuppy/1.0 (contact@smuppy.app)',
};

// ============================================
// GOOGLE APIS (kept as backup/optional)
// ============================================
export const GOOGLE_API = {
  API_KEY: ENV.GOOGLE_API_KEY,
  PLACES_AUTOCOMPLETE: 'https://maps.googleapis.com/maps/api/place/autocomplete/json',
  PLACES_DETAILS: 'https://maps.googleapis.com/maps/api/place/details/json',
  GEOCODING: 'https://maps.googleapis.com/maps/api/geocode/json',
};

// ============================================
// BACKEND API
// ============================================
export const BACKEND_API = {
  BASE_URL: ENV.API_URL,
  AUTH: {
    LOGIN: '/auth/login',
    REGISTER: '/auth/register',
    VERIFY_CODE: '/auth/verify',
    REFRESH_TOKEN: '/auth/refresh',
  },
  USER: {
    PROFILE: '/user/profile',
    UPDATE: '/user/update',
  },
};

// ============================================
// HELPER FUNCTIONS
// ============================================

const buildQueryString = (params: Record<string, string | number | boolean | undefined | null>): string => {
  return Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&');
};

// ============================================
// GOOGLE PLACES HELPERS (backup for BusinessInfoScreen)
// ============================================

interface PlacesAutocompleteOptions {
  types?: string;
  language?: string;
  country?: string;
}

export const buildPlacesAutocompleteUrl = (query: string, options: PlacesAutocompleteOptions = {}): string => {
  const params = {
    input: query,
    key: GOOGLE_API.API_KEY,
    types: options.types || 'address',
    language: options.language || 'en',
    ...(options.country && { components: `country:${options.country}` }),
  };
  return `${GOOGLE_API.PLACES_AUTOCOMPLETE}?${buildQueryString(params)}`;
};

interface PlacesDetailsOptions {
  fields?: string;
}

export const buildPlacesDetailsUrl = (placeId: string, options: PlacesDetailsOptions = {}): string => {
  const params = {
    place_id: placeId,
    key: GOOGLE_API.API_KEY,
    fields: options.fields || 'formatted_address,geometry,name',
  };
  return `${GOOGLE_API.PLACES_DETAILS}?${buildQueryString(params)}`;
};

export const buildGeocodingUrl = (address: string): string => {
  const params = {
    address: address,
    key: GOOGLE_API.API_KEY,
  };
  return `${GOOGLE_API.GEOCODING}?${buildQueryString(params)}`;
};

// ============================================
// NOMINATIM HELPER FUNCTIONS (FREE - Primary)
// ============================================

export interface NominatimSearchResult {
  place_id: number;
  licence: string;
  osm_type: string;
  osm_id: number;
  lat: string;
  lon: string;
  display_name: string;
  address?: {
    house_number?: string;
    road?: string;
    neighbourhood?: string;
    suburb?: string;
    city?: string;
    town?: string;
    village?: string;
    county?: string;
    state?: string;
    postcode?: string;
    country?: string;
    country_code?: string;
  };
  boundingbox?: string[];
}

interface NominatimSearchOptions {
  limit?: number;
  countrycodes?: string;
  language?: string;
  addressdetails?: boolean;
}

/**
 * Search locations using Nominatim (OpenStreetMap) - FREE
 */
export const searchNominatim = async (
  query: string,
  options: NominatimSearchOptions = {}
): Promise<NominatimSearchResult[]> => {
  const params = {
    q: query,
    format: 'json',
    limit: options.limit || 5,
    addressdetails: options.addressdetails !== false ? 1 : 0,
    ...(options.countrycodes && { countrycodes: options.countrycodes }),
    ...(options.language && { 'accept-language': options.language }),
  };

  const url = `${NOMINATIM_API.SEARCH}?${buildQueryString(params)}`;

  const response = await fetch(url, {
    headers: {
      'User-Agent': NOMINATIM_API.USER_AGENT,
    },
  });

  if (!response.ok) {
    throw new Error(`Nominatim error: ${response.status}`);
  }

  return response.json();
};

/**
 * Reverse geocode coordinates using Nominatim - FREE
 */
export const reverseGeocodeNominatim = async (
  lat: number,
  lon: number,
  language?: string
): Promise<NominatimSearchResult | null> => {
  const params = {
    lat: lat,
    lon: lon,
    format: 'json',
    addressdetails: 1,
    ...(language && { 'accept-language': language }),
  };

  const url = `${NOMINATIM_API.REVERSE}?${buildQueryString(params)}`;

  const response = await fetch(url, {
    headers: {
      'User-Agent': NOMINATIM_API.USER_AGENT,
    },
  });

  if (!response.ok) {
    throw new Error(`Nominatim error: ${response.status}`);
  }

  const data = await response.json();
  return data.error ? null : data;
};

/**
 * Format Nominatim result for display
 */
export const formatNominatimResult = (result: NominatimSearchResult): {
  mainText: string;
  secondaryText: string;
  fullAddress: string;
} => {
  const address = result.address;

  if (!address) {
    return {
      mainText: result.display_name.split(',')[0],
      secondaryText: result.display_name.split(',').slice(1).join(',').trim(),
      fullAddress: result.display_name,
    };
  }

  // Build main text (most specific part)
  const mainParts = [
    address.house_number,
    address.road,
  ].filter(Boolean);

  const mainText = mainParts.length > 0
    ? mainParts.join(' ')
    : address.neighbourhood || address.suburb || address.city || address.town || address.village || result.display_name.split(',')[0];

  // Build secondary text (city, state, country)
  const secondaryParts = [
    address.city || address.town || address.village,
    address.state,
    address.country,
  ].filter(Boolean);

  const secondaryText = secondaryParts.join(', ');

  return {
    mainText,
    secondaryText,
    fullAddress: result.display_name,
  };
};
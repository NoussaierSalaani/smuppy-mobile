/**
 * External API Configuration
 *
 * API keys are loaded from environment variables via ENV config.
 * See .env.example for required variables.
 */
import { ENV } from './env';

// ============================================
// GOOGLE APIS
// ============================================
export const GOOGLE_API = {
    // API key loaded from environment
    API_KEY: ENV.GOOGLE_API_KEY,

    // Endpoints
    PLACES_AUTOCOMPLETE: 'https://maps.googleapis.com/maps/api/place/autocomplete/json',
    PLACES_DETAILS: 'https://maps.googleapis.com/maps/api/place/details/json',
    GEOCODING: 'https://maps.googleapis.com/maps/api/geocode/json',
  };

  // ============================================
  // BACKEND API
  // ============================================
  export const BACKEND_API = {
    // Base URL loaded from environment
    BASE_URL: ENV.API_URL,

    // Endpoints
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
  // OTHER SERVICES (add as needed)
  // ============================================
  export const SERVICES = {
    // Firebase (if used)
    // FIREBASE_API_KEY: ENV.FIREBASE_API_KEY,

    // Stripe (if used for payments)
    // STRIPE_PUBLISHABLE_KEY: ENV.STRIPE_PUBLISHABLE_KEY,

    // Analytics
    // MIXPANEL_TOKEN: ENV.MIXPANEL_TOKEN,
  };
  
  // ============================================
  // HELPER FUNCTIONS
  // ============================================
  
  /**
   * Helper pour construire les query params (compatible Android)
   */
  const buildQueryString = (params: Record<string, string | number | boolean | undefined | null>): string => {
    return Object.entries(params)
      .filter(([, v]) => v !== undefined && v !== null)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
      .join('&');
  };

  interface PlacesAutocompleteOptions {
    types?: string;
    language?: string;
    country?: string;
  }

  /**
   * Construire une URL Google Places Autocomplete
   */
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

  /**
   * Construire une URL Google Places Details
   */
  export const buildPlacesDetailsUrl = (placeId: string, options: PlacesDetailsOptions = {}): string => {
    const params = {
      place_id: placeId,
      key: GOOGLE_API.API_KEY,
      fields: options.fields || 'formatted_address,geometry,name',
    };

    return `${GOOGLE_API.PLACES_DETAILS}?${buildQueryString(params)}`;
  };

  /**
   * Construire une URL Google Geocoding
   */
  export const buildGeocodingUrl = (address: string): string => {
    const params = {
      address: address,
      key: GOOGLE_API.API_KEY,
    };

    return `${GOOGLE_API.GEOCODING}?${buildQueryString(params)}`;
  };
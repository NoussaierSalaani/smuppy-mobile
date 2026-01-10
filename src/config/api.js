/**
 * Configuration des APIs externes
 * 
 * ⚠️ SÉCURITÉ : Ce fichier ne doit JAMAIS être commité sur GitHub public
 * Ajouter à .gitignore : src/config/api.js
 * 
 * Pour la production, utiliser des variables d'environnement :
 * - React Native : react-native-config
 * - Expo : expo-constants avec app.json extra
 */

// ============================================
// GOOGLE APIS
// ============================================
export const GOOGLE_API = {
    // Clé API Google (Places, Maps, etc.)
    API_KEY: 'AIzaSyAsdPSCcyNVghsz1pKZd0w02fJokTP0mW0',
    
    // Endpoints
    PLACES_AUTOCOMPLETE: 'https://maps.googleapis.com/maps/api/place/autocomplete/json',
    PLACES_DETAILS: 'https://maps.googleapis.com/maps/api/place/details/json',
    GEOCODING: 'https://maps.googleapis.com/maps/api/geocode/json',
  };
  
  // ============================================
  // BACKEND API (à configurer plus tard)
  // ============================================
  export const BACKEND_API = {
    // URL de base de ton backend
    BASE_URL: __DEV__ 
      ? 'http://localhost:3000/api'  // Développement
      : 'https://api.smuppy.com/api', // Production
    
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
  // AUTRES SERVICES (à ajouter selon besoins)
  // ============================================
  export const SERVICES = {
    // Firebase (si utilisé)
    // FIREBASE_API_KEY: 'xxx',
    
    // Stripe (si utilisé pour paiements)
    // STRIPE_PUBLISHABLE_KEY: 'xxx',
    
    // Analytics
    // MIXPANEL_TOKEN: 'xxx',
  };
  
  // ============================================
  // HELPER FUNCTIONS
  // ============================================
  
  /**
   * Construire une URL Google Places Autocomplete
   */
  export const buildPlacesAutocompleteUrl = (query, options = {}) => {
    const params = new URLSearchParams({
      input: query,
      key: GOOGLE_API.API_KEY,
      types: options.types || 'address',
      language: options.language || 'en',
      ...(options.country && { components: `country:${options.country}` }),
    });
    
    return `${GOOGLE_API.PLACES_AUTOCOMPLETE}?${params.toString()}`;
  };
  
  /**
   * Construire une URL Google Places Details
   */
  export const buildPlacesDetailsUrl = (placeId, options = {}) => {
    const params = new URLSearchParams({
      place_id: placeId,
      key: GOOGLE_API.API_KEY,
      fields: options.fields || 'formatted_address,geometry,name',
    });
    
    return `${GOOGLE_API.PLACES_DETAILS}?${params.toString()}`;
  };
  
  /**
   * Construire une URL Google Geocoding
   */
  export const buildGeocodingUrl = (address) => {
    const params = new URLSearchParams({
      address: address,
      key: GOOGLE_API.API_KEY,
    });
    
    return `${GOOGLE_API.GEOCODING}?${params.toString()}`;
  };
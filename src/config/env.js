import Constants from 'expo-constants';

/**
 * Environment configuration loaded from app.config.js
 * Values are read from .env file at build time
 */
const extra = Constants.expoConfig?.extra || {};

export const ENV = {
  // Supabase
  SUPABASE_URL: extra.supabaseUrl || '',
  SUPABASE_ANON_KEY: extra.supabaseAnonKey || '',

  // Google APIs
  GOOGLE_API_KEY: extra.googleApiKey || '',

  // Backend API
  API_URL: __DEV__
    ? (extra.apiUrlDev || 'http://localhost:3000/api')
    : (extra.apiUrlProd || 'https://api.smuppy.com/api'),

  // App info
  APP_ENV: extra.appEnv || 'dev',
  isDev: __DEV__,
  appVersion: Constants.expoConfig?.version || '1.0.0',
};

// Validation: warn if critical env vars are missing
if (__DEV__) {
  if (!ENV.SUPABASE_URL || !ENV.SUPABASE_ANON_KEY) {
    console.warn('[ENV] Missing Supabase configuration. Check your .env file.');
  }
  if (!ENV.GOOGLE_API_KEY) {
    console.warn('[ENV] Missing Google API key. Check your .env file.');
  }
}
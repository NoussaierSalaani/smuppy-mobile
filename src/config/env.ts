import Constants from 'expo-constants';

/**
 * Environment configuration loaded from app.config.js
 * Values are read from .env file at build time
 *
 * Supports:
 * - EAS builds (production/preview): process.env via app.config.js
 * - Expo Go (dev): .env file via dotenv/config in app.config.js
 */
const extra = Constants.expoConfig?.extra
  || (Constants.manifest as any)?.extra
  || (Constants.manifest2 as any)?.extra
  || {};

export const ENV = {
  // Supabase
  SUPABASE_URL: extra.supabaseUrl || '',
  SUPABASE_ANON_KEY: extra.supabaseAnonKey || '',

  // Google APIs
  GOOGLE_API_KEY: extra.googleApiKey || '',

  // Backend API
  // Note: Use HTTPS even in development for security testing
  // For local dev with self-signed certs, use ngrok or similar tunnels
  API_URL: __DEV__
    ? (extra.apiUrlDev || 'https://localhost:3000/api')
    : (extra.apiUrlProd || 'https://api.smuppy.com/api'),

  // HTTPS enforcement
  ENFORCE_HTTPS: !__DEV__, // Always enforce in production

  // AWS S3 & CloudFront
  AWS_REGION: extra.awsRegion || 'eu-west-3',
  S3_BUCKET_NAME: extra.s3BucketName || '',
  CLOUDFRONT_URL: extra.cloudfrontUrl || '',

  // Sentry (Error Tracking)
  SENTRY_DSN: extra.sentryDsn || '',

  // App info
  APP_ENV: extra.appEnv || (__DEV__ ? 'development' : 'production'),
  APP_VERSION: Constants.expoConfig?.version || '1.0.0',
  isDev: __DEV__,

  // Legacy alias (for backwards compatibility)
  appVersion: Constants.expoConfig?.version || '1.0.0',
};

// Validation: warn if critical env vars are missing
if (__DEV__) {
  const missingVars = [];

  if (!ENV.SUPABASE_URL || !ENV.SUPABASE_ANON_KEY) {
    missingVars.push('SUPABASE_URL, SUPABASE_ANON_KEY');
  }
  if (!ENV.GOOGLE_API_KEY) {
    missingVars.push('GOOGLE_API_KEY');
  }
  if (!ENV.SENTRY_DSN) {
    console.log('[ENV] Sentry DSN not configured. Error tracking disabled.');
  }

  if (missingVars.length > 0) {
    console.warn(`[ENV] Missing configuration: ${missingVars.join(', ')}. Check your .env file.`);
  }
}

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
  || (Constants.manifest as Record<string, unknown> | null)?.extra as Record<string, string> | undefined
  || (Constants.manifest2 as Record<string, unknown> | null)?.extra as Record<string, string> | undefined
  || {};

export const ENV = {
  // Google APIs
  GOOGLE_API_KEY: extra.googleApiKey || '',

  // Google OAuth Client IDs (for Sign-In with Google)
  // These need to be created in Google Cloud Console
  GOOGLE_IOS_CLIENT_ID: extra.googleIosClientId || '',
  GOOGLE_ANDROID_CLIENT_ID: extra.googleAndroidClientId || '',
  GOOGLE_WEB_CLIENT_ID: extra.googleWebClientId || '',

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

  // Agora (Live Streaming & Video Calls)
  AGORA_APP_ID: extra.agoraAppId || '',

  // Mapbox — token loaded from app.config.js extra (via .env or EAS env vars)
  MAPBOX_ACCESS_TOKEN: extra.mapboxAccessToken || '',

  // Sentry
  SENTRY_DSN: extra.sentryDsn || '',

  // App info
  APP_ENV: extra.appEnv || (__DEV__ ? 'development' : 'production'),
  APP_VERSION: Constants.expoConfig?.version || '1.0.0',
  BUILD_NUMBER: Constants.expoConfig?.ios?.buildNumber || Constants.expoConfig?.android?.versionCode?.toString() || '1',
  GIT_COMMIT_SHA: extra.gitCommitSha || 'unknown',
  EAS_BUILD_PROFILE: extra.easBuildProfile || 'local',
  RUNTIME_VERSION: typeof Constants.expoConfig?.runtimeVersion === 'string'
    ? Constants.expoConfig.runtimeVersion
    : Constants.expoConfig?.version || '1.0.0',
  isDev: __DEV__,

  // Legacy alias (for backwards compatibility)
  appVersion: Constants.expoConfig?.version || '1.0.0',
};

// Validation: warn if critical env vars are missing (dev only, never crash)
if (__DEV__) {
  if (!ENV.GOOGLE_API_KEY) {
    console.warn('[ENV] Missing configuration: GOOGLE_API_KEY. Check your .env file.');
  }
}

/// <reference path="../types/global.d.ts" />
/**
 * AWS Configuration for Smuppy
 *
 * All config values are loaded from EXPO_PUBLIC_* environment variables.
 *
 * SAFETY RULE: This module NEVER throws at import/startup time.
 * A crash here kills the app before ErrorBoundary mounts — instant death on iOS.
 *
 * Behavior:
 * - Production / Release builds: use env vars. If missing, fall back to staging
 *   defaults and log a single console.error (app stays alive).
 * - Dev with EXPO_PUBLIC_DEV_USE_STAGING=true in .env: silently use staging defaults for
 *   any missing EXPO_PUBLIC_* vars, log one consolidated warning.
 * - Dev WITHOUT EXPO_PUBLIC_DEV_USE_STAGING: log an error for each missing var so the
 *   developer knows their .env is incomplete, but still use staging defaults
 *   (never crash).
 */

import { captureMessage as sentryCaptureMessage } from '../lib/sentry';

// Helper: read Expo env var (works with Expo's inline substitution).
// Expo replaces missing EXPO_PUBLIC_* vars with `__MISSING_<NAME>__` at build time.
// That string is truthy, so we must reject it explicitly.
const env = (key: string): string | undefined => {
  try {
    const value = typeof process !== 'undefined' ? process.env?.[key] : undefined;
    if (typeof value === 'string' && value.startsWith('__MISSING_')) return undefined;
    return value;
  } catch {
    return undefined;
  }
};

export interface AWSConfig {
  region: string;
  cognito: {
    userPoolId: string;
    userPoolClientId: string;
    identityPoolId: string;
  };
  api: {
    restEndpoint: string;
    restEndpoint2: string;
    restEndpoint3: string;
    restEndpointDisputes: string;
    graphqlEndpoint: string;
    websocketEndpoint: string;
  };
  storage: {
    bucket: string;
    cdnDomain: string;
  };
  dynamodb: {
    feedTable: string;
    likesTable: string;
  };
}

// SECURITY: Staging defaults — used ONLY as fallback when EXPO_PUBLIC_* vars are missing.
// These IDs are for the staging environment only and have no access to production data.
const STAGING_DEFAULTS = {
  region: 'us-east-1',
  userPoolId: 'us-east-1_mvBH1S3yX',
  userPoolClientId: '60bt4bafj98q0nkjprpidegr0t',
  identityPoolId: 'us-east-1:ff7c6b31-86c7-4bd1-8b91-f0f41adc828a',
  restEndpoint: 'https://90pg0i63ff.execute-api.us-east-1.amazonaws.com/staging',
  restEndpoint2: 'https://lhvm623909.execute-api.us-east-1.amazonaws.com/staging',
  restEndpoint3: 'https://1e2fsip7a4.execute-api.us-east-1.amazonaws.com/staging',
  restEndpointDisputes: 'https://wk7tymrgbg.execute-api.us-east-1.amazonaws.com/staging',
  graphqlEndpoint: 'https://e55gq4swgra43heqxqj726ivda.appsync-api.us-east-1.amazonaws.com/graphql',
  websocketEndpoint: 'wss://35hlodqnj9.execute-api.us-east-1.amazonaws.com/staging',
  bucket: 'smuppy-media-staging-471112656108',
  cdnDomain: 'https://dc8kq67t0asis.cloudfront.net',
  feedTable: 'smuppy-feeds-staging',
  likesTable: 'smuppy-likes-staging',
} as const;

// Environment detection
const getEnvironment = (): 'staging' | 'production' => {
  if (env('EXPO_PUBLIC_ENV') === 'production') return 'production';
  if (env('APP_ENV') === 'production') return 'production';
  if (env('REACT_APP_ENV') === 'production') return 'production';
  return 'staging';
};

// Build config from env vars, always falling back to staging defaults (NEVER throw)
export const getAWSConfig = (): AWSConfig => {
  const currentEnv = getEnvironment();
  const isProduction = currentEnv === 'production';
  const isReleaseBuild = typeof __DEV__ !== 'undefined' ? !__DEV__ : process.env.NODE_ENV === 'production';
  const devUsesStaging = __DEV__ && env('EXPO_PUBLIC_DEV_USE_STAGING') === 'true';

  // Track which vars fell back to staging defaults
  const fallbackVars: string[] = [];

  const resolve = (envKey: string, stagingDefault: string): string => {
    const value = env(envKey);
    if (value) return value;
    fallbackVars.push(envKey);
    return stagingDefault;
  };

  const config: AWSConfig = {
    region: resolve('EXPO_PUBLIC_AWS_REGION', STAGING_DEFAULTS.region),
    cognito: {
      userPoolId: resolve('EXPO_PUBLIC_COGNITO_USER_POOL_ID', STAGING_DEFAULTS.userPoolId),
      userPoolClientId: resolve('EXPO_PUBLIC_COGNITO_CLIENT_ID', STAGING_DEFAULTS.userPoolClientId),
      identityPoolId: resolve('EXPO_PUBLIC_COGNITO_IDENTITY_POOL_ID', STAGING_DEFAULTS.identityPoolId),
    },
    api: {
      restEndpoint: resolve('EXPO_PUBLIC_API_REST_ENDPOINT', STAGING_DEFAULTS.restEndpoint),
      restEndpoint2: resolve('EXPO_PUBLIC_API_REST_ENDPOINT_2', STAGING_DEFAULTS.restEndpoint2),
      restEndpoint3: resolve('EXPO_PUBLIC_API_REST_ENDPOINT_3', STAGING_DEFAULTS.restEndpoint3),
      restEndpointDisputes: resolve('EXPO_PUBLIC_API_REST_ENDPOINT_DISPUTES', STAGING_DEFAULTS.restEndpointDisputes),
      graphqlEndpoint: resolve('EXPO_PUBLIC_API_GRAPHQL_ENDPOINT', STAGING_DEFAULTS.graphqlEndpoint),
      websocketEndpoint: resolve('EXPO_PUBLIC_API_WEBSOCKET_ENDPOINT', STAGING_DEFAULTS.websocketEndpoint),
    },
    storage: {
      bucket: resolve('EXPO_PUBLIC_S3_BUCKET', STAGING_DEFAULTS.bucket),
      cdnDomain: resolve('EXPO_PUBLIC_CDN_DOMAIN', STAGING_DEFAULTS.cdnDomain),
    },
    dynamodb: {
      feedTable: resolve('EXPO_PUBLIC_DYNAMODB_FEED_TABLE', STAGING_DEFAULTS.feedTable),
      likesTable: resolve('EXPO_PUBLIC_DYNAMODB_LIKES_TABLE', STAGING_DEFAULTS.likesTable),
    },
  };

  // Consolidated logging — one message, never a throw
  if (fallbackVars.length > 0) {
    if ((isProduction || isReleaseBuild) && !__DEV__) {
      // PRODUCTION: log error but NEVER crash — app must start
      const msg =
        `[AWS Config] PRODUCTION BUILD: ${fallbackVars.length} config value(s) missing, using staging fallbacks. ` +
        `Missing: ${fallbackVars.join(', ')}. ` +
        'Ensure all EXPO_PUBLIC_* vars are set in EAS Secrets.';
      console.error(msg);
      try {
        sentryCaptureMessage(msg, 'fatal', { fallbackVars, environment: currentEnv });
      } catch { /* Sentry not available — ignore */ }
    } else if (devUsesStaging) {
      // DEV with opt-in: single consolidated warning
      console.warn(
        `[AWS Config] DEV_USE_STAGING=true — ${fallbackVars.length} config value(s) using staging defaults.`
      );
    } else if (__DEV__) {
      // DEV without opt-in: clear error telling developer what to do
      console.error(
        `[AWS Config] ${fallbackVars.length} EXPO_PUBLIC_* variable(s) missing: ${fallbackVars.join(', ')}. ` +
        'Either set them in your .env file, or add EXPO_PUBLIC_DEV_USE_STAGING=true to your .env to acknowledge staging defaults.'
      );
    }
  }

  return config;
};

export const AWS_CONFIG = getAWSConfig();

// Amplify configuration format (for aws-amplify library)
export const AMPLIFY_CONFIG = {
  Auth: {
    Cognito: {
      userPoolId: AWS_CONFIG.cognito.userPoolId,
      userPoolClientId: AWS_CONFIG.cognito.userPoolClientId,
      identityPoolId: AWS_CONFIG.cognito.identityPoolId,
      region: AWS_CONFIG.region,
      signUpVerificationMethod: 'code' as const,
      loginWith: {
        email: true,
        phone: false,
        username: false,
      },
      passwordFormat: {
        minLength: 8,
        requireLowercase: true,
        requireUppercase: true,
        requireNumbers: true,
        requireSpecialCharacters: true,
      },
    },
  },
  API: {
    REST: {
      SmuppyAPI: {
        endpoint: AWS_CONFIG.api.restEndpoint,
        region: AWS_CONFIG.region,
      },
    },
    GraphQL: {
      endpoint: AWS_CONFIG.api.graphqlEndpoint,
      region: AWS_CONFIG.region,
      defaultAuthMode: 'userPool' as const,
    },
  },
  Storage: {
    S3: {
      bucket: AWS_CONFIG.storage.bucket,
      region: AWS_CONFIG.region,
    },
  },
};

export default AWS_CONFIG;

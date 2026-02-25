/// <reference path="../types/global.d.ts" />
/**
 * AWS Configuration for Smuppy
 *
 * Config values are loaded from Constants.expoConfig.extra (populated by app.config.js
 * at build time). This is MORE RELIABLE than process.env[key] because Expo's babel
 * plugin only statically replaces `process.env.EXPO_PUBLIC_X` — dynamic access
 * `process.env[key]` fails in release builds.
 *
 * SAFETY RULE: This module NEVER throws at import/startup time.
 * A crash here kills the app before ErrorBoundary mounts — instant death on iOS.
 *
 * Fallback chain: expoConfig.extra → staging defaults → app stays alive.
 */

import Constants from 'expo-constants';
import { captureMessage as sentryCaptureMessage } from '../lib/sentry';

// Read extra config baked into the binary by app.config.js
const extra: Record<string, string | undefined> =
  (Constants.expoConfig?.extra as Record<string, string | undefined>) ?? {};

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

export const REQUIRED_PRODUCTION_EXPO_PUBLIC_KEYS = [
  'EXPO_PUBLIC_AWS_REGION',
  'EXPO_PUBLIC_COGNITO_USER_POOL_ID',
  'EXPO_PUBLIC_COGNITO_CLIENT_ID',
  'EXPO_PUBLIC_COGNITO_IDENTITY_POOL_ID',
  'EXPO_PUBLIC_API_REST_ENDPOINT',
  'EXPO_PUBLIC_API_REST_ENDPOINT_2',
  'EXPO_PUBLIC_API_REST_ENDPOINT_3',
  'EXPO_PUBLIC_API_REST_ENDPOINT_DISPUTES',
  'EXPO_PUBLIC_API_GRAPHQL_ENDPOINT',
  'EXPO_PUBLIC_API_WEBSOCKET_ENDPOINT',
  'EXPO_PUBLIC_S3_BUCKET',
  'EXPO_PUBLIC_CDN_DOMAIN',
  'EXPO_PUBLIC_DYNAMODB_FEED_TABLE',
  'EXPO_PUBLIC_DYNAMODB_LIKES_TABLE',
] as const;

export interface AWSConfigDiagnostics {
  environment: string;
  isReleaseBuild: boolean;
  usingStagingFallbacks: boolean;
  missingKeys: string[];
  resolvedHosts: {
    rest: string;
    graphql: string;
    websocket: string;
    cdn: string;
  };
}

let awsConfigDiagnostics: AWSConfigDiagnostics = {
  environment: 'unknown',
  isReleaseBuild: false,
  usingStagingFallbacks: false,
  missingKeys: [],
  resolvedHosts: {
    rest: 'n/a',
    graphql: 'n/a',
    websocket: 'n/a',
    cdn: 'n/a',
  },
};

const safeHost = (url: string): string => {
  try {
    return new URL(url).host;
  } catch {
    return 'invalid-url';
  }
};

export const getAWSConfigDiagnostics = (): AWSConfigDiagnostics => awsConfigDiagnostics;

// SECURITY: Staging defaults — used ONLY as fallback when extra config is missing.
// These MUST match actual staging infrastructure (SmuppyStack-staging).
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
  // Media: staging CDN+bucket (must match staging Lambdas for upload/display consistency)
  bucket: 'smuppy-media-staging-471112656108',
  cdnDomain: 'https://d3gy4x1feicix3.cloudfront.net',
  feedTable: 'smuppy-feeds-staging',
  likesTable: 'smuppy-likes-staging',
} as const;

// Build config from extra (app.config.js), falling back to staging defaults (NEVER throw)
export const getAWSConfig = (): AWSConfig => {
  const currentEnv = extra.expoPublicEnv || extra.appEnv || (__DEV__ ? 'staging' : 'production');
  const isReleaseBuild = typeof __DEV__ === 'undefined' ? process.env.NODE_ENV === 'production' : !__DEV__;

  // Track which vars fell back to staging defaults
  const fallbackVars: string[] = [];

  const resolve = (extraKey: string, stagingDefault: string, label: string): string => {
    const value = extra[extraKey];
    if (value && !value.startsWith('__MISSING_')) return value;
    fallbackVars.push(label);
    return stagingDefault;
  };

  const config: AWSConfig = {
    region: resolve('expoPublicAwsRegion', STAGING_DEFAULTS.region, 'AWS_REGION'),
    cognito: {
      userPoolId: resolve('expoPublicCognitoUserPoolId', STAGING_DEFAULTS.userPoolId, 'COGNITO_USER_POOL_ID'),
      userPoolClientId: resolve('expoPublicCognitoClientId', STAGING_DEFAULTS.userPoolClientId, 'COGNITO_CLIENT_ID'),
      identityPoolId: resolve('expoPublicCognitoIdentityPoolId', STAGING_DEFAULTS.identityPoolId, 'COGNITO_IDENTITY_POOL_ID'),
    },
    api: {
      restEndpoint: resolve('expoPublicApiRestEndpoint', STAGING_DEFAULTS.restEndpoint, 'API_REST_ENDPOINT'),
      restEndpoint2: resolve('expoPublicApiRestEndpoint2', STAGING_DEFAULTS.restEndpoint2, 'API_REST_ENDPOINT_2'),
      restEndpoint3: resolve('expoPublicApiRestEndpoint3', STAGING_DEFAULTS.restEndpoint3, 'API_REST_ENDPOINT_3'),
      restEndpointDisputes: resolve('expoPublicApiRestEndpointDisputes', STAGING_DEFAULTS.restEndpointDisputes, 'API_REST_ENDPOINT_DISPUTES'),
      graphqlEndpoint: resolve('expoPublicApiGraphqlEndpoint', STAGING_DEFAULTS.graphqlEndpoint, 'API_GRAPHQL_ENDPOINT'),
      websocketEndpoint: resolve('expoPublicApiWebsocketEndpoint', STAGING_DEFAULTS.websocketEndpoint, 'API_WEBSOCKET_ENDPOINT'),
    },
    storage: {
      bucket: resolve('expoPublicS3Bucket', STAGING_DEFAULTS.bucket, 'S3_BUCKET'),
      // CDN: try EXPO_PUBLIC_CDN_DOMAIN first, then CLOUDFRONT_URL (legacy), then default
      cdnDomain: extra.expoPublicCdnDomain && !extra.expoPublicCdnDomain.startsWith('__MISSING_')
        ? extra.expoPublicCdnDomain
        : extra.cloudfrontUrl && !extra.cloudfrontUrl.startsWith('__MISSING_')
          ? extra.cloudfrontUrl
          : (() => { fallbackVars.push('CDN_DOMAIN'); return STAGING_DEFAULTS.cdnDomain; })(),
    },
    dynamodb: {
      feedTable: resolve('expoPublicDynamodbFeedTable', STAGING_DEFAULTS.feedTable, 'DYNAMODB_FEED_TABLE'),
      likesTable: resolve('expoPublicDynamodbLikesTable', STAGING_DEFAULTS.likesTable, 'DYNAMODB_LIKES_TABLE'),
    },
  };

  awsConfigDiagnostics = {
    environment: currentEnv,
    isReleaseBuild,
    usingStagingFallbacks: fallbackVars.length > 0,
    missingKeys: [...fallbackVars],
    resolvedHosts: {
      rest: safeHost(config.api.restEndpoint),
      graphql: safeHost(config.api.graphqlEndpoint),
      websocket: safeHost(config.api.websocketEndpoint),
      cdn: safeHost(config.storage.cdnDomain),
    },
  };

  // Consolidated logging — one message, never a throw
  if (fallbackVars.length > 0) {
    if ((currentEnv === 'production' || isReleaseBuild) && !__DEV__) {
      const msg =
        `[AWS Config] PRODUCTION BUILD: ${fallbackVars.length} config value(s) missing, using staging fallbacks. ` +
        `Missing: ${fallbackVars.join(', ')}. ` +
        `Hosts: REST=${awsConfigDiagnostics.resolvedHosts.rest}, CDN=${awsConfigDiagnostics.resolvedHosts.cdn}. ` +
        'Ensure all EXPO_PUBLIC_* vars are set in EAS environment.';
      console.error(msg);
      try {
        sentryCaptureMessage(msg, 'fatal', {
          fallbackVars,
          environment: currentEnv,
          resolvedHosts: awsConfigDiagnostics.resolvedHosts,
        });
      } catch { /* Expected: Sentry may not be initialized during early config loading */ }
    } else if (__DEV__) {
      console.error(
        `[AWS Config] ${fallbackVars.length} config value(s) using staging defaults: ${fallbackVars.join(', ')}. ` +
        `Hosts: REST=${awsConfigDiagnostics.resolvedHosts.rest}, CDN=${awsConfigDiagnostics.resolvedHosts.cdn}.`
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

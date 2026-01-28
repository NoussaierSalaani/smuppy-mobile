/**
 * AWS Configuration for Smuppy
 *
 * All config values are loaded from EXPO_PUBLIC_* environment variables.
 * In local dev, hardcoded staging defaults are used as fallback.
 * In production (EAS Build), values MUST be injected via EAS Secrets —
 * no sensitive IDs are embedded in the release bundle.
 */

// Helper: read Expo env var (works with Expo's inline substitution)
const env = (key: string): string | undefined => {
  try {
    return typeof process !== 'undefined' ? process.env?.[key] : undefined;
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

// Staging defaults — used only when EXPO_PUBLIC_* vars are not set (local dev).
// In EAS builds these are overridden by EAS Secrets / .env.
const STAGING_DEFAULTS = {
  region: 'us-east-1',
  userPoolId: 'us-east-1_mvBH1S3yX',
  userPoolClientId: '60bt4bafj98q0nkjprpidegr0t',
  identityPoolId: 'us-east-1:ff7c6b31-86c7-4bd1-8b91-f0f41adc828a',
  restEndpoint: 'https://90pg0i63ff.execute-api.us-east-1.amazonaws.com/staging',
  graphqlEndpoint: 'https://e55gq4swgra43heqxqj726ivda.appsync-api.us-east-1.amazonaws.com/graphql',
  websocketEndpoint: 'wss://35hlodqnj9.execute-api.us-east-1.amazonaws.com/staging',
  bucket: 'smuppy-media-staging-471112656108',
  cdnDomain: 'https://d3gy4x1feicix3.cloudfront.net',
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

// Build config from env vars, falling back to staging defaults only in non-production
export const getAWSConfig = (): AWSConfig => {
  const currentEnv = getEnvironment();
  const isProduction = currentEnv === 'production';

  // In production, every value MUST come from env vars — no fallback to staging
  const resolve = (envKey: string, stagingDefault: string): string => {
    const value = env(envKey);
    if (value) return value;
    if (isProduction) {
      throw new Error(
        `[AWS Config] FATAL: ${envKey} is not set in production. ` +
        'All AWS config must be injected via EAS Secrets for production builds.'
      );
    }
    return stagingDefault;
  };

  return {
    region: resolve('EXPO_PUBLIC_AWS_REGION', STAGING_DEFAULTS.region),
    cognito: {
      userPoolId: resolve('EXPO_PUBLIC_COGNITO_USER_POOL_ID', STAGING_DEFAULTS.userPoolId),
      userPoolClientId: resolve('EXPO_PUBLIC_COGNITO_CLIENT_ID', STAGING_DEFAULTS.userPoolClientId),
      identityPoolId: resolve('EXPO_PUBLIC_COGNITO_IDENTITY_POOL_ID', STAGING_DEFAULTS.identityPoolId),
    },
    api: {
      restEndpoint: resolve('EXPO_PUBLIC_API_REST_ENDPOINT', STAGING_DEFAULTS.restEndpoint),
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

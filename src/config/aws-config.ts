/**
 * AWS Configuration for Smuppy
 * Auto-generated from CDK deployment
 *
 * IMPORTANT: This file contains staging configuration.
 * For production, use environment variables or a separate config.
 */

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

// Staging Configuration
export const AWS_CONFIG_STAGING: AWSConfig = {
  region: 'us-east-1',
  cognito: {
    userPoolId: 'us-east-1_mvBH1S3yX',
    userPoolClientId: '60bt4bafj98q0nkjprpidegr0t',
    identityPoolId: 'us-east-1:ff7c6b31-86c7-4bd1-8b91-f0f41adc828a',
  },
  api: {
    restEndpoint: 'https://90pg0i63ff.execute-api.us-east-1.amazonaws.com/staging',
    graphqlEndpoint: 'https://e55gq4swgra43heqxqj726ivda.appsync-api.us-east-1.amazonaws.com/graphql',
    websocketEndpoint: 'wss://35hlodqnj9.execute-api.us-east-1.amazonaws.com/staging',
  },
  storage: {
    bucket: 'smuppy-media-staging-471112656108',
    cdnDomain: 'https://d3gy4x1feicix3.cloudfront.net',
  },
  dynamodb: {
    feedTable: 'smuppy-feeds-staging',
    likesTable: 'smuppy-likes-staging',
  },
};

// Production Configuration (to be updated after production deployment)
export const AWS_CONFIG_PRODUCTION: AWSConfig = {
  region: 'us-east-1',
  cognito: {
    userPoolId: '', // TODO: Update after production deployment
    userPoolClientId: '',
    identityPoolId: '',
  },
  api: {
    restEndpoint: '',
    graphqlEndpoint: '',
    websocketEndpoint: '',
  },
  storage: {
    bucket: '',
    cdnDomain: '',
  },
  dynamodb: {
    feedTable: '',
    likesTable: '',
  },
};

// Environment detection
// For React Native: uses __DEV__ global or EXPO_PUBLIC_ENV / APP_ENV
// For web builds: uses import.meta.env.VITE_APP_ENV or process.env.REACT_APP_ENV
const getEnvironment = (): 'staging' | 'production' => {
  // Check for explicit environment variable (highest priority)
  // React Native with Expo
  if (typeof process !== 'undefined' && process.env?.EXPO_PUBLIC_ENV === 'production') {
    return 'production';
  }
  // React Native bare / env injection
  if (typeof process !== 'undefined' && process.env?.APP_ENV === 'production') {
    return 'production';
  }
  // Create React App web builds (Vite/import.meta not supported in Hermes)
  if (typeof process !== 'undefined' && process.env?.REACT_APP_ENV === 'production') {
    return 'production';
  }
  // Default to staging (safe fallback)
  return 'staging';
};

// Get current environment config
export const getAWSConfig = (): AWSConfig => {
  const env = getEnvironment();

  if (env === 'production') {
    // Check if production config is properly set up
    if (!AWS_CONFIG_PRODUCTION.cognito.userPoolId) {
      console.warn('[AWS Config] Production config not yet populated. Falling back to staging.');
      return AWS_CONFIG_STAGING;
    }
    return AWS_CONFIG_PRODUCTION;
  }

  return AWS_CONFIG_STAGING;
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

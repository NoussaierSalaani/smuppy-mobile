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
    restEndpoint: 'https://bmkd8zayee.execute-api.us-east-1.amazonaws.com/staging',
    graphqlEndpoint: 'https://e55gq4swgra43heqxqj726ivda.appsync-api.us-east-1.amazonaws.com/graphql',
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

// Get current environment config
// NOTE: Using staging config for all environments until production is deployed
export const getAWSConfig = (): AWSConfig => {
  // Always use staging config - production AWS not yet deployed
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

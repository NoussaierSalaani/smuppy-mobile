#!/usr/bin/env node
/**
 * Smuppy AWS Infrastructure - Multi-Environment Deployment
 * Supports: dev, staging, production
 */
import 'source-map-support/register';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as cdk from 'aws-cdk-lib';

// Load environment variables from .env file
dotenv.config({ path: path.join(__dirname, '..', '.env') });
import { SmuppyStack, SmuppyStackProps } from '../lib/smuppy-stack';
import { SmuppyGlobalStack } from '../lib/smuppy-global-stack';
import { SecurityPhase2Stack } from '../lib/security-phase2-stack';

const app = new cdk.App();

// Get environment from context (dev, staging, production)
const environment = app.node.tryGetContext('environment') || 'staging';
const _isProduction = environment === 'production';
const _isDev = environment === 'dev';

// Validate environment
const validEnvironments = ['dev', 'staging', 'production'];
if (!validEnvironments.includes(environment)) {
  throw new Error(`Invalid environment: ${environment}. Must be one of: ${validEnvironments.join(', ')}`);
}

// Primary region for compute (API, Database, Lambda)
const primaryRegion = 'us-east-1'; // N. Virginia

// Environment-specific configuration
const envConfig = {
  dev: {
    // Minimal resources for development - skip expensive security features
    skipSecurityStack: true,
    alertEmail: undefined,
    apiDomain: 'api-dev.smuppy.com',
    graphqlDomain: 'graphql-dev.smuppy.com',
  },
  staging: {
    skipSecurityStack: false,
    alertEmail: 'staging-alerts@smuppy.com',
    apiDomain: undefined,  // Disabled: no Route53 hosted zone for staging DNS validation
    graphqlDomain: 'graphql-staging.smuppy.com',
  },
  production: {
    skipSecurityStack: false,
    alertEmail: 'security@smuppy.com',
    apiDomain: 'api.smuppy.com',
    graphqlDomain: 'graphql.smuppy.com',
  },
};

const config = envConfig[environment as keyof typeof envConfig];

console.log(`\n🚀 Deploying Smuppy to ${environment.toUpperCase()} environment\n`);
if (config.skipSecurityStack) {
  console.log('⚠️  Security stack skipped (dev environment)\n');
}

// Stack 1: Core Infrastructure (VPC, Database, Lambda, API Gateway, Cognito)
const coreStack = new SmuppyStack(app, `SmuppyStack-${environment}`, {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: primaryRegion,
  },
  alertEmail: config.alertEmail,
  apiDomain: config.apiDomain,
  hostedZoneId: process.env.HOSTED_ZONE_ID,
  description: `Smuppy Core Infrastructure - ${environment}`,
  tags: {
    Project: 'Smuppy',
    Environment: environment,
    ManagedBy: 'CDK',
    Component: 'Core',
  },
});

// Stack 2: Global Infrastructure (CloudFront, WAF, DynamoDB, S3)
// Must be in us-east-1 for CloudFront WAF
const globalStack = new SmuppyGlobalStack(app, `SmuppyGlobal-${environment}`, {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: 'us-east-1', // CloudFront requires us-east-1 for WAF
  },
  apiEndpoint: `https://${config.apiDomain}`,
  graphqlEndpoint: `https://${config.graphqlDomain}`,
  environment,
  description: `Smuppy Global CDN & DynamoDB - ${environment}`,
  tags: {
    Project: 'Smuppy',
    Environment: environment,
    ManagedBy: 'CDK',
    Component: 'Global',
  },
});

// Global stack depends on core stack
globalStack.addDependency(coreStack);

// Stack 3: Security Phase 2 (Multi-Region Backup + Virus Scanning)
// Skip for dev environment to save costs
if (!config.skipSecurityStack) {
  const securityStack = new SecurityPhase2Stack(app, `SmuppySecurity-${environment}`, {
    env: {
      account: process.env.CDK_DEFAULT_ACCOUNT,
      region: primaryRegion,
    },
    environment,
    mediaBucket: globalStack.mediaBucket,
    secondaryRegion: 'eu-west-1', // Ireland - DR region
    alertEmail: config.alertEmail,
    description: `Smuppy Security Phase 2 - Backup & Virus Scan - ${environment}`,
    tags: {
      Project: 'Smuppy',
      Environment: environment,
      ManagedBy: 'CDK',
      Component: 'Security',
    },
  });

  // Security stack depends on global stack (for media bucket)
  securityStack.addDependency(globalStack);
}

// Output important information
new cdk.CfnOutput(coreStack, 'DeploymentInfo', {
  value: JSON.stringify({
    environment,
    region: primaryRegion,
    timestamp: new Date().toISOString(),
    securityStackEnabled: !config.skipSecurityStack,
  }),
  description: 'Deployment metadata',
});

// Output API URLs
new cdk.CfnOutput(coreStack, 'ApiUrls', {
  value: JSON.stringify({
    api: `https://${config.apiDomain}`,
    graphql: `https://${config.graphqlDomain}`,
  }),
  description: 'API endpoint URLs',
});

app.synth();

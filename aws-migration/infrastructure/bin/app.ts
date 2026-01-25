#!/usr/bin/env node
/**
 * Smuppy AWS Infrastructure - Instagram-Level Scale
 * Multi-stack deployment for global social network
 */
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { SmuppyStack } from '../lib/smuppy-stack';
import { SmuppyGlobalStack } from '../lib/smuppy-global-stack';

const app = new cdk.App();

// Get environment from context
const environment = app.node.tryGetContext('environment') || 'staging';
const isProduction = environment === 'production';

// Primary region for compute (API, Database, Lambda)
const primaryRegion = 'us-east-1'; // N. Virginia - Best for North America

// Stack 1: Core Infrastructure (VPC, Database, Lambda, API Gateway, Cognito)
const coreStack = new SmuppyStack(app, `SmuppyStack-${environment}`, {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: primaryRegion,
  },
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
  apiEndpoint: `https://api.smuppy.com/${environment}`, // Will be updated after core stack
  graphqlEndpoint: `https://graphql.smuppy.com/${environment}`,
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

// Output important information
new cdk.CfnOutput(coreStack, 'DeploymentInfo', {
  value: JSON.stringify({
    environment,
    region: primaryRegion,
    timestamp: new Date().toISOString(),
  }),
  description: 'Deployment metadata',
});

app.synth();

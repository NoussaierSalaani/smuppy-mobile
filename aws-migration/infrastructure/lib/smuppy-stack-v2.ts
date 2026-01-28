import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as sns from 'aws-cdk-lib/aws-sns';
import { Construct } from 'constructs';
import { NetworkStack } from './network-stack';
import { DatabaseStack } from './database-stack';
import { AuthStack } from './auth-stack';
import { LambdaStack } from './lambda-stack';

/**
 * Smuppy AWS Infrastructure Stack V2
 * Refactored with Nested Stacks to stay under 500 resource limit
 */
export class SmuppyStackV2 extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const environment = this.node.tryGetContext('environment') || 'staging';
    const isProduction = environment === 'production';

    console.log(`\n🚀 Deploying Smuppy V2 to ${environment.toUpperCase()} environment\n`);

    // ========================================
    // Network Stack (VPC, Security Groups)
    // ========================================
    const networkStack = new NetworkStack(this, 'NetworkStack', {
      environment,
      isProduction,
    });

    // ========================================
    // Database Stack (RDS Aurora PostgreSQL)
    // ========================================
    const databaseStack = new DatabaseStack(this, 'DatabaseStack', {
      vpc: networkStack.vpc,
      rdsSecurityGroup: networkStack.rdsSecurityGroup,
      environment,
      isProduction,
    });
    databaseStack.addDependency(networkStack);

    // ========================================
    // Auth Stack (Cognito)
    // ========================================
    const authStack = new AuthStack(this, 'AuthStack', {
      environment,
      isProduction,
    });

    // ========================================
    // S3 Media Bucket
    // ========================================
    // Allowed CORS origins for S3 media bucket
    // S3 CORS supports one wildcard (*) per origin entry
    // Using *.cloudfront.net so the origin stays valid across redeployments
    const CORS_ALLOWED_ORIGINS = isProduction
      ? [
          'https://*.cloudfront.net',
          'https://*.execute-api.us-east-1.amazonaws.com',
          'https://app.smuppy.com',
          'https://smuppy.com',
          'https://www.smuppy.com',
        ]
      : [
          'https://*.cloudfront.net',
          'https://*.execute-api.us-east-1.amazonaws.com',
          'https://app.smuppy.com',
          'https://smuppy.com',
          'http://localhost:8081',
          'http://localhost:19006',
          'http://localhost:3000',
        ];

    const mediaBucket = new s3.Bucket(this, 'MediaBucket', {
      bucketName: `smuppy-media-${environment}-${this.account}`,
      cors: [{
        allowedHeaders: ['*'],
        allowedMethods: [s3.HttpMethods.GET, s3.HttpMethods.PUT, s3.HttpMethods.POST],
        allowedOrigins: CORS_ALLOWED_ORIGINS,
        maxAge: 3000,
      }],
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      versioned: false,
      removalPolicy: isProduction ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: !isProduction,
    });

    // CloudFront Distribution
    const distribution = new cloudfront.Distribution(this, 'MediaCDN', {
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(mediaBucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD,
      },
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100,
    });

    // ========================================
    // Admin API Key Secret
    // ========================================
    const adminApiKeySecret = new secretsmanager.Secret(this, 'AdminApiKey', {
      secretName: `smuppy/${environment}/admin-api-key`,
      generateSecretString: {
        excludePunctuation: true,
        passwordLength: 64,
      },
    });

    // ========================================
    // Log Groups
    // ========================================
    const apiLogGroup = new logs.LogGroup(this, 'ApiLogGroup', {
      logGroupName: `/smuppy/${environment}/api`,
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const adminLogGroup = new logs.LogGroup(this, 'AdminLogGroup', {
      logGroupName: `/smuppy/${environment}/admin`,
      retention: logs.RetentionDays.THREE_MONTHS,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const authLogGroup = new logs.LogGroup(this, 'AuthLogGroup', {
      logGroupName: `/smuppy/${environment}/auth`,
      retention: logs.RetentionDays.THREE_MONTHS,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // ========================================
    // Lambda Environment Variables
    // ========================================
    const lambdaEnvironment = {
      NODE_ENV: isProduction ? 'production' : 'development',
      DB_HOST: databaseStack.rdsProxy.endpoint,
      DB_PORT: '5432',
      DB_NAME: 'smuppy',
      DB_SECRET_ARN: databaseStack.dbCredentials.secretArn,
      S3_BUCKET: mediaBucket.bucketName,
      CLOUDFRONT_URL: `https://${distribution.distributionDomainName}`,
      USER_POOL_ID: authStack.userPool.userPoolId,
      USER_POOL_CLIENT_ID: authStack.userPoolClient.userPoolClientId,
      // Note: AWS_REGION is automatically set by Lambda runtime
    };

    // ========================================
    // Lambda Stack (All Lambda Functions)
    // ========================================
    const lambdaStack = new LambdaStack(this, 'LambdaStack', {
      vpc: networkStack.vpc,
      lambdaSecurityGroup: networkStack.lambdaSecurityGroup,
      dbCredentials: databaseStack.dbCredentials,
      adminApiKeySecret,
      mediaBucket,
      userPool: authStack.userPool,
      userPoolClientId: authStack.userPoolClient.userPoolClientId,
      lambdaEnvironment,
      environment,
      isProduction,
      apiLogGroup,
      adminLogGroup,
      authLogGroup,
    });

    // ========================================
    // Outputs
    // ========================================
    new cdk.CfnOutput(this, 'UserPoolId', {
      value: authStack.userPool.userPoolId,
      description: 'Cognito User Pool ID',
    });

    new cdk.CfnOutput(this, 'UserPoolClientId', {
      value: authStack.userPoolClient.userPoolClientId,
      description: 'Cognito User Pool Client ID',
    });

    new cdk.CfnOutput(this, 'MediaBucketName', {
      value: mediaBucket.bucketName,
      description: 'S3 Media Bucket Name',
    });

    new cdk.CfnOutput(this, 'CloudFrontUrl', {
      value: `https://${distribution.distributionDomainName}`,
      description: 'CloudFront Distribution URL',
    });

    new cdk.CfnOutput(this, 'DatabaseEndpoint', {
      value: databaseStack.rdsProxy.endpoint,
      description: 'RDS Proxy Endpoint',
    });
  }
}

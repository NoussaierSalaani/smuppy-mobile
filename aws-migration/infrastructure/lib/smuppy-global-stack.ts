import * as cdk from 'aws-cdk-lib';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as wafv2 from 'aws-cdk-lib/aws-wafv2';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';

interface SmuppyGlobalStackProps extends cdk.StackProps {
  apiEndpoint: string;
  graphqlEndpoint: string;
  environment: string;
}

/**
 * Global Infrastructure Stack for Instagram-Level Scale
 * - CloudFront CDN (450+ edge locations)
 * - Global WAF with advanced rules
 * - DynamoDB Global Tables for feeds
 * - S3 for media with intelligent tiering
 */
export class SmuppyGlobalStack extends cdk.Stack {
  public readonly distribution: cloudfront.Distribution;
  public readonly mediaBucket: s3.Bucket;

  constructor(scope: Construct, id: string, props: SmuppyGlobalStackProps) {
    super(scope, id, props);

    const { environment, apiEndpoint, graphqlEndpoint } = props;
    const isProduction = environment === 'production';

    // ========================================
    // S3 - Media Storage with Intelligent Tiering
    // ========================================
    this.mediaBucket = new s3.Bucket(this, 'MediaBucket', {
      bucketName: `smuppy-media-${environment}-${this.account}`,
      // Security
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      versioned: isProduction,
      // Enable EventBridge for virus scanning integration
      eventBridgeEnabled: true,
      // Cost optimization with intelligent tiering
      intelligentTieringConfigurations: [{
        name: 'AutoTiering',
        archiveAccessTierTime: cdk.Duration.days(90),
        deepArchiveAccessTierTime: cdk.Duration.days(180),
      }],
      // Lifecycle rules for cost optimization
      lifecycleRules: [
        {
          id: 'DeleteIncompleteUploads',
          abortIncompleteMultipartUploadAfter: cdk.Duration.days(1),
        },
        {
          id: 'TransitionOldMedia',
          transitions: [
            {
              storageClass: s3.StorageClass.INTELLIGENT_TIERING,
              transitionAfter: cdk.Duration.days(30),
            },
          ],
        },
      ],
      // SECURITY: Restrictive CORS for direct uploads
      cors: [{
        allowedMethods: [s3.HttpMethods.GET, s3.HttpMethods.PUT, s3.HttpMethods.POST, s3.HttpMethods.HEAD],
        allowedOrigins: isProduction
          ? ['https://smuppy.com', 'https://www.smuppy.com', 'https://app.smuppy.com']
          : ['https://smuppy.com', 'https://www.smuppy.com', 'https://app.smuppy.com', 'http://localhost:8081', 'http://localhost:19006'],
        allowedHeaders: [
          'Content-Type',
          'Content-Length',
          'Content-MD5',
          'Authorization',
          'X-Amz-Date',
          'X-Amz-Content-Sha256',
          'X-Amz-Security-Token',
          'X-Amz-User-Agent',
        ],
        exposedHeaders: ['ETag', 'Content-Length', 'Content-Type', 'x-amz-request-id', 'x-amz-id-2'],
        maxAge: 3600,
      }],
      removalPolicy: isProduction ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: !isProduction,
    });

    // ========================================
    // WAF v2 - Global Web ACL for CloudFront
    // Instagram-level protection
    // ========================================
    const globalWaf = new wafv2.CfnWebACL(this, 'GlobalWAF', {
      scope: 'CLOUDFRONT',
      defaultAction: { allow: {} },
      visibilityConfig: {
        cloudWatchMetricsEnabled: true,
        metricName: 'SmuppyGlobalWAF',
        sampledRequestsEnabled: true,
      },
      rules: [
        // Rule 1: AWS Managed - Common Rule Set (OWASP Top 10)
        {
          name: 'AWSManagedRulesCommonRuleSet',
          priority: 1,
          overrideAction: { none: {} },
          statement: {
            managedRuleGroupStatement: {
              vendorName: 'AWS',
              name: 'AWSManagedRulesCommonRuleSet',
            },
          },
          visibilityConfig: {
            cloudWatchMetricsEnabled: true,
            metricName: 'CommonRuleSet',
            sampledRequestsEnabled: true,
          },
        },
        // Rule 2: AWS Managed - Known Bad Inputs
        {
          name: 'AWSManagedRulesKnownBadInputsRuleSet',
          priority: 2,
          overrideAction: { none: {} },
          statement: {
            managedRuleGroupStatement: {
              vendorName: 'AWS',
              name: 'AWSManagedRulesKnownBadInputsRuleSet',
            },
          },
          visibilityConfig: {
            cloudWatchMetricsEnabled: true,
            metricName: 'KnownBadInputs',
            sampledRequestsEnabled: true,
          },
        },
        // Rule 3: AWS Managed - SQL Injection Protection
        {
          name: 'AWSManagedRulesSQLiRuleSet',
          priority: 3,
          overrideAction: { none: {} },
          statement: {
            managedRuleGroupStatement: {
              vendorName: 'AWS',
              name: 'AWSManagedRulesSQLiRuleSet',
            },
          },
          visibilityConfig: {
            cloudWatchMetricsEnabled: true,
            metricName: 'SQLiRuleSet',
            sampledRequestsEnabled: true,
          },
        },
        // Rule 4: AWS Managed - Bot Control (Essential for social networks)
        {
          name: 'AWSManagedRulesBotControlRuleSet',
          priority: 4,
          overrideAction: { none: {} },
          statement: {
            managedRuleGroupStatement: {
              vendorName: 'AWS',
              name: 'AWSManagedRulesBotControlRuleSet',
              managedRuleGroupConfigs: [{
                awsManagedRulesBotControlRuleSet: {
                  inspectionLevel: 'COMMON',
                },
              }],
            },
          },
          visibilityConfig: {
            cloudWatchMetricsEnabled: true,
            metricName: 'BotControl',
            sampledRequestsEnabled: true,
          },
        },
        // Rule 5: Rate limiting - 10,000 requests per 5 minutes per IP
        {
          name: 'RateLimitRule',
          priority: 5,
          action: { block: {} },
          statement: {
            rateBasedStatement: {
              limit: isProduction ? 10000 : 2000,
              aggregateKeyType: 'IP',
            },
          },
          visibilityConfig: {
            cloudWatchMetricsEnabled: true,
            metricName: 'RateLimit',
            sampledRequestsEnabled: true,
          },
        },
        // Rule 6: Geographic blocking (optional, for compliance)
        {
          name: 'GeoBlockRule',
          priority: 6,
          action: { block: {} },
          statement: {
            geoMatchStatement: {
              countryCodes: ['KP', 'IR', 'SY', 'CU'], // Sanctioned countries
            },
          },
          visibilityConfig: {
            cloudWatchMetricsEnabled: true,
            metricName: 'GeoBlock',
            sampledRequestsEnabled: true,
          },
        },
        // Rule 7: AWS Managed - Anonymous IP List
        {
          name: 'AWSManagedRulesAnonymousIpList',
          priority: 7,
          overrideAction: { none: {} },
          statement: {
            managedRuleGroupStatement: {
              vendorName: 'AWS',
              name: 'AWSManagedRulesAnonymousIpList',
            },
          },
          visibilityConfig: {
            cloudWatchMetricsEnabled: true,
            metricName: 'AnonymousIPList',
            sampledRequestsEnabled: true,
          },
        },
        // Rule 8: AWS Managed - IP Reputation List
        {
          name: 'AWSManagedRulesAmazonIpReputationList',
          priority: 8,
          overrideAction: { none: {} },
          statement: {
            managedRuleGroupStatement: {
              vendorName: 'AWS',
              name: 'AWSManagedRulesAmazonIpReputationList',
            },
          },
          visibilityConfig: {
            cloudWatchMetricsEnabled: true,
            metricName: 'IPReputationList',
            sampledRequestsEnabled: true,
          },
        },
      ],
    });

    // ========================================
    // CloudFront Distribution - Global CDN
    // 450+ Edge Locations worldwide
    // ========================================

    // Origin Access Identity for S3
    const originAccessIdentity = new cloudfront.OriginAccessIdentity(this, 'OAI', {
      comment: `OAI for Smuppy ${environment}`,
    });
    this.mediaBucket.grantRead(originAccessIdentity);

    // Cache policies
    const apiCachePolicy = new cloudfront.CachePolicy(this, 'APICachePolicy', {
      cachePolicyName: `smuppy-api-cache-${environment}`,
      comment: 'Cache policy for API responses',
      defaultTtl: cdk.Duration.seconds(0),
      minTtl: cdk.Duration.seconds(0),
      maxTtl: cdk.Duration.seconds(1),
      cookieBehavior: cloudfront.CacheCookieBehavior.none(),
      headerBehavior: cloudfront.CacheHeaderBehavior.allowList('Authorization', 'Origin', 'Accept'),
      queryStringBehavior: cloudfront.CacheQueryStringBehavior.all(),
      enableAcceptEncodingGzip: true,
      enableAcceptEncodingBrotli: true,
    });

    const mediaCachePolicy = new cloudfront.CachePolicy(this, 'MediaCachePolicy', {
      cachePolicyName: `smuppy-media-cache-${environment}`,
      comment: 'Cache policy for media files',
      defaultTtl: cdk.Duration.days(30),
      minTtl: cdk.Duration.days(1),
      maxTtl: cdk.Duration.days(365),
      cookieBehavior: cloudfront.CacheCookieBehavior.none(),
      headerBehavior: cloudfront.CacheHeaderBehavior.none(),
      queryStringBehavior: cloudfront.CacheQueryStringBehavior.none(),
      enableAcceptEncodingGzip: true,
      enableAcceptEncodingBrotli: true,
    });

    // Origin request policy for API - Use ALL_VIEWER for Authorization forwarding
    const apiOriginRequestPolicy = cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER;

    // SECURITY: Custom response headers policy with restrictive CORS
    const secureResponseHeadersPolicy = new cloudfront.ResponseHeadersPolicy(this, 'SecureResponseHeadersPolicy', {
      responseHeadersPolicyName: `smuppy-secure-headers-${environment}`,
      comment: 'Secure response headers with restrictive CORS',
      corsBehavior: {
        accessControlAllowCredentials: true,
        accessControlAllowHeaders: ['Content-Type', 'Authorization', 'X-Request-Id', 'X-Amz-Date'],
        accessControlAllowMethods: ['GET', 'HEAD', 'OPTIONS', 'PUT', 'POST', 'DELETE'],
        accessControlAllowOrigins: isProduction
          ? ['https://smuppy.com', 'https://www.smuppy.com', 'https://app.smuppy.com']
          : ['https://smuppy.com', 'https://www.smuppy.com', 'https://app.smuppy.com', 'http://localhost:8081', 'http://localhost:19006'],
        accessControlExposeHeaders: ['ETag', 'X-Request-Id'],
        accessControlMaxAge: cdk.Duration.hours(1),
        originOverride: true,
      },
      securityHeadersBehavior: {
        contentSecurityPolicy: {
          contentSecurityPolicy: "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
          override: true,
        },
        contentTypeOptions: { override: true },
        frameOptions: {
          frameOption: cloudfront.HeadersFrameOption.DENY,
          override: true,
        },
        referrerPolicy: {
          referrerPolicy: cloudfront.HeadersReferrerPolicy.STRICT_ORIGIN_WHEN_CROSS_ORIGIN,
          override: true,
        },
        strictTransportSecurity: {
          accessControlMaxAge: cdk.Duration.days(730), // 2 years
          includeSubdomains: true,
          preload: true,
          override: true,
        },
        xssProtection: {
          protection: true,
          modeBlock: true,
          override: true,
        },
      },
      customHeadersBehavior: {
        customHeaders: [
          { header: 'Permissions-Policy', value: 'geolocation=(), microphone=(), camera=()', override: true },
          { header: 'X-Permitted-Cross-Domain-Policies', value: 'none', override: true },
        ],
      },
    });

    // ========================================
    // CloudFront Access Logs Bucket
    // SECURITY: Enable logging for audit and compliance
    // ========================================
    const logsBucket = new s3.Bucket(this, 'CloudFrontLogsBucket', {
      bucketName: `smuppy-cloudfront-logs-${environment}-${this.account}`,
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      // SECURITY: Object ownership for CloudFront logging
      objectOwnership: s3.ObjectOwnership.OBJECT_WRITER,
      lifecycleRules: [
        {
          id: 'DeleteOldLogs',
          expiration: cdk.Duration.days(isProduction ? 90 : 30),
          // Only add transitions in production (expiration must be > transition days)
          ...(isProduction && {
            transitions: [
              {
                storageClass: s3.StorageClass.INFREQUENT_ACCESS,
                transitionAfter: cdk.Duration.days(30),
              },
            ],
          }),
        },
      ],
      removalPolicy: isProduction ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: !isProduction,
    });

    // Extract domain from API endpoint
    const apiDomain = apiEndpoint.replace('https://', '').replace(/\/.*$/, '');
    const graphqlDomain = graphqlEndpoint.replace('https://', '').replace(/\/.*$/, '');

    this.distribution = new cloudfront.Distribution(this, 'CDN', {
      // SECURITY: Enable access logging
      enableLogging: true,
      logBucket: logsBucket,
      logFilePrefix: 'cdn-logs/',
      logIncludesCookies: false, // Privacy: don't log cookies
      comment: `Smuppy Global CDN - ${environment}`,
      enabled: true,
      httpVersion: cloudfront.HttpVersion.HTTP2_AND_3,
      priceClass: isProduction
        ? cloudfront.PriceClass.PRICE_CLASS_ALL  // All edge locations
        : cloudfront.PriceClass.PRICE_CLASS_100, // NA + EU only for staging
      webAclId: globalWaf.attrArn,

      defaultBehavior: {
        origin: new origins.S3Origin(this.mediaBucket, { originAccessIdentity }),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: mediaCachePolicy,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
        compress: true,
        // SECURITY: Custom headers policy with restrictive CORS
        responseHeadersPolicy: secureResponseHeadersPolicy,
      },

      additionalBehaviors: {
        // API Gateway endpoints
        '/api/*': {
          origin: new origins.HttpOrigin(apiDomain, {
            protocolPolicy: cloudfront.OriginProtocolPolicy.HTTPS_ONLY,
            originSslProtocols: [cloudfront.OriginSslPolicy.TLS_V1_2],
          }),
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.HTTPS_ONLY,
          cachePolicy: apiCachePolicy,
          originRequestPolicy: apiOriginRequestPolicy,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
          compress: true,
        },
        // GraphQL endpoint
        '/graphql': {
          origin: new origins.HttpOrigin(graphqlDomain, {
            protocolPolicy: cloudfront.OriginProtocolPolicy.HTTPS_ONLY,
          }),
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.HTTPS_ONLY,
          cachePolicy: apiCachePolicy,
          originRequestPolicy: apiOriginRequestPolicy,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
          compress: true,
        },
        // Media files with aggressive caching
        '/media/*': {
          origin: new origins.S3Origin(this.mediaBucket, { originAccessIdentity }),
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          cachePolicy: mediaCachePolicy,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
          compress: true,
        },
      },

      errorResponses: [
        {
          httpStatus: 403,
          responseHttpStatus: 404,
          responsePagePath: '/404.html',
          ttl: cdk.Duration.minutes(5),
        },
        {
          httpStatus: 404,
          responseHttpStatus: 404,
          responsePagePath: '/404.html',
          ttl: cdk.Duration.minutes(5),
        },
      ],
    });

    // ========================================
    // DynamoDB Global Tables - High Velocity Data
    // For feeds, likes, views (millions of writes/sec)
    // ========================================

    // Feed Table - User feeds with TTL
    const feedTable = new dynamodb.Table(this, 'FeedTable', {
      tableName: `smuppy-feeds-${environment}`,
      partitionKey: { name: 'userId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'timestamp', type: dynamodb.AttributeType.NUMBER },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST, // Auto-scaling
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
      pointInTimeRecovery: isProduction,
      timeToLiveAttribute: 'ttl',
      stream: dynamodb.StreamViewType.NEW_AND_OLD_IMAGES,
      removalPolicy: isProduction ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
    });

    // GSI for getting posts by author
    feedTable.addGlobalSecondaryIndex({
      indexName: 'byAuthor',
      partitionKey: { name: 'authorId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'timestamp', type: dynamodb.AttributeType.NUMBER },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // Tag feed table for backup
    cdk.Tags.of(feedTable).add('service', 'smuppy');
    cdk.Tags.of(feedTable).add('backup', 'true');

    // Likes Table - High write throughput
    const likesTable = new dynamodb.Table(this, 'LikesTable', {
      tableName: `smuppy-likes-${environment}`,
      partitionKey: { name: 'itemId', type: dynamodb.AttributeType.STRING }, // post:123 or peak:456
      sortKey: { name: 'userId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
      pointInTimeRecovery: isProduction, // Enable PITR for production
      stream: dynamodb.StreamViewType.NEW_AND_OLD_IMAGES,
      removalPolicy: isProduction ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
    });

    // Tag likes table for backup
    cdk.Tags.of(likesTable).add('service', 'smuppy');
    cdk.Tags.of(likesTable).add('backup', 'true');

    // GSI for user's likes
    likesTable.addGlobalSecondaryIndex({
      indexName: 'byUser',
      partitionKey: { name: 'userId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'timestamp', type: dynamodb.AttributeType.NUMBER },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // Views/Analytics Table
    const analyticsTable = new dynamodb.Table(this, 'AnalyticsTable', {
      tableName: `smuppy-analytics-${environment}`,
      partitionKey: { name: 'pk', type: dynamodb.AttributeType.STRING }, // post:123#2024-01-24
      sortKey: { name: 'sk', type: dynamodb.AttributeType.STRING }, // view#user:456
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
      pointInTimeRecovery: isProduction, // Enable PITR for production
      timeToLiveAttribute: 'ttl',
      removalPolicy: isProduction ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
    });

    // Tag analytics table for backup
    cdk.Tags.of(analyticsTable).add('service', 'smuppy');
    cdk.Tags.of(analyticsTable).add('backup', 'true');

    // Sessions Table for Redis backup/overflow
    const sessionsTable = new dynamodb.Table(this, 'SessionsTable', {
      tableName: `smuppy-sessions-${environment}`,
      partitionKey: { name: 'sessionId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
      pointInTimeRecovery: isProduction, // Enable PITR for production
      timeToLiveAttribute: 'expiresAt',
      removalPolicy: isProduction ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
    });

    // Tag sessions table for backup
    cdk.Tags.of(sessionsTable).add('service', 'smuppy');
    cdk.Tags.of(sessionsTable).add('backup', 'true');

    // Notifications Table
    const notificationsTable = new dynamodb.Table(this, 'NotificationsTable', {
      tableName: `smuppy-notifications-${environment}`,
      partitionKey: { name: 'userId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'timestamp', type: dynamodb.AttributeType.NUMBER },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
      pointInTimeRecovery: isProduction, // Enable PITR for production
      timeToLiveAttribute: 'ttl',
      stream: dynamodb.StreamViewType.NEW_IMAGE,
      removalPolicy: isProduction ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
    });

    // Tag notifications table for backup
    cdk.Tags.of(notificationsTable).add('service', 'smuppy');
    cdk.Tags.of(notificationsTable).add('backup', 'true');

    // ========================================
    // Outputs
    // ========================================
    new cdk.CfnOutput(this, 'CDNDomain', {
      value: this.distribution.distributionDomainName,
      description: 'CloudFront Distribution Domain',
      exportName: `smuppy-cdn-domain-${environment}`,
    });

    new cdk.CfnOutput(this, 'CDNDistributionId', {
      value: this.distribution.distributionId,
      description: 'CloudFront Distribution ID',
      exportName: `smuppy-cdn-id-${environment}`,
    });

    new cdk.CfnOutput(this, 'MediaBucketName', {
      value: this.mediaBucket.bucketName,
      description: 'S3 Bucket for media storage',
      exportName: `smuppy-media-bucket-${environment}`,
    });

    new cdk.CfnOutput(this, 'FeedTableName', {
      value: feedTable.tableName,
      description: 'DynamoDB Feed Table',
      exportName: `smuppy-feed-table-${environment}`,
    });

    new cdk.CfnOutput(this, 'LikesTableName', {
      value: likesTable.tableName,
      description: 'DynamoDB Likes Table',
      exportName: `smuppy-likes-table-${environment}`,
    });

    new cdk.CfnOutput(this, 'CloudFrontLogsBucketName', {
      value: logsBucket.bucketName,
      description: 'S3 Bucket for CloudFront access logs',
      exportName: `smuppy-cloudfront-logs-${environment}`,
    });
  }
}

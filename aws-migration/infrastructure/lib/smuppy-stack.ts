import * as cdk from 'aws-cdk-lib';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as appsync from 'aws-cdk-lib/aws-appsync';
import * as elasticache from 'aws-cdk-lib/aws-elasticache';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as wafv2 from 'aws-cdk-lib/aws-wafv2';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { Construct } from 'constructs';
import * as path from 'path';

/**
 * Smuppy AWS Infrastructure Stack
 *
 * Optimized for:
 * - 500K+ concurrent users
 * - Auto-scaling
 * - High security (WAF, encryption, least privilege)
 * - Low latency for social network features
 */
export class SmuppyStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const environment = this.node.tryGetContext('environment') || 'staging';
    const isProduction = environment === 'production';

    // ========================================
    // VPC - High Availability Network
    // ========================================
    const vpc = new ec2.Vpc(this, 'SmuppyVPC', {
      maxAzs: 3, // 3 availability zones for high availability
      natGateways: isProduction ? 3 : 1,
      subnetConfiguration: [
        {
          cidrMask: 20,
          name: 'Public',
          subnetType: ec2.SubnetType.PUBLIC,
        },
        {
          cidrMask: 20,
          name: 'Private',
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
        },
        {
          cidrMask: 24,
          name: 'Isolated',
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
        },
      ],
      // Enable VPC Flow Logs for security monitoring
      flowLogs: {
        'FlowLog': {
          destination: ec2.FlowLogDestination.toCloudWatchLogs(),
          trafficType: ec2.FlowLogTrafficType.ALL,
        },
      },
    });

    // ========================================
    // Cognito - Secure Authentication
    // ========================================
    const userPool = new cognito.UserPool(this, 'SmuppyUserPool', {
      userPoolName: `smuppy-users-${environment}`,
      selfSignUpEnabled: true,
      signInAliases: {
        email: true,
        username: true,
      },
      autoVerify: {
        email: true,
      },
      // Strong password policy
      passwordPolicy: {
        minLength: 8,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: false,
        tempPasswordValidity: cdk.Duration.days(3),
      },
      // Account security
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      // Advanced security features
      advancedSecurityMode: isProduction
        ? cognito.AdvancedSecurityMode.ENFORCED
        : cognito.AdvancedSecurityMode.AUDIT,
      // Custom attributes for social network
      customAttributes: {
        'account_type': new cognito.StringAttribute({ mutable: true }),
        'is_verified': new cognito.BooleanAttribute({ mutable: true }),
        'bio': new cognito.StringAttribute({ mutable: true, maxLen: 500 }),
      },
      removalPolicy: isProduction ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
    });

    // User Pool Client for mobile app
    const userPoolClient = new cognito.UserPoolClient(this, 'SmuppyUserPoolClient', {
      userPool,
      userPoolClientName: 'smuppy-mobile-app',
      authFlows: {
        userPassword: true,
        userSrp: true,
      },
      oAuth: {
        flows: {
          authorizationCodeGrant: true,
        },
        scopes: [cognito.OAuthScope.EMAIL, cognito.OAuthScope.OPENID, cognito.OAuthScope.PROFILE],
        callbackUrls: ['smuppy://auth/callback'],
        logoutUrls: ['smuppy://auth/logout'],
      },
      // Token validity
      accessTokenValidity: cdk.Duration.hours(1),
      idTokenValidity: cdk.Duration.hours(1),
      refreshTokenValidity: cdk.Duration.days(30),
      preventUserExistenceErrors: true,
    });

    // Identity Pool for AWS credentials
    const identityPool = new cognito.CfnIdentityPool(this, 'SmuppyIdentityPool', {
      identityPoolName: `smuppy_identity_${environment}`,
      allowUnauthenticatedIdentities: false,
      cognitoIdentityProviders: [
        {
          clientId: userPoolClient.userPoolClientId,
          providerName: userPool.userPoolProviderName,
        },
      ],
    });

    // ========================================
    // Aurora Serverless v2 - Auto-scaling Database
    // ========================================
    const dbSecurityGroup = new ec2.SecurityGroup(this, 'DBSecurityGroup', {
      vpc,
      description: 'Security group for Aurora PostgreSQL',
      allowAllOutbound: false, // Restrict outbound for security
    });

    // Only allow inbound from Lambda
    const lambdaSecurityGroup = new ec2.SecurityGroup(this, 'LambdaSecurityGroup', {
      vpc,
      description: 'Security group for Lambda functions',
      allowAllOutbound: true,
    });

    dbSecurityGroup.addIngressRule(
      lambdaSecurityGroup,
      ec2.Port.tcp(5432),
      'Allow PostgreSQL from Lambda only'
    );

    // Database credentials with rotation
    const dbCredentials = new secretsmanager.Secret(this, 'DBCredentials', {
      secretName: `smuppy-db-credentials-${environment}`,
      generateSecretString: {
        secretStringTemplate: JSON.stringify({ username: 'smuppy_admin' }),
        generateStringKey: 'password',
        excludePunctuation: true,
        passwordLength: 32,
      },
    });

    // Aurora Serverless v2 Cluster - Auto-scaling
    const dbCluster = new rds.DatabaseCluster(this, 'SmuppyDatabase', {
      engine: rds.DatabaseClusterEngine.auroraPostgres({
        version: rds.AuroraPostgresEngineVersion.VER_15_14,
      }),
      credentials: rds.Credentials.fromSecret(dbCredentials),
      defaultDatabaseName: 'smuppy',
      // AUTO-SCALING: 0.5 ACU (idle) to 128 ACU (high load)
      serverlessV2MinCapacity: 0.5,
      serverlessV2MaxCapacity: isProduction ? 128 : 16,
      writer: rds.ClusterInstance.serverlessV2('writer', {
        autoMinorVersionUpgrade: true,
      }),
      // Read replicas for scalability
      readers: isProduction
        ? [
            rds.ClusterInstance.serverlessV2('reader1', { scaleWithWriter: true }),
            rds.ClusterInstance.serverlessV2('reader2', { scaleWithWriter: true }),
          ]
        : [],
      vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
      },
      securityGroups: [dbSecurityGroup],
      // Security: Encryption at rest
      storageEncrypted: true,
      // Backup
      backup: {
        retention: isProduction ? cdk.Duration.days(30) : cdk.Duration.days(7),
        preferredWindow: '03:00-04:00',
      },
      // Performance Insights
      enablePerformanceInsights: true,
      performanceInsightRetention: isProduction
        ? rds.PerformanceInsightRetention.MONTHS_12
        : rds.PerformanceInsightRetention.DEFAULT,
      removalPolicy: isProduction ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
      deletionProtection: isProduction,
    });

    // ========================================
    // ElastiCache Redis - High Performance Caching
    // ========================================
    const redisSecurityGroup = new ec2.SecurityGroup(this, 'RedisSecurityGroup', {
      vpc,
      description: 'Security group for Redis',
      allowAllOutbound: false,
    });

    redisSecurityGroup.addIngressRule(
      lambdaSecurityGroup,
      ec2.Port.tcp(6379),
      'Allow Redis from Lambda only'
    );

    const redisSubnetGroup = new elasticache.CfnSubnetGroup(this, 'RedisSubnetGroup', {
      description: 'Subnet group for Redis',
      subnetIds: vpc.selectSubnets({ subnetType: ec2.SubnetType.PRIVATE_ISOLATED }).subnetIds,
      cacheSubnetGroupName: `smuppy-redis-${environment}`,
    });

    // Redis Cluster with replication for high availability
    const redisReplicationGroup = new elasticache.CfnReplicationGroup(this, 'RedisCluster', {
      replicationGroupDescription: 'Smuppy Redis cluster for caching and sessions',
      automaticFailoverEnabled: isProduction,
      multiAzEnabled: isProduction,
      cacheNodeType: isProduction ? 'cache.r6g.large' : 'cache.t3.medium',
      engine: 'redis',
      engineVersion: '7.0',
      numNodeGroups: isProduction ? 2 : 1, // Sharding for scale
      replicasPerNodeGroup: isProduction ? 2 : 0,
      cacheSubnetGroupName: redisSubnetGroup.cacheSubnetGroupName,
      securityGroupIds: [redisSecurityGroup.securityGroupId],
      // Security: Encryption
      atRestEncryptionEnabled: true,
      transitEncryptionEnabled: true,
      // Auto minor version upgrade
      autoMinorVersionUpgrade: true,
    });

    redisReplicationGroup.addDependency(redisSubnetGroup);

    // ========================================
    // Reference existing S3 bucket
    // ========================================
    const mediaBucket = s3.Bucket.fromBucketName(this, 'MediaBucket', 'smuppy-media');

    // ========================================
    // Lambda Functions - Auto-scaling Serverless
    // ========================================

    // Common Lambda environment variables
    const lambdaEnvironment = {
      DB_HOST: dbCluster.clusterEndpoint.hostname,
      DB_PORT: dbCluster.clusterEndpoint.port.toString(),
      DB_NAME: 'smuppy',
      DB_SECRET_ARN: dbCredentials.secretArn,
      REDIS_HOST: redisReplicationGroup.attrPrimaryEndPointAddress,
      REDIS_PORT: redisReplicationGroup.attrPrimaryEndPointPort,
      USER_POOL_ID: userPool.userPoolId,
      MEDIA_BUCKET: mediaBucket.bucketName,
      ENVIRONMENT: environment,
      NODE_OPTIONS: '--enable-source-maps',
    };

    // Lambda layer for shared code
    const sharedLayer = new lambda.LayerVersion(this, 'SharedLayer', {
      code: lambda.Code.fromAsset('../lambda/layers/shared'),
      compatibleRuntimes: [lambda.Runtime.NODEJS_20_X],
      description: 'Shared utilities for Smuppy Lambda functions',
    });

    // Create optimized Lambda function helper using NodejsFunction for TypeScript
    const createLambda = (name: string, entryFile: string, options?: {
      memory?: number;
      timeout?: number;
      reservedConcurrency?: number;
    }) => {
      const fn = new NodejsFunction(this, name, {
        entry: path.join(__dirname, `../../lambda/api/${entryFile}.ts`),
        handler: 'handler',
        runtime: lambda.Runtime.NODEJS_20_X,
        memorySize: options?.memory || 512,
        timeout: cdk.Duration.seconds(options?.timeout || 30),
        vpc,
        vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
        securityGroups: [lambdaSecurityGroup],
        environment: lambdaEnvironment,
        // Bundling options for TypeScript
        bundling: {
          minify: true,
          sourceMap: true,
          // Bundle everything into a single file
          externalModules: [],
        },
        // Provisioned concurrency for consistent performance
        reservedConcurrentExecutions: options?.reservedConcurrency,
        // Tracing for debugging
        tracing: lambda.Tracing.ACTIVE,
        // Logging
        logRetention: logs.RetentionDays.ONE_MONTH,
        // Dependencies from the Lambda folder
        depsLockFilePath: path.join(__dirname, '../../lambda/api/package-lock.json'),
        projectRoot: path.join(__dirname, '../../lambda/api'),
      });

      // Grant permissions
      dbCredentials.grantRead(fn);
      mediaBucket.grantReadWrite(fn);

      return fn;
    };

    // API Lambda functions with auto-scaling
    const postsListFn = createLambda('PostsListFunction', 'posts/list', { memory: 1024 });
    const postsGetFn = createLambda('PostsGetFunction', 'posts/get');
    const postsCreateFn = createLambda('PostsCreateFunction', 'posts/create');
    const profilesGetFn = createLambda('ProfilesGetFunction', 'profiles/get');
    const profilesSearchFn = createLambda('ProfilesSearchFunction', 'profiles/search', { memory: 1024 });
    const feedGetFn = createLambda('FeedGetFunction', 'feed/get', { memory: 2048, timeout: 60 });
    const followsCreateFn = createLambda('FollowsCreateFunction', 'follows/create');

    // Admin Lambda for migrations (with extended timeout)
    const adminMigrationFn = new NodejsFunction(this, 'AdminMigrationFunction', {
      entry: path.join(__dirname, '../../lambda/api/admin/run-migration.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_20_X,
      memorySize: 512,
      timeout: cdk.Duration.minutes(5), // Long timeout for migrations
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      securityGroups: [lambdaSecurityGroup],
      environment: {
        ...lambdaEnvironment,
        ADMIN_KEY: 'smuppy-migration-secret-key-2026', // Simple admin key
      },
      bundling: {
        minify: true,
        sourceMap: true,
        externalModules: [],
      },
      tracing: lambda.Tracing.ACTIVE,
      logRetention: logs.RetentionDays.ONE_MONTH,
      depsLockFilePath: path.join(__dirname, '../../lambda/api/package-lock.json'),
      projectRoot: path.join(__dirname, '../../lambda/api'),
    });
    dbCredentials.grantRead(adminMigrationFn);

    // Admin Lambda for data migration from Supabase
    const dataMigrationFn = new NodejsFunction(this, 'DataMigrationFunction', {
      entry: path.join(__dirname, '../../lambda/api/admin/migrate-data.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_20_X,
      memorySize: 2048, // More memory for data processing
      timeout: cdk.Duration.minutes(15), // Extended timeout for data migration
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      securityGroups: [lambdaSecurityGroup],
      environment: {
        ...lambdaEnvironment,
        ADMIN_KEY: 'smuppy-migration-secret-key-2026',
      },
      bundling: {
        minify: true,
        sourceMap: true,
        externalModules: [],
      },
      tracing: lambda.Tracing.ACTIVE,
      logRetention: logs.RetentionDays.ONE_MONTH,
      depsLockFilePath: path.join(__dirname, '../../lambda/api/package-lock.json'),
      projectRoot: path.join(__dirname, '../../lambda/api'),
    });
    dbCredentials.grantRead(dataMigrationFn);

    // Admin Lambda for checking profile status
    const checkProfilesFn = new NodejsFunction(this, 'CheckProfilesFunction', {
      entry: path.join(__dirname, '../../lambda/api/admin/check-profiles.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_20_X,
      memorySize: 256,
      timeout: cdk.Duration.seconds(30),
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      securityGroups: [lambdaSecurityGroup],
      environment: lambdaEnvironment,
      bundling: { minify: true, sourceMap: true, externalModules: [] },
      depsLockFilePath: path.join(__dirname, '../../lambda/api/package-lock.json'),
      projectRoot: path.join(__dirname, '../../lambda/api'),
    });
    dbCredentials.grantRead(checkProfilesFn);

    // Admin Lambda for user migration to Cognito
    const userMigrationFn = new NodejsFunction(this, 'UserMigrationFunction', {
      entry: path.join(__dirname, '../../lambda/api/admin/migrate-users.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_20_X,
      memorySize: 1024,
      timeout: cdk.Duration.minutes(15),
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      securityGroups: [lambdaSecurityGroup],
      environment: {
        ...lambdaEnvironment,
        ADMIN_KEY: 'smuppy-migration-secret-key-2026',
      },
      bundling: {
        minify: true,
        sourceMap: true,
        externalModules: [],
      },
      tracing: lambda.Tracing.ACTIVE,
      logRetention: logs.RetentionDays.ONE_MONTH,
      depsLockFilePath: path.join(__dirname, '../../lambda/api/package-lock.json'),
      projectRoot: path.join(__dirname, '../../lambda/api'),
    });
    dbCredentials.grantRead(userMigrationFn);
    // Grant Cognito permissions
    userMigrationFn.addToRolePolicy(new iam.PolicyStatement({
      actions: [
        'cognito-idp:AdminCreateUser',
        'cognito-idp:AdminSetUserPassword',
        'cognito-idp:AdminGetUser',
        'cognito-idp:ListUsers',
      ],
      resources: [userPool.userPoolArn],
    }));

    // ========================================
    // API Gateway - REST API with Throttling
    // ========================================
    const api = new apigateway.RestApi(this, 'SmuppyAPI', {
      restApiName: `smuppy-api-${environment}`,
      description: 'Smuppy REST API - Auto-scaling Social Network',
      // Enable CloudWatch role for API Gateway logging
      cloudWatchRole: true,
      deployOptions: {
        stageName: environment,
        // Rate limiting per user
        throttlingRateLimit: isProduction ? 10000 : 1000,
        throttlingBurstLimit: isProduction ? 5000 : 500,
        // Logging
        loggingLevel: apigateway.MethodLoggingLevel.INFO,
        dataTraceEnabled: !isProduction,
        // Metrics
        metricsEnabled: true,
        // Caching (only in production to save costs)
        cachingEnabled: isProduction,
        cacheClusterEnabled: isProduction,
        cacheClusterSize: isProduction ? '0.5' : undefined,
      },
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: ['Content-Type', 'Authorization', 'X-Amz-Date', 'X-Api-Key'],
        maxAge: cdk.Duration.days(1),
      },
      // Binary support for images
      binaryMediaTypes: ['image/*', 'video/*'],
    });

    // Cognito Authorizer
    const authorizer = new apigateway.CognitoUserPoolsAuthorizer(this, 'CognitoAuthorizer', {
      cognitoUserPools: [userPool],
      resultsCacheTtl: cdk.Duration.minutes(5),
    });

    // API Endpoints
    const posts = api.root.addResource('posts');
    posts.addMethod('GET', new apigateway.LambdaIntegration(postsListFn, {
      // Cache key parameters only when caching is enabled (production)
      ...(isProduction && { cacheKeyParameters: ['method.request.querystring.limit', 'method.request.querystring.offset'] }),
    }));
    posts.addMethod('POST', new apigateway.LambdaIntegration(postsCreateFn), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    const profiles = api.root.addResource('profiles');
    profiles.addMethod('GET', new apigateway.LambdaIntegration(profilesSearchFn));

    const profileById = profiles.addResource('{id}');
    profileById.addMethod('GET', new apigateway.LambdaIntegration(profilesGetFn));

    const feed = api.root.addResource('feed');
    feed.addMethod('GET', new apigateway.LambdaIntegration(feedGetFn), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    const follows = api.root.addResource('follows');
    follows.addMethod('POST', new apigateway.LambdaIntegration(followsCreateFn), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    // Admin endpoints (no Cognito auth, uses admin key)
    const admin = api.root.addResource('admin');
    const migrate = admin.addResource('migrate');
    migrate.addMethod('POST', new apigateway.LambdaIntegration(adminMigrationFn));

    // Data migration endpoint
    const migrateData = admin.addResource('migrate-data');
    migrateData.addMethod('POST', new apigateway.LambdaIntegration(dataMigrationFn, {
      timeout: cdk.Duration.seconds(29), // API Gateway max is 29s, Lambda handles the rest
    }));

    // ========================================
    // WAF - Web Application Firewall (Security)
    // ========================================
    if (isProduction) {
      const webAcl = new wafv2.CfnWebACL(this, 'SmuppyWAF', {
        defaultAction: { allow: {} },
        scope: 'REGIONAL',
        visibilityConfig: {
          cloudWatchMetricsEnabled: true,
          metricName: 'SmuppyWAF',
          sampledRequestsEnabled: true,
        },
        rules: [
          // Rate limiting - prevent DDoS
          {
            name: 'RateLimitRule',
            priority: 1,
            action: { block: {} },
            statement: {
              rateBasedStatement: {
                limit: 2000, // 2000 requests per 5 minutes per IP
                aggregateKeyType: 'IP',
              },
            },
            visibilityConfig: {
              cloudWatchMetricsEnabled: true,
              metricName: 'RateLimitRule',
              sampledRequestsEnabled: true,
            },
          },
          // AWS Managed Rules - Common attacks
          {
            name: 'AWSManagedRulesCommonRuleSet',
            priority: 2,
            overrideAction: { none: {} },
            statement: {
              managedRuleGroupStatement: {
                vendorName: 'AWS',
                name: 'AWSManagedRulesCommonRuleSet',
              },
            },
            visibilityConfig: {
              cloudWatchMetricsEnabled: true,
              metricName: 'AWSManagedRulesCommonRuleSet',
              sampledRequestsEnabled: true,
            },
          },
          // SQL Injection protection
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
              metricName: 'AWSManagedRulesSQLiRuleSet',
              sampledRequestsEnabled: true,
            },
          },
        ],
      });

      // Associate WAF with API Gateway
      new wafv2.CfnWebACLAssociation(this, 'WafApiAssociation', {
        resourceArn: api.deploymentStage.stageArn,
        webAclArn: webAcl.attrArn,
      });
    }

    // ========================================
    // AppSync - GraphQL & Realtime (Auto-scaling)
    // ========================================
    const graphqlApi = new appsync.GraphqlApi(this, 'SmuppyGraphQL', {
      name: `smuppy-graphql-${environment}`,
      definition: appsync.Definition.fromFile('../lambda/graphql/schema.graphql'),
      authorizationConfig: {
        defaultAuthorization: {
          authorizationType: appsync.AuthorizationType.USER_POOL,
          userPoolConfig: {
            userPool,
          },
        },
        additionalAuthorizationModes: [
          {
            authorizationType: appsync.AuthorizationType.IAM,
          },
        ],
      },
      xrayEnabled: true,
      logConfig: {
        fieldLogLevel: appsync.FieldLogLevel.ERROR,
        excludeVerboseContent: true,
      },
    });

    // ========================================
    // Outputs
    // ========================================
    new cdk.CfnOutput(this, 'UserPoolId', {
      value: userPool.userPoolId,
      description: 'Cognito User Pool ID',
      exportName: `${id}-UserPoolId`,
    });

    new cdk.CfnOutput(this, 'UserPoolClientId', {
      value: userPoolClient.userPoolClientId,
      description: 'Cognito User Pool Client ID',
      exportName: `${id}-UserPoolClientId`,
    });

    new cdk.CfnOutput(this, 'IdentityPoolId', {
      value: identityPool.ref,
      description: 'Cognito Identity Pool ID',
      exportName: `${id}-IdentityPoolId`,
    });

    new cdk.CfnOutput(this, 'ApiEndpoint', {
      value: api.url,
      description: 'REST API Endpoint',
      exportName: `${id}-ApiEndpoint`,
    });

    new cdk.CfnOutput(this, 'GraphQLEndpoint', {
      value: graphqlApi.graphqlUrl,
      description: 'GraphQL API Endpoint',
      exportName: `${id}-GraphQLEndpoint`,
    });

    new cdk.CfnOutput(this, 'DatabaseEndpoint', {
      value: dbCluster.clusterEndpoint.hostname,
      description: 'Aurora Database Endpoint',
      exportName: `${id}-DatabaseEndpoint`,
    });

    new cdk.CfnOutput(this, 'RedisEndpoint', {
      value: redisReplicationGroup.attrPrimaryEndPointAddress,
      description: 'Redis Primary Endpoint',
      exportName: `${id}-RedisEndpoint`,
    });
  }
}

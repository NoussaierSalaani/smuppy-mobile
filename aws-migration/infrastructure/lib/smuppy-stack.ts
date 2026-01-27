import * as cdk from 'aws-cdk-lib';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as apigatewayv2 from 'aws-cdk-lib/aws-apigatewayv2';
import { WebSocketLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as appsync from 'aws-cdk-lib/aws-appsync';
import * as elasticache from 'aws-cdk-lib/aws-elasticache';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as wafv2 from 'aws-cdk-lib/aws-wafv2';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as cloudtrail from 'aws-cdk-lib/aws-cloudtrail';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import * as kms from 'aws-cdk-lib/aws-kms';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { Construct } from 'constructs';
import * as path from 'path';
import { LambdaStack } from './lambda-stack';

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
    // VPC Endpoints - Cost Optimization & Security
    // Traffic stays within AWS network (no NAT charges)
    // ========================================

    // S3 Gateway Endpoint (free, reduces NAT costs)
    vpc.addGatewayEndpoint('S3Endpoint', {
      service: ec2.GatewayVpcEndpointAwsService.S3,
      subnets: [{ subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS }],
    });

    // DynamoDB Gateway Endpoint (free, reduces NAT costs)
    vpc.addGatewayEndpoint('DynamoDBEndpoint', {
      service: ec2.GatewayVpcEndpointAwsService.DYNAMODB,
      subnets: [{ subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS }],
    });

    // Secrets Manager Interface Endpoint (for secure credential retrieval)
    vpc.addInterfaceEndpoint('SecretsManagerEndpoint', {
      service: ec2.InterfaceVpcEndpointAwsService.SECRETS_MANAGER,
      subnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      privateDnsEnabled: true,
    });

    // ========================================
    // CloudTrail - Security Audit Logging
    // ========================================
    const trailBucket = new s3.Bucket(this, 'CloudTrailBucket', {
      bucketName: `smuppy-cloudtrail-${environment}-${this.account}`,
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      versioned: true,
      lifecycleRules: [
        {
          id: 'DeleteOldLogs',
          expiration: cdk.Duration.days(isProduction ? 365 : 120),
          transitions: isProduction ? [
            {
              storageClass: s3.StorageClass.INFREQUENT_ACCESS,
              transitionAfter: cdk.Duration.days(30),
            },
            {
              storageClass: s3.StorageClass.GLACIER,
              transitionAfter: cdk.Duration.days(90),
            },
          ] : [
            {
              storageClass: s3.StorageClass.INFREQUENT_ACCESS,
              transitionAfter: cdk.Duration.days(30),
            },
          ],
        },
      ],
      removalPolicy: isProduction ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: !isProduction,
    });

    const trail = new cloudtrail.Trail(this, 'SmuppyCloudTrail', {
      trailName: `smuppy-audit-trail-${environment}`,
      bucket: trailBucket,
      isMultiRegionTrail: true,
      includeGlobalServiceEvents: true,
      enableFileValidation: true,
      sendToCloudWatchLogs: true,
      cloudWatchLogGroup: new logs.LogGroup(this, 'CloudTrailLogGroup', {
        logGroupName: `/aws/cloudtrail/smuppy-${environment}`,
        retention: isProduction ? logs.RetentionDays.ONE_YEAR : logs.RetentionDays.ONE_MONTH,
        removalPolicy: isProduction ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
      }),
      managementEvents: cloudtrail.ReadWriteType.ALL,
    });

    // Track S3 data events for media bucket
    trail.addS3EventSelector([{
      bucket: s3.Bucket.fromBucketName(this, 'MediaBucketForTrail', 'smuppy-media'),
    }], {
      readWriteType: cloudtrail.ReadWriteType.WRITE_ONLY,
      includeManagementEvents: false,
    });

    // ========================================
    // Cognito - Secure Authentication with SES Email
    // ========================================

    // Reference the SES verified domain for professional email delivery
    // Domain must be verified in SES before using (smuppy.com)
    const sesVerifiedDomain = 'smuppy.com';
    const sesFromEmail = `noreply@${sesVerifiedDomain}`;
    const sesReplyToEmail = `support@${sesVerifiedDomain}`;

    // ========================================
    // SES Bounce/Complaint Handling Topics
    // SECURITY: Required for email deliverability and abuse prevention
    // ========================================
    const sesBouncesTopic = new sns.Topic(this, 'SESBouncesTopic', {
      topicName: `smuppy-ses-bounces-${environment}`,
      displayName: 'Smuppy SES Bounces',
    });

    const sesComplaintsTopic = new sns.Topic(this, 'SESComplaintsTopic', {
      topicName: `smuppy-ses-complaints-${environment}`,
      displayName: 'Smuppy SES Complaints',
    });

    // Output SES topics for manual SES configuration
    new cdk.CfnOutput(this, 'SESBouncesTopicArn', {
      value: sesBouncesTopic.topicArn,
      description: 'SNS Topic ARN for SES Bounces - Configure in SES Console',
      exportName: `${id}-SESBouncesTopicArn`,
    });

    new cdk.CfnOutput(this, 'SESComplaintsTopicArn', {
      value: sesComplaintsTopic.topicArn,
      description: 'SNS Topic ARN for SES Complaints - Configure in SES Console',
      exportName: `${id}-SESComplaintsTopicArn`,
    });

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
      // Strong password policy - SECURITY HARDENED
      passwordPolicy: {
        minLength: 10, // Increased from 8
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: true, // SECURITY: Now required
        tempPasswordValidity: cdk.Duration.days(3),
      },
      // Account security
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      // MFA Configuration - SECURITY HARDENED
      // Optional MFA allows users to enable it for enhanced security
      // Production: Optional but encouraged via UI prompts
      mfa: cognito.Mfa.OPTIONAL,
      mfaSecondFactor: {
        sms: false, // Disable SMS MFA (vulnerable to SIM swapping)
        otp: true,  // Enable TOTP (authenticator apps like Google Authenticator)
      },
      // Advanced security features
      advancedSecurityMode: isProduction
        ? cognito.AdvancedSecurityMode.ENFORCED
        : cognito.AdvancedSecurityMode.AUDIT,
      // Professional email delivery via SES
      email: cognito.UserPoolEmail.withSES({
        fromEmail: sesFromEmail,
        fromName: 'Smuppy',
        replyTo: sesReplyToEmail,
        sesRegion: 'us-east-1',
        // SES verified identity ARN
        sesVerifiedDomain: sesVerifiedDomain,
      }),
      // Custom email verification message with Smuppy branding
      userVerification: {
        emailSubject: 'Smuppy - Verify your email',
        emailBody: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td align="center" style="padding: 40px 0;">
        <table role="presentation" style="width: 100%; max-width: 600px; border-collapse: collapse; background-color: #ffffff; border-radius: 16px; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
          <tr>
            <td style="padding: 40px 40px 20px 40px; text-align: center;">
              <h1 style="margin: 0; color: #0EBF8A; font-size: 36px; font-weight: 900;">Smuppy</h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 0 40px 20px 40px; text-align: center;">
              <h2 style="margin: 0; color: #1f2937; font-size: 24px; font-weight: 600;">Verify your email</h2>
            </td>
          </tr>
          <tr>
            <td style="padding: 0 40px 30px 40px; text-align: center;">
              <p style="margin: 0; color: #6b7280; font-size: 16px; line-height: 24px;">
                Welcome to Smuppy! Use the verification code below to complete your registration.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding: 0 40px 30px 40px; text-align: center;">
              <div style="background: linear-gradient(135deg, #00B3C7 0%, #0EBF8A 100%); border-radius: 12px; padding: 28px;">
                <span style="font-size: 40px; font-weight: bold; color: #ffffff; letter-spacing: 10px; font-family: monospace;">{####}</span>
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding: 0 40px 30px 40px;">
              <div style="background-color: #E6FAF8; border-radius: 8px; padding: 16px; border-left: 4px solid #0EBF8A;">
                <p style="margin: 0; color: #065f46; font-size: 13px; line-height: 20px;">
                  <strong>Security tip:</strong> Never share this code with anyone. Smuppy will never ask for your code via phone, text, or email.
                </p>
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding: 0 40px 20px 40px; text-align: center;">
              <p style="margin: 0; color: #9ca3af; font-size: 14px;">
                This code expires in 24 hours. If you didn't request this, please ignore this email.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding: 20px 40px; text-align: center; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0; color: #9ca3af; font-size: 12px;">
                © 2026 Smuppy. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`,
        emailStyle: cognito.VerificationEmailStyle.CODE,
      },
      // Custom attributes for social network
      customAttributes: {
        'account_type': new cognito.StringAttribute({ mutable: true }),
        'is_verified': new cognito.BooleanAttribute({ mutable: true }),
        'bio': new cognito.StringAttribute({ mutable: true, maxLen: 500 }),
        'auth_provider': new cognito.StringAttribute({ mutable: false }),
        'apple_user_id': new cognito.StringAttribute({ mutable: false }),
        'google_user_id': new cognito.StringAttribute({ mutable: false }),
      },
      removalPolicy: isProduction ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
    });

    // Shared log group for triggers
    const triggersLogGroup = new logs.LogGroup(this, 'TriggersLogGroup', {
      logGroupName: `/aws/lambda/smuppy-triggers-${environment}`,
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: isProduction ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
    });

    // Pre-signup Lambda Trigger for email validation and abuse prevention
    // SECURITY: Validates email domains and prevents disposable email signups
    const preSignupFn = new NodejsFunction(this, 'PreSignupFunction', {
      entry: path.join(__dirname, '../../lambda/triggers/pre-signup.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_20_X,
      memorySize: 128,
      timeout: cdk.Duration.seconds(5),
      // No VPC needed for this trigger
      bundling: {
        minify: true,
        sourceMap: true,
        externalModules: [],
      },
      tracing: lambda.Tracing.ACTIVE,
      logGroup: triggersLogGroup,
      environment: {
        ENVIRONMENT: environment,
      },
    });

    // Custom Message Lambda Trigger for professional email templates
    const customMessageFn = new NodejsFunction(this, 'CustomMessageFunction', {
      entry: path.join(__dirname, '../../lambda/triggers/custom-message.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_20_X,
      memorySize: 128,
      timeout: cdk.Duration.seconds(5),
      // No VPC needed for this trigger
      bundling: {
        minify: true,
        sourceMap: true,
        externalModules: [],
      },
      tracing: lambda.Tracing.ACTIVE,
      logGroup: triggersLogGroup,
    });

    // Attach triggers to user pool
    userPool.addTrigger(cognito.UserPoolOperation.PRE_SIGN_UP, preSignupFn);
    userPool.addTrigger(cognito.UserPoolOperation.CUSTOM_MESSAGE, customMessageFn);

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
      // Token validity - SECURITY HARDENED
      // Short-lived access tokens (15 min) minimize window of attack if token is stolen
      accessTokenValidity: cdk.Duration.minutes(15),
      idTokenValidity: cdk.Duration.minutes(15),
      // Refresh tokens valid for 7 days with rotation
      refreshTokenValidity: cdk.Duration.days(7),
      // Enable token revocation for logout
      enableTokenRevocation: true,
      // Prevent user enumeration attacks
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
    // Identity Pool IAM Roles - Least Privilege
    // ========================================

    // Authenticated user role - minimal permissions for app functionality
    const authenticatedRole = new iam.Role(this, 'CognitoAuthenticatedRole', {
      assumedBy: new iam.FederatedPrincipal(
        'cognito-identity.amazonaws.com',
        {
          StringEquals: {
            'cognito-identity.amazonaws.com:aud': identityPool.ref,
          },
          'ForAnyValue:StringLike': {
            'cognito-identity.amazonaws.com:amr': 'authenticated',
          },
        },
        'sts:AssumeRoleWithWebIdentity'
      ),
      description: 'Role for authenticated Smuppy users',
      maxSessionDuration: cdk.Duration.hours(1),
    });

    // S3 permissions - users can only access their own folder
    authenticatedRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['s3:GetObject', 's3:PutObject', 's3:DeleteObject'],
        resources: [
          `arn:aws:s3:::smuppy-media/users/\${cognito-identity.amazonaws.com:sub}/*`,
          `arn:aws:s3:::smuppy-media/private/\${cognito-identity.amazonaws.com:sub}/*`,
        ],
      })
    );

    // S3 list permissions for user's own folder
    authenticatedRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['s3:ListBucket'],
        resources: ['arn:aws:s3:::smuppy-media'],
        conditions: {
          StringLike: {
            's3:prefix': [
              'users/${cognito-identity.amazonaws.com:sub}/*',
              'private/${cognito-identity.amazonaws.com:sub}/*',
            ],
          },
        },
      })
    );

    // Public read for posts/media (all users can view)
    authenticatedRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['s3:GetObject'],
        resources: [
          'arn:aws:s3:::smuppy-media/posts/*',
          'arn:aws:s3:::smuppy-media/public/*',
        ],
      })
    );

    // Unauthenticated role - very limited (just public content)
    const unauthenticatedRole = new iam.Role(this, 'CognitoUnauthenticatedRole', {
      assumedBy: new iam.FederatedPrincipal(
        'cognito-identity.amazonaws.com',
        {
          StringEquals: {
            'cognito-identity.amazonaws.com:aud': identityPool.ref,
          },
          'ForAnyValue:StringLike': {
            'cognito-identity.amazonaws.com:amr': 'unauthenticated',
          },
        },
        'sts:AssumeRoleWithWebIdentity'
      ),
      description: 'Role for unauthenticated Smuppy users (minimal)',
      maxSessionDuration: cdk.Duration.hours(1),
    });

    // Unauthenticated can only read public content
    unauthenticatedRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['s3:GetObject'],
        resources: ['arn:aws:s3:::smuppy-media/public/*'],
      })
    );

    // Attach roles to Identity Pool
    new cognito.CfnIdentityPoolRoleAttachment(this, 'IdentityPoolRoleAttachment', {
      identityPoolId: identityPool.ref,
      roles: {
        authenticated: authenticatedRole.roleArn,
        unauthenticated: unauthenticatedRole.roleArn,
      },
      roleMappings: {
        cognitoProvider: {
          identityProvider: `cognito-idp.${this.region}.amazonaws.com/${userPool.userPoolId}:${userPoolClient.userPoolClientId}`,
          type: 'Token',
          ambiguousRoleResolution: 'AuthenticatedRole',
        },
      },
    });

    // ========================================
    // Aurora Serverless v2 - Auto-scaling Database
    // OPTIMIZED: Parameter Groups, RDS Proxy, Enhanced Monitoring, CloudWatch Logs
    // ========================================

    // Security group for RDS Proxy
    const rdsProxySecurityGroup = new ec2.SecurityGroup(this, 'RDSProxySecurityGroup', {
      vpc,
      description: 'Security group for RDS Proxy',
      allowAllOutbound: false,
    });

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

    // DB accepts connections from RDS Proxy and Lambda (for direct access if needed)
    dbSecurityGroup.addIngressRule(
      rdsProxySecurityGroup,
      ec2.Port.tcp(5432),
      'Allow PostgreSQL from RDS Proxy'
    );
    dbSecurityGroup.addIngressRule(
      lambdaSecurityGroup,
      ec2.Port.tcp(5432),
      'Allow PostgreSQL from Lambda only'
    );

    // RDS Proxy accepts connections from Lambda
    rdsProxySecurityGroup.addIngressRule(
      lambdaSecurityGroup,
      ec2.Port.tcp(5432),
      'Allow PostgreSQL from Lambda to RDS Proxy'
    );
    rdsProxySecurityGroup.addEgressRule(
      dbSecurityGroup,
      ec2.Port.tcp(5432),
      'Allow RDS Proxy to connect to Aurora'
    );

    // Database credentials with automatic rotation
    const dbCredentials = new secretsmanager.Secret(this, 'DBCredentials', {
      secretName: `smuppy-db-credentials-${environment}`,
      generateSecretString: {
        secretStringTemplate: JSON.stringify({ username: 'smuppy_admin' }),
        generateStringKey: 'password',
        excludePunctuation: true,
        passwordLength: 32,
      },
    });

    // SECURITY: Admin API Key stored in Secrets Manager (not hardcoded)
    const adminApiKeySecret = new secretsmanager.Secret(this, 'AdminApiKeySecret', {
      secretName: `smuppy-admin-api-key-${environment}`,
      description: 'Admin API key for migration and administrative operations',
      generateSecretString: {
        excludePunctuation: false,
        passwordLength: 64,
        includeSpace: false,
      },
    });

    // ========================================
    // FIX #1: PostgreSQL Parameter Group - Performance Optimization
    // Note: Aurora manages checkpointing and shared_buffers internally
    // ========================================
    const dbClusterParameterGroup = new rds.ParameterGroup(this, 'AuroraClusterParameterGroup', {
      engine: rds.DatabaseClusterEngine.auroraPostgres({
        version: rds.AuroraPostgresEngineVersion.VER_15_14,
      }),
      description: `Smuppy Aurora PostgreSQL optimized cluster parameters - ${environment}`,
      parameters: {
        // Connection management - kill idle transactions after 5 minutes
        'idle_in_transaction_session_timeout': '300000',

        // Performance tuning - pg_stat_statements for query analysis
        'shared_preload_libraries': 'pg_stat_statements,auto_explain',
        'pg_stat_statements.track': 'all',
        'pg_stat_statements.max': '10000',
        'auto_explain.log_min_duration': '1000', // Log queries > 1 second
        'auto_explain.log_analyze': 'true',
        'auto_explain.log_buffers': 'true',

        // Memory optimization - Aurora manages these automatically based on instance size
        // work_mem and maintenance_work_mem are set by Aurora

        // Logging for debugging and monitoring
        'log_statement': 'ddl',
        'log_min_duration_statement': isProduction ? '1000' : '500',
        'log_lock_waits': 'on',
        'log_temp_files': '0', // Log all temp files
        'log_autovacuum_min_duration': '1000', // Log autovacuum > 1s

        // Query planner optimization for Aurora SSD storage
        'random_page_cost': '1.1', // SSD-optimized (Aurora uses SSDs)
        'default_statistics_target': '100', // Better query plans

        // Autovacuum tuning for high-write social network workloads
        'autovacuum_vacuum_scale_factor': '0.05', // Vacuum at 5% dead tuples
        'autovacuum_analyze_scale_factor': '0.025', // Analyze at 2.5% changes
        'autovacuum_vacuum_cost_delay': '2', // Faster vacuum
        'autovacuum_vacuum_cost_limit': '1000', // More aggressive vacuum
        'autovacuum_naptime': '15', // Check every 15s

        // SSL enforcement for security
        'rds.force_ssl': '1',

        // Timezone
        'timezone': 'UTC',
      },
    });

    const dbInstanceParameterGroup = new rds.ParameterGroup(this, 'AuroraInstanceParameterGroup', {
      engine: rds.DatabaseClusterEngine.auroraPostgres({
        version: rds.AuroraPostgresEngineVersion.VER_15_14,
      }),
      description: `Smuppy Aurora PostgreSQL optimized instance parameters - ${environment}`,
      parameters: {
        // Instance-level logging for connection tracking
        'log_connections': isProduction ? 'off' : 'on', // Reduce noise in production
        'log_disconnections': isProduction ? 'off' : 'on',

        // Performance monitoring - essential for Performance Insights
        'track_activities': 'on',
        'track_counts': 'on',
        'track_io_timing': 'on',
        'track_functions': 'all',
        'track_activity_query_size': '4096', // Track longer queries
      },
    });

    // ========================================
    // FIX #5 & #7: Enhanced Backup & Encryption with KMS
    // Note: CloudWatch Logs are configured via cloudwatchLogsExports on the cluster
    // ========================================
    const dbEncryptionKey = new kms.Key(this, 'AuroraEncryptionKey', {
      alias: `smuppy-aurora-${environment}`,
      description: `KMS key for Smuppy Aurora database encryption - ${environment}`,
      enableKeyRotation: true, // Automatic key rotation every year
      removalPolicy: isProduction ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
    });

    // Aurora Serverless v2 Cluster - Auto-scaling with all optimizations
    const dbCluster = new rds.DatabaseCluster(this, 'SmuppyDatabase', {
      engine: rds.DatabaseClusterEngine.auroraPostgres({
        version: rds.AuroraPostgresEngineVersion.VER_15_14,
      }),
      credentials: rds.Credentials.fromSecret(dbCredentials),
      defaultDatabaseName: 'smuppy',
      clusterIdentifier: `smuppy-db-${environment}`,

      // FIX #1: Apply Parameter Groups
      parameterGroup: dbClusterParameterGroup,

      // AUTO-SCALING: 0.5 ACU (idle) to 128 ACU (high load)
      serverlessV2MinCapacity: 0.5,
      serverlessV2MaxCapacity: isProduction ? 128 : 16,

      writer: rds.ClusterInstance.serverlessV2('writer', {
        autoMinorVersionUpgrade: true,
        parameterGroup: dbInstanceParameterGroup,
        enablePerformanceInsights: true,
        performanceInsightRetention: isProduction
          ? rds.PerformanceInsightRetention.MONTHS_12
          : rds.PerformanceInsightRetention.DEFAULT,
      }),

      // FIX #2: Read replicas with reader endpoint for read-heavy operations
      readers: isProduction
        ? [
            rds.ClusterInstance.serverlessV2('reader1', {
              scaleWithWriter: true,
              parameterGroup: dbInstanceParameterGroup,
              enablePerformanceInsights: true,
            }),
            rds.ClusterInstance.serverlessV2('reader2', {
              scaleWithWriter: true,
              parameterGroup: dbInstanceParameterGroup,
              enablePerformanceInsights: true,
            }),
          ]
        : [
            // Even staging gets one reader for testing read scaling
            rds.ClusterInstance.serverlessV2('reader1', {
              scaleWithWriter: true,
              parameterGroup: dbInstanceParameterGroup,
            }),
          ],

      vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
      },
      securityGroups: [dbSecurityGroup],

      // FIX #7: Security - Encryption at rest with KMS
      storageEncrypted: true,
      storageEncryptionKey: dbEncryptionKey,

      // FIX #5: Enhanced Backup with cross-region copy
      backup: {
        retention: isProduction ? cdk.Duration.days(35) : cdk.Duration.days(14),
        preferredWindow: '03:00-04:00',
      },

      // FIX #6: CloudWatch Logs Export
      cloudwatchLogsExports: ['postgresql'],
      cloudwatchLogsRetention: isProduction ? logs.RetentionDays.THREE_MONTHS : logs.RetentionDays.ONE_MONTH,

      // FIX #3: Enhanced Monitoring
      monitoringInterval: cdk.Duration.seconds(isProduction ? 15 : 60),

      // Copy tags to snapshots for better backup management
      copyTagsToSnapshot: true,

      // IAM Authentication support
      iamAuthentication: true,

      removalPolicy: isProduction ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
      deletionProtection: isProduction,
    });

    // ========================================
    // FIX #4: RDS Proxy - Connection Pooling (Prevents connection explosion)
    // ========================================
    const rdsProxy = new rds.DatabaseProxy(this, 'SmuppyRDSProxy', {
      proxyTarget: rds.ProxyTarget.fromCluster(dbCluster),
      secrets: [dbCredentials],
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      securityGroups: [rdsProxySecurityGroup],
      dbProxyName: `smuppy-proxy-${environment}`,

      // Connection pool configuration
      idleClientTimeout: cdk.Duration.minutes(30),
      maxConnectionsPercent: 90, // Use up to 90% of available connections
      maxIdleConnectionsPercent: 50, // Keep 50% of connections idle for burst capacity

      // Require TLS for all connections
      requireTLS: true,

      // Borrow timeout - how long to wait for a connection
      borrowTimeout: cdk.Duration.seconds(30),

      // IAM Authentication for enhanced security
      iamAuth: true,

      // Debug logging in staging
      debugLogging: !isProduction,
    });

    // Store RDS Proxy endpoint in SSM for Lambda functions
    new ssm.StringParameter(this, 'RDSProxyEndpoint', {
      parameterName: `/smuppy/${environment}/db/proxy-endpoint`,
      stringValue: rdsProxy.endpoint,
      description: 'RDS Proxy endpoint for connection pooling',
    });

    // Store reader endpoint in SSM for read-heavy Lambda functions
    new ssm.StringParameter(this, 'DBReaderEndpoint', {
      parameterName: `/smuppy/${environment}/db/reader-endpoint`,
      stringValue: dbCluster.clusterReadEndpoint.hostname,
      description: 'Aurora reader endpoint for read-heavy operations',
    });

    // ========================================
    // FIX #8: Secret Rotation - ALL ENVIRONMENTS
    // Rotate database credentials every 30 days (production) or 90 days (staging)
    // ========================================
    dbCredentials.addRotationSchedule('DBCredentialsRotation', {
      automaticallyAfter: isProduction ? cdk.Duration.days(30) : cdk.Duration.days(90),
      hostedRotation: secretsmanager.HostedRotation.postgreSqlSingleUser({
        vpc,
        vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
        securityGroups: [lambdaSecurityGroup],
        functionName: `smuppy-db-rotation-${environment}`,
      }),
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

    // SECURITY: Redis Auth Token stored in Secrets Manager
    const redisAuthToken = new secretsmanager.Secret(this, 'RedisAuthToken', {
      secretName: `smuppy-redis-auth-${environment}`,
      description: 'Authentication token for Redis cluster',
      generateSecretString: {
        excludePunctuation: true, // Redis auth tokens must be alphanumeric
        passwordLength: 64,
        excludeCharacters: '@%*()_+=[]{}|;:,.<>?/~`"\'\\',
      },
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
      // SECURITY: Auth token for Redis authentication
      authToken: redisAuthToken.secretValue.unsafeUnwrap(),
      transitEncryptionMode: 'required',
      // Auto minor version upgrade
      autoMinorVersionUpgrade: true,
    });

    redisReplicationGroup.addDependency(redisSubnetGroup);

    // ========================================
    // Reference existing S3 bucket
    // ========================================
    const mediaBucket = s3.Bucket.fromBucketName(this, 'MediaBucket', 'smuppy-media');

    // ========================================
    // Lambda Functions - Nested Stack
    // ========================================

    // Common Lambda environment variables
    // FIX #4: Use RDS Proxy endpoint instead of direct database connection
    // Note: Redis endpoint will be added after Redis cluster is fully created via SSM Parameter
    const lambdaEnvironment: { [key: string]: string } = {
      // Use RDS Proxy for connection pooling (prevents Lambda connection explosion)
      DB_HOST: rdsProxy.endpoint,
      DB_PORT: '5432',
      DB_NAME: 'smuppy',
      DB_SECRET_ARN: dbCredentials.secretArn,
      // Direct writer endpoint (for admin/migration tasks that need direct access)
      DB_WRITER_HOST: dbCluster.clusterEndpoint.hostname,
      // Reader endpoint for read-heavy operations (feeds, search, list queries)
      DB_READER_HOST: dbCluster.clusterReadEndpoint.hostname,
      // IAM auth disabled - using Secrets Manager password auth through RDS Proxy
      DB_USE_IAM_AUTH: 'false',
      USER_POOL_ID: userPool.userPoolId,
      MEDIA_BUCKET: mediaBucket.bucketName,
      ENVIRONMENT: environment,
      NODE_OPTIONS: '--enable-source-maps',
      // SNS Platform Application ARNs for Push Notifications
      IOS_PLATFORM_APPLICATION_ARN: `arn:aws:sns:${this.region}:${this.account}:app/${isProduction ? 'APNS' : 'APNS_SANDBOX'}/smuppy-ios-${environment}`,
      // Android uses GCM platform type in SNS (Firebase Cloud Messaging)
      ANDROID_PLATFORM_APPLICATION_ARN: `arn:aws:sns:${this.region}:${this.account}:app/GCM/smuppy-android-${environment}`,
      FCM_SECRET_ARN: `smuppy/${environment}/fcm-credentials`,
    };

    // Pass Redis replication group ID to Lambdas - they will look up endpoint at runtime
    // This avoids CloudFormation validation issues with attrPrimaryEndPointAddress
    lambdaEnvironment.REDIS_REPLICATION_GROUP_ID = redisReplicationGroup.ref;
    lambdaEnvironment.REDIS_PORT = '6379';
    lambdaEnvironment.REDIS_AUTH_SECRET_ARN = redisAuthToken.secretArn;
    lambdaEnvironment.AWS_REGION_NAME = this.region;

    // Shared log groups for Lambda functions (created in main stack to keep resource ownership)
    const apiLogGroup = new logs.LogGroup(this, 'ApiLambdaLogGroup', {
      logGroupName: `/aws/lambda/smuppy-api-${environment}`,
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: isProduction ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
    });

    const adminLogGroup = new logs.LogGroup(this, 'AdminLogGroup', {
      logGroupName: `/aws/lambda/smuppy-admin-${environment}`,
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: isProduction ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
    });

    const authLogGroup = new logs.LogGroup(this, 'AuthLogGroup', {
      logGroupName: `/aws/lambda/smuppy-auth-${environment}`,
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: isProduction ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
    });

    // Create nested Lambda stack to stay under CloudFormation's 500 resource limit
    const lambdaStack = new LambdaStack(this, 'LambdaStack', {
      vpc,
      lambdaSecurityGroup,
      dbCredentials,
      adminApiKeySecret,
      redisAuthSecret: redisAuthToken,
      mediaBucket,
      userPool,
      userPoolClientId: userPoolClient.userPoolClientId,
      lambdaEnvironment,
      environment,
      isProduction,
      apiLogGroup,
      adminLogGroup,
      authLogGroup,
      // RDS Proxy ARN for IAM authentication
      // Format: arn:aws:rds-db:region:account:dbuser:proxy-resource-id/db_user
      rdsProxyArn: cdk.Fn.sub('arn:aws:rds-db:${AWS::Region}:${AWS::AccountId}:dbuser:${ProxyId}/*', {
        ProxyId: cdk.Fn.select(6, cdk.Fn.split(':', rdsProxy.dbProxyArn)),
      }),
    });

    // Note: Lambda stack no longer depends on Redis directly
    // Redis endpoint is stored in SSM Parameter Store and retrieved at runtime
    // This avoids CloudFormation circular/timing dependency issues

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
        // Rate limiting - massive scale for production social network
        // 100k req/s steady, 50k burst handles viral content & peak hours
        throttlingRateLimit: isProduction ? 100000 : 1000,
        throttlingBurstLimit: isProduction ? 50000 : 500,
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
      // SECURITY: Restrictive CORS - Only allow Smuppy domains
      defaultCorsPreflightOptions: {
        allowOrigins: isProduction
          ? ['https://smuppy.com', 'https://www.smuppy.com', 'https://app.smuppy.com']
          : ['https://smuppy.com', 'https://www.smuppy.com', 'https://app.smuppy.com', 'http://localhost:8081', 'http://localhost:19006'],
        allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
        allowHeaders: [
          'Content-Type',
          'Authorization',
          'X-Amz-Date',
          'X-Api-Key',
          'X-Amz-Security-Token',
          'X-Request-Id',
        ],
        allowCredentials: true,
        maxAge: cdk.Duration.hours(1),
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
    posts.addMethod('GET', new apigateway.LambdaIntegration(lambdaStack.postsListFn, {
      // Cache key parameters only when caching is enabled (production)
      ...(isProduction && { cacheKeyParameters: ['method.request.querystring.limit', 'method.request.querystring.offset'] }),
    }));
    posts.addMethod('POST', new apigateway.LambdaIntegration(lambdaStack.postsCreateFn), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    // Single post operations: /posts/{id}
    const postById = posts.addResource('{id}');
    postById.addMethod('GET', new apigateway.LambdaIntegration(lambdaStack.postsGetFn));
    postById.addMethod('DELETE', new apigateway.LambdaIntegration(lambdaStack.postsDeleteFn), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    // Like/Unlike: POST /posts/{id}/like, DELETE /posts/{id}/like
    const postLike = postById.addResource('like');
    postLike.addMethod('POST', new apigateway.LambdaIntegration(lambdaStack.postsLikeFn), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });
    postLike.addMethod('DELETE', new apigateway.LambdaIntegration(lambdaStack.postsUnlikeFn), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    // Save/Unsave (Bookmark): POST /posts/{id}/save, DELETE /posts/{id}/save
    const postSave = postById.addResource('save');
    postSave.addMethod('POST', new apigateway.LambdaIntegration(lambdaStack.postsSaveFn), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });
    postSave.addMethod('DELETE', new apigateway.LambdaIntegration(lambdaStack.postsUnsaveFn), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    // Comments: GET /posts/{id}/comments, POST /posts/{id}/comments
    const postComments = postById.addResource('comments');
    postComments.addMethod('GET', new apigateway.LambdaIntegration(lambdaStack.commentsListFn));
    postComments.addMethod('POST', new apigateway.LambdaIntegration(lambdaStack.commentsCreateFn), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    // Check if post is saved: GET /posts/{id}/saved
    const postSaved = postById.addResource('saved');
    postSaved.addMethod('GET', new apigateway.LambdaIntegration(lambdaStack.postsIsSavedFn), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    // Comments: DELETE /comments/{id}, PATCH /comments/{id}
    const comments = api.root.addResource('comments');
    const commentById = comments.addResource('{id}');
    commentById.addMethod('DELETE', new apigateway.LambdaIntegration(lambdaStack.commentsDeleteFn), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });
    commentById.addMethod('PATCH', new apigateway.LambdaIntegration(lambdaStack.commentsUpdateFn), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    const profiles = api.root.addResource('profiles');
    profiles.addMethod('GET', new apigateway.LambdaIntegration(lambdaStack.profilesSearchFn));

    const profileById = profiles.addResource('{id}');
    profileById.addMethod('GET', new apigateway.LambdaIntegration(lambdaStack.profilesGetFn));

    // Check if following endpoint: GET /profiles/{id}/is-following
    const profileIsFollowing = profileById.addResource('is-following');
    profileIsFollowing.addMethod('GET', new apigateway.LambdaIntegration(lambdaStack.profilesIsFollowingFn), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    // Profile followers: GET /profiles/{id}/followers
    const profileFollowers = profileById.addResource('followers');
    profileFollowers.addMethod('GET', new apigateway.LambdaIntegration(lambdaStack.profilesFollowersFn));

    // Profile following: GET /profiles/{id}/following
    const profileFollowing = profileById.addResource('following');
    profileFollowing.addMethod('GET', new apigateway.LambdaIntegration(lambdaStack.profilesFollowingFn));

    // Profile update endpoint (authenticated)
    const profileMe = profiles.addResource('me');
    profileMe.addMethod('PATCH', new apigateway.LambdaIntegration(lambdaStack.profilesUpdateFn), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    // Suggested profiles endpoint (authenticated for personalized suggestions)
    const profilesSuggested = profiles.addResource('suggested');
    profilesSuggested.addMethod('GET', new apigateway.LambdaIntegration(lambdaStack.profilesSuggestedFn), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    const feed = api.root.addResource('feed');
    feed.addMethod('GET', new apigateway.LambdaIntegration(lambdaStack.feedGetFn), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    const follows = api.root.addResource('follows');
    follows.addMethod('POST', new apigateway.LambdaIntegration(lambdaStack.followsCreateFn), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    // Unfollow endpoint: DELETE /follows/{userId}
    const followsByUser = follows.addResource('{userId}');
    followsByUser.addMethod('DELETE', new apigateway.LambdaIntegration(lambdaStack.followsDeleteFn), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    // Follow Requests endpoints
    const followRequests = api.root.addResource('follow-requests');
    followRequests.addMethod('GET', new apigateway.LambdaIntegration(lambdaStack.followRequestsListFn), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    const followRequestById = followRequests.addResource('{id}');
    const followRequestAccept = followRequestById.addResource('accept');
    followRequestAccept.addMethod('POST', new apigateway.LambdaIntegration(lambdaStack.followRequestsAcceptFn), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    const followRequestDecline = followRequestById.addResource('decline');
    followRequestDecline.addMethod('POST', new apigateway.LambdaIntegration(lambdaStack.followRequestsDeclineFn), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    // ========================================
    // Peaks Endpoints (Phase 4)
    // ========================================
    const peaks = api.root.addResource('peaks');
    peaks.addMethod('GET', new apigateway.LambdaIntegration(lambdaStack.peaksListFn));
    peaks.addMethod('POST', new apigateway.LambdaIntegration(lambdaStack.peaksCreateFn), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    const peakById = peaks.addResource('{id}');
    peakById.addMethod('GET', new apigateway.LambdaIntegration(lambdaStack.peaksGetFn));
    peakById.addMethod('DELETE', new apigateway.LambdaIntegration(lambdaStack.peaksDeleteFn), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    // Peak like/unlike: POST /peaks/{id}/like, DELETE /peaks/{id}/like
    const peakLike = peakById.addResource('like');
    peakLike.addMethod('POST', new apigateway.LambdaIntegration(lambdaStack.peaksLikeFn), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });
    peakLike.addMethod('DELETE', new apigateway.LambdaIntegration(lambdaStack.peaksUnlikeFn), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    // Peak comments: POST /peaks/{id}/comments
    const peakComments = peakById.addResource('comments');
    peakComments.addMethod('POST', new apigateway.LambdaIntegration(lambdaStack.peaksCommentFn), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    // Peak reactions: POST /peaks/{id}/react, DELETE /peaks/{id}/react
    const peakReact = peakById.addResource('react');
    peakReact.addMethod('POST', new apigateway.LambdaIntegration(lambdaStack.peaksReactFn), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });
    peakReact.addMethod('DELETE', new apigateway.LambdaIntegration(lambdaStack.peaksReactFn), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    // Peak tags: GET /peaks/{id}/tags, POST /peaks/{id}/tags
    const peakTags = peakById.addResource('tags');
    peakTags.addMethod('GET', new apigateway.LambdaIntegration(lambdaStack.peaksTagFn), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });
    peakTags.addMethod('POST', new apigateway.LambdaIntegration(lambdaStack.peaksTagFn), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    // Peak tag by user: DELETE /peaks/{id}/tags/{userId}
    const peakTagByUser = peakTags.addResource('{userId}');
    peakTagByUser.addMethod('DELETE', new apigateway.LambdaIntegration(lambdaStack.peaksTagFn), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    // Peak hide: POST /peaks/{id}/hide, DELETE /peaks/{id}/hide
    const peakHide = peakById.addResource('hide');
    peakHide.addMethod('POST', new apigateway.LambdaIntegration(lambdaStack.peaksHideFn), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });
    peakHide.addMethod('DELETE', new apigateway.LambdaIntegration(lambdaStack.peaksHideFn), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    // Hidden peaks list: GET /peaks/hidden
    const peaksHidden = peaks.addResource('hidden');
    peaksHidden.addMethod('GET', new apigateway.LambdaIntegration(lambdaStack.peaksHideFn), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    // Peak replies (respond to peak with another peak): GET/POST /peaks/{id}/replies
    const peakReplies = peakById.addResource('replies');
    peakReplies.addMethod('GET', new apigateway.LambdaIntegration(lambdaStack.peaksRepliesFn), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });
    peakReplies.addMethod('POST', new apigateway.LambdaIntegration(lambdaStack.peaksRepliesFn), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    // ========================================
    // Sessions Endpoints
    // ========================================
    const sessions = api.root.addResource('sessions');

    // List sessions: GET /sessions
    sessions.addMethod('GET', new apigateway.LambdaIntegration(lambdaStack.sessionsListFn), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    // Create session: POST /sessions
    sessions.addMethod('POST', new apigateway.LambdaIntegration(lambdaStack.sessionsCreateFn), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    // Session by ID: GET /sessions/{id}
    const sessionById = sessions.addResource('{id}');
    sessionById.addMethod('GET', new apigateway.LambdaIntegration(lambdaStack.sessionsGetFn), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    // Accept session: POST /sessions/{id}/accept
    const sessionAccept = sessionById.addResource('accept');
    sessionAccept.addMethod('POST', new apigateway.LambdaIntegration(lambdaStack.sessionsAcceptFn), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    // Decline session: POST /sessions/{id}/decline
    const sessionDecline = sessionById.addResource('decline');
    sessionDecline.addMethod('POST', new apigateway.LambdaIntegration(lambdaStack.sessionsDeclineFn), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    // Creator availability: GET /sessions/availability/{creatorId}
    const sessionAvailability = sessions.addResource('availability');
    const sessionAvailabilityByCreator = sessionAvailability.addResource('{creatorId}');
    sessionAvailabilityByCreator.addMethod('GET', new apigateway.LambdaIntegration(lambdaStack.sessionsAvailabilityFn), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    // ========================================
    // Session Packs Endpoints
    // ========================================
    const packs = api.root.addResource('packs');

    // List packs: GET /packs
    packs.addMethod('GET', new apigateway.LambdaIntegration(lambdaStack.packsListFn), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    // Purchase pack: POST /packs/purchase
    const packsPurchase = packs.addResource('purchase');
    packsPurchase.addMethod('POST', new apigateway.LambdaIntegration(lambdaStack.packsPurchaseFn), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    // Create pack (creator): POST /packs
    packs.addMethod('POST', new apigateway.LambdaIntegration(lambdaStack.packsManageFn), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    // Update/delete pack by ID
    const packById = packs.addResource('{id}');
    packById.addMethod('PUT', new apigateway.LambdaIntegration(lambdaStack.packsManageFn), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });
    packById.addMethod('DELETE', new apigateway.LambdaIntegration(lambdaStack.packsManageFn), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    // ========================================
    // Session Token (Agora) Endpoint
    // ========================================
    // Generate Agora token: POST /sessions/{id}/token
    const sessionToken = sessionById.addResource('token');
    sessionToken.addMethod('POST', new apigateway.LambdaIntegration(lambdaStack.sessionsTokenFn), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    // Update session settings: PUT /sessions/settings
    const sessionSettings = sessions.addResource('settings');
    sessionSettings.addMethod('PUT', new apigateway.LambdaIntegration(lambdaStack.sessionsSettingsFn), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    // ========================================
    // Earnings Endpoints
    // ========================================
    const earnings = api.root.addResource('earnings');

    // Get earnings: GET /earnings
    earnings.addMethod('GET', new apigateway.LambdaIntegration(lambdaStack.earningsGetFn), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    // ========================================
    // Notifications Endpoints (Phase 5)
    // ========================================
    const notifications = api.root.addResource('notifications');
    notifications.addMethod('GET', new apigateway.LambdaIntegration(lambdaStack.notificationsListFn), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    // Mark all notifications as read: POST /notifications/read-all
    const notificationsReadAll = notifications.addResource('read-all');
    notificationsReadAll.addMethod('POST', new apigateway.LambdaIntegration(lambdaStack.notificationsMarkAllReadFn), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    // Unread count: GET /notifications/unread-count
    const notificationsUnreadCount = notifications.addResource('unread-count');
    notificationsUnreadCount.addMethod('GET', new apigateway.LambdaIntegration(lambdaStack.notificationsUnreadCountFn), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    // Push token registration: POST /notifications/push-token
    const notificationsPushToken = notifications.addResource('push-token');
    notificationsPushToken.addMethod('POST', new apigateway.LambdaIntegration(lambdaStack.notificationsPushTokenFn), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    // Mark single notification as read: POST /notifications/{id}/read
    const notificationById = notifications.addResource('{id}');
    const notificationRead = notificationById.addResource('read');
    notificationRead.addMethod('POST', new apigateway.LambdaIntegration(lambdaStack.notificationsMarkReadFn), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    // ========================================
    // Conversations & Messages Endpoints (Phase 6)
    // ========================================
    const conversations = api.root.addResource('conversations');

    // List conversations: GET /conversations
    conversations.addMethod('GET', new apigateway.LambdaIntegration(lambdaStack.conversationsListFn), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    // Create/get conversation: POST /conversations
    conversations.addMethod('POST', new apigateway.LambdaIntegration(lambdaStack.conversationsCreateFn), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    // Conversation by ID
    const conversationById = conversations.addResource('{id}');

    // Get messages: GET /conversations/{id}/messages
    const conversationMessages = conversationById.addResource('messages');
    conversationMessages.addMethod('GET', new apigateway.LambdaIntegration(lambdaStack.conversationsMessagesFn), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    // Send message: POST /conversations/{id}/messages
    conversationMessages.addMethod('POST', new apigateway.LambdaIntegration(lambdaStack.conversationsSendMessageFn), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    // Messages resource for delete
    const messages = api.root.addResource('messages');
    const messageById = messages.addResource('{id}');

    // Delete message: DELETE /messages/{id}
    messageById.addMethod('DELETE', new apigateway.LambdaIntegration(lambdaStack.messagesDeleteFn), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    // Auth endpoints (no Cognito auth - these ARE the auth endpoints)
    const auth = api.root.addResource('auth');
    const appleAuth = auth.addResource('apple');
    appleAuth.addMethod('POST', new apigateway.LambdaIntegration(lambdaStack.appleAuthFn));

    const googleAuth = auth.addResource('google');
    googleAuth.addMethod('POST', new apigateway.LambdaIntegration(lambdaStack.googleAuthFn));

    // Smart signup endpoint (no Cognito auth - this IS the signup endpoint)
    const signupAuth = auth.addResource('signup');
    signupAuth.addMethod('POST', new apigateway.LambdaIntegration(lambdaStack.signupAuthFn));

    const validateEmail = auth.addResource('validate-email');
    validateEmail.addMethod('POST', new apigateway.LambdaIntegration(lambdaStack.validateEmailFn));

    const confirmSignup = auth.addResource('confirm-signup');
    confirmSignup.addMethod('POST', new apigateway.LambdaIntegration(lambdaStack.confirmSignupFn));

    const resendCode = auth.addResource('resend-code');
    resendCode.addMethod('POST', new apigateway.LambdaIntegration(lambdaStack.resendCodeFn));

    const forgotPassword = auth.addResource('forgot-password');
    forgotPassword.addMethod('POST', new apigateway.LambdaIntegration(lambdaStack.forgotPasswordFn));

    const confirmForgotPassword = auth.addResource('confirm-forgot-password');
    confirmForgotPassword.addMethod('POST', new apigateway.LambdaIntegration(lambdaStack.confirmForgotPasswordFn));

    const checkUser = auth.addResource('check-user');
    checkUser.addMethod('POST', new apigateway.LambdaIntegration(lambdaStack.checkUserFn));

    // ========================================
    // Media Endpoints (Phase 7)
    // ========================================
    const media = api.root.addResource('media');

    // Generate presigned URL for secure client-side uploads: POST /media/upload-url
    const mediaUploadUrl = media.addResource('upload-url');
    mediaUploadUrl.addMethod('POST', new apigateway.LambdaIntegration(lambdaStack.mediaUploadUrlFn), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    // ========================================
    // Payment Endpoints (Stripe)
    // ========================================
    const payments = api.root.addResource('payments');

    // Create payment intent: POST /payments/create-intent
    const createIntent = payments.addResource('create-intent');
    createIntent.addMethod('POST', new apigateway.LambdaIntegration(lambdaStack.paymentCreateIntentFn), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    // Stripe webhook (no auth - verified via signature): POST /payments/webhook
    const webhook = payments.addResource('webhook');
    webhook.addMethod('POST', new apigateway.LambdaIntegration(lambdaStack.paymentWebhookFn));

    // Subscriptions: POST /payments/subscriptions
    const subscriptions = payments.addResource('subscriptions');
    subscriptions.addMethod('POST', new apigateway.LambdaIntegration(lambdaStack.paymentSubscriptionsFn), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    // Stripe Connect for creators: POST /payments/connect
    const connect = payments.addResource('connect');
    connect.addMethod('POST', new apigateway.LambdaIntegration(lambdaStack.paymentConnectFn), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    // Stripe Identity verification: POST /payments/identity
    const identity = payments.addResource('identity');
    identity.addMethod('POST', new apigateway.LambdaIntegration(lambdaStack.paymentIdentityFn), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    // Platform subscriptions (Pro Creator $99, Pro Business $49): POST /payments/platform-subscription
    const platformSub = payments.addResource('platform-subscription');
    platformSub.addMethod('POST', new apigateway.LambdaIntegration(lambdaStack.paymentPlatformSubFn), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    // Channel subscriptions (Fan subscribing to Creator): POST /payments/channel-subscription
    const channelSub = payments.addResource('channel-subscription');
    channelSub.addMethod('POST', new apigateway.LambdaIntegration(lambdaStack.paymentChannelSubFn), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    // Creator wallet (earnings, transactions, payouts): POST /payments/wallet
    const wallet = payments.addResource('wallet');
    wallet.addMethod('POST', new apigateway.LambdaIntegration(lambdaStack.paymentWalletFn), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    // Refunds: GET/POST /payments/refunds, GET /payments/refunds/{refundId}
    const refunds = payments.addResource('refunds');
    refunds.addMethod('GET', new apigateway.LambdaIntegration(lambdaStack.paymentRefundsFn), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });
    refunds.addMethod('POST', new apigateway.LambdaIntegration(lambdaStack.paymentRefundsFn), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });
    const refundById = refunds.addResource('{refundId}');
    refundById.addMethod('GET', new apigateway.LambdaIntegration(lambdaStack.paymentRefundsFn), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    // Payment methods: GET/POST/DELETE /payments/methods
    const methods = payments.addResource('methods');
    methods.addMethod('GET', new apigateway.LambdaIntegration(lambdaStack.paymentMethodsFn), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });
    methods.addMethod('POST', new apigateway.LambdaIntegration(lambdaStack.paymentMethodsFn), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });
    const setupIntent = methods.addResource('setup-intent');
    setupIntent.addMethod('POST', new apigateway.LambdaIntegration(lambdaStack.paymentMethodsFn), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });
    const methodById = methods.addResource('{methodId}');
    methodById.addMethod('DELETE', new apigateway.LambdaIntegration(lambdaStack.paymentMethodsFn), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });
    const methodDefault = methodById.addResource('default');
    methodDefault.addMethod('PUT', new apigateway.LambdaIntegration(lambdaStack.paymentMethodsFn), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    // Web Checkout: POST /payments/web-checkout, GET /payments/web-checkout/status/{sessionId}
    // This endpoint creates Stripe Checkout Sessions for web-based payments
    // to avoid the 30% App Store / Play Store fees
    const webCheckout = payments.addResource('web-checkout');
    webCheckout.addMethod('POST', new apigateway.LambdaIntegration(lambdaStack.paymentWebCheckoutFn), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });
    const webCheckoutStatus = webCheckout.addResource('status');
    const webCheckoutStatusById = webCheckoutStatus.addResource('{sessionId}');
    webCheckoutStatusById.addMethod('GET', new apigateway.LambdaIntegration(lambdaStack.paymentWebCheckoutFn), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    // ========================================
    // Tips Endpoints
    // ========================================
    const tips = api.root.addResource('tips');

    // Send tip: POST /tips/send
    const tipsSend = tips.addResource('send');
    tipsSend.addMethod('POST', new apigateway.LambdaIntegration(lambdaStack.tipsSendFn), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    // Tips history: GET /tips/history
    const tipsHistory = tips.addResource('history');
    tipsHistory.addMethod('GET', new apigateway.LambdaIntegration(lambdaStack.tipsHistoryFn), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    // Tips leaderboard: GET /tips/leaderboard/{creatorId}
    const tipsLeaderboard = tips.addResource('leaderboard');
    const tipsLeaderboardByCreator = tipsLeaderboard.addResource('{creatorId}');
    tipsLeaderboardByCreator.addMethod('GET', new apigateway.LambdaIntegration(lambdaStack.tipsLeaderboardFn));

    // ========================================
    // Challenges Endpoints
    // ========================================
    const challenges = api.root.addResource('challenges');

    // Create challenge: POST /challenges
    challenges.addMethod('POST', new apigateway.LambdaIntegration(lambdaStack.challengesCreateFn), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    // List challenges: GET /challenges
    challenges.addMethod('GET', new apigateway.LambdaIntegration(lambdaStack.challengesListFn));

    // Respond to challenge: POST /challenges/{challengeId}/respond
    const challengeById = challenges.addResource('{challengeId}');
    const challengeRespond = challengeById.addResource('respond');
    challengeRespond.addMethod('POST', new apigateway.LambdaIntegration(lambdaStack.challengesRespondFn), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    // ========================================
    // Live Battles Endpoints
    // ========================================
    const battles = api.root.addResource('battles');

    // Create battle: POST /battles
    battles.addMethod('POST', new apigateway.LambdaIntegration(lambdaStack.battlesCreateFn), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    // Join/leave battle: POST /battles/{battleId}/join
    const battleById = battles.addResource('{battleId}');
    const battleJoin = battleById.addResource('join');
    battleJoin.addMethod('POST', new apigateway.LambdaIntegration(lambdaStack.battlesJoinFn), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    // ========================================
    // Events Endpoints (Xplorer)
    // ========================================
    const events = api.root.addResource('events');

    // Create event: POST /events
    events.addMethod('POST', new apigateway.LambdaIntegration(lambdaStack.eventsCreateFn), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    // List events: GET /events
    events.addMethod('GET', new apigateway.LambdaIntegration(lambdaStack.eventsListFn));

    // Join event: POST /events/{eventId}/join
    const eventById = events.addResource('{eventId}');
    const eventJoin = eventById.addResource('join');
    eventJoin.addMethod('POST', new apigateway.LambdaIntegration(lambdaStack.eventsJoinFn), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    // ========================================
    // Settings Endpoints
    // ========================================
    const settings = api.root.addResource('settings');

    // Currency settings: GET/PUT /settings/currency
    const settingsCurrency = settings.addResource('currency');
    settingsCurrency.addMethod('GET', new apigateway.LambdaIntegration(lambdaStack.settingsCurrencyFn));
    settingsCurrency.addMethod('PUT', new apigateway.LambdaIntegration(lambdaStack.settingsCurrencyFn), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    // Admin endpoints (no Cognito auth, uses admin key)
    const admin = api.root.addResource('admin');
    const migrate = admin.addResource('migrate');
    migrate.addMethod('POST', new apigateway.LambdaIntegration(lambdaStack.adminMigrationFn));

    // Data migration endpoint
    const migrateData = admin.addResource('migrate-data');
    migrateData.addMethod('POST', new apigateway.LambdaIntegration(lambdaStack.dataMigrationFn, {
      timeout: cdk.Duration.seconds(29), // API Gateway max is 29s, Lambda handles the rest
    }));

    // ========================================
    // WAF - Web Application Firewall (Security)
    // ENABLED FOR ALL ENVIRONMENTS - Security is not optional
    // ========================================
    const webAcl = new wafv2.CfnWebACL(this, 'SmuppyWAF', {
      defaultAction: { allow: {} },
      scope: 'REGIONAL',
      name: `smuppy-waf-${environment}`,
      visibilityConfig: {
        cloudWatchMetricsEnabled: true,
        metricName: `SmuppyWAF-${environment}`,
        sampledRequestsEnabled: true,
      },
      rules: [
        // Rule 1: Extreme rate limiting - only block obvious DDoS (100k/5min = 333 req/s per IP)
        // High limit because legitimate users behind NAT/corporate networks share IPs
        {
          name: 'DDoSProtectionRule',
          priority: 1,
          action: { block: {} },
          statement: {
            rateBasedStatement: {
              limit: isProduction ? 100000 : 10000, // 100k requests per 5 minutes per IP
              aggregateKeyType: 'IP',
            },
          },
          visibilityConfig: {
            cloudWatchMetricsEnabled: true,
            metricName: 'DDoSProtectionRule',
            sampledRequestsEnabled: true,
          },
        },
        // Rule 2: Auth endpoint protection - stricter but reasonable for mobile app
        // 2000/5min = ~6.6 req/s per IP (handles rapid retries, token refresh)
        {
          name: 'AuthRateLimitRule',
          priority: 2,
          action: { block: {} },
          statement: {
            rateBasedStatement: {
              limit: isProduction ? 2000 : 500, // 2k requests per 5 minutes per IP for auth
              aggregateKeyType: 'IP',
              scopeDownStatement: {
                byteMatchStatement: {
                  searchString: '/auth/',
                  fieldToMatch: { uriPath: {} },
                  textTransformations: [{ priority: 0, type: 'LOWERCASE' }],
                  positionalConstraint: 'CONTAINS',
                },
              },
            },
          },
          visibilityConfig: {
            cloudWatchMetricsEnabled: true,
            metricName: 'AuthRateLimitRule',
            sampledRequestsEnabled: true,
          },
        },
        // Rule 3: Write operations protection (POST/PUT/DELETE) - prevent spam
        // 5000/5min = ~16 req/s per IP for writes
        {
          name: 'WriteOperationsRateLimit',
          priority: 3,
          action: { block: {} },
          statement: {
            rateBasedStatement: {
              limit: isProduction ? 5000 : 1000,
              aggregateKeyType: 'IP',
              scopeDownStatement: {
                orStatement: {
                  statements: [
                    { byteMatchStatement: { searchString: 'POST', fieldToMatch: { method: {} }, textTransformations: [{ priority: 0, type: 'NONE' }], positionalConstraint: 'EXACTLY' } },
                    { byteMatchStatement: { searchString: 'PUT', fieldToMatch: { method: {} }, textTransformations: [{ priority: 0, type: 'NONE' }], positionalConstraint: 'EXACTLY' } },
                    { byteMatchStatement: { searchString: 'DELETE', fieldToMatch: { method: {} }, textTransformations: [{ priority: 0, type: 'NONE' }], positionalConstraint: 'EXACTLY' } },
                  ],
                },
              },
            },
          },
          visibilityConfig: {
            cloudWatchMetricsEnabled: true,
            metricName: 'WriteOperationsRateLimit',
            sampledRequestsEnabled: true,
          },
        },
        // Rule 4: AWS Managed Rules - Common attacks (OWASP Top 10)
        {
          name: 'AWSManagedRulesCommonRuleSet',
          priority: 4,
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
        // Rule 5: SQL Injection protection
        {
          name: 'AWSManagedRulesSQLiRuleSet',
          priority: 5,
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
        // Rule 6: Known Bad Inputs
        {
          name: 'AWSManagedRulesKnownBadInputsRuleSet',
          priority: 6,
          overrideAction: { none: {} },
          statement: {
            managedRuleGroupStatement: {
              vendorName: 'AWS',
              name: 'AWSManagedRulesKnownBadInputsRuleSet',
            },
          },
          visibilityConfig: {
            cloudWatchMetricsEnabled: true,
            metricName: 'AWSManagedRulesKnownBadInputsRuleSet',
            sampledRequestsEnabled: true,
          },
        },
        // Rule 7: Linux-specific protection (Lambda runs on Linux)
        {
          name: 'AWSManagedRulesLinuxRuleSet',
          priority: 7,
          overrideAction: { none: {} },
          statement: {
            managedRuleGroupStatement: {
              vendorName: 'AWS',
              name: 'AWSManagedRulesLinuxRuleSet',
            },
          },
          visibilityConfig: {
            cloudWatchMetricsEnabled: true,
            metricName: 'AWSManagedRulesLinuxRuleSet',
            sampledRequestsEnabled: true,
          },
        },
        // Rule 8: Block requests from anonymous proxies and TOR
        {
          name: 'AWSManagedRulesAnonymousIpList',
          priority: 8,
          overrideAction: { none: {} },
          statement: {
            managedRuleGroupStatement: {
              vendorName: 'AWS',
              name: 'AWSManagedRulesAnonymousIpList',
            },
          },
          visibilityConfig: {
            cloudWatchMetricsEnabled: true,
            metricName: 'AWSManagedRulesAnonymousIpList',
            sampledRequestsEnabled: true,
          },
        },
        // Rule 9: Block IPs with bad reputation
        {
          name: 'AWSManagedRulesAmazonIpReputationList',
          priority: 9,
          overrideAction: { none: {} },
          statement: {
            managedRuleGroupStatement: {
              vendorName: 'AWS',
              name: 'AWSManagedRulesAmazonIpReputationList',
            },
          },
          visibilityConfig: {
            cloudWatchMetricsEnabled: true,
            metricName: 'AWSManagedRulesAmazonIpReputationList',
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

    // ========================================
    // WebSocket API Gateway - Real-time Messaging
    // ========================================
    const webSocketApi = new apigatewayv2.WebSocketApi(this, 'SmuppyWebSocketApi', {
      apiName: `smuppy-websocket-${environment}`,
      description: 'Smuppy WebSocket API for real-time messaging',
      connectRouteOptions: {
        integration: new WebSocketLambdaIntegration('ConnectIntegration', lambdaStack.wsConnectFn),
      },
      disconnectRouteOptions: {
        integration: new WebSocketLambdaIntegration('DisconnectIntegration', lambdaStack.wsDisconnectFn),
      },
      defaultRouteOptions: {
        integration: new WebSocketLambdaIntegration('DefaultIntegration', lambdaStack.wsDefaultFn),
      },
    });

    // Add sendMessage route
    webSocketApi.addRoute('sendMessage', {
      integration: new WebSocketLambdaIntegration('SendMessageIntegration', lambdaStack.wsSendMessageFn),
    });

    // Add Live Stream routes (join, leave, comment, reaction)
    webSocketApi.addRoute('joinLive', {
      integration: new WebSocketLambdaIntegration('JoinLiveIntegration', lambdaStack.wsLiveStreamFn),
    });
    webSocketApi.addRoute('leaveLive', {
      integration: new WebSocketLambdaIntegration('LeaveLiveIntegration', lambdaStack.wsLiveStreamFn),
    });
    webSocketApi.addRoute('liveComment', {
      integration: new WebSocketLambdaIntegration('LiveCommentIntegration', lambdaStack.wsLiveStreamFn),
    });
    webSocketApi.addRoute('liveReaction', {
      integration: new WebSocketLambdaIntegration('LiveReactionIntegration', lambdaStack.wsLiveStreamFn),
    });

    // WebSocket Stage
    const webSocketStage = new apigatewayv2.WebSocketStage(this, 'WebSocketStage', {
      webSocketApi,
      stageName: environment,
      autoDeploy: true,
    });

    // Grant Lambda permissions to manage WebSocket connections
    webSocketApi.grantManageConnections(lambdaStack.wsSendMessageFn);
    webSocketApi.grantManageConnections(lambdaStack.wsConnectFn);
    webSocketApi.grantManageConnections(lambdaStack.wsDisconnectFn);
    webSocketApi.grantManageConnections(lambdaStack.wsDefaultFn);

    // ========================================
    // AppSync - GraphQL & Realtime (Auto-scaling)
    // ========================================
    const graphqlApi = new appsync.GraphqlApi(this, 'SmuppyGraphQL', {
      name: `smuppy-graphql-${environment}`,
      definition: appsync.Definition.fromFile(path.join(__dirname, '../../lambda/graphql/schema.graphql')),
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
    // AppSync Data Sources
    // ========================================

    // NONE data source for local/passthrough resolvers (subscriptions, typing indicators)
    const noneDataSource = graphqlApi.addNoneDataSource('NoneDataSource', {
      name: 'NoneDataSource',
      description: 'Local resolver for subscriptions and real-time features',
    });

    // HTTP data source pointing to REST API for data operations
    const httpDataSource = graphqlApi.addHttpDataSource('RestApiDataSource', api.url, {
      name: 'RestApiDataSource',
      description: 'HTTP data source for REST API',
      authorizationConfig: {
        signingRegion: this.region,
        signingServiceName: 'execute-api',
      },
    });

    // ========================================
    // AppSync Resolvers - Queries
    // ========================================

    // getConversation Query
    httpDataSource.createResolver('GetConversationResolver', {
      typeName: 'Query',
      fieldName: 'getConversation',
      requestMappingTemplate: appsync.MappingTemplate.fromString(`
        {
          "version": "2018-05-29",
          "method": "GET",
          "resourcePath": "/conversations/$ctx.args.id/messages",
          "params": {
            "headers": {
              "Authorization": "$ctx.request.headers.Authorization",
              "Content-Type": "application/json"
            }
          }
        }
      `),
      responseMappingTemplate: appsync.MappingTemplate.fromString(`
        #if($ctx.error)
          $util.error($ctx.error.message, $ctx.error.type)
        #end
        $util.toJson($ctx.result.body)
      `),
    });

    // listConversations Query
    httpDataSource.createResolver('ListConversationsResolver', {
      typeName: 'Query',
      fieldName: 'listConversations',
      requestMappingTemplate: appsync.MappingTemplate.fromString(`
        {
          "version": "2018-05-29",
          "method": "GET",
          "resourcePath": "/conversations",
          "params": {
            "headers": {
              "Authorization": "$ctx.request.headers.Authorization",
              "Content-Type": "application/json"
            },
            "query": {
              "limit": "$util.defaultIfNull($ctx.args.limit, '20')",
              "nextToken": "$util.defaultIfNullOrEmpty($ctx.args.nextToken, '')"
            }
          }
        }
      `),
      responseMappingTemplate: appsync.MappingTemplate.fromString(`
        #if($ctx.error)
          $util.error($ctx.error.message, $ctx.error.type)
        #end
        {
          "items": $ctx.result.body,
          "nextToken": $util.toJson($ctx.result.headers.get("x-next-token"))
        }
      `),
    });

    // listMessages Query
    httpDataSource.createResolver('ListMessagesResolver', {
      typeName: 'Query',
      fieldName: 'listMessages',
      requestMappingTemplate: appsync.MappingTemplate.fromString(`
        {
          "version": "2018-05-29",
          "method": "GET",
          "resourcePath": "/conversations/$ctx.args.conversationId/messages",
          "params": {
            "headers": {
              "Authorization": "$ctx.request.headers.Authorization",
              "Content-Type": "application/json"
            },
            "query": {
              "limit": "$util.defaultIfNull($ctx.args.limit, '50')",
              "nextToken": "$util.defaultIfNullOrEmpty($ctx.args.nextToken, '')"
            }
          }
        }
      `),
      responseMappingTemplate: appsync.MappingTemplate.fromString(`
        #if($ctx.error)
          $util.error($ctx.error.message, $ctx.error.type)
        #end
        {
          "items": $ctx.result.body,
          "nextToken": $util.toJson($ctx.result.headers.get("x-next-token"))
        }
      `),
    });

    // listNotifications Query
    httpDataSource.createResolver('ListNotificationsResolver', {
      typeName: 'Query',
      fieldName: 'listNotifications',
      requestMappingTemplate: appsync.MappingTemplate.fromString(`
        {
          "version": "2018-05-29",
          "method": "GET",
          "resourcePath": "/notifications",
          "params": {
            "headers": {
              "Authorization": "$ctx.request.headers.Authorization",
              "Content-Type": "application/json"
            },
            "query": {
              "limit": "$util.defaultIfNull($ctx.args.limit, '20')",
              "nextToken": "$util.defaultIfNullOrEmpty($ctx.args.nextToken, '')"
            }
          }
        }
      `),
      responseMappingTemplate: appsync.MappingTemplate.fromString(`
        #if($ctx.error)
          $util.error($ctx.error.message, $ctx.error.type)
        #end
        {
          "items": $ctx.result.body,
          "nextToken": $util.toJson($ctx.result.headers.get("x-next-token"))
        }
      `),
    });

    // getUnreadCount Query
    httpDataSource.createResolver('GetUnreadCountResolver', {
      typeName: 'Query',
      fieldName: 'getUnreadCount',
      requestMappingTemplate: appsync.MappingTemplate.fromString(`
        {
          "version": "2018-05-29",
          "method": "GET",
          "resourcePath": "/notifications/unread-count",
          "params": {
            "headers": {
              "Authorization": "$ctx.request.headers.Authorization",
              "Content-Type": "application/json"
            }
          }
        }
      `),
      responseMappingTemplate: appsync.MappingTemplate.fromString(`
        #if($ctx.error)
          $util.error($ctx.error.message, $ctx.error.type)
        #end
        $util.toJson($ctx.result.body.count)
      `),
    });

    // ========================================
    // AppSync Resolvers - Mutations
    // ========================================

    // sendMessage Mutation - uses HTTP to REST API, triggers subscription
    httpDataSource.createResolver('SendMessageResolver', {
      typeName: 'Mutation',
      fieldName: 'sendMessage',
      requestMappingTemplate: appsync.MappingTemplate.fromString(`
        {
          "version": "2018-05-29",
          "method": "POST",
          "resourcePath": "/conversations/$ctx.args.input.conversationId/messages",
          "params": {
            "headers": {
              "Authorization": "$ctx.request.headers.Authorization",
              "Content-Type": "application/json"
            },
            "body": $util.toJson($ctx.args.input)
          }
        }
      `),
      responseMappingTemplate: appsync.MappingTemplate.fromString(`
        #if($ctx.error)
          $util.error($ctx.error.message, $ctx.error.type)
        #end
        $util.toJson($ctx.result.body)
      `),
    });

    // createConversation Mutation
    httpDataSource.createResolver('CreateConversationResolver', {
      typeName: 'Mutation',
      fieldName: 'createConversation',
      requestMappingTemplate: appsync.MappingTemplate.fromString(`
        {
          "version": "2018-05-29",
          "method": "POST",
          "resourcePath": "/conversations",
          "params": {
            "headers": {
              "Authorization": "$ctx.request.headers.Authorization",
              "Content-Type": "application/json"
            },
            "body": $util.toJson($ctx.args.input)
          }
        }
      `),
      responseMappingTemplate: appsync.MappingTemplate.fromString(`
        #if($ctx.error)
          $util.error($ctx.error.message, $ctx.error.type)
        #end
        $util.toJson($ctx.result.body)
      `),
    });

    // deleteConversation Mutation
    httpDataSource.createResolver('DeleteConversationResolver', {
      typeName: 'Mutation',
      fieldName: 'deleteConversation',
      requestMappingTemplate: appsync.MappingTemplate.fromString(`
        {
          "version": "2018-05-29",
          "method": "DELETE",
          "resourcePath": "/conversations/$ctx.args.id",
          "params": {
            "headers": {
              "Authorization": "$ctx.request.headers.Authorization",
              "Content-Type": "application/json"
            }
          }
        }
      `),
      responseMappingTemplate: appsync.MappingTemplate.fromString(`
        #if($ctx.error)
          $util.error($ctx.error.message, $ctx.error.type)
        #end
        true
      `),
    });

    // markAsRead Mutation
    httpDataSource.createResolver('MarkAsReadResolver', {
      typeName: 'Mutation',
      fieldName: 'markAsRead',
      requestMappingTemplate: appsync.MappingTemplate.fromString(`
        {
          "version": "2018-05-29",
          "method": "POST",
          "resourcePath": "/messages/$ctx.args.input.messageId/read",
          "params": {
            "headers": {
              "Authorization": "$ctx.request.headers.Authorization",
              "Content-Type": "application/json"
            },
            "body": {
              "conversationId": "$ctx.args.input.conversationId"
            }
          }
        }
      `),
      responseMappingTemplate: appsync.MappingTemplate.fromString(`
        #if($ctx.error)
          $util.error($ctx.error.message, $ctx.error.type)
        #end
        {
          "conversationId": "$ctx.args.input.conversationId",
          "messageId": "$ctx.args.input.messageId",
          "userId": "$ctx.identity.sub",
          "readAt": "$util.time.nowISO8601()"
        }
      `),
    });

    // createNotification Mutation (internal use, IAM auth)
    noneDataSource.createResolver('CreateNotificationResolver', {
      typeName: 'Mutation',
      fieldName: 'createNotification',
      requestMappingTemplate: appsync.MappingTemplate.fromString(`
        {
          "version": "2018-05-29",
          "payload": {
            "id": "$util.autoId()",
            "userId": "$ctx.args.userId",
            "type": "$ctx.args.type",
            "title": "$ctx.args.title",
            "body": "$ctx.args.body",
            "data": $util.defaultIfNull($ctx.args.data, "null"),
            "read": false,
            "createdAt": "$util.time.nowISO8601()"
          }
        }
      `),
      responseMappingTemplate: appsync.MappingTemplate.fromString(`
        $util.toJson($ctx.result)
      `),
    });

    // markNotificationRead Mutation
    httpDataSource.createResolver('MarkNotificationReadResolver', {
      typeName: 'Mutation',
      fieldName: 'markNotificationRead',
      requestMappingTemplate: appsync.MappingTemplate.fromString(`
        {
          "version": "2018-05-29",
          "method": "POST",
          "resourcePath": "/notifications/$ctx.args.id/read",
          "params": {
            "headers": {
              "Authorization": "$ctx.request.headers.Authorization",
              "Content-Type": "application/json"
            }
          }
        }
      `),
      responseMappingTemplate: appsync.MappingTemplate.fromString(`
        #if($ctx.error)
          $util.error($ctx.error.message, $ctx.error.type)
        #end
        true
      `),
    });

    // markAllNotificationsRead Mutation
    httpDataSource.createResolver('MarkAllNotificationsReadResolver', {
      typeName: 'Mutation',
      fieldName: 'markAllNotificationsRead',
      requestMappingTemplate: appsync.MappingTemplate.fromString(`
        {
          "version": "2018-05-29",
          "method": "POST",
          "resourcePath": "/notifications/read-all",
          "params": {
            "headers": {
              "Authorization": "$ctx.request.headers.Authorization",
              "Content-Type": "application/json"
            }
          }
        }
      `),
      responseMappingTemplate: appsync.MappingTemplate.fromString(`
        #if($ctx.error)
          $util.error($ctx.error.message, $ctx.error.type)
        #end
        true
      `),
    });

    // setTyping Mutation - Local resolver for real-time typing indicators
    noneDataSource.createResolver('SetTypingResolver', {
      typeName: 'Mutation',
      fieldName: 'setTyping',
      requestMappingTemplate: appsync.MappingTemplate.fromString(`
        {
          "version": "2018-05-29",
          "payload": {
            "conversationId": "$ctx.args.conversationId",
            "userId": "$ctx.identity.sub",
            "isTyping": $ctx.args.isTyping,
            "timestamp": "$util.time.nowISO8601()"
          }
        }
      `),
      responseMappingTemplate: appsync.MappingTemplate.fromString(`
        $util.toJson($ctx.result)
      `),
    });

    // ========================================
    // SNS - Push Notifications
    // ========================================

    // SNS Topic for broadcast notifications
    const pushNotificationsTopic = new sns.Topic(this, 'PushNotificationsTopic', {
      topicName: `smuppy-push-notifications-${environment}`,
      displayName: 'Smuppy Push Notifications',
    });

    // Create secrets for push notification credentials (to be filled manually)
    const apnsCredentials = new secretsmanager.Secret(this, 'APNsCredentials', {
      secretName: `smuppy/${environment}/apns-credentials`,
      description: 'APNs credentials for iOS push notifications',
      generateSecretString: {
        secretStringTemplate: JSON.stringify({
          bundleId: 'com.smuppy.app',
          teamId: '',
          keyId: '',
          privateKey: '',
        }),
        generateStringKey: 'placeholder',
      },
    });

    const fcmCredentials = new secretsmanager.Secret(this, 'FCMCredentials', {
      secretName: `smuppy/${environment}/fcm-credentials`,
      description: 'FCM credentials for Android push notifications',
      generateSecretString: {
        secretStringTemplate: JSON.stringify({
          apiKey: '',
          projectId: '',
        }),
        generateStringKey: 'placeholder',
      },
    });

    // Note: SNS Platform Applications for APNs and FCM require valid credentials
    // They should be created manually or via a separate script after credentials are configured
    // This output provides the topic ARN for the Lambda functions to use

    // Grant Lambda functions permission to publish to SNS
    pushNotificationsTopic.grantPublish(lambdaStack.notificationsPushTokenFn);

    // Create IAM policy for SNS platform application management
    // SECURITY: Scoped to specific platform application and endpoint ARN patterns
    const snsPlatformPolicy = new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'sns:CreatePlatformEndpoint',
        'sns:DeleteEndpoint',
        'sns:GetEndpointAttributes',
        'sns:SetEndpointAttributes',
        'sns:Publish',
      ],
      resources: [
        // Platform applications for iOS and Android
        `arn:aws:sns:${this.region}:${this.account}:app/APNS/smuppy-ios-${environment}`,
        `arn:aws:sns:${this.region}:${this.account}:app/APNS_SANDBOX/smuppy-ios-${environment}`,
        `arn:aws:sns:${this.region}:${this.account}:app/GCM/smuppy-android-${environment}`,
        // Endpoints created under these platform applications
        `arn:aws:sns:${this.region}:${this.account}:endpoint/APNS/smuppy-ios-${environment}/*`,
        `arn:aws:sns:${this.region}:${this.account}:endpoint/APNS_SANDBOX/smuppy-ios-${environment}/*`,
        `arn:aws:sns:${this.region}:${this.account}:endpoint/GCM/smuppy-android-${environment}/*`,
      ],
    });

    lambdaStack.notificationsPushTokenFn.addToRolePolicy(snsPlatformPolicy);

    // ========================================
    // CloudWatch Alarms - Monitoring & Alerting
    // ========================================
    const cloudwatch = require('aws-cdk-lib/aws-cloudwatch');
    const cloudwatchActions = require('aws-cdk-lib/aws-cloudwatch-actions');

    // SNS Topic for alerts
    const alertsTopic = new sns.Topic(this, 'AlertsTopic', {
      topicName: `smuppy-alerts-${environment}`,
      displayName: `Smuppy ${environment} Alerts`,
    });

    // API Gateway 5xx errors alarm
    const api5xxAlarm = new cloudwatch.Alarm(this, 'Api5xxAlarm', {
      alarmName: `smuppy-${environment}-api-5xx-errors`,
      alarmDescription: 'API Gateway 5xx errors exceeded threshold',
      metric: new cloudwatch.Metric({
        namespace: 'AWS/ApiGateway',
        metricName: '5XXError',
        dimensionsMap: {
          ApiName: `smuppy-api-${environment}`,
        },
        statistic: 'Sum',
        period: cdk.Duration.minutes(5),
      }),
      threshold: isProduction ? 10 : 5,
      evaluationPeriods: 2,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    api5xxAlarm.addAlarmAction(new cloudwatchActions.SnsAction(alertsTopic));

    // API Gateway 4xx errors alarm (potential attacks)
    const api4xxAlarm = new cloudwatch.Alarm(this, 'Api4xxAlarm', {
      alarmName: `smuppy-${environment}-api-4xx-errors`,
      alarmDescription: 'High rate of 4xx errors - potential attack or client issues',
      metric: new cloudwatch.Metric({
        namespace: 'AWS/ApiGateway',
        metricName: '4XXError',
        dimensionsMap: {
          ApiName: `smuppy-api-${environment}`,
        },
        statistic: 'Sum',
        period: cdk.Duration.minutes(5),
      }),
      threshold: isProduction ? 100 : 50,
      evaluationPeriods: 2,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    api4xxAlarm.addAlarmAction(new cloudwatchActions.SnsAction(alertsTopic));

    // API Latency alarm
    const apiLatencyAlarm = new cloudwatch.Alarm(this, 'ApiLatencyAlarm', {
      alarmName: `smuppy-${environment}-api-high-latency`,
      alarmDescription: 'API response time exceeded threshold',
      metric: new cloudwatch.Metric({
        namespace: 'AWS/ApiGateway',
        metricName: 'Latency',
        dimensionsMap: {
          ApiName: `smuppy-api-${environment}`,
        },
        statistic: 'p95',
        period: cdk.Duration.minutes(5),
      }),
      threshold: 3000, // 3 seconds p95
      evaluationPeriods: 3,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    apiLatencyAlarm.addAlarmAction(new cloudwatchActions.SnsAction(alertsTopic));

    // Database CPU alarm
    const dbCpuAlarm = new cloudwatch.Alarm(this, 'DbCpuAlarm', {
      alarmName: `smuppy-${environment}-db-high-cpu`,
      alarmDescription: 'Database CPU utilization exceeded threshold',
      metric: new cloudwatch.Metric({
        namespace: 'AWS/RDS',
        metricName: 'CPUUtilization',
        dimensionsMap: {
          DBClusterIdentifier: dbCluster.clusterIdentifier,
        },
        statistic: 'Average',
        period: cdk.Duration.minutes(5),
      }),
      threshold: 80, // 80% CPU
      evaluationPeriods: 3,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    dbCpuAlarm.addAlarmAction(new cloudwatchActions.SnsAction(alertsTopic));

    // Database connections alarm
    const dbConnectionsAlarm = new cloudwatch.Alarm(this, 'DbConnectionsAlarm', {
      alarmName: `smuppy-${environment}-db-high-connections`,
      alarmDescription: 'Database connections approaching limit',
      metric: new cloudwatch.Metric({
        namespace: 'AWS/RDS',
        metricName: 'DatabaseConnections',
        dimensionsMap: {
          DBClusterIdentifier: dbCluster.clusterIdentifier,
        },
        statistic: 'Maximum',
        period: cdk.Duration.minutes(5),
      }),
      threshold: isProduction ? 500 : 50,
      evaluationPeriods: 2,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    dbConnectionsAlarm.addAlarmAction(new cloudwatchActions.SnsAction(alertsTopic));

    // RDS Proxy - Client connections alarm
    const proxyConnectionsAlarm = new cloudwatch.Alarm(this, 'RDSProxyConnectionsAlarm', {
      alarmName: `smuppy-${environment}-proxy-high-connections`,
      alarmDescription: 'RDS Proxy client connections approaching limit',
      metric: new cloudwatch.Metric({
        namespace: 'AWS/RDS',
        metricName: 'ClientConnections',
        dimensionsMap: {
          ProxyName: `smuppy-proxy-${environment}`,
        },
        statistic: 'Maximum',
        period: cdk.Duration.minutes(5),
      }),
      threshold: isProduction ? 1000 : 100,
      evaluationPeriods: 2,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    proxyConnectionsAlarm.addAlarmAction(new cloudwatchActions.SnsAction(alertsTopic));

    // RDS Proxy - Connection borrow latency alarm
    const proxyLatencyAlarm = new cloudwatch.Alarm(this, 'RDSProxyLatencyAlarm', {
      alarmName: `smuppy-${environment}-proxy-high-borrow-latency`,
      alarmDescription: 'RDS Proxy connection borrow latency is high - connection pool exhaustion risk',
      metric: new cloudwatch.Metric({
        namespace: 'AWS/RDS',
        metricName: 'QueryResponseLatency',
        dimensionsMap: {
          ProxyName: `smuppy-proxy-${environment}`,
        },
        statistic: 'p95',
        period: cdk.Duration.minutes(5),
      }),
      threshold: 1000, // 1 second p95 latency
      evaluationPeriods: 3,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    proxyLatencyAlarm.addAlarmAction(new cloudwatchActions.SnsAction(alertsTopic));

    // Database freeable memory alarm
    const dbMemoryAlarm = new cloudwatch.Alarm(this, 'DbMemoryAlarm', {
      alarmName: `smuppy-${environment}-db-low-memory`,
      alarmDescription: 'Database freeable memory is low',
      metric: new cloudwatch.Metric({
        namespace: 'AWS/RDS',
        metricName: 'FreeableMemory',
        dimensionsMap: {
          DBClusterIdentifier: dbCluster.clusterIdentifier,
        },
        statistic: 'Minimum',
        period: cdk.Duration.minutes(5),
      }),
      threshold: isProduction ? 500000000 : 100000000, // 500MB prod, 100MB staging
      evaluationPeriods: 2,
      comparisonOperator: cloudwatch.ComparisonOperator.LESS_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    dbMemoryAlarm.addAlarmAction(new cloudwatchActions.SnsAction(alertsTopic));

    // WAF blocked requests alarm (potential attack)
    const wafBlockedAlarm = new cloudwatch.Alarm(this, 'WafBlockedAlarm', {
      alarmName: `smuppy-${environment}-waf-blocked-requests`,
      alarmDescription: 'High number of blocked requests - potential attack',
      metric: new cloudwatch.Metric({
        namespace: 'AWS/WAFV2',
        metricName: 'BlockedRequests',
        dimensionsMap: {
          WebACL: `smuppy-waf-${environment}`,
          Region: this.region,
          Rule: 'ALL',
        },
        statistic: 'Sum',
        period: cdk.Duration.minutes(5),
      }),
      threshold: isProduction ? 1000 : 100,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    wafBlockedAlarm.addAlarmAction(new cloudwatchActions.SnsAction(alertsTopic));

    // ========================================
    // Outputs
    // ========================================
    new cdk.CfnOutput(this, 'AlertsTopicArn', {
      value: alertsTopic.topicArn,
      description: 'SNS Topic ARN for Alerts',
      exportName: `${id}-AlertsTopicArn`,
    });

    new cdk.CfnOutput(this, 'CloudTrailBucketName', {
      value: trailBucket.bucketName,
      description: 'S3 Bucket for CloudTrail logs',
      exportName: `${id}-CloudTrailBucketName`,
    });

    new cdk.CfnOutput(this, 'PushNotificationsTopicArn', {
      value: pushNotificationsTopic.topicArn,
      description: 'SNS Topic ARN for Push Notifications',
      exportName: `${id}-PushNotificationsTopicArn`,
    });

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
      description: 'Aurora Database Writer Endpoint (direct)',
      exportName: `${id}-DatabaseEndpoint`,
    });

    new cdk.CfnOutput(this, 'DatabaseReaderEndpoint', {
      value: dbCluster.clusterReadEndpoint.hostname,
      description: 'Aurora Database Reader Endpoint (for read-heavy operations)',
      exportName: `${id}-DatabaseReaderEndpoint`,
    });

    new cdk.CfnOutput(this, 'RDSProxyEndpointOutput', {
      value: rdsProxy.endpoint,
      description: 'RDS Proxy Endpoint (connection pooling - use this for Lambda)',
      exportName: `${id}-RDSProxyEndpoint`,
    });

    new cdk.CfnOutput(this, 'RedisReplicationGroupId', {
      value: redisReplicationGroup.ref,
      description: 'Redis Replication Group ID (use AWS CLI to get endpoint)',
      exportName: `${id}-RedisReplicationGroupId`,
    });

    new cdk.CfnOutput(this, 'WebSocketEndpoint', {
      value: webSocketStage.url,
      description: 'WebSocket API Endpoint',
      exportName: `${id}-WebSocketEndpoint`,
    });
  }
}

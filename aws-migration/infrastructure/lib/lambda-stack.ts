import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { Construct } from 'constructs';
import * as path from 'path';

export interface LambdaStackProps extends cdk.NestedStackProps {
  vpc: ec2.IVpc;
  lambdaSecurityGroup: ec2.ISecurityGroup;
  dbCredentials: secretsmanager.ISecret;
  adminApiKeySecret: secretsmanager.ISecret;
  mediaBucket: s3.IBucket;
  userPool: cognito.IUserPool;
  userPoolClientId: string;
  lambdaEnvironment: { [key: string]: string };
  environment: string;
  isProduction: boolean;
  apiLogGroup: logs.ILogGroup;
  adminLogGroup: logs.ILogGroup;
  authLogGroup: logs.ILogGroup;
  rdsProxyArn?: string; // Optional: ARN for RDS Proxy IAM auth
}

/**
 * Nested Stack for Lambda Functions
 * This separates Lambda resources to stay under CloudFormation's 500 resource limit
 */
export class LambdaStack extends cdk.NestedStack {
  // API Lambda Functions
  public readonly postsListFn: NodejsFunction;
  public readonly postsGetFn: NodejsFunction;
  public readonly postsCreateFn: NodejsFunction;
  public readonly profilesGetFn: NodejsFunction;
  public readonly profilesSearchFn: NodejsFunction;
  public readonly feedGetFn: NodejsFunction;
  public readonly followsCreateFn: NodejsFunction;
  public readonly followsDeleteFn: NodejsFunction;
  public readonly profilesUpdateFn: NodejsFunction;
  public readonly profilesSuggestedFn: NodejsFunction;
  public readonly profilesIsFollowingFn: NodejsFunction;

  // Phase 2: Posts & Comments
  public readonly postsLikeFn: NodejsFunction;
  public readonly postsUnlikeFn: NodejsFunction;
  public readonly postsDeleteFn: NodejsFunction;
  public readonly postsSaveFn: NodejsFunction;
  public readonly postsUnsaveFn: NodejsFunction;
  public readonly commentsListFn: NodejsFunction;
  public readonly commentsCreateFn: NodejsFunction;
  public readonly commentsDeleteFn: NodejsFunction;
  public readonly commentsUpdateFn: NodejsFunction;
  public readonly postsIsSavedFn: NodejsFunction;

  // Phase 3: Profiles & Follow Requests
  public readonly profilesFollowersFn: NodejsFunction;
  public readonly profilesFollowingFn: NodejsFunction;
  public readonly followRequestsListFn: NodejsFunction;
  public readonly followRequestsAcceptFn: NodejsFunction;
  public readonly followRequestsDeclineFn: NodejsFunction;

  // Phase 4: Peaks
  public readonly peaksListFn: NodejsFunction;
  public readonly peaksGetFn: NodejsFunction;
  public readonly peaksCreateFn: NodejsFunction;
  public readonly peaksDeleteFn: NodejsFunction;
  public readonly peaksLikeFn: NodejsFunction;
  public readonly peaksUnlikeFn: NodejsFunction;
  public readonly peaksCommentFn: NodejsFunction;

  // Phase 5: Notifications
  public readonly notificationsListFn: NodejsFunction;
  public readonly notificationsMarkReadFn: NodejsFunction;
  public readonly notificationsMarkAllReadFn: NodejsFunction;
  public readonly notificationsUnreadCountFn: NodejsFunction;
  public readonly notificationsPushTokenFn: NodejsFunction;

  // Phase 6: Messages & Conversations
  public readonly conversationsListFn: NodejsFunction;
  public readonly conversationsCreateFn: NodejsFunction;
  public readonly conversationsMessagesFn: NodejsFunction;
  public readonly conversationsSendMessageFn: NodejsFunction;
  public readonly messagesDeleteFn: NodejsFunction;

  // Media Functions
  public readonly mediaUploadUrlFn: NodejsFunction;

  // Admin Functions
  public readonly adminMigrationFn: NodejsFunction;
  public readonly dataMigrationFn: NodejsFunction;
  public readonly checkProfilesFn: NodejsFunction;
  public readonly userMigrationFn: NodejsFunction;

  // Auth Functions
  public readonly appleAuthFn: NodejsFunction;
  public readonly googleAuthFn: NodejsFunction;
  public readonly signupAuthFn: NodejsFunction;
  public readonly validateEmailFn: NodejsFunction;
  public readonly confirmSignupFn: NodejsFunction;
  public readonly resendCodeFn: NodejsFunction;
  public readonly forgotPasswordFn: NodejsFunction;
  public readonly confirmForgotPasswordFn: NodejsFunction;
  public readonly checkUserFn: NodejsFunction;

  // WebSocket Functions
  public readonly wsConnectFn: NodejsFunction;
  public readonly wsDisconnectFn: NodejsFunction;
  public readonly wsSendMessageFn: NodejsFunction;
  public readonly wsDefaultFn: NodejsFunction;

  constructor(scope: Construct, id: string, props: LambdaStackProps) {
    super(scope, id, props);

    const {
      vpc,
      lambdaSecurityGroup,
      dbCredentials,
      adminApiKeySecret,
      mediaBucket,
      userPool,
      userPoolClientId,
      lambdaEnvironment,
      environment,
      isProduction,
      apiLogGroup,
      adminLogGroup,
      authLogGroup,
    } = props;

    // SECURITY: Validate Google OAuth Client IDs in production
    if (isProduction) {
      const googleIosClientId = process.env.GOOGLE_IOS_CLIENT_ID;
      const googleAndroidClientId = process.env.GOOGLE_ANDROID_CLIENT_ID;
      const googleWebClientId = process.env.GOOGLE_WEB_CLIENT_ID;

      if (!googleIosClientId || !googleAndroidClientId || !googleWebClientId) {
        throw new Error(
          'SECURITY: Google OAuth Client IDs are required for production deployment. ' +
          'Set GOOGLE_IOS_CLIENT_ID, GOOGLE_ANDROID_CLIENT_ID, and GOOGLE_WEB_CLIENT_ID environment variables.'
        );
      }
    }

    // Create optimized Lambda function helper
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
        bundling: {
          minify: true,
          sourceMap: true,
          externalModules: [],
        },
        reservedConcurrentExecutions: options?.reservedConcurrency,
        tracing: lambda.Tracing.ACTIVE,
        logGroup: apiLogGroup,
        depsLockFilePath: path.join(__dirname, '../../lambda/api/package-lock.json'),
        projectRoot: path.join(__dirname, '../../lambda/api'),
      });

      dbCredentials.grantRead(fn);
      // SECURITY: S3 access removed from generic Lambdas (least privilege)
      // Only mediaUploadUrlFn has S3 PutObject permission for presigned URLs

      // Grant RDS Proxy IAM authentication permissions
      // This allows Lambda to connect to RDS Proxy using IAM auth instead of username/password
      if (props.rdsProxyArn) {
        fn.addToRolePolicy(new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: ['rds-db:connect'],
          resources: [props.rdsProxyArn],
        }));
      }

      return fn;
    };

    // ========================================
    // Phase 1: Core API Lambda Functions
    // ========================================
    this.postsListFn = createLambda('PostsListFunction', 'posts/list', { memory: 1024 });
    this.postsGetFn = createLambda('PostsGetFunction', 'posts/get');
    this.postsCreateFn = createLambda('PostsCreateFunction', 'posts/create');
    this.profilesGetFn = createLambda('ProfilesGetFunction', 'profiles/get');
    this.profilesSearchFn = createLambda('ProfilesSearchFunction', 'profiles/search', { memory: 1024 });
    this.feedGetFn = createLambda('FeedGetFunction', 'feed/get', { memory: 2048, timeout: 60 });
    this.followsCreateFn = createLambda('FollowsCreateFunction', 'follows/create');
    this.followsDeleteFn = createLambda('FollowsDeleteFunction', 'follows/delete');
    this.profilesUpdateFn = createLambda('ProfilesUpdateFunction', 'profiles/update');
    this.profilesSuggestedFn = createLambda('ProfilesSuggestedFunction', 'profiles/suggested');
    this.profilesIsFollowingFn = createLambda('ProfilesIsFollowingFunction', 'profiles/is-following');

    // ========================================
    // Phase 2: Posts & Comments Lambda Functions
    // ========================================
    this.postsLikeFn = createLambda('PostsLikeFunction', 'posts/like');
    this.postsUnlikeFn = createLambda('PostsUnlikeFunction', 'posts/unlike');
    this.postsDeleteFn = createLambda('PostsDeleteFunction', 'posts/delete');
    this.postsSaveFn = createLambda('PostsSaveFunction', 'posts/save');
    this.postsUnsaveFn = createLambda('PostsUnsaveFunction', 'posts/unsave');
    this.commentsListFn = createLambda('CommentsListFunction', 'comments/list');
    this.commentsCreateFn = createLambda('CommentsCreateFunction', 'comments/create');
    this.commentsDeleteFn = createLambda('CommentsDeleteFunction', 'comments/delete');
    this.commentsUpdateFn = createLambda('CommentsUpdateFunction', 'comments/update');
    this.postsIsSavedFn = createLambda('PostsIsSavedFunction', 'posts/is-saved');

    // ========================================
    // Phase 3: Profiles & Follow Requests Lambda Functions
    // ========================================
    this.profilesFollowersFn = createLambda('ProfilesFollowersFunction', 'profiles/followers');
    this.profilesFollowingFn = createLambda('ProfilesFollowingFunction', 'profiles/following');
    this.followRequestsListFn = createLambda('FollowRequestsListFunction', 'follow-requests/list');
    this.followRequestsAcceptFn = createLambda('FollowRequestsAcceptFunction', 'follow-requests/accept');
    this.followRequestsDeclineFn = createLambda('FollowRequestsDeclineFunction', 'follow-requests/decline');

    // ========================================
    // Phase 4: Peaks Lambda Functions
    // ========================================
    this.peaksListFn = createLambda('PeaksListFunction', 'peaks/list', { memory: 1024 });
    this.peaksGetFn = createLambda('PeaksGetFunction', 'peaks/get');
    this.peaksCreateFn = createLambda('PeaksCreateFunction', 'peaks/create');
    this.peaksDeleteFn = createLambda('PeaksDeleteFunction', 'peaks/delete');
    this.peaksLikeFn = createLambda('PeaksLikeFunction', 'peaks/like');
    this.peaksUnlikeFn = createLambda('PeaksUnlikeFunction', 'peaks/unlike');
    this.peaksCommentFn = createLambda('PeaksCommentFunction', 'peaks/comment');

    // ========================================
    // Phase 5: Notifications Lambda Functions
    // ========================================
    this.notificationsListFn = createLambda('NotificationsListFunction', 'notifications/list');
    this.notificationsMarkReadFn = createLambda('NotificationsMarkReadFunction', 'notifications/mark-read');
    this.notificationsMarkAllReadFn = createLambda('NotificationsMarkAllReadFunction', 'notifications/mark-all-read');
    this.notificationsUnreadCountFn = createLambda('NotificationsUnreadCountFunction', 'notifications/unread-count');
    this.notificationsPushTokenFn = createLambda('NotificationsPushTokenFunction', 'notifications/push-token');

    // ========================================
    // Phase 6: Messages & Conversations Lambda Functions
    // ========================================
    this.conversationsListFn = createLambda('ConversationsListFunction', 'conversations/list');
    this.conversationsCreateFn = createLambda('ConversationsCreateFunction', 'conversations/create');
    this.conversationsMessagesFn = createLambda('ConversationsMessagesFunction', 'conversations/messages');
    this.conversationsSendMessageFn = createLambda('ConversationsSendMessageFunction', 'conversations/send-message');
    this.messagesDeleteFn = createLambda('MessagesDeleteFunction', 'messages/delete');

    // ========================================
    // Media Lambda Functions
    // ========================================
    this.mediaUploadUrlFn = new NodejsFunction(this, 'MediaUploadUrlFunction', {
      entry: path.join(__dirname, '../../lambda/api/media/upload-url.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_20_X,
      memorySize: 256,
      timeout: cdk.Duration.seconds(10),
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      securityGroups: [lambdaSecurityGroup],
      environment: {
        ...lambdaEnvironment,
        MEDIA_BUCKET: mediaBucket.bucketName,
      },
      bundling: { minify: true, sourceMap: true, externalModules: [] },
      tracing: lambda.Tracing.ACTIVE,
      logGroup: apiLogGroup,
      depsLockFilePath: path.join(__dirname, '../../lambda/api/package-lock.json'),
      projectRoot: path.join(__dirname, '../../lambda/api'),
    });
    // Grant S3 PutObject for presigned URL generation
    mediaBucket.grantPut(this.mediaUploadUrlFn);

    // ========================================
    // Admin Lambda Functions
    // ========================================
    this.adminMigrationFn = new NodejsFunction(this, 'AdminMigrationFunction', {
      entry: path.join(__dirname, '../../lambda/api/admin/run-migration.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_20_X,
      memorySize: 512,
      timeout: cdk.Duration.minutes(5),
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      securityGroups: [lambdaSecurityGroup],
      environment: {
        ...lambdaEnvironment,
        ADMIN_KEY_SECRET_ARN: adminApiKeySecret.secretArn,
      },
      bundling: { minify: true, sourceMap: true, externalModules: [] },
      tracing: lambda.Tracing.ACTIVE,
      logGroup: adminLogGroup,
      depsLockFilePath: path.join(__dirname, '../../lambda/api/package-lock.json'),
      projectRoot: path.join(__dirname, '../../lambda/api'),
    });
    dbCredentials.grantRead(this.adminMigrationFn);
    adminApiKeySecret.grantRead(this.adminMigrationFn);

    this.dataMigrationFn = new NodejsFunction(this, 'DataMigrationFunction', {
      entry: path.join(__dirname, '../../lambda/api/admin/migrate-data.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_20_X,
      memorySize: 2048,
      timeout: cdk.Duration.minutes(15),
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      securityGroups: [lambdaSecurityGroup],
      environment: {
        ...lambdaEnvironment,
        ADMIN_KEY_SECRET_ARN: adminApiKeySecret.secretArn,
      },
      bundling: { minify: true, sourceMap: true, externalModules: [] },
      tracing: lambda.Tracing.ACTIVE,
      logGroup: adminLogGroup,
      depsLockFilePath: path.join(__dirname, '../../lambda/api/package-lock.json'),
      projectRoot: path.join(__dirname, '../../lambda/api'),
    });
    dbCredentials.grantRead(this.dataMigrationFn);
    adminApiKeySecret.grantRead(this.dataMigrationFn);

    this.checkProfilesFn = new NodejsFunction(this, 'CheckProfilesFunction', {
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
    dbCredentials.grantRead(this.checkProfilesFn);
    adminApiKeySecret.grantRead(this.checkProfilesFn);

    this.userMigrationFn = new NodejsFunction(this, 'UserMigrationFunction', {
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
        ADMIN_KEY_SECRET_ARN: adminApiKeySecret.secretArn,
      },
      bundling: { minify: true, sourceMap: true, externalModules: [] },
      tracing: lambda.Tracing.ACTIVE,
      logGroup: adminLogGroup,
      depsLockFilePath: path.join(__dirname, '../../lambda/api/package-lock.json'),
      projectRoot: path.join(__dirname, '../../lambda/api'),
    });
    dbCredentials.grantRead(this.userMigrationFn);
    adminApiKeySecret.grantRead(this.userMigrationFn);
    this.userMigrationFn.addToRolePolicy(new iam.PolicyStatement({
      actions: [
        'cognito-idp:AdminCreateUser',
        'cognito-idp:AdminSetUserPassword',
        'cognito-idp:AdminGetUser',
        'cognito-idp:ListUsers',
      ],
      resources: [userPool.userPoolArn],
    }));

    // ========================================
    // Auth Lambda Functions
    // ========================================
    this.appleAuthFn = new NodejsFunction(this, 'AppleAuthFunction', {
      entry: path.join(__dirname, '../../lambda/api/auth/apple.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_20_X,
      memorySize: 256,
      timeout: cdk.Duration.seconds(30),
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      securityGroups: [lambdaSecurityGroup],
      environment: {
        ...lambdaEnvironment,
        APPLE_CLIENT_ID: 'com.smuppy.app',
        CLIENT_ID: userPoolClientId,
      },
      bundling: { minify: true, sourceMap: true, externalModules: [] },
      tracing: lambda.Tracing.ACTIVE,
      logGroup: authLogGroup,
      depsLockFilePath: path.join(__dirname, '../../lambda/api/package-lock.json'),
      projectRoot: path.join(__dirname, '../../lambda/api'),
    });
    this.appleAuthFn.addToRolePolicy(new iam.PolicyStatement({
      actions: [
        'cognito-idp:AdminCreateUser',
        'cognito-idp:AdminSetUserPassword',
        'cognito-idp:AdminGetUser',
        'cognito-idp:AdminInitiateAuth',
      ],
      resources: [userPool.userPoolArn],
    }));

    // SECURITY: Google OAuth credentials - use placeholder in staging to prevent runtime errors
    // Production requires real credentials (validated above)
    const googleIosClientId = process.env.GOOGLE_IOS_CLIENT_ID || (isProduction ? '' : 'STAGING_PLACEHOLDER');
    const googleAndroidClientId = process.env.GOOGLE_ANDROID_CLIENT_ID || (isProduction ? '' : 'STAGING_PLACEHOLDER');
    const googleWebClientId = process.env.GOOGLE_WEB_CLIENT_ID || (isProduction ? '' : 'STAGING_PLACEHOLDER');

    this.googleAuthFn = new NodejsFunction(this, 'GoogleAuthFunction', {
      entry: path.join(__dirname, '../../lambda/api/auth/google.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_20_X,
      memorySize: 256,
      timeout: cdk.Duration.seconds(30),
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      securityGroups: [lambdaSecurityGroup],
      environment: {
        ...lambdaEnvironment,
        GOOGLE_IOS_CLIENT_ID: googleIosClientId,
        GOOGLE_ANDROID_CLIENT_ID: googleAndroidClientId,
        GOOGLE_WEB_CLIENT_ID: googleWebClientId,
        CLIENT_ID: userPoolClientId,
      },
      bundling: { minify: true, sourceMap: true, externalModules: [] },
      tracing: lambda.Tracing.ACTIVE,
      logGroup: authLogGroup,
      depsLockFilePath: path.join(__dirname, '../../lambda/api/package-lock.json'),
      projectRoot: path.join(__dirname, '../../lambda/api'),
    });
    this.googleAuthFn.addToRolePolicy(new iam.PolicyStatement({
      actions: [
        'cognito-idp:AdminCreateUser',
        'cognito-idp:AdminSetUserPassword',
        'cognito-idp:AdminGetUser',
        'cognito-idp:AdminInitiateAuth',
      ],
      resources: [userPool.userPoolArn],
    }));

    this.signupAuthFn = new NodejsFunction(this, 'SignupAuthFunction', {
      entry: path.join(__dirname, '../../lambda/api/auth/signup.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_20_X,
      memorySize: 256,
      timeout: cdk.Duration.seconds(30),
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      securityGroups: [lambdaSecurityGroup],
      environment: {
        ...lambdaEnvironment,
        CLIENT_ID: userPoolClientId,
      },
      bundling: { minify: true, sourceMap: true, externalModules: [] },
      tracing: lambda.Tracing.ACTIVE,
      logGroup: authLogGroup,
      depsLockFilePath: path.join(__dirname, '../../lambda/api/package-lock.json'),
      projectRoot: path.join(__dirname, '../../lambda/api'),
    });
    this.signupAuthFn.addToRolePolicy(new iam.PolicyStatement({
      actions: [
        'cognito-idp:AdminGetUser',
        'cognito-idp:AdminDeleteUser',
        'cognito-idp:SignUp',
      ],
      resources: [userPool.userPoolArn],
    }));

    this.validateEmailFn = new NodejsFunction(this, 'ValidateEmailFunction', {
      entry: path.join(__dirname, '../../lambda/api/auth/validate-email.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_20_X,
      memorySize: 256,
      timeout: cdk.Duration.seconds(10),
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      securityGroups: [lambdaSecurityGroup],
      environment: { NODE_ENV: environment },
      bundling: { minify: true, sourceMap: true, externalModules: [] },
      tracing: lambda.Tracing.ACTIVE,
      logGroup: authLogGroup,
      depsLockFilePath: path.join(__dirname, '../../lambda/api/package-lock.json'),
      projectRoot: path.join(__dirname, '../../lambda/api'),
    });

    this.confirmSignupFn = new NodejsFunction(this, 'ConfirmSignupFunction', {
      entry: path.join(__dirname, '../../lambda/api/auth/confirm-signup.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_20_X,
      memorySize: 256,
      timeout: cdk.Duration.seconds(10),
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      securityGroups: [lambdaSecurityGroup],
      environment: {
        ...lambdaEnvironment,
        CLIENT_ID: userPoolClientId,
      },
      bundling: { minify: true, sourceMap: true, externalModules: [] },
      tracing: lambda.Tracing.ACTIVE,
      logGroup: authLogGroup,
      depsLockFilePath: path.join(__dirname, '../../lambda/api/package-lock.json'),
      projectRoot: path.join(__dirname, '../../lambda/api'),
    });

    this.resendCodeFn = new NodejsFunction(this, 'ResendCodeFunction', {
      entry: path.join(__dirname, '../../lambda/api/auth/resend-code.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_20_X,
      memorySize: 256,
      timeout: cdk.Duration.seconds(10),
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      securityGroups: [lambdaSecurityGroup],
      environment: {
        ...lambdaEnvironment,
        CLIENT_ID: userPoolClientId,
      },
      bundling: { minify: true, sourceMap: true, externalModules: [] },
      tracing: lambda.Tracing.ACTIVE,
      logGroup: authLogGroup,
      depsLockFilePath: path.join(__dirname, '../../lambda/api/package-lock.json'),
      projectRoot: path.join(__dirname, '../../lambda/api'),
    });

    this.forgotPasswordFn = new NodejsFunction(this, 'ForgotPasswordFunction', {
      entry: path.join(__dirname, '../../lambda/api/auth/forgot-password.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_20_X,
      memorySize: 256,
      timeout: cdk.Duration.seconds(10),
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      securityGroups: [lambdaSecurityGroup],
      environment: {
        ...lambdaEnvironment,
        CLIENT_ID: userPoolClientId,
      },
      bundling: { minify: true, sourceMap: true, externalModules: [] },
      tracing: lambda.Tracing.ACTIVE,
      logGroup: authLogGroup,
      depsLockFilePath: path.join(__dirname, '../../lambda/api/package-lock.json'),
      projectRoot: path.join(__dirname, '../../lambda/api'),
    });

    this.confirmForgotPasswordFn = new NodejsFunction(this, 'ConfirmForgotPasswordFunction', {
      entry: path.join(__dirname, '../../lambda/api/auth/confirm-forgot-password.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_20_X,
      memorySize: 256,
      timeout: cdk.Duration.seconds(10),
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      securityGroups: [lambdaSecurityGroup],
      environment: {
        ...lambdaEnvironment,
        CLIENT_ID: userPoolClientId,
      },
      bundling: { minify: true, sourceMap: true, externalModules: [] },
      tracing: lambda.Tracing.ACTIVE,
      logGroup: authLogGroup,
      depsLockFilePath: path.join(__dirname, '../../lambda/api/package-lock.json'),
      projectRoot: path.join(__dirname, '../../lambda/api'),
    });

    this.checkUserFn = new NodejsFunction(this, 'CheckUserFunction', {
      entry: path.join(__dirname, '../../lambda/api/auth/check-user.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_20_X,
      memorySize: 256,
      timeout: cdk.Duration.seconds(10),
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      securityGroups: [lambdaSecurityGroup],
      environment: {
        ...lambdaEnvironment,
        USER_POOL_ID: userPool.userPoolId,
      },
      bundling: { minify: true, sourceMap: true, externalModules: [] },
      tracing: lambda.Tracing.ACTIVE,
      logGroup: authLogGroup,
      depsLockFilePath: path.join(__dirname, '../../lambda/api/package-lock.json'),
      projectRoot: path.join(__dirname, '../../lambda/api'),
    });
    userPool.grant(this.checkUserFn, 'cognito-idp:AdminGetUser');

    // ========================================
    // WebSocket Lambda Functions
    // ========================================
    const wsLogGroup = new logs.LogGroup(this, 'WebSocketLogGroup', {
      logGroupName: `/aws/lambda/smuppy-websocket-${environment}`,
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: isProduction ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
    });

    this.wsConnectFn = new NodejsFunction(this, 'WsConnectFunction', {
      entry: path.join(__dirname, '../../lambda/websocket/connect.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_20_X,
      memorySize: 256,
      timeout: cdk.Duration.seconds(10),
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      securityGroups: [lambdaSecurityGroup],
      environment: {
        ...lambdaEnvironment,
        CLIENT_ID: userPoolClientId,
      },
      bundling: { minify: true, sourceMap: true, externalModules: [] },
      tracing: lambda.Tracing.ACTIVE,
      logGroup: wsLogGroup,
      depsLockFilePath: path.join(__dirname, '../../lambda/websocket/package-lock.json'),
      projectRoot: path.join(__dirname, '../../lambda/websocket'),
    });
    dbCredentials.grantRead(this.wsConnectFn);

    this.wsDisconnectFn = new NodejsFunction(this, 'WsDisconnectFunction', {
      entry: path.join(__dirname, '../../lambda/websocket/disconnect.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_20_X,
      memorySize: 256,
      timeout: cdk.Duration.seconds(10),
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      securityGroups: [lambdaSecurityGroup],
      environment: lambdaEnvironment,
      bundling: { minify: true, sourceMap: true, externalModules: [] },
      tracing: lambda.Tracing.ACTIVE,
      logGroup: wsLogGroup,
      depsLockFilePath: path.join(__dirname, '../../lambda/websocket/package-lock.json'),
      projectRoot: path.join(__dirname, '../../lambda/websocket'),
    });
    dbCredentials.grantRead(this.wsDisconnectFn);

    this.wsSendMessageFn = new NodejsFunction(this, 'WsSendMessageFunction', {
      entry: path.join(__dirname, '../../lambda/websocket/send-message.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_20_X,
      memorySize: 512,
      timeout: cdk.Duration.seconds(30),
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      securityGroups: [lambdaSecurityGroup],
      environment: lambdaEnvironment,
      bundling: { minify: true, sourceMap: true, externalModules: [] },
      tracing: lambda.Tracing.ACTIVE,
      logGroup: wsLogGroup,
      depsLockFilePath: path.join(__dirname, '../../lambda/websocket/package-lock.json'),
      projectRoot: path.join(__dirname, '../../lambda/websocket'),
    });
    dbCredentials.grantRead(this.wsSendMessageFn);

    this.wsDefaultFn = new NodejsFunction(this, 'WsDefaultFunction', {
      entry: path.join(__dirname, '../../lambda/websocket/default.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_20_X,
      memorySize: 128,
      timeout: cdk.Duration.seconds(5),
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      securityGroups: [lambdaSecurityGroup],
      environment: lambdaEnvironment,
      bundling: { minify: true, sourceMap: true, externalModules: [] },
      tracing: lambda.Tracing.ACTIVE,
      logGroup: wsLogGroup,
      depsLockFilePath: path.join(__dirname, '../../lambda/websocket/package-lock.json'),
      projectRoot: path.join(__dirname, '../../lambda/websocket'),
    });
  }
}

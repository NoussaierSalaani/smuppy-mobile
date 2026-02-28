import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as cloudwatchActions from 'aws-cdk-lib/aws-cloudwatch-actions';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { Construct } from 'constructs';
import * as path from 'path';
import { createLambdaFactory } from './lambda-helpers';

export interface LambdaStackProps extends cdk.NestedStackProps {
  vpc: ec2.IVpc;
  lambdaSecurityGroup: ec2.ISecurityGroup;
  dbCredentials: secretsmanager.ISecret;
  adminApiKeySecret: secretsmanager.ISecret;
  stripeSecret: secretsmanager.ISecret;
  redisAuthSecret?: secretsmanager.ISecret; // Optional: Redis auth token secret
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
  alertsTopic?: sns.ITopic; // Optional: SNS topic for CloudWatch alarm notifications
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
  public readonly profilesDeleteFn: NodejsFunction;
  public readonly profilesSuggestedFn: NodejsFunction;
  public readonly profilesIsFollowingFn: NodejsFunction;
  public readonly profilesExportDataFn: NodejsFunction;
  public readonly profilesConsentFn: NodejsFunction;

  // Phase 2: Posts & Comments
  public readonly postsLikersFn: NodejsFunction;
  public readonly postsLikeFn: NodejsFunction;
  public readonly postsUnlikeFn: NodejsFunction;
  public readonly postsDeleteFn: NodejsFunction;
  public readonly postsViewFn: NodejsFunction;
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
  public readonly notificationsDeleteFn: NodejsFunction;

  // Phase 6: Messages & Conversations
  public readonly conversationsListFn: NodejsFunction;
  public readonly conversationsCreateFn: NodejsFunction;
  public readonly conversationsMessagesFn: NodejsFunction;
  public readonly conversationsSendMessageFn: NodejsFunction;
  public readonly messagesDeleteFn: NodejsFunction;

  // Media Functions
  public readonly mediaUploadUrlFn: NodejsFunction;
  public readonly videoStatusFn: NodejsFunction;
  public readonly startVideoProcessingFn: NodejsFunction;
  public readonly videoProcessingCompleteFn: NodejsFunction;
  public readonly imageOptimizerFn: NodejsFunction;

  // Payment Functions
  public readonly paymentCreateIntentFn: NodejsFunction;
  public readonly paymentWebhookFn: NodejsFunction;
  public readonly paymentSubscriptionsFn: NodejsFunction;
  public readonly paymentConnectFn: NodejsFunction;
  public readonly paymentIdentityFn: NodejsFunction;
  public readonly paymentPlatformSubFn: NodejsFunction;
  public readonly paymentChannelSubFn: NodejsFunction;
  public readonly paymentWalletFn: NodejsFunction;
  public readonly paymentRefundsFn: NodejsFunction;
  public readonly paymentMethodsFn: NodejsFunction;
  public readonly paymentWebCheckoutFn: NodejsFunction;

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

  // Auth - WebSocket Token
  public readonly wsTokenFn: NodejsFunction;

  // WebSocket Functions
  public readonly wsConnectFn: NodejsFunction;
  public readonly wsDisconnectFn: NodejsFunction;
  public readonly wsSendMessageFn: NodejsFunction;
  public readonly wsDefaultFn: NodejsFunction;
  public readonly wsLiveStreamFn: NodejsFunction;

  // Peaks - Extended
  public readonly peaksReactFn: NodejsFunction;
  public readonly peaksTagFn: NodejsFunction;
  public readonly peaksHideFn: NodejsFunction;
  public readonly peaksRepliesFn: NodejsFunction;

  // Sessions
  public readonly sessionsListFn: NodejsFunction;
  public readonly sessionsCreateFn: NodejsFunction;
  public readonly sessionsGetFn: NodejsFunction;
  public readonly sessionsAcceptFn: NodejsFunction;
  public readonly sessionsDeclineFn: NodejsFunction;
  public readonly sessionsAvailabilityFn: NodejsFunction;

  // Session Packs
  public readonly packsListFn: NodejsFunction;
  public readonly packsPurchaseFn: NodejsFunction;
  public readonly packsManageFn: NodejsFunction;

  // Session Token (Agora)
  public readonly sessionsTokenFn: NodejsFunction;
  public readonly sessionsSettingsFn: NodejsFunction;

  // Earnings
  public readonly earningsGetFn: NodejsFunction;

  // Tips
  public readonly tipsSendFn: NodejsFunction;
  public readonly tipsHistoryFn: NodejsFunction;
  public readonly tipsLeaderboardFn: NodejsFunction;

  // Challenges - MOVED to LambdaStack3
  // public readonly challengesCreateFn: NodejsFunction;
  // public readonly challengesListFn: NodejsFunction;
  // public readonly challengesRespondFn: NodejsFunction;
  // public readonly challengesResponsesFn: NodejsFunction;

  // Battles - MOVED to LambdaStack3
  // public readonly battlesCreateFn: NodejsFunction;
  // public readonly battlesJoinFn: NodejsFunction;

  // Events - MOVED to LambdaStack3
  // public readonly eventsCreateFn: NodejsFunction;
  // public readonly eventsListFn: NodejsFunction;
  // public readonly eventsJoinFn: NodejsFunction;

  // Groups - MOVED to LambdaStack3
  // public readonly groupsCreateFn: NodejsFunction;
  // public readonly groupsListFn: NodejsFunction;
  // public readonly groupsGetFn: NodejsFunction;
  // public readonly groupsJoinFn: NodejsFunction;
  // public readonly groupsLeaveFn: NodejsFunction;

  // Content Moderation: Reports
  public readonly reportsPostFn: NodejsFunction;
  public readonly reportsCommentFn: NodejsFunction;
  public readonly reportsLivestreamFn: NodejsFunction;
  public readonly reportsMessageFn: NodejsFunction;
  public readonly reportsUserFn: NodejsFunction;
  public readonly reportsCheckPostFn: NodejsFunction;
  public readonly reportsCheckUserFn: NodejsFunction;

  // Content Moderation: Block & Mute
  public readonly profilesBlockFn: NodejsFunction;
  public readonly profilesUnblockFn: NodejsFunction;
  public readonly profilesMuteFn: NodejsFunction;
  public readonly profilesUnmuteFn: NodejsFunction;
  public readonly profilesGetBlockedFn: NodejsFunction;
  public readonly profilesGetMutedFn: NodejsFunction;
  public readonly profilesCreationLimitsFn: NodejsFunction;

  // Search & Discovery - MOVED to LambdaStack3
  // public readonly postsSearchFn: NodejsFunction;
  // public readonly peaksSearchFn: NodejsFunction;
  // public readonly hashtagsTrendingFn: NodejsFunction;

  // Feed Variants - MOVED to LambdaStack3
  // public readonly feedOptimizedFn: NodejsFunction;
  // public readonly feedFollowingFn: NodejsFunction;
  // public readonly feedDiscoverFn: NodejsFunction;

  // Posts Batch - PARTIALLY MOVED to LambdaStack3
  // public readonly postsLikesBatchFn: NodejsFunction;
  // public readonly postsSavesBatchFn: NodejsFunction;
  public readonly postsSavedListFn: NodejsFunction;

  // Interests & Expertise - MOVED to LambdaStack3
  // public readonly interestsListFn: NodejsFunction;
  // public readonly expertiseListFn: NodejsFunction;

  // Follow Requests - Extended
  public readonly followRequestsCountFn: NodejsFunction;
  public readonly followRequestsCheckPendingFn: NodejsFunction;
  public readonly followRequestsCancelFn: NodejsFunction;

  // Media - Voice Upload
  public readonly mediaUploadVoiceFn: NodejsFunction;
  // Media - Upload Quota
  public readonly mediaUploadQuotaFn: NodejsFunction;

  // Spots handlers moved to LambdaStackDisputes to stay under CloudFormation limits

  // Live Streams
  public readonly liveStreamsStartFn: NodejsFunction;
  public readonly liveStreamsEndFn: NodejsFunction;
  public readonly liveStreamsActiveFn: NodejsFunction;

  // Provisioned Concurrency Aliases (for API Gateway integration)
  public readonly feedGetAlias: lambda.IFunction;
  public readonly postsListAlias: lambda.IFunction;
  public readonly postsCreateAlias: lambda.IFunction;
  public readonly profilesGetAlias: lambda.IFunction;
  public readonly peaksListAlias: lambda.IFunction;
  public readonly conversationsListAlias: lambda.IFunction;
  public readonly conversationsSendMessageAlias: lambda.IFunction;
  public readonly notificationsListAlias: lambda.IFunction;
  public readonly signupAuthAlias: lambda.IFunction;
  public readonly appleAuthAlias: lambda.IFunction;

  // Settings
  public readonly settingsCurrencyFn: NodejsFunction;

  // Business
  public readonly businessServicesListFn: NodejsFunction;
  public readonly businessServicesCreateFn: NodejsFunction;
  public readonly businessServicesUpdateFn: NodejsFunction;
  public readonly businessServicesDeleteFn: NodejsFunction;
  public readonly businessDashboardFn: NodejsFunction;
  public readonly businessProgramGetFn: NodejsFunction;
  public readonly businessProgramUpdateFn: NodejsFunction;
  public readonly businessAvailabilityFn: NodejsFunction;
  public readonly businessProfileGetFn: NodejsFunction;
  public readonly businessDiscoverFn: NodejsFunction;
  public readonly businessScheduleGetFn: NodejsFunction;
  public readonly businessCheckoutFn: NodejsFunction;
  // Business access handlers moved to LambdaStack2 to stay under CloudFormation limits

  constructor(scope: Construct, id: string, props: LambdaStackProps) {
    super(scope, id, props);

    const {
      vpc,
      lambdaSecurityGroup,
      dbCredentials,
      adminApiKeySecret,
      stripeSecret,
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

    // Dead-letter queue for critical Lambda invocations (payments, messages)
    const criticalDlq = new sqs.Queue(this, 'CriticalLambdaDLQ', {
      queueName: `smuppy-critical-dlq-${environment}`,
      retentionPeriod: cdk.Duration.days(14),
      encryption: sqs.QueueEncryption.SQS_MANAGED,
    });

    // Shared Lambda factory (eliminates duplicated createLambda across stacks)
    const createLambda = createLambdaFactory({
      scope: this,
      vpc,
      lambdaSecurityGroup,
      dbCredentials,
      lambdaEnvironment,
      environment,
      isProduction,
      apiLogGroup,
      redisAuthSecret: props.redisAuthSecret,
      rdsProxyArn: props.rdsProxyArn,
    });

    // ========================================
    // Phase 1: Core API Lambda Functions
    // ========================================
    this.postsListFn = createLambda('PostsListFunction', 'posts/list', { memory: 1024, reservedConcurrency: 50 });
    this.postsGetFn = createLambda('PostsGetFunction', 'posts/get');
    this.postsCreateFn = createLambda('PostsCreateFunction', 'posts/create');
    this.profilesGetFn = createLambda('ProfilesGetFunction', 'profiles/get');
    this.profilesSearchFn = createLambda('ProfilesSearchFunction', 'profiles/search', { memory: 1024 });
    this.feedGetFn = createLambda('FeedGetFunction', 'feed/get', { memory: 2048, timeout: 60, reservedConcurrency: 100 });
    this.followsCreateFn = createLambda('FollowsCreateFunction', 'follows/create');
    this.followsDeleteFn = createLambda('FollowsDeleteFunction', 'follows/delete');
    this.profilesUpdateFn = createLambda('ProfilesUpdateFunction', 'profiles/update');
    this.profilesDeleteFn = createLambda('ProfilesDeleteFunction', 'profiles/delete');
    this.profilesSuggestedFn = createLambda('ProfilesSuggestedFunction', 'profiles/suggested');
    this.profilesIsFollowingFn = createLambda('ProfilesIsFollowingFunction', 'profiles/is-following');
    this.profilesExportDataFn = createLambda('ProfilesExportDataFunction', 'profiles/export-data', { timeout: 30 });
    this.profilesConsentFn = createLambda('ProfilesConsentFunction', 'profiles/consent');

    // ========================================
    // Phase 2: Posts & Comments Lambda Functions
    // ========================================
    this.postsLikersFn = createLambda('PostsLikersFunction', 'posts/likers');
    this.postsLikeFn = createLambda('PostsLikeFunction', 'posts/like');
    this.postsUnlikeFn = createLambda('PostsUnlikeFunction', 'posts/unlike');
    this.postsDeleteFn = createLambda('PostsDeleteFunction', 'posts/delete');
    this.postsViewFn = createLambda('PostsViewFunction', 'posts/view');
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
    this.peaksListFn = createLambda('PeaksListFunction', 'peaks/list', { memory: 1024, reservedConcurrency: 50 });
    this.peaksGetFn = createLambda('PeaksGetFunction', 'peaks/get');
    this.peaksCreateFn = createLambda('PeaksCreateFunction', 'peaks/create');
    this.peaksDeleteFn = createLambda('PeaksDeleteFunction', 'peaks/delete');

    // Grant S3 delete and CloudFront invalidation to delete Lambdas (variant cleanup)
    mediaBucket.grantDelete(this.postsDeleteFn);
    mediaBucket.grantRead(this.postsDeleteFn);
    mediaBucket.grantDelete(this.peaksDeleteFn);
    mediaBucket.grantRead(this.peaksDeleteFn);
    const cfInvalidationPolicy = new iam.PolicyStatement({
      actions: ['cloudfront:CreateInvalidation'],
      resources: [`arn:aws:cloudfront::${cdk.Aws.ACCOUNT_ID}:distribution/*`],
    });
    this.postsDeleteFn.addToRolePolicy(cfInvalidationPolicy);
    this.peaksDeleteFn.addToRolePolicy(cfInvalidationPolicy);

    this.peaksLikeFn = createLambda('PeaksLikeFunction', 'peaks/like');
    this.peaksUnlikeFn = createLambda('PeaksUnlikeFunction', 'peaks/unlike');
    this.peaksCommentFn = createLambda('PeaksCommentFunction', 'peaks/comment');
    this.peaksReactFn = createLambda('PeaksReactFunction', 'peaks/react');
    this.peaksTagFn = createLambda('PeaksTagFunction', 'peaks/tag');
    this.peaksHideFn = createLambda('PeaksHideFunction', 'peaks/hide');
    this.peaksRepliesFn = createLambda('PeaksRepliesFunction', 'peaks/replies');

    // ========================================
    // Sessions Lambda Functions
    // ========================================
    this.sessionsListFn = createLambda('SessionsListFunction', 'sessions/list');
    this.sessionsCreateFn = createLambda('SessionsCreateFunction', 'sessions/create');
    this.sessionsGetFn = createLambda('SessionsGetFunction', 'sessions/get');
    this.sessionsAcceptFn = createLambda('SessionsAcceptFunction', 'sessions/accept');
    this.sessionsDeclineFn = createLambda('SessionsDeclineFunction', 'sessions/decline');
    this.sessionsAvailabilityFn = createLambda('SessionsAvailabilityFunction', 'sessions/availability');

    // ========================================
    // Session Packs Lambda Functions
    // ========================================
    this.packsListFn = createLambda('PacksListFunction', 'packs/list');
    this.packsPurchaseFn = createLambda('PacksPurchaseFunction', 'packs/purchase');
    this.packsManageFn = createLambda('PacksManageFunction', 'packs/manage');

    // ========================================
    // Session Token (Agora) Lambda Functions
    // ========================================
    this.sessionsTokenFn = createLambda('SessionsTokenFunction', 'sessions/token');
    this.sessionsSettingsFn = createLambda('SessionsSettingsFunction', 'sessions/settings');

    // ========================================
    // Earnings Lambda Functions
    // ========================================
    this.earningsGetFn = createLambda('EarningsGetFunction', 'earnings/get');

    // ========================================
    // Tips Lambda Functions
    // ========================================
    this.tipsSendFn = createLambda('TipsSendFunction', 'tips/send');
    this.tipsHistoryFn = createLambda('TipsHistoryFunction', 'tips/history');
    this.tipsLeaderboardFn = createLambda('TipsLeaderboardFunction', 'tips/leaderboard');

    // ========================================
    // Challenges Lambda Functions - MOVED to LambdaStack3
    // ========================================
    // this.challengesCreateFn = createLambda('ChallengesCreateFunction', 'challenges/create');
    // this.challengesListFn = createLambda('ChallengesListFunction', 'challenges/list');
    // this.challengesRespondFn = createLambda('ChallengesRespondFunction', 'challenges/respond');
    // this.challengesResponsesFn = createLambda('ChallengesResponsesFunction', 'challenges/responses');

    // ========================================
    // Live Battles Lambda Functions - MOVED to LambdaStack3
    // ========================================
    // this.battlesCreateFn = createLambda('BattlesCreateFunction', 'battles/create');
    // this.battlesJoinFn = createLambda('BattlesJoinFunction', 'battles/join');

    // ========================================
    // Events Lambda Functions (Xplorer) - MOVED to LambdaStack3
    // ========================================
    // this.eventsCreateFn = createLambda('EventsCreateFunction', 'events/create');
    // this.eventsListFn = createLambda('EventsListFunction', 'events/list');
    // this.eventsJoinFn = createLambda('EventsJoinFunction', 'events/join');

    // ========================================
    // Groups Lambda Functions - MOVED to LambdaStack3
    // ========================================
    // this.groupsCreateFn = createLambda('GroupsCreateFunction', 'groups/create');
    // this.groupsListFn = createLambda('GroupsListFunction', 'groups/list');
    // this.groupsGetFn = createLambda('GroupsGetFunction', 'groups/get');
    // this.groupsJoinFn = createLambda('GroupsJoinFunction', 'groups/join');
    // this.groupsLeaveFn = createLambda('GroupsLeaveFunction', 'groups/leave');

    // ========================================
    // Content Moderation: Reports Lambda Functions
    // ========================================
    this.reportsPostFn = createLambda('ReportsPostFunction', 'reports/report-post');
    this.reportsCommentFn = createLambda('ReportsCommentFunction', 'reports/report-comment');
    this.reportsLivestreamFn = createLambda('ReportsLivestreamFunction', 'reports/report-livestream');
    this.reportsMessageFn = createLambda('ReportsMessageFunction', 'reports/report-message');
    this.reportsUserFn = createLambda('ReportsUserFunction', 'reports/report-user');
    this.reportsCheckPostFn = createLambda('ReportsCheckPostFunction', 'reports/check-post-report');
    this.reportsCheckUserFn = createLambda('ReportsCheckUserFunction', 'reports/check-user-report');

    // ========================================
    // Content Moderation: Block & Mute Lambda Functions
    // ========================================
    this.profilesBlockFn = createLambda('ProfilesBlockFunction', 'profiles/block');
    this.profilesUnblockFn = createLambda('ProfilesUnblockFunction', 'profiles/unblock');
    this.profilesMuteFn = createLambda('ProfilesMuteFunction', 'profiles/mute');
    this.profilesUnmuteFn = createLambda('ProfilesUnmuteFunction', 'profiles/unmute');
    this.profilesGetBlockedFn = createLambda('ProfilesGetBlockedFunction', 'profiles/get-blocked');
    this.profilesGetMutedFn = createLambda('ProfilesGetMutedFunction', 'profiles/get-muted');
    this.profilesCreationLimitsFn = createLambda('ProfilesCreationLimitsFunction', 'profiles/creation-limits');

    // ========================================
    // Live Streams Lambda Functions
    // ========================================
    this.liveStreamsStartFn = createLambda('LiveStreamsStartFunction', 'live-streams/start');
    this.liveStreamsEndFn = createLambda('LiveStreamsEndFunction', 'live-streams/end');
    this.liveStreamsActiveFn = createLambda('LiveStreamsActiveFunction', 'live-streams/active');

    // ========================================
    // Settings Lambda Functions
    // ========================================
    this.settingsCurrencyFn = createLambda('SettingsCurrencyFunction', 'settings/currency');

    // ========================================
    // Business Lambda Functions
    // ========================================
    this.businessServicesListFn = createLambda('BusinessServicesListFunction', 'business/services-list');
    this.businessServicesCreateFn = createLambda('BusinessServicesCreateFunction', 'business/services-create');
    this.businessServicesUpdateFn = createLambda('BusinessServicesUpdateFunction', 'business/services-update');
    this.businessServicesDeleteFn = createLambda('BusinessServicesDeleteFunction', 'business/services-delete');
    this.businessDashboardFn = createLambda('BusinessDashboardFunction', 'business/dashboard');
    this.businessProgramGetFn = createLambda('BusinessProgramGetFunction', 'business/program-get');
    this.businessProgramUpdateFn = createLambda('BusinessProgramUpdateFunction', 'business/program-update');
    this.businessAvailabilityFn = createLambda('BusinessAvailabilityFunction', 'business/availability');
    this.businessProfileGetFn = createLambda('BusinessProfileGetFunction', 'business/profile-get');
    this.businessDiscoverFn = createLambda('BusinessDiscoverFunction', 'business/discover', { memory: 1024 });
    this.businessScheduleGetFn = createLambda('BusinessScheduleGetFunction', 'business/schedule-get');

    // Note: Business access handlers (validate-access, log-entry, subscription-manage)
    // are deployed via LambdaStack2 to stay under CloudFormation limits

    // Business Checkout (needs Stripe)
    this.businessCheckoutFn = new NodejsFunction(this, 'BusinessCheckoutFunction', {
      entry: path.join(__dirname, '../../lambda/api/payments/business-checkout.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_22_X,
      memorySize: 256,
      timeout: cdk.Duration.seconds(30),
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      securityGroups: [lambdaSecurityGroup],
      environment: {
        ...lambdaEnvironment,
        STRIPE_SECRET_ARN: stripeSecret.secretArn,
        WEB_DOMAIN: process.env.WEB_DOMAIN || 'https://smuppy.com',
      },
      bundling: { minify: true, sourceMap: !isProduction, externalModules: [] },
      tracing: lambda.Tracing.ACTIVE,
      logGroup: apiLogGroup,
      depsLockFilePath: path.join(__dirname, '../../lambda/api/package-lock.json'),
      projectRoot: path.join(__dirname, '../../lambda/api'),
    });
    dbCredentials.grantRead(this.businessCheckoutFn);

    // ========================================
    // Search & Discovery Lambda Functions - MOVED to LambdaStack3
    // ========================================
    // this.postsSearchFn = createLambda('PostsSearchFunction', 'posts/search', { memory: 1024 });
    // this.peaksSearchFn = createLambda('PeaksSearchFunction', 'peaks/search', { memory: 1024 });
    // this.hashtagsTrendingFn = createLambda('HashtagsTrendingFunction', 'hashtags/trending');

    // ========================================
    // Feed Variants Lambda Functions - MOVED to LambdaStack3
    // ========================================
    // this.feedOptimizedFn = createLambda('FeedOptimizedFunction', 'feed/optimized', { memory: 2048, timeout: 60 });
    // this.feedFollowingFn = createLambda('FeedFollowingFunction', 'feed/following', { memory: 1024 });
    // this.feedDiscoverFn = createLambda('FeedDiscoverFunction', 'feed/discover', { memory: 1024 });

    // ========================================
    // Posts Batch & Saved Lambda Functions - PARTIALLY MOVED to LambdaStack3
    // ========================================
    // this.postsLikesBatchFn = createLambda('PostsLikesBatchFunction', 'posts/likes-batch');
    // this.postsSavesBatchFn = createLambda('PostsSavesBatchFunction', 'posts/saves-batch');
    this.postsSavedListFn = createLambda('PostsSavedListFunction', 'posts/saved-list');

    // ========================================
    // Interests & Expertise Lambda Functions - MOVED to LambdaStack3
    // ========================================
    // this.interestsListFn = createLambda('InterestsListFunction', 'interests/list');
    // this.expertiseListFn = createLambda('ExpertiseListFunction', 'expertise/list');

    // ========================================
    // Follow Requests Extended Lambda Functions
    // ========================================
    this.followRequestsCountFn = createLambda('FollowRequestsCountFunction', 'follow-requests/count');
    this.followRequestsCheckPendingFn = createLambda('FollowRequestsCheckPendingFunction', 'follow-requests/check-pending');
    this.followRequestsCancelFn = createLambda('FollowRequestsCancelFunction', 'follow-requests/cancel');

    // Note: Spots handlers (list, get, create, update, delete, nearby, save, unsave,
    // is-saved, saved-list, reviews-list, reviews-create, reviews-delete)
    // are deployed via LambdaStackDisputes to stay under CloudFormation limits

    // ========================================
    // Phase 5: Notifications Lambda Functions
    // ========================================
    this.notificationsListFn = createLambda('NotificationsListFunction', 'notifications/list');
    this.notificationsMarkReadFn = createLambda('NotificationsMarkReadFunction', 'notifications/mark-read');
    this.notificationsMarkAllReadFn = createLambda('NotificationsMarkAllReadFunction', 'notifications/mark-all-read');
    this.notificationsUnreadCountFn = createLambda('NotificationsUnreadCountFunction', 'notifications/unread-count');
    this.notificationsPushTokenFn = createLambda('NotificationsPushTokenFunction', 'notifications/push-token');
    this.notificationsDeleteFn = createLambda('NotificationsDeleteFunction', 'notifications/delete');

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
      runtime: lambda.Runtime.NODEJS_22_X,
      memorySize: 256,
      timeout: cdk.Duration.seconds(10),
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      securityGroups: [lambdaSecurityGroup],
      environment: {
        ...lambdaEnvironment,
        MEDIA_BUCKET: mediaBucket.bucketName,
        CDN_DOMAIN: cdk.Fn.importValue(`smuppy-cdn-domain-${environment}`),
      },
      bundling: { minify: true, sourceMap: !isProduction, externalModules: [] },
      tracing: lambda.Tracing.ACTIVE,
      logGroup: apiLogGroup,
      depsLockFilePath: path.join(__dirname, '../../lambda/api/package-lock.json'),
      projectRoot: path.join(__dirname, '../../lambda/api'),
    });
    // Grant S3 PutObject for presigned URL generation
    mediaBucket.grantPut(this.mediaUploadUrlFn);
    // Grant DynamoDB rate limit table access
    this.mediaUploadUrlFn.addToRolePolicy(new iam.PolicyStatement({
      actions: ['dynamodb:UpdateItem', 'dynamodb:GetItem'],
      resources: [`arn:aws:dynamodb:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:table/smuppy-rate-limit-${environment}`],
    }));
    // Grant DB access for account_type lookup (quota enforcement)
    dbCredentials.grantRead(this.mediaUploadUrlFn);
    if (props.rdsProxyArn) {
      this.mediaUploadUrlFn.addToRolePolicy(new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['rds-db:connect'],
        resources: [props.rdsProxyArn],
      }));
    }

    // Upload Quota Lambda - returns daily quota status
    this.mediaUploadQuotaFn = createLambda('MediaUploadQuotaFunction', 'media/upload-quota');
    // Grant DynamoDB GetItem for reading quota counters (createLambda only grants UpdateItem)
    this.mediaUploadQuotaFn.addToRolePolicy(new iam.PolicyStatement({
      actions: ['dynamodb:GetItem'],
      resources: [`arn:aws:dynamodb:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:table/smuppy-rate-limit-${environment}`],
    }));

    // Voice Upload Lambda - presigned S3 URL for voice messages
    this.mediaUploadVoiceFn = new NodejsFunction(this, 'MediaUploadVoiceFunction', {
      entry: path.join(__dirname, '../../lambda/api/media/upload-voice.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_22_X,
      memorySize: 256,
      timeout: cdk.Duration.seconds(10),
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      securityGroups: [lambdaSecurityGroup],
      environment: {
        ...lambdaEnvironment,
        MEDIA_BUCKET: mediaBucket.bucketName,
        CDN_DOMAIN: cdk.Fn.importValue(`smuppy-cdn-domain-${environment}`),
      },
      bundling: { minify: true, sourceMap: !isProduction, externalModules: [] },
      tracing: lambda.Tracing.ACTIVE,
      logGroup: apiLogGroup,
      depsLockFilePath: path.join(__dirname, '../../lambda/api/package-lock.json'),
      projectRoot: path.join(__dirname, '../../lambda/api'),
    });
    dbCredentials.grantRead(this.mediaUploadVoiceFn);
    if (props.rdsProxyArn) {
      this.mediaUploadVoiceFn.addToRolePolicy(new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['rds-db:connect'],
        resources: [props.rdsProxyArn],
      }));
    }
    mediaBucket.grantPut(this.mediaUploadVoiceFn);
    this.mediaUploadVoiceFn.addToRolePolicy(new iam.PolicyStatement({
      actions: ['dynamodb:UpdateItem'],
      resources: [`arn:aws:dynamodb:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:table/smuppy-rate-limit-${environment}`],
    }));

    // ========================================
    // Video Pipeline Lambda Functions
    // ========================================

    // Video Status API — frontend polls this to check HLS readiness
    this.videoStatusFn = createLambda('VideoStatusFunction', 'media/video-status');

    // Start Video Processing — invoked asynchronously after post/peak creation
    this.startVideoProcessingFn = new NodejsFunction(this, 'StartVideoProcessingFunction', {
      entry: path.join(__dirname, '../../lambda/api/media/start-video-processing.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_22_X,
      memorySize: 512,
      timeout: cdk.Duration.seconds(60),
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      securityGroups: [lambdaSecurityGroup],
      environment: {
        ...lambdaEnvironment,
        MEDIA_BUCKET: mediaBucket.bucketName,
        MEDIA_CONVERT_ENDPOINT: `https://mediaconvert.${cdk.Aws.REGION}.amazonaws.com`,
        MEDIA_CONVERT_ROLE_ARN: `arn:aws:iam::${cdk.Aws.ACCOUNT_ID}:role/smuppy-mediaconvert-${environment}`,
        MEDIA_CONVERT_QUEUE_ARN: '',  // Will be set by main stack after queue creation
      },
      bundling: { minify: true, sourceMap: !isProduction, externalModules: [] },
      tracing: lambda.Tracing.ACTIVE,
      logGroup: apiLogGroup,
      depsLockFilePath: path.join(__dirname, '../../lambda/api/package-lock.json'),
      projectRoot: path.join(__dirname, '../../lambda/api'),
    });
    dbCredentials.grantRead(this.startVideoProcessingFn);
    if (props.rdsProxyArn) {
      this.startVideoProcessingFn.addToRolePolicy(new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['rds-db:connect'],
        resources: [props.rdsProxyArn],
      }));
    }
    // Grant MediaConvert CreateJob + PassRole
    this.startVideoProcessingFn.addToRolePolicy(new iam.PolicyStatement({
      actions: ['mediaconvert:CreateJob', 'mediaconvert:GetJob', 'mediaconvert:DescribeEndpoints'],
      resources: ['*'],
    }));
    this.startVideoProcessingFn.addToRolePolicy(new iam.PolicyStatement({
      actions: ['iam:PassRole'],
      resources: [`arn:aws:iam::${cdk.Aws.ACCOUNT_ID}:role/smuppy-mediaconvert-${environment}`],
    }));
    // Grant S3 read for source video
    mediaBucket.grantRead(this.startVideoProcessingFn);

    // Video Processing Complete — EventBridge handler for MediaConvert completion
    this.videoProcessingCompleteFn = new NodejsFunction(this, 'VideoProcessingCompleteFunction', {
      entry: path.join(__dirname, '../../lambda/api/media/video-processing-complete.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_22_X,
      memorySize: 256,
      timeout: cdk.Duration.seconds(30),
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      securityGroups: [lambdaSecurityGroup],
      environment: {
        ...lambdaEnvironment,
        MEDIA_BUCKET: mediaBucket.bucketName,
        CDN_DOMAIN: cdk.Fn.importValue(`smuppy-cdn-domain-${environment}`),
      },
      bundling: { minify: true, sourceMap: !isProduction, externalModules: [] },
      tracing: lambda.Tracing.ACTIVE,
      logGroup: apiLogGroup,
      depsLockFilePath: path.join(__dirname, '../../lambda/api/package-lock.json'),
      projectRoot: path.join(__dirname, '../../lambda/api'),
    });
    dbCredentials.grantRead(this.videoProcessingCompleteFn);
    if (props.rdsProxyArn) {
      this.videoProcessingCompleteFn.addToRolePolicy(new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['rds-db:connect'],
        resources: [props.rdsProxyArn],
      }));
    }

    // Grant Lambda invoke for post/peak create to trigger processing
    this.postsCreateFn.addToRolePolicy(new iam.PolicyStatement({
      actions: ['lambda:InvokeFunction'],
      resources: [this.startVideoProcessingFn.functionArn],
    }));
    this.peaksCreateFn.addToRolePolicy(new iam.PolicyStatement({
      actions: ['lambda:InvokeFunction'],
      resources: [this.startVideoProcessingFn.functionArn],
    }));

    // Grant S3 read for ensureMediaObjectsReady (HeadObject on uploaded media)
    mediaBucket.grantRead(this.postsCreateFn);
    mediaBucket.grantRead(this.peaksCreateFn);
    mediaBucket.grantRead(this.profilesUpdateFn);

    // ========================================
    // Image Optimizer Lambda (Sharp + Blurhash)
    // ========================================
    this.imageOptimizerFn = new NodejsFunction(this, 'ImageOptimizerFunction', {
      entry: path.join(__dirname, '../../lambda/api/media/image-optimizer.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_22_X,
      memorySize: 2048, // Sharp needs RAM for large images
      timeout: cdk.Duration.seconds(60),
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      securityGroups: [lambdaSecurityGroup],
      environment: {
        ...lambdaEnvironment,
        MEDIA_BUCKET: mediaBucket.bucketName,
      },
      bundling: {
        minify: true,
        sourceMap: !isProduction,
        externalModules: [],
        nodeModules: ['sharp'], // npm install instead of esbuild bundle (native binaries)
        forceDockerBundling: true, // Ensure Linux Sharp binaries
      },
      tracing: lambda.Tracing.ACTIVE,
      logGroup: apiLogGroup,
      depsLockFilePath: path.join(__dirname, '../../lambda/api/package-lock.json'),
      projectRoot: path.join(__dirname, '../../lambda'),  // Wider root: Docker mount includes shared/ for ../../shared/db import
    });
    dbCredentials.grantRead(this.imageOptimizerFn);
    mediaBucket.grantReadWrite(this.imageOptimizerFn);

    // EventBridge rule: trigger image optimizer on image uploads
    const imageOptimizerDlq = new sqs.Queue(this, 'ImageOptimizerDLQ', {
      queueName: `smuppy-image-optimizer-dlq-${environment}`,
      retentionPeriod: cdk.Duration.days(14),
      encryption: sqs.QueueEncryption.SQS_MANAGED,
    });

    const imageOptimizerRule = new events.Rule(this, 'ImageOptimizerRule', {
      ruleName: `smuppy-image-optimizer-trigger-${environment}`,
      description: 'Trigger image optimization (resize, blurhash, EXIF strip) on media uploads',
      eventPattern: {
        source: ['aws.s3'],
        detailType: ['Object Created'],
        detail: {
          bucket: {
            name: [mediaBucket.bucketName],
          },
          object: {
            key: [
              { prefix: 'posts/' },
              { prefix: 'peaks/' },
              { prefix: 'users/' },
            ],
          },
        },
      },
    });

    imageOptimizerRule.addTarget(new targets.LambdaFunction(this.imageOptimizerFn, {
      retryAttempts: 2,
      deadLetterQueue: imageOptimizerDlq,
    }));

    // ========================================
    // Payment Lambda Functions (Stripe)
    // ========================================
    this.paymentCreateIntentFn = new NodejsFunction(this, 'PaymentCreateIntentFunction', {
      entry: path.join(__dirname, '../../lambda/api/payments/create-intent.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_22_X,
      memorySize: 256,
      timeout: cdk.Duration.seconds(30),
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      securityGroups: [lambdaSecurityGroup],
      environment: {
        ...lambdaEnvironment,
        STRIPE_SECRET_ARN: stripeSecret.secretArn,
      },
      reservedConcurrentExecutions: 20,
      bundling: { minify: true, sourceMap: !isProduction, externalModules: [] },
      tracing: lambda.Tracing.ACTIVE,
      logGroup: apiLogGroup,
      depsLockFilePath: path.join(__dirname, '../../lambda/api/package-lock.json'),
      projectRoot: path.join(__dirname, '../../lambda/api'),
    });
    dbCredentials.grantRead(this.paymentCreateIntentFn);

    this.paymentWebhookFn = new NodejsFunction(this, 'PaymentWebhookFunction', {
      entry: path.join(__dirname, '../../lambda/api/payments/webhook.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_22_X,
      memorySize: 256,
      timeout: cdk.Duration.seconds(30),
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      securityGroups: [lambdaSecurityGroup],
      environment: {
        ...lambdaEnvironment,
        STRIPE_SECRET_ARN: stripeSecret.secretArn,
        ...(props.alertsTopic ? { SECURITY_ALERTS_TOPIC_ARN: props.alertsTopic.topicArn } : {}),
      },
      deadLetterQueue: criticalDlq,
      retryAttempts: 2,
      reservedConcurrentExecutions: 10,
      bundling: { minify: true, sourceMap: !isProduction, externalModules: [] },
      tracing: lambda.Tracing.ACTIVE,
      logGroup: apiLogGroup,
      depsLockFilePath: path.join(__dirname, '../../lambda/api/package-lock.json'),
      projectRoot: path.join(__dirname, '../../lambda/api'),
    });
    dbCredentials.grantRead(this.paymentWebhookFn);
    if (props.alertsTopic) {
      this.paymentWebhookFn.addToRolePolicy(new iam.PolicyStatement({
        actions: ['sns:Publish'],
        resources: [props.alertsTopic.topicArn],
      }));
    }

    // Subscriptions Lambda - Monthly subscriptions with revenue share
    this.paymentSubscriptionsFn = new NodejsFunction(this, 'PaymentSubscriptionsFunction', {
      entry: path.join(__dirname, '../../lambda/api/payments/subscriptions.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_22_X,
      memorySize: 256,
      timeout: cdk.Duration.seconds(30),
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      securityGroups: [lambdaSecurityGroup],
      environment: {
        ...lambdaEnvironment,
        STRIPE_SECRET_ARN: stripeSecret.secretArn,
      },
      bundling: { minify: true, sourceMap: !isProduction, externalModules: [] },
      tracing: lambda.Tracing.ACTIVE,
      logGroup: apiLogGroup,
      depsLockFilePath: path.join(__dirname, '../../lambda/api/package-lock.json'),
      projectRoot: path.join(__dirname, '../../lambda/api'),
    });
    dbCredentials.grantRead(this.paymentSubscriptionsFn);

    // Stripe Connect Lambda - Creator onboarding for payouts
    this.paymentConnectFn = new NodejsFunction(this, 'PaymentConnectFunction', {
      entry: path.join(__dirname, '../../lambda/api/payments/connect.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_22_X,
      memorySize: 256,
      timeout: cdk.Duration.seconds(30),
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      securityGroups: [lambdaSecurityGroup],
      environment: {
        ...lambdaEnvironment,
        STRIPE_SECRET_ARN: stripeSecret.secretArn,
      },
      bundling: { minify: true, sourceMap: !isProduction, externalModules: [] },
      tracing: lambda.Tracing.ACTIVE,
      logGroup: apiLogGroup,
      depsLockFilePath: path.join(__dirname, '../../lambda/api/package-lock.json'),
      projectRoot: path.join(__dirname, '../../lambda/api'),
    });
    dbCredentials.grantRead(this.paymentConnectFn);

    // Stripe Identity Lambda - Creator verification
    this.paymentIdentityFn = new NodejsFunction(this, 'PaymentIdentityFunction', {
      entry: path.join(__dirname, '../../lambda/api/payments/identity.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_22_X,
      memorySize: 256,
      timeout: cdk.Duration.seconds(30),
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      securityGroups: [lambdaSecurityGroup],
      environment: {
        ...lambdaEnvironment,
        STRIPE_SECRET_ARN: stripeSecret.secretArn,
      },
      bundling: { minify: true, sourceMap: !isProduction, externalModules: [] },
      tracing: lambda.Tracing.ACTIVE,
      logGroup: apiLogGroup,
      depsLockFilePath: path.join(__dirname, '../../lambda/api/package-lock.json'),
      projectRoot: path.join(__dirname, '../../lambda/api'),
    });
    dbCredentials.grantRead(this.paymentIdentityFn);

    // Platform Subscription Lambda - Pro Creator ($99) & Pro Business ($49)
    this.paymentPlatformSubFn = new NodejsFunction(this, 'PaymentPlatformSubFunction', {
      entry: path.join(__dirname, '../../lambda/api/payments/platform-subscription.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_22_X,
      memorySize: 256,
      timeout: cdk.Duration.seconds(30),
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      securityGroups: [lambdaSecurityGroup],
      environment: {
        ...lambdaEnvironment,
        STRIPE_SECRET_ARN: stripeSecret.secretArn,
      },
      bundling: { minify: true, sourceMap: !isProduction, externalModules: [] },
      tracing: lambda.Tracing.ACTIVE,
      logGroup: apiLogGroup,
      depsLockFilePath: path.join(__dirname, '../../lambda/api/package-lock.json'),
      projectRoot: path.join(__dirname, '../../lambda/api'),
    });
    dbCredentials.grantRead(this.paymentPlatformSubFn);

    // Channel Subscription Lambda - Fan subscribing to Creator channels
    this.paymentChannelSubFn = new NodejsFunction(this, 'PaymentChannelSubFunction', {
      entry: path.join(__dirname, '../../lambda/api/payments/channel-subscription.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_22_X,
      memorySize: 256,
      timeout: cdk.Duration.seconds(30),
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      securityGroups: [lambdaSecurityGroup],
      environment: {
        ...lambdaEnvironment,
        STRIPE_SECRET_ARN: stripeSecret.secretArn,
      },
      bundling: { minify: true, sourceMap: !isProduction, externalModules: [] },
      tracing: lambda.Tracing.ACTIVE,
      logGroup: apiLogGroup,
      depsLockFilePath: path.join(__dirname, '../../lambda/api/package-lock.json'),
      projectRoot: path.join(__dirname, '../../lambda/api'),
    });
    dbCredentials.grantRead(this.paymentChannelSubFn);

    // Creator Wallet Lambda - Earnings, transactions, payouts
    this.paymentWalletFn = new NodejsFunction(this, 'PaymentWalletFunction', {
      entry: path.join(__dirname, '../../lambda/api/payments/wallet.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_22_X,
      memorySize: 512,
      timeout: cdk.Duration.seconds(30),
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      securityGroups: [lambdaSecurityGroup],
      environment: {
        ...lambdaEnvironment,
        STRIPE_SECRET_ARN: stripeSecret.secretArn,
      },
      bundling: { minify: true, sourceMap: !isProduction, externalModules: [] },
      tracing: lambda.Tracing.ACTIVE,
      logGroup: apiLogGroup,
      depsLockFilePath: path.join(__dirname, '../../lambda/api/package-lock.json'),
      projectRoot: path.join(__dirname, '../../lambda/api'),
    });
    dbCredentials.grantRead(this.paymentWalletFn);

    // Refunds Lambda - Manual refund processing
    this.paymentRefundsFn = new NodejsFunction(this, 'PaymentRefundsFunction', {
      entry: path.join(__dirname, '../../lambda/api/payments/refunds.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_22_X,
      memorySize: 256,
      timeout: cdk.Duration.seconds(30),
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      securityGroups: [lambdaSecurityGroup],
      environment: {
        ...lambdaEnvironment,
        STRIPE_SECRET_ARN: stripeSecret.secretArn,
      },
      bundling: { minify: true, sourceMap: !isProduction, externalModules: [] },
      tracing: lambda.Tracing.ACTIVE,
      logGroup: apiLogGroup,
      depsLockFilePath: path.join(__dirname, '../../lambda/api/package-lock.json'),
      projectRoot: path.join(__dirname, '../../lambda/api'),
    });
    dbCredentials.grantRead(this.paymentRefundsFn);

    // Payment Methods Lambda - Saved cards management
    this.paymentMethodsFn = new NodejsFunction(this, 'PaymentMethodsFunction', {
      entry: path.join(__dirname, '../../lambda/api/payments/payment-methods.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_22_X,
      memorySize: 256,
      timeout: cdk.Duration.seconds(30),
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      securityGroups: [lambdaSecurityGroup],
      environment: {
        ...lambdaEnvironment,
        STRIPE_SECRET_ARN: stripeSecret.secretArn,
      },
      bundling: { minify: true, sourceMap: !isProduction, externalModules: [] },
      tracing: lambda.Tracing.ACTIVE,
      logGroup: apiLogGroup,
      depsLockFilePath: path.join(__dirname, '../../lambda/api/package-lock.json'),
      projectRoot: path.join(__dirname, '../../lambda/api'),
    });
    dbCredentials.grantRead(this.paymentMethodsFn);

    // Web Checkout Lambda - Stripe Checkout Sessions (avoids 30% app store fees)
    this.paymentWebCheckoutFn = new NodejsFunction(this, 'PaymentWebCheckoutFunction', {
      entry: path.join(__dirname, '../../lambda/api/payments/web-checkout.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_22_X,
      memorySize: 256,
      timeout: cdk.Duration.seconds(30),
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      securityGroups: [lambdaSecurityGroup],
      environment: {
        ...lambdaEnvironment,
        STRIPE_SECRET_ARN: stripeSecret.secretArn,
        APP_SCHEME: 'smuppy',
        WEB_DOMAIN: process.env.WEB_DOMAIN || 'https://smuppy.com',
      },
      bundling: { minify: true, sourceMap: !isProduction, externalModules: [] },
      tracing: lambda.Tracing.ACTIVE,
      logGroup: apiLogGroup,
      depsLockFilePath: path.join(__dirname, '../../lambda/api/package-lock.json'),
      projectRoot: path.join(__dirname, '../../lambda/api'),
    });
    dbCredentials.grantRead(this.paymentWebCheckoutFn);

    // SECURITY: Apply DLQ, Stripe secret access, and reserved concurrency to all payment lambdas
    const allPaymentLambdas = [
      this.paymentCreateIntentFn,
      this.paymentWebhookFn,
      this.paymentSubscriptionsFn,
      this.paymentConnectFn,
      this.paymentIdentityFn,
      this.paymentPlatformSubFn,
      this.paymentChannelSubFn,
      this.paymentWalletFn,
      this.paymentRefundsFn,
      this.paymentMethodsFn,
      this.paymentWebCheckoutFn,
      this.businessCheckoutFn,
    ];
    for (const fn of allPaymentLambdas) {
      stripeSecret.grantRead(fn);

      // Grant Redis auth secret read permission
      if (props.redisAuthSecret) {
        props.redisAuthSecret.grantRead(fn);
      }

      // Grant DynamoDB rate limit table access
      fn.addToRolePolicy(new iam.PolicyStatement({
        actions: ['dynamodb:UpdateItem'],
        resources: [`arn:aws:dynamodb:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:table/smuppy-rate-limit-${environment}`],
      }));

      // Grant RDS Proxy IAM authentication permissions
      if (props.rdsProxyArn) {
        fn.addToRolePolicy(new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: ['rds-db:connect'],
          resources: [props.rdsProxyArn],
        }));
      }
    }

    // Grant Cognito ListUsers to payment Lambdas that need email fallback
    userPool.grant(this.paymentConnectFn, 'cognito-idp:ListUsers');
    userPool.grant(this.paymentChannelSubFn, 'cognito-idp:ListUsers');

    // Account deletion: needs Cognito disable + Stripe subscription cancel
    stripeSecret.grantRead(this.profilesDeleteFn);
    userPool.grant(this.profilesDeleteFn, 'cognito-idp:AdminDisableUser');

    // DLQ for non-intent/webhook payment lambdas (intent & webhook have their own config)
    const paymentLambdasForDlq = [
      this.paymentSubscriptionsFn,
      this.paymentConnectFn,
      this.paymentIdentityFn,
      this.paymentPlatformSubFn,
      this.paymentChannelSubFn,
      this.paymentWalletFn,
      this.paymentRefundsFn,
      this.paymentMethodsFn,
      this.paymentWebCheckoutFn,
      this.businessCheckoutFn,
    ];
    for (const fn of paymentLambdasForDlq) {
      const cfnFn = fn.node.defaultChild as lambda.CfnFunction;
      cfnFn.addPropertyOverride('DeadLetterConfig', {
        TargetArn: criticalDlq.queueArn,
      });
      criticalDlq.grantSendMessages(fn);
    }

    // ========================================
    // Admin Lambda Functions
    // ========================================
    this.adminMigrationFn = new NodejsFunction(this, 'AdminMigrationFunction', {
      entry: path.join(__dirname, '../../lambda/api/admin/run-migration.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_22_X,
      memorySize: 512,
      timeout: cdk.Duration.minutes(5),
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      securityGroups: [lambdaSecurityGroup],
      environment: {
        ...lambdaEnvironment,
        ADMIN_KEY_SECRET_ARN: adminApiKeySecret.secretArn,
      },
      bundling: { minify: true, sourceMap: !isProduction, externalModules: [] },
      tracing: lambda.Tracing.ACTIVE,
      logGroup: adminLogGroup,
      depsLockFilePath: path.join(__dirname, '../../lambda/api/package-lock.json'),
      projectRoot: path.join(__dirname, '../../lambda/api'),
    });
    dbCredentials.grantRead(this.adminMigrationFn);
    adminApiKeySecret.grantRead(this.adminMigrationFn);
    // Grant RDS Proxy IAM authentication for admin migration
    if (props.rdsProxyArn) {
      this.adminMigrationFn.addToRolePolicy(new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['rds-db:connect'],
        resources: [props.rdsProxyArn],
      }));
    }

    this.dataMigrationFn = new NodejsFunction(this, 'DataMigrationFunction', {
      entry: path.join(__dirname, '../../lambda/api/admin/migrate-data.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_22_X,
      memorySize: 2048,
      // SECURITY: 10min max for admin migration — protected by admin API key auth
      timeout: cdk.Duration.minutes(10),
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      securityGroups: [lambdaSecurityGroup],
      environment: {
        ...lambdaEnvironment,
        ADMIN_KEY_SECRET_ARN: adminApiKeySecret.secretArn,
      },
      bundling: { minify: true, sourceMap: !isProduction, externalModules: [] },
      tracing: lambda.Tracing.ACTIVE,
      logGroup: adminLogGroup,
      depsLockFilePath: path.join(__dirname, '../../lambda/api/package-lock.json'),
      projectRoot: path.join(__dirname, '../../lambda/api'),
    });
    dbCredentials.grantRead(this.dataMigrationFn);
    adminApiKeySecret.grantRead(this.dataMigrationFn);
    // Grant RDS Proxy IAM authentication for data migration
    if (props.rdsProxyArn) {
      this.dataMigrationFn.addToRolePolicy(new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['rds-db:connect'],
        resources: [props.rdsProxyArn],
      }));
    }

    this.checkProfilesFn = new NodejsFunction(this, 'CheckProfilesFunction', {
      entry: path.join(__dirname, '../../lambda/api/admin/check-profiles.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_22_X,
      memorySize: 256,
      timeout: cdk.Duration.seconds(30),
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      securityGroups: [lambdaSecurityGroup],
      environment: lambdaEnvironment,
      bundling: { minify: true, sourceMap: !isProduction, externalModules: [] },
      depsLockFilePath: path.join(__dirname, '../../lambda/api/package-lock.json'),
      projectRoot: path.join(__dirname, '../../lambda/api'),
    });
    dbCredentials.grantRead(this.checkProfilesFn);
    adminApiKeySecret.grantRead(this.checkProfilesFn);
    if (props.rdsProxyArn) {
      this.checkProfilesFn.addToRolePolicy(new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['rds-db:connect'],
        resources: [props.rdsProxyArn],
      }));
    }

    this.userMigrationFn = new NodejsFunction(this, 'UserMigrationFunction', {
      entry: path.join(__dirname, '../../lambda/api/admin/migrate-users.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_22_X,
      memorySize: 1024,
      // SECURITY: 10min max for admin migration — protected by admin API key auth
      timeout: cdk.Duration.minutes(10),
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      securityGroups: [lambdaSecurityGroup],
      environment: {
        ...lambdaEnvironment,
        ADMIN_KEY_SECRET_ARN: adminApiKeySecret.secretArn,
      },
      bundling: { minify: true, sourceMap: !isProduction, externalModules: [] },
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
    if (props.rdsProxyArn) {
      this.userMigrationFn.addToRolePolicy(new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['rds-db:connect'],
        resources: [props.rdsProxyArn],
      }));
    }

    // ========================================
    // Scheduled: Refresh Bot Peaks (every 24h)
    // ========================================
    const refreshBotPeaksFn = new NodejsFunction(this, 'RefreshBotPeaksFunction', {
      entry: path.join(__dirname, '../../lambda/api/admin/refresh-bot-peaks.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_22_X,
      memorySize: 256,
      timeout: cdk.Duration.minutes(2),
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      securityGroups: [lambdaSecurityGroup],
      environment: lambdaEnvironment,
      bundling: { minify: true, sourceMap: !isProduction, externalModules: [] },
      tracing: lambda.Tracing.ACTIVE,
      logGroup: adminLogGroup,
      depsLockFilePath: path.join(__dirname, '../../lambda/api/package-lock.json'),
      projectRoot: path.join(__dirname, '../../lambda/api'),
    });
    dbCredentials.grantRead(refreshBotPeaksFn);

    // Trigger every 24h at 5:00 AM UTC
    const refreshBotPeaksDlq = new sqs.Queue(this, 'RefreshBotPeaksDLQ', {
      queueName: `smuppy-refresh-bot-peaks-dlq-${environment}`,
      retentionPeriod: cdk.Duration.days(14),
      encryption: sqs.QueueEncryption.SQS_MANAGED,
    });

    new events.Rule(this, 'RefreshBotPeaksSchedule', {
      schedule: events.Schedule.cron({ hour: '5', minute: '0' }),
      targets: [new targets.LambdaFunction(refreshBotPeaksFn, {
        retryAttempts: 2,
        deadLetterQueue: refreshBotPeaksDlq,
      })],
      description: 'Refresh bot peaks every 24h to keep feeds populated',
    });

    // ========================================
    // Scheduled: Cleanup expired peaks (S3 + DB)
    // ========================================
    const peaksCleanupFn = new NodejsFunction(this, 'PeaksCleanupFunction', {
      entry: path.join(__dirname, '../../lambda/api/peaks/cleanup-expired.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_22_X,
      memorySize: 512,
      timeout: cdk.Duration.seconds(120),
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      securityGroups: [lambdaSecurityGroup],
      environment: lambdaEnvironment,
      bundling: { minify: true, sourceMap: !isProduction, externalModules: [] },
      tracing: lambda.Tracing.ACTIVE,
      logGroup: apiLogGroup,
      depsLockFilePath: path.join(__dirname, '../../lambda/api/package-lock.json'),
      projectRoot: path.join(__dirname, '../../lambda/api'),
    });
    dbCredentials.grantRead(peaksCleanupFn);
    mediaBucket.grantDelete(peaksCleanupFn);

    // Run daily at 3:00 AM UTC (off-peak)
    const peaksCleanupDlq = new sqs.Queue(this, 'PeaksCleanupDLQ', {
      queueName: `smuppy-peaks-cleanup-dlq-${environment}`,
      retentionPeriod: cdk.Duration.days(14),
      encryption: sqs.QueueEncryption.SQS_MANAGED,
    });

    new events.Rule(this, 'PeaksCleanupSchedule', {
      schedule: events.Schedule.cron({ hour: '3', minute: '0' }),
      targets: [new targets.LambdaFunction(peaksCleanupFn, {
        retryAttempts: 2,
        deadLetterQueue: peaksCleanupDlq,
      })],
      description: 'Clean up expired peaks S3 media and DB records daily',
    });

    // ========================================
    // Scheduled: Hard-delete accounts past 30-day grace period (GDPR Art. 17)
    // ========================================
    const accountsCleanupFn = new NodejsFunction(this, 'AccountsCleanupFunction', {
      entry: path.join(__dirname, '../../lambda/api/profiles/cleanup-deleted.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_22_X,
      memorySize: 512,
      timeout: cdk.Duration.seconds(120),
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      securityGroups: [lambdaSecurityGroup],
      environment: lambdaEnvironment,
      bundling: { minify: true, sourceMap: !isProduction, externalModules: [] },
      tracing: lambda.Tracing.ACTIVE,
      logGroup: apiLogGroup,
      depsLockFilePath: path.join(__dirname, '../../lambda/api/package-lock.json'),
      projectRoot: path.join(__dirname, '../../lambda/api'),
    });
    dbCredentials.grantRead(accountsCleanupFn);
    mediaBucket.grantDelete(accountsCleanupFn);
    mediaBucket.grantRead(accountsCleanupFn);
    userPool.grant(accountsCleanupFn, 'cognito-idp:AdminDeleteUser');

    // Run daily at 4:00 AM UTC (off-peak, after peaks cleanup at 3:00 AM)
    const accountsCleanupDlq = new sqs.Queue(this, 'AccountsCleanupDLQ', {
      queueName: `smuppy-accounts-cleanup-dlq-${environment}`,
      retentionPeriod: cdk.Duration.days(14),
      encryption: sqs.QueueEncryption.SQS_MANAGED,
    });

    new events.Rule(this, 'AccountsCleanupSchedule', {
      schedule: events.Schedule.cron({ hour: '4', minute: '0' }),
      targets: [new targets.LambdaFunction(accountsCleanupFn, {
        retryAttempts: 2,
        deadLetterQueue: accountsCleanupDlq,
      })],
      description: 'Hard-delete accounts past 30-day grace period (GDPR Art. 17)',
    });

    // ========================================
    // Auth Lambda Functions
    // ========================================
    this.appleAuthFn = new NodejsFunction(this, 'AppleAuthFunction', {
      entry: path.join(__dirname, '../../lambda/api/auth/apple.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_22_X,
      memorySize: 256,
      timeout: cdk.Duration.seconds(30),
      reservedConcurrentExecutions: 20,
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      securityGroups: [lambdaSecurityGroup],
      environment: {
        ...lambdaEnvironment,
        APPLE_CLIENT_ID: 'com.nou09.Smuppy',
        CLIENT_ID: userPoolClientId,
      },
      bundling: { minify: true, sourceMap: !isProduction, externalModules: [] },
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
        'cognito-idp:ListUsers',
      ],
      resources: [userPool.userPoolArn],
    }));
    dbCredentials.grantRead(this.appleAuthFn);
    this.appleAuthFn.addToRolePolicy(new iam.PolicyStatement({
      actions: ['dynamodb:UpdateItem'],
      resources: [`arn:aws:dynamodb:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:table/smuppy-rate-limit-${environment}`],
    }));

    // SECURITY: Google OAuth credentials - use placeholder in staging to prevent runtime errors
    // Production requires real credentials (validated above)
    const googleIosClientId = process.env.GOOGLE_IOS_CLIENT_ID || (isProduction ? '' : 'STAGING_PLACEHOLDER');
    const googleAndroidClientId = process.env.GOOGLE_ANDROID_CLIENT_ID || (isProduction ? '' : 'STAGING_PLACEHOLDER');
    const googleWebClientId = process.env.GOOGLE_WEB_CLIENT_ID || (isProduction ? '' : 'STAGING_PLACEHOLDER');

    this.googleAuthFn = new NodejsFunction(this, 'GoogleAuthFunction', {
      entry: path.join(__dirname, '../../lambda/api/auth/google.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_22_X,
      memorySize: 256,
      timeout: cdk.Duration.seconds(30),
      reservedConcurrentExecutions: 20,
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
      bundling: { minify: true, sourceMap: !isProduction, externalModules: [] },
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
        'cognito-idp:ListUsers',
      ],
      resources: [userPool.userPoolArn],
    }));
    dbCredentials.grantRead(this.googleAuthFn);
    this.googleAuthFn.addToRolePolicy(new iam.PolicyStatement({
      actions: ['dynamodb:UpdateItem'],
      resources: [`arn:aws:dynamodb:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:table/smuppy-rate-limit-${environment}`],
    }));

    this.signupAuthFn = new NodejsFunction(this, 'SignupAuthFunction', {
      entry: path.join(__dirname, '../../lambda/api/auth/signup.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_22_X,
      memorySize: 256,
      timeout: cdk.Duration.seconds(30),
      reservedConcurrentExecutions: 20,
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      securityGroups: [lambdaSecurityGroup],
      environment: {
        ...lambdaEnvironment,
        CLIENT_ID: userPoolClientId,
        RATE_LIMIT_TABLE: `smuppy-rate-limit-${environment}`,
      },
      bundling: { minify: true, sourceMap: !isProduction, externalModules: [] },
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
        'cognito-idp:ListUsers',
      ],
      resources: [userPool.userPoolArn],
    }));
    this.signupAuthFn.addToRolePolicy(new iam.PolicyStatement({
      actions: [
        'dynamodb:GetItem',
        'dynamodb:PutItem',
        'dynamodb:UpdateItem',
      ],
      resources: [`arn:aws:dynamodb:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:table/smuppy-rate-limit-${environment}`],
    }));

    this.validateEmailFn = new NodejsFunction(this, 'ValidateEmailFunction', {
      entry: path.join(__dirname, '../../lambda/api/auth/validate-email.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_22_X,
      memorySize: 256,
      timeout: cdk.Duration.seconds(10),
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      securityGroups: [lambdaSecurityGroup],
      environment: {
        NODE_ENV: environment,
        RATE_LIMIT_TABLE: `smuppy-rate-limit-${environment}`,
      },
      bundling: { minify: true, sourceMap: !isProduction, externalModules: [] },
      tracing: lambda.Tracing.ACTIVE,
      logGroup: authLogGroup,
      depsLockFilePath: path.join(__dirname, '../../lambda/api/package-lock.json'),
      projectRoot: path.join(__dirname, '../../lambda/api'),
    });
    this.validateEmailFn.addToRolePolicy(new iam.PolicyStatement({
      actions: ['dynamodb:UpdateItem'],
      resources: [`arn:aws:dynamodb:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:table/smuppy-rate-limit-${environment}`],
    }));

    this.confirmSignupFn = new NodejsFunction(this, 'ConfirmSignupFunction', {
      entry: path.join(__dirname, '../../lambda/api/auth/confirm-signup.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_22_X,
      memorySize: 256,
      timeout: cdk.Duration.seconds(10),
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      securityGroups: [lambdaSecurityGroup],
      environment: {
        ...lambdaEnvironment,
        CLIENT_ID: userPoolClientId,
        USER_POOL_ID: userPool.userPoolId,
        RATE_LIMIT_TABLE: `smuppy-rate-limit-${environment}`,
      },
      bundling: { minify: true, sourceMap: !isProduction, externalModules: [] },
      tracing: lambda.Tracing.ACTIVE,
      logGroup: authLogGroup,
      depsLockFilePath: path.join(__dirname, '../../lambda/api/package-lock.json'),
      projectRoot: path.join(__dirname, '../../lambda/api'),
    });
    // Grant ListUsers permission to lookup user by email
    userPool.grant(this.confirmSignupFn, 'cognito-idp:ListUsers');
    this.confirmSignupFn.addToRolePolicy(new iam.PolicyStatement({
      actions: ['dynamodb:UpdateItem'],
      resources: [`arn:aws:dynamodb:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:table/smuppy-rate-limit-${environment}`],
    }));

    this.resendCodeFn = new NodejsFunction(this, 'ResendCodeFunction', {
      entry: path.join(__dirname, '../../lambda/api/auth/resend-code.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_22_X,
      memorySize: 256,
      timeout: cdk.Duration.seconds(10),
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      securityGroups: [lambdaSecurityGroup],
      environment: {
        ...lambdaEnvironment,
        CLIENT_ID: userPoolClientId,
        USER_POOL_ID: userPool.userPoolId,
        RATE_LIMIT_TABLE: `smuppy-rate-limit-${environment}`,
      },
      bundling: { minify: true, sourceMap: !isProduction, externalModules: [] },
      tracing: lambda.Tracing.ACTIVE,
      logGroup: authLogGroup,
      depsLockFilePath: path.join(__dirname, '../../lambda/api/package-lock.json'),
      projectRoot: path.join(__dirname, '../../lambda/api'),
    });
    // Grant ListUsers permission to lookup user by email
    userPool.grant(this.resendCodeFn, 'cognito-idp:ListUsers');
    this.resendCodeFn.addToRolePolicy(new iam.PolicyStatement({
      actions: ['dynamodb:UpdateItem'],
      resources: [`arn:aws:dynamodb:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:table/smuppy-rate-limit-${environment}`],
    }));

    this.forgotPasswordFn = new NodejsFunction(this, 'ForgotPasswordFunction', {
      entry: path.join(__dirname, '../../lambda/api/auth/forgot-password.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_22_X,
      memorySize: 256,
      timeout: cdk.Duration.seconds(10),
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      securityGroups: [lambdaSecurityGroup],
      environment: {
        ...lambdaEnvironment,
        CLIENT_ID: userPoolClientId,
        USER_POOL_ID: userPool.userPoolId,
        RATE_LIMIT_TABLE: `smuppy-rate-limit-${environment}`,
      },
      bundling: { minify: true, sourceMap: !isProduction, externalModules: [] },
      tracing: lambda.Tracing.ACTIVE,
      logGroup: authLogGroup,
      depsLockFilePath: path.join(__dirname, '../../lambda/api/package-lock.json'),
      projectRoot: path.join(__dirname, '../../lambda/api'),
    });
    // Grant ListUsers permission to lookup user by email
    userPool.grant(this.forgotPasswordFn, 'cognito-idp:ListUsers');
    this.forgotPasswordFn.addToRolePolicy(new iam.PolicyStatement({
      actions: ['dynamodb:UpdateItem'],
      resources: [`arn:aws:dynamodb:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:table/smuppy-rate-limit-${environment}`],
    }));

    this.confirmForgotPasswordFn = new NodejsFunction(this, 'ConfirmForgotPasswordFunction', {
      entry: path.join(__dirname, '../../lambda/api/auth/confirm-forgot-password.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_22_X,
      memorySize: 256,
      timeout: cdk.Duration.seconds(10),
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      securityGroups: [lambdaSecurityGroup],
      environment: {
        ...lambdaEnvironment,
        CLIENT_ID: userPoolClientId,
        USER_POOL_ID: userPool.userPoolId,
        RATE_LIMIT_TABLE: `smuppy-rate-limit-${environment}`,
      },
      bundling: { minify: true, sourceMap: !isProduction, externalModules: [] },
      tracing: lambda.Tracing.ACTIVE,
      logGroup: authLogGroup,
      depsLockFilePath: path.join(__dirname, '../../lambda/api/package-lock.json'),
      projectRoot: path.join(__dirname, '../../lambda/api'),
    });
    // Grant ListUsers permission to lookup user by email
    userPool.grant(this.confirmForgotPasswordFn, 'cognito-idp:ListUsers');
    this.confirmForgotPasswordFn.addToRolePolicy(new iam.PolicyStatement({
      actions: ['dynamodb:UpdateItem'],
      resources: [`arn:aws:dynamodb:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:table/smuppy-rate-limit-${environment}`],
    }));

    this.checkUserFn = new NodejsFunction(this, 'CheckUserFunction', {
      entry: path.join(__dirname, '../../lambda/api/auth/check-user.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_22_X,
      memorySize: 256,
      timeout: cdk.Duration.seconds(10),
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      securityGroups: [lambdaSecurityGroup],
      environment: {
        ...lambdaEnvironment,
        USER_POOL_ID: userPool.userPoolId,
        RATE_LIMIT_TABLE: `smuppy-rate-limit-${environment}`,
      },
      bundling: { minify: true, sourceMap: !isProduction, externalModules: [] },
      tracing: lambda.Tracing.ACTIVE,
      logGroup: authLogGroup,
      depsLockFilePath: path.join(__dirname, '../../lambda/api/package-lock.json'),
      projectRoot: path.join(__dirname, '../../lambda/api'),
    });
    userPool.grant(this.checkUserFn, 'cognito-idp:AdminGetUser', 'cognito-idp:ListUsers');
    this.checkUserFn.addToRolePolicy(new iam.PolicyStatement({
      actions: ['dynamodb:UpdateItem'],
      resources: [`arn:aws:dynamodb:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:table/smuppy-rate-limit-${environment}`],
    }));

    // ========================================
    // Auth - WebSocket Token Lambda
    // ========================================
    this.wsTokenFn = new NodejsFunction(this, 'WsTokenFunction', {
      entry: path.join(__dirname, '../../lambda/api/auth/ws-token.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_22_X,
      memorySize: 256,
      timeout: cdk.Duration.seconds(10),
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      securityGroups: [lambdaSecurityGroup],
      environment: {
        ...lambdaEnvironment,
        WS_TOKENS_TABLE: `smuppy-ws-tokens-${environment}`,
      },
      bundling: { minify: true, sourceMap: !isProduction, externalModules: [] },
      tracing: lambda.Tracing.ACTIVE,
      logGroup: authLogGroup,
      depsLockFilePath: path.join(__dirname, '../../lambda/api/package-lock.json'),
      projectRoot: path.join(__dirname, '../../lambda/api'),
    });
    dbCredentials.grantRead(this.wsTokenFn);
    this.wsTokenFn.addToRolePolicy(new iam.PolicyStatement({
      actions: ['dynamodb:PutItem'],
      resources: [`arn:aws:dynamodb:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:table/smuppy-ws-tokens-${environment}`],
    }));

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
      runtime: lambda.Runtime.NODEJS_22_X,
      memorySize: 256,
      timeout: cdk.Duration.seconds(10),
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      securityGroups: [lambdaSecurityGroup],
      environment: {
        ...lambdaEnvironment,
        CLIENT_ID: userPoolClientId,
      },
      bundling: { minify: true, sourceMap: !isProduction, externalModules: [] },
      tracing: lambda.Tracing.ACTIVE,
      logGroup: wsLogGroup,
      depsLockFilePath: path.join(__dirname, '../../lambda/websocket/package-lock.json'),
      projectRoot: path.join(__dirname, '../../lambda/websocket'),
    });
    dbCredentials.grantRead(this.wsConnectFn);

    this.wsDisconnectFn = new NodejsFunction(this, 'WsDisconnectFunction', {
      entry: path.join(__dirname, '../../lambda/websocket/disconnect.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_22_X,
      memorySize: 256,
      timeout: cdk.Duration.seconds(10),
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      securityGroups: [lambdaSecurityGroup],
      environment: lambdaEnvironment,
      bundling: { minify: true, sourceMap: !isProduction, externalModules: [] },
      tracing: lambda.Tracing.ACTIVE,
      logGroup: wsLogGroup,
      depsLockFilePath: path.join(__dirname, '../../lambda/websocket/package-lock.json'),
      projectRoot: path.join(__dirname, '../../lambda/websocket'),
    });
    dbCredentials.grantRead(this.wsDisconnectFn);

    this.wsSendMessageFn = new NodejsFunction(this, 'WsSendMessageFunction', {
      entry: path.join(__dirname, '../../lambda/websocket/send-message.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_22_X,
      memorySize: 512,
      timeout: cdk.Duration.seconds(30),
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      securityGroups: [lambdaSecurityGroup],
      environment: lambdaEnvironment,
      bundling: { minify: true, sourceMap: !isProduction, externalModules: [] },
      tracing: lambda.Tracing.ACTIVE,
      logGroup: wsLogGroup,
      depsLockFilePath: path.join(__dirname, '../../lambda/websocket/package-lock.json'),
      projectRoot: path.join(__dirname, '../../lambda/websocket'),
    });
    dbCredentials.grantRead(this.wsSendMessageFn);

    this.wsDefaultFn = new NodejsFunction(this, 'WsDefaultFunction', {
      entry: path.join(__dirname, '../../lambda/websocket/default.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_22_X,
      memorySize: 128,
      timeout: cdk.Duration.seconds(5),
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      securityGroups: [lambdaSecurityGroup],
      environment: lambdaEnvironment,
      bundling: { minify: true, sourceMap: !isProduction, externalModules: [] },
      tracing: lambda.Tracing.ACTIVE,
      logGroup: wsLogGroup,
      depsLockFilePath: path.join(__dirname, '../../lambda/websocket/package-lock.json'),
      projectRoot: path.join(__dirname, '../../lambda/websocket'),
    });

    // Live Stream WebSocket Handler
    this.wsLiveStreamFn = new NodejsFunction(this, 'WsLiveStreamFunction', {
      entry: path.join(__dirname, '../../lambda/websocket/live-stream.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_22_X,
      memorySize: 256,
      timeout: cdk.Duration.seconds(10),
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      securityGroups: [lambdaSecurityGroup],
      environment: lambdaEnvironment,
      bundling: { minify: true, sourceMap: !isProduction, externalModules: [] },
      tracing: lambda.Tracing.ACTIVE,
      logGroup: wsLogGroup,
      depsLockFilePath: path.join(__dirname, '../../lambda/websocket/package-lock.json'),
      projectRoot: path.join(__dirname, '../../lambda/websocket'),
    });
    dbCredentials.grantRead(this.wsLiveStreamFn);

    // ========== Comprehend IAM for content moderation Lambdas ==========
    const comprehendLambdas = [
      this.postsCreateFn,
      this.commentsCreateFn,
      this.commentsUpdateFn,
      this.peaksCreateFn,
      this.peaksCommentFn,
      this.conversationsSendMessageFn,
      this.profilesUpdateFn,
      this.tipsSendFn,
      this.liveStreamsStartFn,
      // WebSocket handlers that use text moderation
      this.wsSendMessageFn,
      this.wsLiveStreamFn,
    ];
    for (const fn of comprehendLambdas) {
      fn.addToRolePolicy(new iam.PolicyStatement({
        actions: ['comprehend:DetectToxicContent'],
        // Comprehend is a stateless API — resource-level ARNs are not supported by AWS
        resources: ['*'],
        conditions: {
          StringEquals: { 'aws:RequestedRegion': cdk.Stack.of(this).region },
        },
      }));
    }

    // ========== CloudWatch Alarms for critical Lambdas ==========
    const cloudwatch = cdk.aws_cloudwatch;

    // Payment webhook errors
    const paymentWebhookErrorsAlarm = new cloudwatch.Alarm(this, 'PaymentWebhookErrorsAlarm', {
      metric: this.paymentWebhookFn.metricErrors({ period: cdk.Duration.minutes(5) }),
      threshold: 1,
      evaluationPeriods: 1,
      alarmDescription: 'Payment webhook Lambda is erroring',
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    if (props.alertsTopic) {
      paymentWebhookErrorsAlarm.addAlarmAction(new cloudwatchActions.SnsAction(props.alertsTopic));
    }

    // Payment webhook throttles
    const paymentWebhookThrottlesAlarm = new cloudwatch.Alarm(this, 'PaymentWebhookThrottlesAlarm', {
      metric: this.paymentWebhookFn.metricThrottles({ period: cdk.Duration.minutes(5) }),
      threshold: 1,
      evaluationPeriods: 1,
      alarmDescription: 'Payment webhook Lambda is being throttled',
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    if (props.alertsTopic) {
      paymentWebhookThrottlesAlarm.addAlarmAction(new cloudwatchActions.SnsAction(props.alertsTopic));
    }

    // Payment create-intent errors
    const paymentCreateIntentErrorsAlarm = new cloudwatch.Alarm(this, 'PaymentCreateIntentErrorsAlarm', {
      metric: this.paymentCreateIntentFn.metricErrors({ period: cdk.Duration.minutes(5) }),
      threshold: 3,
      evaluationPeriods: 1,
      alarmDescription: 'Payment create-intent Lambda is erroring',
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    if (props.alertsTopic) {
      paymentCreateIntentErrorsAlarm.addAlarmAction(new cloudwatchActions.SnsAction(props.alertsTopic));
    }

    // DLQ messages alarm
    const criticalDlqAlarm = new cloudwatch.Alarm(this, 'CriticalDLQAlarm', {
      metric: criticalDlq.metricApproximateNumberOfMessagesVisible({ period: cdk.Duration.minutes(5) }),
      threshold: 1,
      evaluationPeriods: 1,
      alarmDescription: 'Messages in critical DLQ — failed Lambda invocations',
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    if (props.alertsTopic) {
      criticalDlqAlarm.addAlarmAction(new cloudwatchActions.SnsAction(props.alertsTopic));
    }

    // Auth Lambda errors — users cannot sign up/login
    const authErrorsAlarm = new cloudwatch.Alarm(this, 'AuthErrorsAlarm', {
      metric: this.signupAuthFn.metricErrors({ period: cdk.Duration.minutes(5) }),
      threshold: 3,
      evaluationPeriods: 1,
      alarmDescription: 'Auth Lambda is erroring — users cannot sign up/login',
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    if (props.alertsTopic) {
      authErrorsAlarm.addAlarmAction(new cloudwatchActions.SnsAction(props.alertsTopic));
    }

    // Feed Lambda errors — users see empty feed
    const feedErrorsAlarm = new cloudwatch.Alarm(this, 'FeedErrorsAlarm', {
      metric: this.feedGetFn.metricErrors({ period: cdk.Duration.minutes(5) }),
      threshold: 5,
      evaluationPeriods: 2,
      alarmDescription: 'Feed Lambda is erroring — users see empty feed',
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    if (props.alertsTopic) {
      feedErrorsAlarm.addAlarmAction(new cloudwatchActions.SnsAction(props.alertsTopic));
    }

    // Messaging Lambda errors — DMs broken
    const messagingErrorsAlarm = new cloudwatch.Alarm(this, 'MessagingErrorsAlarm', {
      metric: this.conversationsSendMessageFn.metricErrors({ period: cdk.Duration.minutes(5) }),
      threshold: 3,
      evaluationPeriods: 1,
      alarmDescription: 'Messaging Lambda is erroring — DMs broken',
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    if (props.alertsTopic) {
      messagingErrorsAlarm.addAlarmAction(new cloudwatchActions.SnsAction(props.alertsTopic));
    }

    // Image Optimizer DLQ alarm
    const imageOptimizerDlqAlarm = new cloudwatch.Alarm(this, 'ImageOptimizerDLQAlarm', {
      metric: imageOptimizerDlq.metricApproximateNumberOfMessagesVisible({ period: cdk.Duration.minutes(5) }),
      threshold: 1,
      evaluationPeriods: 1,
      alarmDescription: 'Messages in image optimizer DLQ — image processing failures',
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    if (props.alertsTopic) {
      imageOptimizerDlqAlarm.addAlarmAction(new cloudwatchActions.SnsAction(props.alertsTopic));
    }

    // Scheduled tasks DLQ alarm (combined — any scheduled task failure)
    const scheduledTasksDlqAlarm = new cloudwatch.Alarm(this, 'ScheduledTasksDLQAlarm', {
      metric: new cloudwatch.MathExpression({
        expression: 'botDlq + peaksDlq + accountsDlq',
        usingMetrics: {
          botDlq: refreshBotPeaksDlq.metricApproximateNumberOfMessagesVisible({ period: cdk.Duration.minutes(5) }),
          peaksDlq: peaksCleanupDlq.metricApproximateNumberOfMessagesVisible({ period: cdk.Duration.minutes(5) }),
          accountsDlq: accountsCleanupDlq.metricApproximateNumberOfMessagesVisible({ period: cdk.Duration.minutes(5) }),
        },
      }),
      threshold: 1,
      evaluationPeriods: 1,
      alarmDescription: 'Messages in scheduled tasks DLQ — cleanup job failures',
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    if (props.alertsTopic) {
      scheduledTasksDlqAlarm.addAlarmAction(new cloudwatchActions.SnsAction(props.alertsTopic));
    }

    // ========================================
    // Provisioned Concurrency with Auto-Scaling
    // Reduces cold starts for critical user-facing paths
    // ========================================
    const addProvisionedConcurrency = (
      fn: NodejsFunction,
      name: string,
      minCapacity: number,
      maxCapacity: number,
    ): lambda.IFunction => {
      const alias = new lambda.Alias(this, `${name}Alias`, {
        aliasName: 'live',
        version: fn.currentVersion,
        provisionedConcurrentExecutions: minCapacity,
      });

      const scalingTarget = alias.addAutoScaling({
        minCapacity,
        maxCapacity,
      });
      scalingTarget.scaleOnUtilization({
        utilizationTarget: 0.7,
        scaleInCooldown: cdk.Duration.minutes(3),
        scaleOutCooldown: cdk.Duration.minutes(1),
      });

      return alias;
    };

    const minPC = isProduction ? 5 : 1;
    const maxPC = isProduction ? 50 : 5;
    const minPCHigh = isProduction ? 10 : 2;
    const maxPCHigh = isProduction ? 100 : 10;

    this.feedGetAlias = addProvisionedConcurrency(this.feedGetFn, 'FeedGet', minPCHigh, maxPCHigh);
    this.postsListAlias = addProvisionedConcurrency(this.postsListFn, 'PostsList', minPC, maxPC);
    this.postsCreateAlias = addProvisionedConcurrency(this.postsCreateFn, 'PostsCreate', minPC, maxPC);
    this.profilesGetAlias = addProvisionedConcurrency(this.profilesGetFn, 'ProfilesGet', minPC, maxPC);
    this.peaksListAlias = addProvisionedConcurrency(this.peaksListFn, 'PeaksList', minPC, maxPC);
    this.conversationsListAlias = addProvisionedConcurrency(this.conversationsListFn, 'ConversationsList', minPC, maxPC);
    this.conversationsSendMessageAlias = addProvisionedConcurrency(this.conversationsSendMessageFn, 'ConversationsSendMessage', minPC, maxPC);
    this.notificationsListAlias = addProvisionedConcurrency(this.notificationsListFn, 'NotificationsList', minPC, maxPC);
    this.signupAuthAlias = addProvisionedConcurrency(this.signupAuthFn, 'SignupAuth', minPC, maxPC);
    this.appleAuthAlias = addProvisionedConcurrency(this.appleAuthFn, 'AppleAuth', minPC, maxPC);
  }
}

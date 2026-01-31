import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as sqs from 'aws-cdk-lib/aws-sqs';
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

  // Challenges
  public readonly challengesCreateFn: NodejsFunction;
  public readonly challengesListFn: NodejsFunction;
  public readonly challengesRespondFn: NodejsFunction;

  // Battles
  public readonly battlesCreateFn: NodejsFunction;
  public readonly battlesJoinFn: NodejsFunction;

  // Events
  public readonly eventsCreateFn: NodejsFunction;
  public readonly eventsListFn: NodejsFunction;
  public readonly eventsJoinFn: NodejsFunction;

  // Groups
  public readonly groupsCreateFn: NodejsFunction;
  public readonly groupsListFn: NodejsFunction;
  public readonly groupsGetFn: NodejsFunction;
  public readonly groupsJoinFn: NodejsFunction;
  public readonly groupsLeaveFn: NodejsFunction;

  // Content Moderation: Reports
  public readonly reportsPostFn: NodejsFunction;
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

  // Search & Discovery
  public readonly postsSearchFn: NodejsFunction;
  public readonly peaksSearchFn: NodejsFunction;
  public readonly hashtagsTrendingFn: NodejsFunction;

  // Feed Variants
  public readonly feedOptimizedFn: NodejsFunction;
  public readonly feedFollowingFn: NodejsFunction;
  public readonly feedDiscoverFn: NodejsFunction;

  // Posts Batch & Saved
  public readonly postsLikesBatchFn: NodejsFunction;
  public readonly postsSavesBatchFn: NodejsFunction;
  public readonly postsSavedListFn: NodejsFunction;

  // Interests & Expertise
  public readonly interestsListFn: NodejsFunction;
  public readonly expertiseListFn: NodejsFunction;

  // Follow Requests - Extended
  public readonly followRequestsCountFn: NodejsFunction;
  public readonly followRequestsCheckPendingFn: NodejsFunction;
  public readonly followRequestsCancelFn: NodejsFunction;

  // Media - Voice Upload
  public readonly mediaUploadVoiceFn: NodejsFunction;

  // Spots
  public readonly spotsListFn: NodejsFunction;
  public readonly spotsGetFn: NodejsFunction;
  public readonly spotsCreateFn: NodejsFunction;
  public readonly spotsUpdateFn: NodejsFunction;
  public readonly spotsDeleteFn: NodejsFunction;
  public readonly spotsNearbyFn: NodejsFunction;
  public readonly spotsSaveFn: NodejsFunction;
  public readonly spotsUnsaveFn: NodejsFunction;
  public readonly spotsIsSavedFn: NodejsFunction;
  public readonly spotsSavedListFn: NodejsFunction;
  public readonly spotsReviewsListFn: NodejsFunction;
  public readonly spotsReviewsCreateFn: NodejsFunction;
  public readonly spotsReviewsDeleteFn: NodejsFunction;

  // Settings
  public readonly settingsCurrencyFn: NodejsFunction;

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

    // Create optimized Lambda function helper
    const createLambda = (name: string, entryFile: string, options?: {
      memory?: number;
      timeout?: number;
      reservedConcurrency?: number;
    }) => {
      const fn = new NodejsFunction(this, name, {
        entry: path.join(__dirname, `../../lambda/api/${entryFile}.ts`),
        handler: 'handler',
        runtime: lambda.Runtime.NODEJS_22_X,
        memorySize: options?.memory || 512,
        timeout: cdk.Duration.seconds(options?.timeout || 30),
        vpc,
        vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
        securityGroups: [lambdaSecurityGroup],
        environment: lambdaEnvironment,
        bundling: {
          minify: true,
          sourceMap: !isProduction,
          externalModules: [],
        },
        reservedConcurrentExecutions: options?.reservedConcurrency,
        tracing: lambda.Tracing.ACTIVE,
        logGroup: apiLogGroup,
        depsLockFilePath: path.join(__dirname, '../../lambda/api/package-lock.json'),
        projectRoot: path.join(__dirname, '../../lambda/api'),
      });

      dbCredentials.grantRead(fn);

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
    this.postsListFn = createLambda('PostsListFunction', 'posts/list', { memory: 1024, reservedConcurrency: 50 });
    this.postsGetFn = createLambda('PostsGetFunction', 'posts/get');
    this.postsCreateFn = createLambda('PostsCreateFunction', 'posts/create');
    this.profilesGetFn = createLambda('ProfilesGetFunction', 'profiles/get');
    this.profilesSearchFn = createLambda('ProfilesSearchFunction', 'profiles/search', { memory: 1024 });
    this.feedGetFn = createLambda('FeedGetFunction', 'feed/get', { memory: 2048, timeout: 60, reservedConcurrency: 100 });
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
    this.peaksListFn = createLambda('PeaksListFunction', 'peaks/list', { memory: 1024, reservedConcurrency: 50 });
    this.peaksGetFn = createLambda('PeaksGetFunction', 'peaks/get');
    this.peaksCreateFn = createLambda('PeaksCreateFunction', 'peaks/create');
    this.peaksDeleteFn = createLambda('PeaksDeleteFunction', 'peaks/delete');
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
    // Challenges Lambda Functions
    // ========================================
    this.challengesCreateFn = createLambda('ChallengesCreateFunction', 'challenges/create');
    this.challengesListFn = createLambda('ChallengesListFunction', 'challenges/list');
    this.challengesRespondFn = createLambda('ChallengesRespondFunction', 'challenges/respond');

    // ========================================
    // Live Battles Lambda Functions
    // ========================================
    this.battlesCreateFn = createLambda('BattlesCreateFunction', 'battles/create');
    this.battlesJoinFn = createLambda('BattlesJoinFunction', 'battles/join');

    // ========================================
    // Events Lambda Functions (Xplorer)
    // ========================================
    this.eventsCreateFn = createLambda('EventsCreateFunction', 'events/create');
    this.eventsListFn = createLambda('EventsListFunction', 'events/list');
    this.eventsJoinFn = createLambda('EventsJoinFunction', 'events/join');

    // ========================================
    // Groups Lambda Functions
    // ========================================
    this.groupsCreateFn = createLambda('GroupsCreateFunction', 'groups/create');
    this.groupsListFn = createLambda('GroupsListFunction', 'groups/list');
    this.groupsGetFn = createLambda('GroupsGetFunction', 'groups/get');
    this.groupsJoinFn = createLambda('GroupsJoinFunction', 'groups/join');
    this.groupsLeaveFn = createLambda('GroupsLeavFunction', 'groups/leave');

    // ========================================
    // Content Moderation: Reports Lambda Functions
    // ========================================
    this.reportsPostFn = createLambda('ReportsPostFunction', 'reports/report-post');
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

    // ========================================
    // Settings Lambda Functions
    // ========================================
    this.settingsCurrencyFn = createLambda('SettingsCurrencyFunction', 'settings/currency');

    // ========================================
    // Search & Discovery Lambda Functions
    // ========================================
    this.postsSearchFn = createLambda('PostsSearchFunction', 'posts/search', { memory: 1024 });
    this.peaksSearchFn = createLambda('PeaksSearchFunction', 'peaks/search', { memory: 1024 });
    this.hashtagsTrendingFn = createLambda('HashtagsTrendingFunction', 'hashtags/trending');

    // ========================================
    // Feed Variants Lambda Functions
    // ========================================
    this.feedOptimizedFn = createLambda('FeedOptimizedFunction', 'feed/optimized', { memory: 2048, timeout: 60 });
    this.feedFollowingFn = createLambda('FeedFollowingFunction', 'feed/following', { memory: 1024 });
    this.feedDiscoverFn = createLambda('FeedDiscoverFunction', 'feed/discover', { memory: 1024 });

    // ========================================
    // Posts Batch & Saved Lambda Functions
    // ========================================
    this.postsLikesBatchFn = createLambda('PostsLikesBatchFunction', 'posts/likes-batch');
    this.postsSavesBatchFn = createLambda('PostsSavesBatchFunction', 'posts/saves-batch');
    this.postsSavedListFn = createLambda('PostsSavedListFunction', 'posts/saved-list');

    // ========================================
    // Interests & Expertise Lambda Functions
    // ========================================
    this.interestsListFn = createLambda('InterestsListFunction', 'interests/list');
    this.expertiseListFn = createLambda('ExpertiseListFunction', 'expertise/list');

    // ========================================
    // Follow Requests Extended Lambda Functions
    // ========================================
    this.followRequestsCountFn = createLambda('FollowRequestsCountFunction', 'follow-requests/count');
    this.followRequestsCheckPendingFn = createLambda('FollowRequestsCheckPendingFunction', 'follow-requests/check-pending');
    this.followRequestsCancelFn = createLambda('FollowRequestsCancelFunction', 'follow-requests/cancel');

    // ========================================
    // Spots Lambda Functions
    // ========================================
    this.spotsListFn = createLambda('SpotsListFunction', 'spots/list', { memory: 1024 });
    this.spotsGetFn = createLambda('SpotsGetFunction', 'spots/get');
    this.spotsCreateFn = createLambda('SpotsCreateFunction', 'spots/create');
    this.spotsUpdateFn = createLambda('SpotsUpdateFunction', 'spots/update');
    this.spotsDeleteFn = createLambda('SpotsDeleteFunction', 'spots/delete');
    this.spotsNearbyFn = createLambda('SpotsNearbyFunction', 'spots/nearby', { memory: 1024 });
    this.spotsSaveFn = createLambda('SpotsSaveFunction', 'spots/save');
    this.spotsUnsaveFn = createLambda('SpotsUnsaveFunction', 'spots/unsave');
    this.spotsIsSavedFn = createLambda('SpotsIsSavedFunction', 'spots/is-saved');
    this.spotsSavedListFn = createLambda('SpotsSavedListFunction', 'spots/saved-list');
    this.spotsReviewsListFn = createLambda('SpotsReviewsListFunction', 'spots/reviews-list');
    this.spotsReviewsCreateFn = createLambda('SpotsReviewsCreateFunction', 'spots/reviews-create');
    this.spotsReviewsDeleteFn = createLambda('SpotsReviewsDeleteFunction', 'spots/reviews-delete');

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
      runtime: lambda.Runtime.NODEJS_22_X,
      memorySize: 256,
      timeout: cdk.Duration.seconds(10),
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      securityGroups: [lambdaSecurityGroup],
      environment: {
        ...lambdaEnvironment,
        MEDIA_BUCKET: mediaBucket.bucketName,
      },
      bundling: { minify: true, sourceMap: !isProduction, externalModules: [] },
      tracing: lambda.Tracing.ACTIVE,
      logGroup: apiLogGroup,
      depsLockFilePath: path.join(__dirname, '../../lambda/api/package-lock.json'),
      projectRoot: path.join(__dirname, '../../lambda/api'),
    });
    // Grant S3 PutObject for presigned URL generation
    mediaBucket.grantPut(this.mediaUploadUrlFn);

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
      },
      bundling: { minify: true, sourceMap: !isProduction, externalModules: [] },
      tracing: lambda.Tracing.ACTIVE,
      logGroup: apiLogGroup,
      depsLockFilePath: path.join(__dirname, '../../lambda/api/package-lock.json'),
      projectRoot: path.join(__dirname, '../../lambda/api'),
    });
    dbCredentials.grantRead(this.mediaUploadVoiceFn);
    mediaBucket.grantPut(this.mediaUploadVoiceFn);
    this.mediaUploadVoiceFn.addToRolePolicy(new iam.PolicyStatement({
      actions: ['dynamodb:UpdateItem'],
      resources: [`arn:aws:dynamodb:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:table/smuppy-rate-limit-${environment}`],
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
        APPLE_CLIENT_ID: 'com.smuppy.app',
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
      ],
      resources: [userPool.userPoolArn],
    }));
    dbCredentials.grantRead(this.appleAuthFn);

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
      ],
      resources: [userPool.userPoolArn],
    }));
    dbCredentials.grantRead(this.googleAuthFn);

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

    // ========== CloudWatch Alarms for critical Lambdas ==========
    const cloudwatch = cdk.aws_cloudwatch;

    // Payment webhook errors
    new cloudwatch.Alarm(this, 'PaymentWebhookErrorsAlarm', {
      metric: this.paymentWebhookFn.metricErrors({ period: cdk.Duration.minutes(5) }),
      threshold: 1,
      evaluationPeriods: 1,
      alarmDescription: 'Payment webhook Lambda is erroring',
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    // Payment webhook throttles
    new cloudwatch.Alarm(this, 'PaymentWebhookThrottlesAlarm', {
      metric: this.paymentWebhookFn.metricThrottles({ period: cdk.Duration.minutes(5) }),
      threshold: 1,
      evaluationPeriods: 1,
      alarmDescription: 'Payment webhook Lambda is being throttled',
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    // Payment create-intent errors
    new cloudwatch.Alarm(this, 'PaymentCreateIntentErrorsAlarm', {
      metric: this.paymentCreateIntentFn.metricErrors({ period: cdk.Duration.minutes(5) }),
      threshold: 3,
      evaluationPeriods: 1,
      alarmDescription: 'Payment create-intent Lambda is erroring',
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    // DLQ messages alarm
    new cloudwatch.Alarm(this, 'CriticalDLQAlarm', {
      metric: criticalDlq.metricApproximateNumberOfMessagesVisible({ period: cdk.Duration.minutes(5) }),
      threshold: 1,
      evaluationPeriods: 1,
      alarmDescription: 'Messages in critical DLQ — failed Lambda invocations',
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
  }
}

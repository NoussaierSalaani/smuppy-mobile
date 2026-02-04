import * as cdk from 'aws-cdk-lib';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as wafv2 from 'aws-cdk-lib/aws-wafv2';
import { Construct } from 'constructs';
import { LambdaStack } from './lambda-stack';
import { LambdaStack2 } from './lambda-stack-2';

export interface ApiGatewayStackProps extends cdk.NestedStackProps {
  userPool: cognito.IUserPool;
  lambdaStack: LambdaStack;
  lambdaStack2: LambdaStack2;
  environment: string;
  isProduction: boolean;
}

/**
 * API Gateway Nested Stack - Core Endpoints
 * Contains: posts, profiles, feed, follows, comments, peaks, notifications, conversations, auth, media
 */
export class ApiGatewayStack extends cdk.NestedStack {
  public readonly api: apigateway.RestApi;
  public readonly authorizer: apigateway.CognitoUserPoolsAuthorizer;

  constructor(scope: Construct, id: string, props: ApiGatewayStackProps) {
    super(scope, id, props);

    const { userPool, lambdaStack, lambdaStack2, environment, isProduction } = props;

    // ========================================
    // API Gateway - REST API with Throttling
    // ========================================
    this.api = new apigateway.RestApi(this, 'SmuppyAPI', {
      restApiName: `smuppy-api-${environment}`,
      description: 'Smuppy REST API - Core Endpoints',
      cloudWatchRole: true,
      deployOptions: {
        stageName: environment,
        throttlingRateLimit: isProduction ? 100000 : 1000,
        throttlingBurstLimit: isProduction ? 50000 : 500,
        loggingLevel: apigateway.MethodLoggingLevel.INFO,
        dataTraceEnabled: !isProduction,
        metricsEnabled: true,
        cachingEnabled: isProduction,
        cacheClusterEnabled: isProduction,
        cacheClusterSize: isProduction ? '0.5' : undefined,
      },
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
      binaryMediaTypes: ['image/*', 'video/*'],
    });

    // Cognito Authorizer
    this.authorizer = new apigateway.CognitoUserPoolsAuthorizer(this, 'CognitoAuthorizer', {
      cognitoUserPools: [userPool],
      resultsCacheTtl: cdk.Duration.minutes(5),
    });

    // SECURITY: Request body validator for POST/PATCH endpoints
    const bodyValidator = new apigateway.RequestValidator(this, 'BodyValidator', {
      restApi: this.api,
      requestValidatorName: `smuppy-body-validator-${environment}`,
      validateRequestBody: true,
      validateRequestParameters: true,
    });

    // Create all API routes
    this.createRoutes(lambdaStack, lambdaStack2, isProduction, bodyValidator);

    // Create WAF
    this.createWaf(environment, isProduction);
  }

  private createRoutes(lambdaStack: LambdaStack, lambdaStack2: LambdaStack2, isProduction: boolean, bodyValidator: apigateway.RequestValidator) {
    const authMethodOptions: apigateway.MethodOptions = {
      authorizer: this.authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    };

    // Auth + body validation for POST/PATCH mutations
    const authWithBodyValidation: apigateway.MethodOptions = {
      ...authMethodOptions,
      requestValidator: bodyValidator,
    };

    // Body validation without auth (for public POST endpoints like auth)
    const bodyValidationOnly: apigateway.MethodOptions = {
      requestValidator: bodyValidator,
    };

    // ========================================
    // Posts Endpoints
    // ========================================
    const posts = this.api.root.addResource('posts');
    posts.addMethod('GET', new apigateway.LambdaIntegration(lambdaStack.postsListFn, {
      ...(isProduction && { cacheKeyParameters: ['method.request.querystring.limit', 'method.request.querystring.offset'] }),
    }));
    posts.addMethod('POST', new apigateway.LambdaIntegration(lambdaStack.postsCreateFn), authWithBodyValidation);

    const postById = posts.addResource('{id}');
    postById.addMethod('GET', new apigateway.LambdaIntegration(lambdaStack.postsGetFn));
    postById.addMethod('DELETE', new apigateway.LambdaIntegration(lambdaStack.postsDeleteFn), authMethodOptions);

    const postLikers = postById.addResource('likers');
    postLikers.addMethod('GET', new apigateway.LambdaIntegration(lambdaStack.postsLikersFn), authMethodOptions);

    const postLike = postById.addResource('like');
    postLike.addMethod('POST', new apigateway.LambdaIntegration(lambdaStack.postsLikeFn), authMethodOptions);
    postLike.addMethod('DELETE', new apigateway.LambdaIntegration(lambdaStack.postsUnlikeFn), authMethodOptions);

    const postView = postById.addResource('view');
    postView.addMethod('POST', new apigateway.LambdaIntegration(lambdaStack.postsViewFn), authMethodOptions);

    const postSave = postById.addResource('save');
    postSave.addMethod('POST', new apigateway.LambdaIntegration(lambdaStack.postsSaveFn), authMethodOptions);
    postSave.addMethod('DELETE', new apigateway.LambdaIntegration(lambdaStack.postsUnsaveFn), authMethodOptions);

    const postComments = postById.addResource('comments');
    postComments.addMethod('GET', new apigateway.LambdaIntegration(lambdaStack.commentsListFn));
    postComments.addMethod('POST', new apigateway.LambdaIntegration(lambdaStack.commentsCreateFn), authWithBodyValidation);

    const postSaved = postById.addResource('saved');
    postSaved.addMethod('GET', new apigateway.LambdaIntegration(lambdaStack.postsIsSavedFn), authMethodOptions);

    // Report check: GET /posts/{id}/reported
    const postReported = postById.addResource('reported');
    postReported.addMethod('GET', new apigateway.LambdaIntegration(lambdaStack.reportsCheckPostFn), authMethodOptions);

    // ========================================
    // Comments Endpoints
    // ========================================
    const comments = this.api.root.addResource('comments');
    const commentById = comments.addResource('{id}');
    commentById.addMethod('DELETE', new apigateway.LambdaIntegration(lambdaStack.commentsDeleteFn), authMethodOptions);
    commentById.addMethod('PATCH', new apigateway.LambdaIntegration(lambdaStack.commentsUpdateFn), authWithBodyValidation);

    // ========================================
    // Profiles Endpoints
    // ========================================
    const profiles = this.api.root.addResource('profiles');
    profiles.addMethod('GET', new apigateway.LambdaIntegration(lambdaStack.profilesSearchFn));

    const profileById = profiles.addResource('{id}');
    profileById.addMethod('GET', new apigateway.LambdaIntegration(lambdaStack.profilesGetFn), authMethodOptions);

    const profileIsFollowing = profileById.addResource('is-following');
    profileIsFollowing.addMethod('GET', new apigateway.LambdaIntegration(lambdaStack.profilesIsFollowingFn), authMethodOptions);

    const profileFollowers = profileById.addResource('followers');
    profileFollowers.addMethod('GET', new apigateway.LambdaIntegration(lambdaStack.profilesFollowersFn));

    const profileFollowing = profileById.addResource('following');
    profileFollowing.addMethod('GET', new apigateway.LambdaIntegration(lambdaStack.profilesFollowingFn));

    const profileMe = profiles.addResource('me');
    profileMe.addMethod('PATCH', new apigateway.LambdaIntegration(lambdaStack.profilesUpdateFn), authWithBodyValidation);

    const profilesCreationLimits = profiles.addResource('creation-limits');
    profilesCreationLimits.addMethod('GET', new apigateway.LambdaIntegration(lambdaStack.profilesCreationLimitsFn), authMethodOptions);

    const profilesSuggested = profiles.addResource('suggested');
    profilesSuggested.addMethod('GET', new apigateway.LambdaIntegration(lambdaStack.profilesSuggestedFn), authMethodOptions);

    // Block & Mute
    const profileBlock = profileById.addResource('block');
    profileBlock.addMethod('POST', new apigateway.LambdaIntegration(lambdaStack.profilesBlockFn), authMethodOptions);

    const profileUnblock = profileById.addResource('unblock');
    profileUnblock.addMethod('POST', new apigateway.LambdaIntegration(lambdaStack.profilesUnblockFn), authMethodOptions);

    const profileMute = profileById.addResource('mute');
    profileMute.addMethod('POST', new apigateway.LambdaIntegration(lambdaStack.profilesMuteFn), authMethodOptions);

    const profileUnmute = profileById.addResource('unmute');
    profileUnmute.addMethod('POST', new apigateway.LambdaIntegration(lambdaStack.profilesUnmuteFn), authMethodOptions);

    const profilesBlocked = profiles.addResource('blocked');
    profilesBlocked.addMethod('GET', new apigateway.LambdaIntegration(lambdaStack.profilesGetBlockedFn), authMethodOptions);

    const profilesMuted = profiles.addResource('muted');
    profilesMuted.addMethod('GET', new apigateway.LambdaIntegration(lambdaStack.profilesGetMutedFn), authMethodOptions);

    // Report check: GET /profiles/{id}/reported
    const profileReported = profileById.addResource('reported');
    profileReported.addMethod('GET', new apigateway.LambdaIntegration(lambdaStack.reportsCheckUserFn), authMethodOptions);

    // ========================================
    // Feed Endpoint
    // ========================================
    const feed = this.api.root.addResource('feed');
    feed.addMethod('GET', new apigateway.LambdaIntegration(lambdaStack.feedGetFn), authMethodOptions);

    // ========================================
    // Follows Endpoints
    // ========================================
    const follows = this.api.root.addResource('follows');
    follows.addMethod('POST', new apigateway.LambdaIntegration(lambdaStack.followsCreateFn), authWithBodyValidation);

    const followsByUser = follows.addResource('{userId}');
    followsByUser.addMethod('DELETE', new apigateway.LambdaIntegration(lambdaStack.followsDeleteFn), authMethodOptions);

    // ========================================
    // Follow Requests Endpoints
    // ========================================
    const followRequests = this.api.root.addResource('follow-requests');
    followRequests.addMethod('GET', new apigateway.LambdaIntegration(lambdaStack.followRequestsListFn), authMethodOptions);

    const followRequestById = followRequests.addResource('{id}');
    const followRequestAccept = followRequestById.addResource('accept');
    followRequestAccept.addMethod('POST', new apigateway.LambdaIntegration(lambdaStack.followRequestsAcceptFn), authMethodOptions);

    const followRequestDecline = followRequestById.addResource('decline');
    followRequestDecline.addMethod('POST', new apigateway.LambdaIntegration(lambdaStack.followRequestsDeclineFn), authMethodOptions);

    // ========================================
    // Peaks Endpoints
    // ========================================
    const peaks = this.api.root.addResource('peaks');
    peaks.addMethod('GET', new apigateway.LambdaIntegration(lambdaStack.peaksListFn));
    peaks.addMethod('POST', new apigateway.LambdaIntegration(lambdaStack.peaksCreateFn), authWithBodyValidation);

    const peakById = peaks.addResource('{id}');
    peakById.addMethod('GET', new apigateway.LambdaIntegration(lambdaStack.peaksGetFn));
    peakById.addMethod('DELETE', new apigateway.LambdaIntegration(lambdaStack.peaksDeleteFn), authMethodOptions);

    const peakLike = peakById.addResource('like');
    peakLike.addMethod('POST', new apigateway.LambdaIntegration(lambdaStack.peaksLikeFn), authMethodOptions);
    peakLike.addMethod('DELETE', new apigateway.LambdaIntegration(lambdaStack.peaksUnlikeFn), authMethodOptions);

    const peakComments = peakById.addResource('comments');
    peakComments.addMethod('POST', new apigateway.LambdaIntegration(lambdaStack.peaksCommentFn), authWithBodyValidation);

    const peakReact = peakById.addResource('react');
    peakReact.addMethod('POST', new apigateway.LambdaIntegration(lambdaStack.peaksReactFn), authMethodOptions);
    peakReact.addMethod('DELETE', new apigateway.LambdaIntegration(lambdaStack.peaksReactFn), authMethodOptions);

    const peakTags = peakById.addResource('tags');
    peakTags.addMethod('GET', new apigateway.LambdaIntegration(lambdaStack.peaksTagFn), authMethodOptions);
    peakTags.addMethod('POST', new apigateway.LambdaIntegration(lambdaStack.peaksTagFn), authMethodOptions);

    const peakTagByUser = peakTags.addResource('{userId}');
    peakTagByUser.addMethod('DELETE', new apigateway.LambdaIntegration(lambdaStack.peaksTagFn), authMethodOptions);

    const peakHide = peakById.addResource('hide');
    peakHide.addMethod('POST', new apigateway.LambdaIntegration(lambdaStack.peaksHideFn), authMethodOptions);
    peakHide.addMethod('DELETE', new apigateway.LambdaIntegration(lambdaStack.peaksHideFn), authMethodOptions);

    const peaksHidden = peaks.addResource('hidden');
    peaksHidden.addMethod('GET', new apigateway.LambdaIntegration(lambdaStack.peaksHideFn), authMethodOptions);

    const peakReplies = peakById.addResource('replies');
    peakReplies.addMethod('GET', new apigateway.LambdaIntegration(lambdaStack.peaksRepliesFn), authMethodOptions);
    peakReplies.addMethod('POST', new apigateway.LambdaIntegration(lambdaStack.peaksRepliesFn), authWithBodyValidation);

    // ========================================
    // Notifications Endpoints
    // ========================================
    const notifications = this.api.root.addResource('notifications');
    notifications.addMethod('GET', new apigateway.LambdaIntegration(lambdaStack.notificationsListFn), authMethodOptions);

    const notificationsReadAll = notifications.addResource('read-all');
    notificationsReadAll.addMethod('POST', new apigateway.LambdaIntegration(lambdaStack.notificationsMarkAllReadFn), authMethodOptions);

    const notificationsUnreadCount = notifications.addResource('unread-count');
    notificationsUnreadCount.addMethod('GET', new apigateway.LambdaIntegration(lambdaStack.notificationsUnreadCountFn), authMethodOptions);

    const notificationsPushToken = notifications.addResource('push-token');
    notificationsPushToken.addMethod('POST', new apigateway.LambdaIntegration(lambdaStack.notificationsPushTokenFn), authWithBodyValidation);

    const notificationsPreferences = notifications.addResource('preferences');
    notificationsPreferences.addMethod('GET', new apigateway.LambdaIntegration(lambdaStack2.notificationsPreferencesGetFn), authMethodOptions);
    notificationsPreferences.addMethod('PUT', new apigateway.LambdaIntegration(lambdaStack2.notificationsPreferencesUpdateFn), authWithBodyValidation);

    const notificationById = notifications.addResource('{id}');
    const notificationRead = notificationById.addResource('read');
    notificationRead.addMethod('POST', new apigateway.LambdaIntegration(lambdaStack.notificationsMarkReadFn), authMethodOptions);

    // ========================================
    // Conversations & Messages Endpoints
    // ========================================
    const conversations = this.api.root.addResource('conversations');
    conversations.addMethod('GET', new apigateway.LambdaIntegration(lambdaStack.conversationsListFn), authMethodOptions);
    conversations.addMethod('POST', new apigateway.LambdaIntegration(lambdaStack.conversationsCreateFn), authWithBodyValidation);

    const conversationById = conversations.addResource('{id}');
    const conversationMessages = conversationById.addResource('messages');
    conversationMessages.addMethod('GET', new apigateway.LambdaIntegration(lambdaStack.conversationsMessagesFn), authMethodOptions);
    conversationMessages.addMethod('POST', new apigateway.LambdaIntegration(lambdaStack.conversationsSendMessageFn), authWithBodyValidation);

    const messages = this.api.root.addResource('messages');
    const messageById = messages.addResource('{id}');
    messageById.addMethod('DELETE', new apigateway.LambdaIntegration(lambdaStack.messagesDeleteFn), authMethodOptions);

    // ========================================
    // Reports Endpoints
    // ========================================
    const reports = this.api.root.addResource('reports');
    const reportPost = reports.addResource('post');
    reportPost.addMethod('POST', new apigateway.LambdaIntegration(lambdaStack.reportsPostFn), authWithBodyValidation);

    const reportUser = reports.addResource('user');
    reportUser.addMethod('POST', new apigateway.LambdaIntegration(lambdaStack.reportsUserFn), authWithBodyValidation);

    // ========================================
    // Auth Endpoints (no Cognito auth)
    // ========================================
    const auth = this.api.root.addResource('auth');
    const appleAuth = auth.addResource('apple');
    appleAuth.addMethod('POST', new apigateway.LambdaIntegration(lambdaStack.appleAuthFn), bodyValidationOnly);

    const googleAuth = auth.addResource('google');
    googleAuth.addMethod('POST', new apigateway.LambdaIntegration(lambdaStack.googleAuthFn), bodyValidationOnly);

    const signupAuth = auth.addResource('signup');
    signupAuth.addMethod('POST', new apigateway.LambdaIntegration(lambdaStack.signupAuthFn), bodyValidationOnly);

    const validateEmail = auth.addResource('validate-email');
    validateEmail.addMethod('POST', new apigateway.LambdaIntegration(lambdaStack.validateEmailFn), bodyValidationOnly);

    const confirmSignup = auth.addResource('confirm-signup');
    confirmSignup.addMethod('POST', new apigateway.LambdaIntegration(lambdaStack.confirmSignupFn), bodyValidationOnly);

    const resendCode = auth.addResource('resend-code');
    resendCode.addMethod('POST', new apigateway.LambdaIntegration(lambdaStack.resendCodeFn), bodyValidationOnly);

    const forgotPassword = auth.addResource('forgot-password');
    forgotPassword.addMethod('POST', new apigateway.LambdaIntegration(lambdaStack.forgotPasswordFn), bodyValidationOnly);

    const confirmForgotPassword = auth.addResource('confirm-forgot-password');
    confirmForgotPassword.addMethod('POST', new apigateway.LambdaIntegration(lambdaStack.confirmForgotPasswordFn), bodyValidationOnly);

    const checkUser = auth.addResource('check-user');
    checkUser.addMethod('POST', new apigateway.LambdaIntegration(lambdaStack.checkUserFn), bodyValidationOnly);

    const wsToken = auth.addResource('ws-token');
    wsToken.addMethod('POST', new apigateway.LambdaIntegration(lambdaStack.wsTokenFn), authMethodOptions);

    // ========================================
    // Media Endpoints
    // ========================================
    const media = this.api.root.addResource('media');
    const mediaUploadUrl = media.addResource('upload-url');
    mediaUploadUrl.addMethod('POST', new apigateway.LambdaIntegration(lambdaStack.mediaUploadUrlFn), authWithBodyValidation);

    const mediaUploadVoice = media.addResource('upload-voice');
    mediaUploadVoice.addMethod('POST', new apigateway.LambdaIntegration(lambdaStack.mediaUploadVoiceFn), authWithBodyValidation);

    // ========================================
    // Search (nested under existing posts/peaks)
    // ========================================
    const postsSearch = posts.addResource('search');
    postsSearch.addMethod('GET', new apigateway.LambdaIntegration(lambdaStack.postsSearchFn), authMethodOptions);

    const peaksSearch = peaks.addResource('search');
    peaksSearch.addMethod('GET', new apigateway.LambdaIntegration(lambdaStack.peaksSearchFn), authMethodOptions);

    // ========================================
    // Feed Variants (nested under existing /feed)
    // ========================================
    const feedOptimized = feed.addResource('optimized');
    feedOptimized.addMethod('GET', new apigateway.LambdaIntegration(lambdaStack.feedOptimizedFn), authMethodOptions);

    const feedFollowing = feed.addResource('following');
    feedFollowing.addMethod('GET', new apigateway.LambdaIntegration(lambdaStack.feedFollowingFn), authMethodOptions);

    const feedDiscover = feed.addResource('discover');
    feedDiscover.addMethod('GET', new apigateway.LambdaIntegration(lambdaStack.feedDiscoverFn), authMethodOptions);

    // ========================================
    // Posts Batch & Saved (nested under existing /posts)
    // ========================================
    const postsLikes = posts.addResource('likes');
    const postsLikesBatch = postsLikes.addResource('batch');
    postsLikesBatch.addMethod('POST', new apigateway.LambdaIntegration(lambdaStack.postsLikesBatchFn), authMethodOptions);

    const postsSaves = posts.addResource('saves');
    const postsSavesBatch = postsSaves.addResource('batch');
    postsSavesBatch.addMethod('POST', new apigateway.LambdaIntegration(lambdaStack.postsSavesBatchFn), authMethodOptions);

    const postsSaved = posts.addResource('saved');
    postsSaved.addMethod('GET', new apigateway.LambdaIntegration(lambdaStack.postsSavedListFn), authMethodOptions);

    // ========================================
    // Follow Requests Extended (nested under existing /follow-requests)
    // ========================================
    const followRequestsCount = followRequests.addResource('count');
    followRequestsCount.addMethod('GET', new apigateway.LambdaIntegration(lambdaStack.followRequestsCountFn), authMethodOptions);

    const followRequestsPending = followRequests.addResource('pending');
    const followRequestsPendingByUser = followRequestsPending.addResource('{userId}');
    followRequestsPendingByUser.addMethod('GET', new apigateway.LambdaIntegration(lambdaStack.followRequestsCheckPendingFn), authMethodOptions);

    const followRequestCancel = followRequestById.addResource('cancel');
    followRequestCancel.addMethod('POST', new apigateway.LambdaIntegration(lambdaStack.followRequestsCancelFn), authMethodOptions);
  }

  private createWaf(environment: string, isProduction: boolean) {
    const webAcl = new wafv2.CfnWebACL(this, 'SmuppyWAF', {
      defaultAction: { allow: {} },
      scope: 'REGIONAL',
      name: `smuppy-core-waf-${environment}`,
      visibilityConfig: {
        cloudWatchMetricsEnabled: true,
        metricName: `SmuppyCoreWAF-${environment}`,
        sampledRequestsEnabled: true,
      },
      rules: [
        {
          name: 'DDoSProtectionRule',
          priority: 1,
          action: { block: {} },
          statement: {
            rateBasedStatement: {
              limit: isProduction ? 100000 : 10000,
              aggregateKeyType: 'IP',
            },
          },
          visibilityConfig: {
            cloudWatchMetricsEnabled: true,
            metricName: 'DDoSProtectionRule',
            sampledRequestsEnabled: true,
          },
        },
        {
          name: 'AuthRateLimitRule',
          priority: 2,
          action: { block: {} },
          statement: {
            rateBasedStatement: {
              limit: isProduction ? 2000 : 500,
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
      ],
    });

    new wafv2.CfnWebACLAssociation(this, 'WafApiAssociation', {
      resourceArn: this.api.deploymentStage.stageArn,
      webAclArn: webAcl.attrArn,
    });
  }
}

import * as cdk from 'aws-cdk-lib';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as wafv2 from 'aws-cdk-lib/aws-wafv2';
import { Construct } from 'constructs';
import { LambdaStack } from './lambda-stack';

export interface ApiGateway2StackProps extends cdk.NestedStackProps {
  userPool: cognito.IUserPool;
  lambdaStack: LambdaStack;
  environment: string;
  isProduction: boolean;
}

/**
 * API Gateway Nested Stack 2 - Secondary Endpoints
 * Contains: sessions, packs, payments, tips, challenges, battles, events, settings, admin, earnings
 * Split from ApiGatewayStack to stay under CloudFormation's 500 resource limit
 */
export class ApiGateway2Stack extends cdk.NestedStack {
  public readonly api: apigateway.RestApi;
  public readonly authorizer: apigateway.CognitoUserPoolsAuthorizer;

  constructor(scope: Construct, id: string, props: ApiGateway2StackProps) {
    super(scope, id, props);

    const { userPool, lambdaStack, environment, isProduction } = props;

    // ========================================
    // API Gateway - REST API with Throttling (Secondary API)
    // ========================================
    this.api = new apigateway.RestApi(this, 'SmuppyAPI2', {
      restApiName: `smuppy-api-2-${environment}`,
      description: 'Smuppy REST API - Secondary Endpoints (sessions, payments, etc.)',
      cloudWatchRole: false, // Already set in primary API stack
      deployOptions: {
        stageName: environment,
        throttlingRateLimit: isProduction ? 100000 : 1000,
        throttlingBurstLimit: isProduction ? 50000 : 500,
        loggingLevel: apigateway.MethodLoggingLevel.INFO,
        dataTraceEnabled: !isProduction,
        metricsEnabled: true,
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
    });

    // Cognito Authorizer (separate instance for this API)
    this.authorizer = new apigateway.CognitoUserPoolsAuthorizer(this, 'CognitoAuthorizer2', {
      cognitoUserPools: [userPool],
      resultsCacheTtl: cdk.Duration.minutes(5),
    });

    const authMethodOptions: apigateway.MethodOptions = {
      authorizer: this.authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    };

    // ========================================
    // Sessions Endpoints
    // ========================================
    const sessions = this.api.root.addResource('sessions');
    sessions.addMethod('GET', new apigateway.LambdaIntegration(lambdaStack.sessionsListFn), authMethodOptions);
    sessions.addMethod('POST', new apigateway.LambdaIntegration(lambdaStack.sessionsCreateFn), authMethodOptions);

    const sessionById = sessions.addResource('{id}');
    sessionById.addMethod('GET', new apigateway.LambdaIntegration(lambdaStack.sessionsGetFn), authMethodOptions);

    const sessionAccept = sessionById.addResource('accept');
    sessionAccept.addMethod('POST', new apigateway.LambdaIntegration(lambdaStack.sessionsAcceptFn), authMethodOptions);

    const sessionDecline = sessionById.addResource('decline');
    sessionDecline.addMethod('POST', new apigateway.LambdaIntegration(lambdaStack.sessionsDeclineFn), authMethodOptions);

    const sessionAvailability = sessions.addResource('availability');
    const sessionAvailabilityByCreator = sessionAvailability.addResource('{creatorId}');
    sessionAvailabilityByCreator.addMethod('GET', new apigateway.LambdaIntegration(lambdaStack.sessionsAvailabilityFn), authMethodOptions);

    const sessionToken = sessionById.addResource('token');
    sessionToken.addMethod('POST', new apigateway.LambdaIntegration(lambdaStack.sessionsTokenFn), authMethodOptions);

    const sessionSettings = sessions.addResource('settings');
    sessionSettings.addMethod('PUT', new apigateway.LambdaIntegration(lambdaStack.sessionsSettingsFn), authMethodOptions);

    // ========================================
    // Session Packs Endpoints
    // ========================================
    const packs = this.api.root.addResource('packs');
    packs.addMethod('GET', new apigateway.LambdaIntegration(lambdaStack.packsListFn), authMethodOptions);
    packs.addMethod('POST', new apigateway.LambdaIntegration(lambdaStack.packsManageFn), authMethodOptions);

    const packsPurchase = packs.addResource('purchase');
    packsPurchase.addMethod('POST', new apigateway.LambdaIntegration(lambdaStack.packsPurchaseFn), authMethodOptions);

    const packById = packs.addResource('{id}');
    packById.addMethod('PUT', new apigateway.LambdaIntegration(lambdaStack.packsManageFn), authMethodOptions);
    packById.addMethod('DELETE', new apigateway.LambdaIntegration(lambdaStack.packsManageFn), authMethodOptions);

    // ========================================
    // Earnings Endpoints
    // ========================================
    const earnings = this.api.root.addResource('earnings');
    earnings.addMethod('GET', new apigateway.LambdaIntegration(lambdaStack.earningsGetFn), authMethodOptions);

    // ========================================
    // Payment Endpoints
    // ========================================
    const payments = this.api.root.addResource('payments');

    const createIntent = payments.addResource('create-intent');
    createIntent.addMethod('POST', new apigateway.LambdaIntegration(lambdaStack.paymentCreateIntentFn), authMethodOptions);

    const webhook = payments.addResource('webhook');
    webhook.addMethod('POST', new apigateway.LambdaIntegration(lambdaStack.paymentWebhookFn));

    const subscriptions = payments.addResource('subscriptions');
    subscriptions.addMethod('POST', new apigateway.LambdaIntegration(lambdaStack.paymentSubscriptionsFn), authMethodOptions);

    const connect = payments.addResource('connect');
    connect.addMethod('POST', new apigateway.LambdaIntegration(lambdaStack.paymentConnectFn), authMethodOptions);

    const identity = payments.addResource('identity');
    identity.addMethod('POST', new apigateway.LambdaIntegration(lambdaStack.paymentIdentityFn), authMethodOptions);

    const platformSub = payments.addResource('platform-subscription');
    platformSub.addMethod('POST', new apigateway.LambdaIntegration(lambdaStack.paymentPlatformSubFn), authMethodOptions);

    const channelSub = payments.addResource('channel-subscription');
    channelSub.addMethod('POST', new apigateway.LambdaIntegration(lambdaStack.paymentChannelSubFn), authMethodOptions);

    const wallet = payments.addResource('wallet');
    wallet.addMethod('POST', new apigateway.LambdaIntegration(lambdaStack.paymentWalletFn), authMethodOptions);

    const refunds = payments.addResource('refunds');
    refunds.addMethod('GET', new apigateway.LambdaIntegration(lambdaStack.paymentRefundsFn), authMethodOptions);
    refunds.addMethod('POST', new apigateway.LambdaIntegration(lambdaStack.paymentRefundsFn), authMethodOptions);
    const refundById = refunds.addResource('{refundId}');
    refundById.addMethod('GET', new apigateway.LambdaIntegration(lambdaStack.paymentRefundsFn), authMethodOptions);

    const methods = payments.addResource('methods');
    methods.addMethod('GET', new apigateway.LambdaIntegration(lambdaStack.paymentMethodsFn), authMethodOptions);
    methods.addMethod('POST', new apigateway.LambdaIntegration(lambdaStack.paymentMethodsFn), authMethodOptions);
    const setupIntent = methods.addResource('setup-intent');
    setupIntent.addMethod('POST', new apigateway.LambdaIntegration(lambdaStack.paymentMethodsFn), authMethodOptions);
    const methodById = methods.addResource('{methodId}');
    methodById.addMethod('DELETE', new apigateway.LambdaIntegration(lambdaStack.paymentMethodsFn), authMethodOptions);
    const methodDefault = methodById.addResource('default');
    methodDefault.addMethod('PUT', new apigateway.LambdaIntegration(lambdaStack.paymentMethodsFn), authMethodOptions);

    const webCheckout = payments.addResource('web-checkout');
    webCheckout.addMethod('POST', new apigateway.LambdaIntegration(lambdaStack.paymentWebCheckoutFn), authMethodOptions);
    const webCheckoutStatus = webCheckout.addResource('status');
    const webCheckoutStatusById = webCheckoutStatus.addResource('{sessionId}');
    webCheckoutStatusById.addMethod('GET', new apigateway.LambdaIntegration(lambdaStack.paymentWebCheckoutFn), authMethodOptions);

    // ========================================
    // Tips Endpoints
    // ========================================
    const tips = this.api.root.addResource('tips');

    const tipsSend = tips.addResource('send');
    tipsSend.addMethod('POST', new apigateway.LambdaIntegration(lambdaStack.tipsSendFn), authMethodOptions);

    const tipsHistory = tips.addResource('history');
    tipsHistory.addMethod('GET', new apigateway.LambdaIntegration(lambdaStack.tipsHistoryFn), authMethodOptions);

    const tipsLeaderboard = tips.addResource('leaderboard');
    const tipsLeaderboardByCreator = tipsLeaderboard.addResource('{creatorId}');
    tipsLeaderboardByCreator.addMethod('GET', new apigateway.LambdaIntegration(lambdaStack.tipsLeaderboardFn));

    // ========================================
    // Challenges Endpoints
    // ========================================
    const challenges = this.api.root.addResource('challenges');
    challenges.addMethod('POST', new apigateway.LambdaIntegration(lambdaStack.challengesCreateFn), authMethodOptions);
    challenges.addMethod('GET', new apigateway.LambdaIntegration(lambdaStack.challengesListFn));

    const challengeById = challenges.addResource('{challengeId}');
    const challengeRespond = challengeById.addResource('respond');
    challengeRespond.addMethod('POST', new apigateway.LambdaIntegration(lambdaStack.challengesRespondFn), authMethodOptions);

    const challengeResponses = challengeById.addResource('responses');
    challengeResponses.addMethod('GET', new apigateway.LambdaIntegration(lambdaStack.challengesResponsesFn));

    // ========================================
    // Battles Endpoints
    // ========================================
    const battles = this.api.root.addResource('battles');
    battles.addMethod('POST', new apigateway.LambdaIntegration(lambdaStack.battlesCreateFn), authMethodOptions);

    const battleById = battles.addResource('{battleId}');
    const battleJoin = battleById.addResource('join');
    battleJoin.addMethod('POST', new apigateway.LambdaIntegration(lambdaStack.battlesJoinFn), authMethodOptions);

    // ========================================
    // Events Endpoints
    // ========================================
    const events = this.api.root.addResource('events');
    events.addMethod('POST', new apigateway.LambdaIntegration(lambdaStack.eventsCreateFn), authMethodOptions);
    events.addMethod('GET', new apigateway.LambdaIntegration(lambdaStack.eventsListFn));

    const eventById = events.addResource('{eventId}');
    const eventJoin = eventById.addResource('join');
    eventJoin.addMethod('POST', new apigateway.LambdaIntegration(lambdaStack.eventsJoinFn), authMethodOptions);

    // ========================================
    // Groups Endpoints
    // ========================================
    const groups = this.api.root.addResource('groups');
    groups.addMethod('POST', new apigateway.LambdaIntegration(lambdaStack.groupsCreateFn), authMethodOptions);
    groups.addMethod('GET', new apigateway.LambdaIntegration(lambdaStack.groupsListFn));

    const groupById = groups.addResource('{groupId}');
    groupById.addMethod('GET', new apigateway.LambdaIntegration(lambdaStack.groupsGetFn));

    const groupJoin = groupById.addResource('join');
    groupJoin.addMethod('POST', new apigateway.LambdaIntegration(lambdaStack.groupsJoinFn), authMethodOptions);

    const groupLeave = groupById.addResource('leave');
    groupLeave.addMethod('DELETE', new apigateway.LambdaIntegration(lambdaStack.groupsLeaveFn), authMethodOptions);

    // ========================================
    // Settings Endpoints
    // ========================================
    const settings = this.api.root.addResource('settings');
    const settingsCurrency = settings.addResource('currency');
    settingsCurrency.addMethod('GET', new apigateway.LambdaIntegration(lambdaStack.settingsCurrencyFn));
    settingsCurrency.addMethod('PUT', new apigateway.LambdaIntegration(lambdaStack.settingsCurrencyFn), authMethodOptions);

    // ========================================
    // Admin Endpoints (no Cognito auth, uses admin key)
    // ========================================
    const admin = this.api.root.addResource('admin');
    const migrate = admin.addResource('migrate');
    migrate.addMethod('POST', new apigateway.LambdaIntegration(lambdaStack.adminMigrationFn));

    const migrateData = admin.addResource('migrate-data');
    migrateData.addMethod('POST', new apigateway.LambdaIntegration(lambdaStack.dataMigrationFn, {
      timeout: cdk.Duration.seconds(29),
    }));

    const checkProfiles = admin.addResource('check-profiles');
    checkProfiles.addMethod('POST', new apigateway.LambdaIntegration(lambdaStack.checkProfilesFn));

    const migrateUsers = admin.addResource('migrate-users');
    migrateUsers.addMethod('POST', new apigateway.LambdaIntegration(lambdaStack.userMigrationFn));

    // Auth + body validation for POST/PATCH mutations
    const bodyValidator = new apigateway.RequestValidator(this, 'BodyValidator2', {
      restApi: this.api,
      requestValidatorName: `smuppy-body-validator-2-${environment}`,
      validateRequestBody: true,
      validateRequestParameters: true,
    });

    const authWithBodyValidation: apigateway.MethodOptions = {
      ...authMethodOptions,
      requestValidator: bodyValidator,
    };

    // ========================================
    // Hashtags Endpoints
    // ========================================
    const hashtags = this.api.root.addResource('hashtags');
    const hashtagsTrending = hashtags.addResource('trending');
    hashtagsTrending.addMethod('GET', new apigateway.LambdaIntegration(lambdaStack.hashtagsTrendingFn), authMethodOptions);

    // ========================================
    // Interests & Expertise Endpoints
    // ========================================
    const interests = this.api.root.addResource('interests');
    interests.addMethod('GET', new apigateway.LambdaIntegration(lambdaStack.interestsListFn), authMethodOptions);

    const expertise = this.api.root.addResource('expertise');
    expertise.addMethod('GET', new apigateway.LambdaIntegration(lambdaStack.expertiseListFn), authMethodOptions);

    // ========================================
    // Spots Endpoints
    // ========================================
    const spots = this.api.root.addResource('spots');
    spots.addMethod('GET', new apigateway.LambdaIntegration(lambdaStack.spotsListFn), authMethodOptions);
    spots.addMethod('POST', new apigateway.LambdaIntegration(lambdaStack.spotsCreateFn), authWithBodyValidation);

    const spotsNearby = spots.addResource('nearby');
    spotsNearby.addMethod('GET', new apigateway.LambdaIntegration(lambdaStack.spotsNearbyFn), authMethodOptions);

    const spotsSaved = spots.addResource('saved');
    spotsSaved.addMethod('GET', new apigateway.LambdaIntegration(lambdaStack.spotsSavedListFn), authMethodOptions);

    const spotById = spots.addResource('{id}');
    spotById.addMethod('GET', new apigateway.LambdaIntegration(lambdaStack.spotsGetFn), authMethodOptions);
    spotById.addMethod('PUT', new apigateway.LambdaIntegration(lambdaStack.spotsUpdateFn), authWithBodyValidation);
    spotById.addMethod('DELETE', new apigateway.LambdaIntegration(lambdaStack.spotsDeleteFn), authMethodOptions);

    const spotSave = spotById.addResource('save');
    spotSave.addMethod('POST', new apigateway.LambdaIntegration(lambdaStack.spotsSaveFn), authMethodOptions);
    spotSave.addMethod('DELETE', new apigateway.LambdaIntegration(lambdaStack.spotsUnsaveFn), authMethodOptions);

    const spotIsSaved = spotById.addResource('is-saved');
    spotIsSaved.addMethod('GET', new apigateway.LambdaIntegration(lambdaStack.spotsIsSavedFn), authMethodOptions);

    const spotReviews = spotById.addResource('reviews');
    spotReviews.addMethod('GET', new apigateway.LambdaIntegration(lambdaStack.spotsReviewsListFn), authMethodOptions);
    spotReviews.addMethod('POST', new apigateway.LambdaIntegration(lambdaStack.spotsReviewsCreateFn), authWithBodyValidation);

    const spotReviewById = spotReviews.addResource('{reviewId}');
    spotReviewById.addMethod('DELETE', new apigateway.LambdaIntegration(lambdaStack.spotsReviewsDeleteFn), authMethodOptions);

    // ========================================
    // Business Endpoints
    // ========================================
    const businesses = this.api.root.addResource('businesses');

    // Public: discover businesses
    const businessDiscover = businesses.addResource('discover');
    businessDiscover.addMethod('GET', new apigateway.LambdaIntegration(lambdaStack.businessDiscoverFn), authMethodOptions);

    // Public: business profile by ID
    const businessById = businesses.addResource('{businessId}');
    businessById.addMethod('GET', new apigateway.LambdaIntegration(lambdaStack.businessProfileGetFn), authMethodOptions);

    // Public: business services
    const businessServices = businessById.addResource('services');
    businessServices.addMethod('GET', new apigateway.LambdaIntegration(lambdaStack.businessServicesListFn), authMethodOptions);

    // Public: business schedule
    const businessSchedule = businessById.addResource('schedule');
    businessSchedule.addMethod('GET', new apigateway.LambdaIntegration(lambdaStack.businessScheduleGetFn), authMethodOptions);

    // Public: business availability
    const businessAvailability = businessById.addResource('availability');
    businessAvailability.addMethod('GET', new apigateway.LambdaIntegration(lambdaStack.businessAvailabilityFn), authMethodOptions);

    // Public: business reviews (reuse spots reviews pattern — placeholder for now)
    const businessReviews = businessById.addResource('reviews');
    businessReviews.addMethod('GET', new apigateway.LambdaIntegration(lambdaStack.businessProfileGetFn), authMethodOptions);

    // Public: business subscription plans (returns services with category=membership)
    const businessSubPlans = businessById.addResource('subscription-plans');
    businessSubPlans.addMethod('GET', new apigateway.LambdaIntegration(lambdaStack.businessServicesListFn), authMethodOptions);

    // Auth: follow/unfollow business
    const businessFollow = businessById.addResource('follow');
    businessFollow.addMethod('POST', new apigateway.LambdaIntegration(lambdaStack.followsCreateFn), authMethodOptions);
    businessFollow.addMethod('DELETE', new apigateway.LambdaIntegration(lambdaStack.followsDeleteFn), authMethodOptions);

    // Owner: /businesses/my/*
    const businessMy = businesses.addResource('my');

    const businessMyDashboard = businessMy.addResource('dashboard');
    businessMyDashboard.addMethod('GET', new apigateway.LambdaIntegration(lambdaStack.businessDashboardFn), authMethodOptions);

    const businessMyProgram = businessMy.addResource('program');
    businessMyProgram.addMethod('GET', new apigateway.LambdaIntegration(lambdaStack.businessProgramGetFn), authMethodOptions);

    const businessMyServices = businessMy.addResource('services');
    businessMyServices.addMethod('POST', new apigateway.LambdaIntegration(lambdaStack.businessServicesCreateFn), authMethodOptions);

    const businessMyServiceById = businessMyServices.addResource('{serviceId}');
    businessMyServiceById.addMethod('PATCH', new apigateway.LambdaIntegration(lambdaStack.businessServicesUpdateFn), authMethodOptions);
    businessMyServiceById.addMethod('DELETE', new apigateway.LambdaIntegration(lambdaStack.businessServicesDeleteFn), authMethodOptions);

    const businessMyActivities = businessMy.addResource('activities');
    businessMyActivities.addMethod('POST', new apigateway.LambdaIntegration(lambdaStack.businessProgramUpdateFn), authMethodOptions);

    const businessMyActivityById = businessMyActivities.addResource('{activityId}');
    businessMyActivityById.addMethod('PUT', new apigateway.LambdaIntegration(lambdaStack.businessProgramUpdateFn), authMethodOptions);
    businessMyActivityById.addMethod('DELETE', new apigateway.LambdaIntegration(lambdaStack.businessProgramUpdateFn), authMethodOptions);

    const businessMySchedule = businessMy.addResource('schedule');
    businessMySchedule.addMethod('POST', new apigateway.LambdaIntegration(lambdaStack.businessProgramUpdateFn), authMethodOptions);

    const businessMyScheduleSlotById = businessMySchedule.addResource('{slotId}');
    businessMyScheduleSlotById.addMethod('DELETE', new apigateway.LambdaIntegration(lambdaStack.businessProgramUpdateFn), authMethodOptions);

    const businessMyTags = businessMy.addResource('tags');
    businessMyTags.addMethod('POST', new apigateway.LambdaIntegration(lambdaStack.businessProgramUpdateFn), authMethodOptions);

    const businessMyTagById = businessMyTags.addResource('{tagId}');
    businessMyTagById.addMethod('DELETE', new apigateway.LambdaIntegration(lambdaStack.businessProgramUpdateFn), authMethodOptions);

    // Payment: business checkout
    const businessCheckout = payments.addResource('business-checkout');
    businessCheckout.addMethod('POST', new apigateway.LambdaIntegration(lambdaStack.businessCheckoutFn), authMethodOptions);

    // ========================================
    // Live Streams Endpoints
    // ========================================
    const liveStreams = this.api.root.addResource('live-streams');
    const liveStreamsActive = liveStreams.addResource('active');
    liveStreamsActive.addMethod('GET', new apigateway.LambdaIntegration(lambdaStack.liveStreamsActiveFn), authMethodOptions);

    const liveStreamsStart = liveStreams.addResource('start');
    liveStreamsStart.addMethod('POST', new apigateway.LambdaIntegration(lambdaStack.liveStreamsStartFn), authMethodOptions);

    const liveStreamsEnd = liveStreams.addResource('end');
    liveStreamsEnd.addMethod('POST', new apigateway.LambdaIntegration(lambdaStack.liveStreamsEndFn), authMethodOptions);

    // ========================================
    // WAF for Secondary API
    // ========================================
    const webAcl = new wafv2.CfnWebACL(this, 'SmuppyWAF2', {
      defaultAction: { allow: {} },
      scope: 'REGIONAL',
      name: `smuppy-waf-2-${environment}`,
      visibilityConfig: {
        cloudWatchMetricsEnabled: true,
        metricName: `SmuppyWAF2-${environment}`,
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
            metricName: 'DDoSProtectionRule2',
            sampledRequestsEnabled: true,
          },
        },
        {
          name: 'WriteOperationsRateLimit',
          priority: 2,
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
            metricName: 'WriteOperationsRateLimit2',
            sampledRequestsEnabled: true,
          },
        },
        {
          name: 'AWSManagedRulesCommonRuleSet',
          priority: 3,
          overrideAction: { none: {} },
          statement: {
            managedRuleGroupStatement: {
              vendorName: 'AWS',
              name: 'AWSManagedRulesCommonRuleSet',
            },
          },
          visibilityConfig: {
            cloudWatchMetricsEnabled: true,
            metricName: 'AWSManagedRulesCommonRuleSet2',
            sampledRequestsEnabled: true,
          },
        },
        {
          name: 'AWSManagedRulesSQLiRuleSet',
          priority: 4,
          overrideAction: { none: {} },
          statement: {
            managedRuleGroupStatement: {
              vendorName: 'AWS',
              name: 'AWSManagedRulesSQLiRuleSet',
            },
          },
          visibilityConfig: {
            cloudWatchMetricsEnabled: true,
            metricName: 'AWSManagedRulesSQLiRuleSet2',
            sampledRequestsEnabled: true,
          },
        },
        {
          name: 'AWSManagedRulesKnownBadInputsRuleSet',
          priority: 5,
          overrideAction: { none: {} },
          statement: {
            managedRuleGroupStatement: {
              vendorName: 'AWS',
              name: 'AWSManagedRulesKnownBadInputsRuleSet',
            },
          },
          visibilityConfig: {
            cloudWatchMetricsEnabled: true,
            metricName: 'AWSManagedRulesKnownBadInputsRuleSet2',
            sampledRequestsEnabled: true,
          },
        },
      ],
    });

    new wafv2.CfnWebACLAssociation(this, 'WafApiAssociation2', {
      resourceArn: this.api.deploymentStage.stageArn,
      webAclArn: webAcl.attrArn,
    });
  }
}

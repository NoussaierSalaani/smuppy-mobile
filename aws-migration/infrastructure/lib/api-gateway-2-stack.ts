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
            metricName: 'AWSManagedRulesCommonRuleSet2',
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

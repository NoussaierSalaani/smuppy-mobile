import * as cdk from 'aws-cdk-lib';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as wafv2 from 'aws-cdk-lib/aws-wafv2';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { Construct } from 'constructs';
import * as path from 'path';
import { LambdaStack } from './lambda-stack';
import { LambdaStack2 } from './lambda-stack-2';
import { LambdaStackDisputes } from './lambda-stack-disputes';


export interface ApiGateway3StackProps extends cdk.NestedStackProps {
  userPool: cognito.IUserPool;
  lambdaStack: LambdaStack;
  lambdaStack2: LambdaStack2;
  lambdaStackDisputes: LambdaStackDisputes;
  environment: string;
  isProduction: boolean;
}

/**
 * API Gateway Stack 3 - Business Access & Subscription Endpoints
 * Separated to stay under CloudFormation's 500 resource limit
 */
export class ApiGateway3Stack extends cdk.NestedStack {
  public readonly api: apigateway.RestApi;

  constructor(scope: Construct, id: string, props: ApiGateway3StackProps) {
    super(scope, id, props);

    const { userPool, lambdaStack, lambdaStack2, lambdaStackDisputes, environment, isProduction } = props;

    // ========================================
    // API Gateway - REST API
    // ========================================
    this.api = new apigateway.RestApi(this, 'SmuppyAPI3', {
      restApiName: `smuppy-api-3-${environment}`,
      description: 'Smuppy REST API - Business Access Endpoints',
      cloudWatchRole: true,
      deployOptions: {
        stageName: environment,
        throttlingRateLimit: isProduction ? 50000 : 1000,
        throttlingBurstLimit: isProduction ? 25000 : 500,
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

    // Cognito Authorizer
    const authorizer = new apigateway.CognitoUserPoolsAuthorizer(this, 'CognitoAuthorizer3', {
      cognitoUserPools: [userPool],
      resultsCacheTtl: cdk.Duration.minutes(5),
    });

    const authMethodOptions: apigateway.MethodOptions = {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    };

    // ========================================
    // Business Access Endpoints
    // ========================================
    const businesses = this.api.root.addResource('businesses');

    // POST /businesses/validate-access - Validate member QR code
    const validateAccess = businesses.addResource('validate-access');
    validateAccess.addMethod('POST', new apigateway.LambdaIntegration(lambdaStack2.businessValidateAccessFn), authMethodOptions);

    // POST /businesses/log-entry - Log member check-in
    const logEntry = businesses.addResource('log-entry');
    logEntry.addMethod('POST', new apigateway.LambdaIntegration(lambdaStack2.businessLogEntryFn), authMethodOptions);

    // /businesses/subscriptions resources
    const subscriptions = businesses.addResource('subscriptions');

    // GET /businesses/subscriptions/my - List user's subscriptions
    const mySubscriptions = subscriptions.addResource('my');
    mySubscriptions.addMethod('GET', new apigateway.LambdaIntegration(lambdaStack2.businessSubscriptionManageFn), authMethodOptions);

    // /businesses/subscriptions/{subscriptionId}
    const subscriptionById = subscriptions.addResource('{subscriptionId}');

    // GET /businesses/subscriptions/{subscriptionId}/access-pass - Get member QR code
    const accessPass = subscriptionById.addResource('access-pass');
    accessPass.addMethod('GET', new apigateway.LambdaIntegration(lambdaStack2.businessSubscriptionManageFn), authMethodOptions);

    // POST /businesses/subscriptions/{subscriptionId}/cancel - Cancel subscription
    const cancelSubscription = subscriptionById.addResource('cancel');
    cancelSubscription.addMethod('POST', new apigateway.LambdaIntegration(lambdaStack2.businessSubscriptionManageFn), authMethodOptions);

    // POST /businesses/subscriptions/{subscriptionId}/reactivate - Reactivate subscription
    const reactivate = subscriptionById.addResource('reactivate');
    reactivate.addMethod('POST', new apigateway.LambdaIntegration(lambdaStack2.businessSubscriptionManageFn), authMethodOptions);

    // ========================================
    // Spots Endpoints (moved from ApiGateway2Stack — CloudFormation 500 resource limit)
    // ========================================
    const bodyValidator = new apigateway.RequestValidator(this, 'BodyValidator3', {
      restApi: this.api,
      requestValidatorName: 'body-validator-3',
      validateRequestBody: true,
    });

    const authWithBodyValidation: apigateway.MethodOptions = {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
      requestValidator: bodyValidator,
    };

    const spots = this.api.root.addResource('spots');
    spots.addMethod('GET', new apigateway.LambdaIntegration(lambdaStackDisputes.spotsListFn), authMethodOptions);
    spots.addMethod('POST', new apigateway.LambdaIntegration(lambdaStackDisputes.spotsCreateFn), authWithBodyValidation);

    const spotsNearby = spots.addResource('nearby');
    spotsNearby.addMethod('GET', new apigateway.LambdaIntegration(lambdaStackDisputes.spotsNearbyFn), authMethodOptions);

    const spotsSaved = spots.addResource('saved');
    spotsSaved.addMethod('GET', new apigateway.LambdaIntegration(lambdaStackDisputes.spotsSavedListFn), authMethodOptions);

    const spotById = spots.addResource('{id}');
    spotById.addMethod('GET', new apigateway.LambdaIntegration(lambdaStackDisputes.spotsGetFn), authMethodOptions);
    spotById.addMethod('PUT', new apigateway.LambdaIntegration(lambdaStackDisputes.spotsUpdateFn), authWithBodyValidation);
    spotById.addMethod('DELETE', new apigateway.LambdaIntegration(lambdaStackDisputes.spotsDeleteFn), authMethodOptions);

    const spotSave = spotById.addResource('save');
    spotSave.addMethod('POST', new apigateway.LambdaIntegration(lambdaStackDisputes.spotsSaveFn), authMethodOptions);
    spotSave.addMethod('DELETE', new apigateway.LambdaIntegration(lambdaStackDisputes.spotsUnsaveFn), authMethodOptions);

    const spotIsSaved = spotById.addResource('is-saved');
    spotIsSaved.addMethod('GET', new apigateway.LambdaIntegration(lambdaStackDisputes.spotsIsSavedFn), authMethodOptions);

    const spotReviews = spotById.addResource('reviews');
    spotReviews.addMethod('GET', new apigateway.LambdaIntegration(lambdaStackDisputes.spotsReviewsListFn), authMethodOptions);
    spotReviews.addMethod('POST', new apigateway.LambdaIntegration(lambdaStackDisputes.spotsReviewsCreateFn), authWithBodyValidation);

    const spotReviewById = spotReviews.addResource('{reviewId}');
    spotReviewById.addMethod('DELETE', new apigateway.LambdaIntegration(lambdaStackDisputes.spotsReviewsDeleteFn), authMethodOptions);

    // ========================================
    // Reports Endpoints (moved from ApiGatewayStack — CloudFormation 500 resource limit)
    // ========================================
    const reports = this.api.root.addResource('reports');
    const reportPost = reports.addResource('post');
    reportPost.addMethod('POST', new apigateway.LambdaIntegration(lambdaStack.reportsPostFn), authWithBodyValidation);

    const reportPeak = reports.addResource('peak');
    reportPeak.addMethod('POST', new apigateway.LambdaIntegration(lambdaStack2.reportsPeakFn), authWithBodyValidation);

    const reportComment = reports.addResource('comment');
    reportComment.addMethod('POST', new apigateway.LambdaIntegration(lambdaStack.reportsCommentFn), authWithBodyValidation);

    const reportLivestream = reports.addResource('livestream');
    reportLivestream.addMethod('POST', new apigateway.LambdaIntegration(lambdaStack.reportsLivestreamFn), authWithBodyValidation);

    const reportMessage = reports.addResource('message');
    reportMessage.addMethod('POST', new apigateway.LambdaIntegration(lambdaStack.reportsMessageFn), authWithBodyValidation);

    const reportUser = reports.addResource('user');
    reportUser.addMethod('POST', new apigateway.LambdaIntegration(lambdaStack.reportsUserFn), authWithBodyValidation);

    // ========================================
    // Health Check (public — no auth, no VPC)
    // ========================================
    const healthCheckFn = new NodejsFunction(this, 'HealthCheckFunction', {
      entry: path.join(__dirname, '../../lambda/api/health/check.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_22_X,
      memorySize: 128,
      timeout: cdk.Duration.seconds(5),
      environment: {
        ENVIRONMENT: environment,
      },
    });

    const health = this.api.root.addResource('health');
    health.addMethod('GET', new apigateway.LambdaIntegration(healthCheckFn));

    // ========================================
    // WAF for API 3
    // ========================================
    const webAcl = new wafv2.CfnWebACL(this, 'SmuppyWAF3', {
      defaultAction: { allow: {} },
      scope: 'REGIONAL',
      name: `smuppy-waf-3-${environment}`,
      visibilityConfig: {
        cloudWatchMetricsEnabled: true,
        metricName: `SmuppyWAF3-${environment}`,
        sampledRequestsEnabled: true,
      },
      rules: [
        {
          name: 'RateLimitRule',
          priority: 1,
          action: { block: {} },
          statement: {
            rateBasedStatement: {
              limit: isProduction ? 10000 : 1000,
              aggregateKeyType: 'IP',
            },
          },
          visibilityConfig: {
            cloudWatchMetricsEnabled: true,
            metricName: 'RateLimitRule3',
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
            metricName: 'AWSManagedRulesCommonRuleSet3',
            sampledRequestsEnabled: true,
          },
        },
      ],
    });

    new wafv2.CfnWebACLAssociation(this, 'WafApiAssociation3', {
      resourceArn: this.api.deploymentStage.stageArn,
      webAclArn: webAcl.attrArn,
    });

    // ========================================
    // Outputs
    // ========================================
    new cdk.CfnOutput(this, 'Api3Url', {
      value: this.api.url,
      description: 'Business Access API URL',
      exportName: `SmuppyApi3Url-${environment}`,
    });
  }
}

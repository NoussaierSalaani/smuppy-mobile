import * as cdk from 'aws-cdk-lib';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as wafv2 from 'aws-cdk-lib/aws-wafv2';
import { Construct } from 'constructs';
import { LambdaStack2 } from './lambda-stack-2';

export interface ApiGateway3StackProps extends cdk.NestedStackProps {
  userPool: cognito.IUserPool;
  lambdaStack2: LambdaStack2;
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

    const { userPool, lambdaStack2, environment, isProduction } = props;

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

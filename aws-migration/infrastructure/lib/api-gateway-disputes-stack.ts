import * as cdk from 'aws-cdk-lib';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as wafv2 from 'aws-cdk-lib/aws-wafv2';
import { Construct } from 'constructs';
import { LambdaStackDisputes } from './lambda-stack-disputes';

export interface ApiGatewayDisputesStackProps extends cdk.NestedStackProps {
  userPool: cognito.IUserPool;
  lambdaStackDisputes: LambdaStackDisputes;
  environment: string;
  isProduction: boolean;
}

/**
 * API Gateway Nested Stack - Disputes Endpoints
 * Separated to stay under CloudFormation's 500 resource limit
 */
export class ApiGatewayDisputesStack extends cdk.NestedStack {
  public readonly api: apigateway.RestApi;
  public readonly authorizer: apigateway.CognitoUserPoolsAuthorizer;

  constructor(scope: Construct, id: string, props: ApiGatewayDisputesStackProps) {
    super(scope, id, props);

    const { userPool, lambdaStackDisputes, environment, isProduction } = props;

    // ========================================
    // API Gateway - REST API for Disputes
    // ========================================
    this.api = new apigateway.RestApi(this, 'SmuppyDisputesAPI', {
      restApiName: `smuppy-api-disputes-${environment}`,
      description: 'Smuppy REST API - Disputes & Resolution Endpoints',
      cloudWatchRole: false,
      deployOptions: {
        stageName: environment,
        throttlingRateLimit: isProduction ? 2000 : 500,
        throttlingBurstLimit: isProduction ? 1000 : 250,
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
    this.authorizer = new apigateway.CognitoUserPoolsAuthorizer(this, 'CognitoAuthorizerDisputes', {
      cognitoUserPools: [userPool],
      resultsCacheTtl: cdk.Duration.minutes(5),
    });

    const authMethodOptions: apigateway.MethodOptions = {
      authorizer: this.authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    };

    const bodyValidator = new apigateway.RequestValidator(this, 'BodyValidatorDisputes', {
      restApi: this.api,
      requestValidatorName: `smuppy-body-validator-disputes-${environment}`,
      validateRequestBody: true,
      validateRequestParameters: true,
    });

    const authWithBodyValidation: apigateway.MethodOptions = {
      ...authMethodOptions,
      requestValidator: bodyValidator,
    };

    // ========================================
    // Disputes Endpoints
    // ========================================
    const disputes = this.api.root.addResource('disputes');
    disputes.addMethod('GET', new apigateway.LambdaIntegration(lambdaStackDisputes.disputesListFn), authMethodOptions);
    disputes.addMethod('POST', new apigateway.LambdaIntegration(lambdaStackDisputes.disputesCreateFn), authWithBodyValidation);

    const disputeById = disputes.addResource('{id}');
    disputeById.addMethod('GET', new apigateway.LambdaIntegration(lambdaStackDisputes.disputesGetFn), authMethodOptions);

    const disputeEvidence = disputeById.addResource('evidence');
    disputeEvidence.addMethod('POST', new apigateway.LambdaIntegration(lambdaStackDisputes.disputesSubmitEvidenceFn), authWithBodyValidation);

    const disputeAccept = disputeById.addResource('accept');
    disputeAccept.addMethod('POST', new apigateway.LambdaIntegration(lambdaStackDisputes.disputesAcceptResolutionFn), authMethodOptions);

    // ========================================
    // Admin Disputes Endpoints
    // ========================================
    const admin = this.api.root.addResource('admin');
    const adminDisputes = admin.addResource('disputes');
    adminDisputes.addMethod('GET', new apigateway.LambdaIntegration(lambdaStackDisputes.disputesAdminListFn), authMethodOptions);

    const adminDisputeById = adminDisputes.addResource('{id}');
    const adminDisputeResolve = adminDisputeById.addResource('resolve');
    adminDisputeResolve.addMethod('POST', new apigateway.LambdaIntegration(lambdaStackDisputes.disputesAdminResolveFn), authMethodOptions);

    // ========================================
    // WAF for Disputes API
    // ========================================
    const webAcl = new wafv2.CfnWebACL(this, 'SmuppyWAFDisputes', {
      defaultAction: { allow: {} },
      scope: 'REGIONAL',
      name: `smuppy-waf-disputes-${environment}`,
      visibilityConfig: {
        cloudWatchMetricsEnabled: true,
        metricName: `SmuppyWAFDisputes-${environment}`,
        sampledRequestsEnabled: true,
      },
      rules: [
        {
          name: 'DDoSProtectionRule',
          priority: 1,
          action: { block: {} },
          statement: {
            rateBasedStatement: {
              limit: isProduction ? 50000 : 5000,
              aggregateKeyType: 'IP',
            },
          },
          visibilityConfig: {
            cloudWatchMetricsEnabled: true,
            metricName: 'DDoSProtectionRuleDisputes',
            sampledRequestsEnabled: true,
          },
        },
        {
          name: 'WriteOperationsRateLimit',
          priority: 2,
          action: { block: {} },
          statement: {
            rateBasedStatement: {
              limit: isProduction ? 2500 : 500,
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
            metricName: 'WriteOperationsRateLimitDisputes',
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
            metricName: 'AWSManagedRulesCommonRuleSetDisputes',
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
            metricName: 'AWSManagedRulesSQLiRuleSetDisputes',
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
            metricName: 'AWSManagedRulesKnownBadInputsRuleSetDisputes',
            sampledRequestsEnabled: true,
          },
        },
      ],
    });

    new wafv2.CfnWebACLAssociation(this, 'WafApiAssociationDisputes', {
      resourceArn: this.api.deploymentStage.stageArn,
      webAclArn: webAcl.attrArn,
    });

    // ========================================
    // Outputs
    // ========================================
    new cdk.CfnOutput(this, 'ApiDisputesUrl', {
      value: this.api.url,
      description: 'Disputes API URL',
      exportName: `SmuppyApiDisputesUrl-${environment}`,
    });
  }
}

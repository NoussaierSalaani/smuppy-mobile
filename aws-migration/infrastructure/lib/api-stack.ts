import * as cdk from 'aws-cdk-lib';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as wafv2 from 'aws-cdk-lib/aws-wafv2';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { Construct } from 'constructs';

export interface ApiStackProps extends cdk.NestedStackProps {
  userPool: cognito.IUserPool;
  environment: string;
  isProduction: boolean;
  lambdaFunctions: { [key: string]: lambda.IFunction };
}

/**
 * API Nested Stack
 * Contains API Gateway REST API with routes
 */
export class ApiStack extends cdk.NestedStack {
  public readonly api: apigateway.RestApi;
  public readonly authorizer: apigateway.CognitoUserPoolsAuthorizer;

  constructor(scope: Construct, id: string, props: ApiStackProps) {
    super(scope, id, props);

    const { userPool, environment, isProduction, lambdaFunctions } = props;

    // API Gateway Access Logs
    const apiLogGroup = new logs.LogGroup(this, 'ApiAccessLogs', {
      logGroupName: `/aws/apigateway/smuppy-api-${environment}`,
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // REST API
    this.api = new apigateway.RestApi(this, 'SmuppyAPI', {
      restApiName: `smuppy-api-${environment}`,
      description: 'Smuppy REST API',
      deployOptions: {
        stageName: environment,
        accessLogDestination: new apigateway.LogGroupLogDestination(apiLogGroup),
        accessLogFormat: apigateway.AccessLogFormat.jsonWithStandardFields(),
        throttlingRateLimit: isProduction ? 10000 : 1000,
        throttlingBurstLimit: isProduction ? 5000 : 500,
      },
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: ['Content-Type', 'Authorization', 'X-Api-Key'],
      },
    });

    // Cognito Authorizer
    this.authorizer = new apigateway.CognitoUserPoolsAuthorizer(this, 'CognitoAuthorizer', {
      cognitoUserPools: [userPool],
      authorizerName: 'CognitoAuthorizer',
    });

    // WAF for API Gateway (production only)
    if (isProduction) {
      const webAcl = new wafv2.CfnWebACL(this, 'ApiWAF', {
        defaultAction: { allow: {} },
        scope: 'REGIONAL',
        visibilityConfig: {
          cloudWatchMetricsEnabled: true,
          metricName: 'SmuppyApiWAF',
          sampledRequestsEnabled: true,
        },
        rules: [
          {
            name: 'RateLimit',
            priority: 1,
            action: { block: {} },
            visibilityConfig: {
              cloudWatchMetricsEnabled: true,
              metricName: 'RateLimit',
              sampledRequestsEnabled: true,
            },
            statement: {
              rateBasedStatement: {
                limit: 2000,
                aggregateKeyType: 'IP',
              },
            },
          },
          {
            name: 'AWSManagedRulesCommonRuleSet',
            priority: 2,
            overrideAction: { none: {} },
            visibilityConfig: {
              cloudWatchMetricsEnabled: true,
              metricName: 'CommonRules',
              sampledRequestsEnabled: true,
            },
            statement: {
              managedRuleGroupStatement: {
                vendorName: 'AWS',
                name: 'AWSManagedRulesCommonRuleSet',
              },
            },
          },
        ],
      });

      new wafv2.CfnWebACLAssociation(this, 'ApiWAFAssociation', {
        resourceArn: this.api.deploymentStage.stageArn,
        webAclArn: webAcl.attrArn,
      });
    }

    // Create API routes
    this.createRoutes(lambdaFunctions);
  }

  private createRoutes(lambdaFunctions: { [key: string]: lambda.IFunction }) {
    const authMethodOptions: apigateway.MethodOptions = {
      authorizer: this.authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    };

    // Helper to add lambda integration
    const addRoute = (resource: apigateway.IResource, method: string, fn: lambda.IFunction, requireAuth = true) => {
      resource.addMethod(
        method,
        new apigateway.LambdaIntegration(fn),
        requireAuth ? authMethodOptions : undefined
      );
    };

    // API Resources
    const api = this.api.root.addResource('api');

    // /api/profiles
    if (lambdaFunctions.profilesGet) {
      const profiles = api.addResource('profiles');
      const profileById = profiles.addResource('{id}');
      addRoute(profileById, 'GET', lambdaFunctions.profilesGet);

      if (lambdaFunctions.profilesUpdate) {
        addRoute(profileById, 'PUT', lambdaFunctions.profilesUpdate);
      }

      if (lambdaFunctions.profilesSearch) {
        const search = profiles.addResource('search');
        addRoute(search, 'GET', lambdaFunctions.profilesSearch);
      }
    }

    // /api/posts
    if (lambdaFunctions.postsList) {
      const posts = api.addResource('posts');
      addRoute(posts, 'GET', lambdaFunctions.postsList);

      if (lambdaFunctions.postsCreate) {
        addRoute(posts, 'POST', lambdaFunctions.postsCreate);
      }

      if (lambdaFunctions.postsGet) {
        const postById = posts.addResource('{id}');
        addRoute(postById, 'GET', lambdaFunctions.postsGet);
      }
    }

    // /api/feed
    if (lambdaFunctions.feedGet) {
      const feed = api.addResource('feed');
      addRoute(feed, 'GET', lambdaFunctions.feedGet);
    }

    // /api/auth (public endpoints)
    const auth = api.addResource('auth');
    if (lambdaFunctions.authSignup) {
      const signup = auth.addResource('signup');
      addRoute(signup, 'POST', lambdaFunctions.authSignup, false);
    }
  }
}

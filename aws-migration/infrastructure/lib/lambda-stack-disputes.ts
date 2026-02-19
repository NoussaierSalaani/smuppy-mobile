import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as iam from 'aws-cdk-lib/aws-iam';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { Construct } from 'constructs';
import * as path from 'path';
import { createLambdaFactory } from './lambda-helpers';

export interface LambdaStackDisputesProps extends cdk.NestedStackProps {
  vpc: ec2.IVpc;
  lambdaSecurityGroup: ec2.ISecurityGroup;
  dbCredentials: secretsmanager.ISecret;
  stripeSecret: secretsmanager.ISecret;
  redisAuthSecret?: secretsmanager.ISecret;
  lambdaEnvironment: { [key: string]: string };
  environment: string;
  isProduction: boolean;
  apiLogGroup: logs.ILogGroup;
  rdsProxyArn?: string;
}

/**
 * Lambda Stack 3 - Disputes & Resolution Handlers
 * Separated to stay under CloudFormation's 500 resource limit
 */
export class LambdaStackDisputes extends cdk.NestedStack {
  // Disputes Lambda Functions
  public readonly disputesCreateFn: NodejsFunction;
  public readonly disputesListFn: NodejsFunction;
  public readonly disputesGetFn: NodejsFunction;
  public readonly disputesSubmitEvidenceFn: NodejsFunction;
  public readonly disputesAcceptResolutionFn: NodejsFunction;
  public readonly disputesAdminListFn: NodejsFunction;
  public readonly disputesAdminResolveFn: NodejsFunction;

  // Spots Lambda Functions
  public readonly spotsListFn: NodejsFunction;
  public readonly spotsCreateFn: NodejsFunction;
  public readonly spotsGetFn: NodejsFunction;
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

  constructor(scope: Construct, id: string, props: LambdaStackDisputesProps) {
    super(scope, id, props);

    const {
      vpc,
      lambdaSecurityGroup,
      dbCredentials,
      stripeSecret,
      lambdaEnvironment,
      environment,
      isProduction,
      apiLogGroup,
    } = props;

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
    // Disputes Lambda Functions
    // ========================================
    this.disputesCreateFn = createLambda('DisputesCreateFunction', 'disputes/create');
    this.disputesListFn = createLambda('DisputesListFunction', 'disputes/list');
    this.disputesGetFn = createLambda('DisputesGetFunction', 'disputes/get');
    this.disputesSubmitEvidenceFn = createLambda('DisputesSubmitEvidenceFunction', 'disputes/submit-evidence');
    this.disputesAcceptResolutionFn = createLambda('DisputesAcceptResolutionFunction', 'disputes/accept-resolution');
    this.disputesAdminListFn = createLambda('DisputesAdminListFunction', 'disputes/admin-list');
    this.disputesAdminResolveFn = createLambda('DisputesAdminResolveFunction', 'disputes/admin-resolve', { memory: 512, timeout: 60 });

    // Grant Stripe secret read access to admin-resolve (for refunds)
    stripeSecret.grantRead(this.disputesAdminResolveFn);

    // ========================================
    // Spots Lambda Functions
    // ========================================
    this.spotsListFn = createLambda('SpotsListFunction', 'spots/list', { memory: 1024 });
    this.spotsCreateFn = createLambda('SpotsCreateFunction', 'spots/create');
    this.spotsGetFn = createLambda('SpotsGetFunction', 'spots/get');
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

    // ========== Comprehend IAM for content moderation ==========
    const comprehendLambdas = [
      this.disputesCreateFn,
      this.spotsCreateFn,
      this.spotsUpdateFn,
      this.spotsReviewsCreateFn,
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
  }
}

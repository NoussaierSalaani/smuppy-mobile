import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as iam from 'aws-cdk-lib/aws-iam';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { Construct } from 'constructs';
import * as path from 'path';

export interface LambdaStack2Props extends cdk.NestedStackProps {
  vpc: ec2.IVpc;
  lambdaSecurityGroup: ec2.ISecurityGroup;
  dbCredentials: secretsmanager.ISecret;
  stripeSecret: secretsmanager.ISecret;
  lambdaEnvironment: { [key: string]: string };
  environment: string;
  isProduction: boolean;
  apiLogGroup: logs.ILogGroup;
}

/**
 * Lambda Stack 2 - Business Access & Subscription Handlers
 * Separated to stay under CloudFormation's 500 resource limit
 */
export class LambdaStack2 extends cdk.NestedStack {
  // Business Access Functions
  public readonly businessValidateAccessFn: NodejsFunction;
  public readonly businessLogEntryFn: NodejsFunction;
  public readonly businessSubscriptionManageFn: NodejsFunction;

  // Notification Preferences Functions
  public readonly notificationsPreferencesGetFn: NodejsFunction;
  public readonly notificationsPreferencesUpdateFn: NodejsFunction;

  // Reports - Extended (moved from LambdaStack to stay under 500 resource limit)
  public readonly reportsPeakFn: NodejsFunction;

  // Peaks - Extended (moved from LambdaStack to stay under 500 resource limit)
  public readonly peaksExpiredFn: NodejsFunction;
  public readonly peaksSaveDecisionFn: NodejsFunction;

  constructor(scope: Construct, id: string, props: LambdaStack2Props) {
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

    // Helper to create Lambda functions with standard config
    const createLambda = (name: string, entryFile: string, options?: {
      memory?: number;
      timeout?: number;
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
        tracing: lambda.Tracing.ACTIVE,
        logGroup: apiLogGroup,
        depsLockFilePath: path.join(__dirname, '../../lambda/api/package-lock.json'),
        projectRoot: path.join(__dirname, '../../lambda/api'),
      });

      dbCredentials.grantRead(fn);

      // Grant DynamoDB rate limit table access
      fn.addToRolePolicy(new iam.PolicyStatement({
        actions: ['dynamodb:UpdateItem'],
        resources: [`arn:aws:dynamodb:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:table/smuppy-rate-limit-${environment}`],
      }));

      return fn;
    };

    // ========================================
    // Business Access Lambda Functions
    // ========================================

    // Validate member access (QR code scanner)
    this.businessValidateAccessFn = createLambda('BusinessValidateAccessFunction', 'business/validate-access');

    // Log member entry (check-in)
    this.businessLogEntryFn = createLambda('BusinessLogEntryFunction', 'business/log-entry');

    // Business Subscription Management (combined handler - needs Stripe)
    this.businessSubscriptionManageFn = new NodejsFunction(this, 'BusinessSubscriptionManageFunction', {
      entry: path.join(__dirname, '../../lambda/api/business/subscription-manage.ts'),
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
    dbCredentials.grantRead(this.businessSubscriptionManageFn);
    stripeSecret.grantRead(this.businessSubscriptionManageFn);

    // ========================================
    // Notification Preferences Lambda Functions
    // ========================================
    this.notificationsPreferencesGetFn = createLambda('NotificationsPreferencesGetFunction', 'notifications/preferences-get');
    this.notificationsPreferencesUpdateFn = createLambda('NotificationsPreferencesUpdateFunction', 'notifications/preferences-update');

    // ========================================
    // Reports Extended Lambda Functions
    // (moved from LambdaStack to stay under CloudFormation 500 resource limit)
    // ========================================
    this.reportsPeakFn = createLambda('ReportsPeakFunction', 'reports/report-peak');

    // ========================================
    // Peaks Extended Lambda Functions
    // (moved from LambdaStack to stay under CloudFormation 500 resource limit)
    // ========================================
    this.peaksExpiredFn = createLambda('PeaksExpiredFunction', 'peaks/expired');
    this.peaksSaveDecisionFn = createLambda('PeaksSaveDecisionFunction', 'peaks/save-decision');
  }
}

import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as iam from 'aws-cdk-lib/aws-iam';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { Construct } from 'constructs';
import * as path from 'path';
import { createLambdaFactory } from './lambda-helpers';

export interface LambdaStack2Props extends cdk.NestedStackProps {
  vpc: ec2.IVpc;
  lambdaSecurityGroup: ec2.ISecurityGroup;
  dbCredentials: secretsmanager.ISecret;
  stripeSecret: secretsmanager.ISecret;
  redisAuthSecret?: secretsmanager.ISecret;
  appleIAPSecret?: secretsmanager.ISecret;
  googlePlaySecret?: secretsmanager.ISecret;
  lambdaEnvironment: { [key: string]: string };
  environment: string;
  isProduction: boolean;
  apiLogGroup: logs.ILogGroup;
  rdsProxyArn?: string;
}

/**
 * Lambda Stack 2 - Business Access, Subscription, & IAP Handlers
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

  // Activity History
  public readonly activityListFn: NodejsFunction;

  // IAP (In-App Purchase) Functions (moved from LambdaStack to stay under 500 resource limit)
  public readonly iapVerifyFn: NodejsFunction;
  public readonly iapNotificationsFn: NodejsFunction;

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
    });

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

    // ========================================
    // Activity History Lambda Functions
    // ========================================
    this.activityListFn = createLambda('ActivityListFunction', 'activity/list');

    // ========================================
    // IAP (In-App Purchase) Lambda Functions
    // (moved from LambdaStack to stay under CloudFormation 500 resource limit)
    // ========================================

    // DLQ for IAP notification webhooks (critical — must not lose store events)
    const iapDlq = new sqs.Queue(this, 'IAPNotificationsDLQ', {
      queueName: `smuppy-iap-notifications-dlq-${environment}`,
      retentionPeriod: cdk.Duration.days(14),
      encryption: sqs.QueueEncryption.SQS_MANAGED,
    });

    // IAP Verify Lambda - Validates receipts from App Store / Google Play
    this.iapVerifyFn = new NodejsFunction(this, 'IAPVerifyFunction', {
      entry: path.join(__dirname, '../../lambda/api/payments/iap-verify.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_22_X,
      memorySize: 256,
      timeout: cdk.Duration.seconds(30),
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      securityGroups: [lambdaSecurityGroup],
      environment: {
        ...lambdaEnvironment,
        ...(props.appleIAPSecret ? { APPLE_IAP_SECRET_ARN: props.appleIAPSecret.secretArn } : {}),
        ...(props.googlePlaySecret ? { GOOGLE_PLAY_SECRET_ARN: props.googlePlaySecret.secretArn } : {}),
      },
      reservedConcurrentExecutions: 20,
      bundling: { minify: true, sourceMap: !isProduction, externalModules: [] },
      tracing: lambda.Tracing.ACTIVE,
      logGroup: apiLogGroup,
      depsLockFilePath: path.join(__dirname, '../../lambda/api/package-lock.json'),
      projectRoot: path.join(__dirname, '../../lambda/api'),
    });
    dbCredentials.grantRead(this.iapVerifyFn);
    if (props.appleIAPSecret) props.appleIAPSecret.grantRead(this.iapVerifyFn);
    if (props.googlePlaySecret) props.googlePlaySecret.grantRead(this.iapVerifyFn);

    // IAP Notifications Lambda - App Store Server Notifications v2 + Google RTDN
    this.iapNotificationsFn = new NodejsFunction(this, 'IAPNotificationsFunction', {
      entry: path.join(__dirname, '../../lambda/api/payments/iap-notifications.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_22_X,
      memorySize: 256,
      timeout: cdk.Duration.seconds(30),
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      securityGroups: [lambdaSecurityGroup],
      environment: {
        ...lambdaEnvironment,
        ...(props.appleIAPSecret ? { APPLE_IAP_SECRET_ARN: props.appleIAPSecret.secretArn } : {}),
        ...(props.googlePlaySecret ? { GOOGLE_PLAY_SECRET_ARN: props.googlePlaySecret.secretArn } : {}),
      },
      deadLetterQueue: iapDlq,
      retryAttempts: 2,
      reservedConcurrentExecutions: 10,
      bundling: { minify: true, sourceMap: !isProduction, externalModules: [] },
      tracing: lambda.Tracing.ACTIVE,
      logGroup: apiLogGroup,
      depsLockFilePath: path.join(__dirname, '../../lambda/api/package-lock.json'),
      projectRoot: path.join(__dirname, '../../lambda/api'),
    });
    dbCredentials.grantRead(this.iapNotificationsFn);
    if (props.appleIAPSecret) props.appleIAPSecret.grantRead(this.iapNotificationsFn);
    if (props.googlePlaySecret) props.googlePlaySecret.grantRead(this.iapNotificationsFn);

    // Grant shared permissions to IAP Lambdas (Stripe, Redis, rate limiting, RDS Proxy)
    const iapLambdas = [this.iapVerifyFn, this.iapNotificationsFn];
    for (const fn of iapLambdas) {
      stripeSecret.grantRead(fn);

      if (props.redisAuthSecret) {
        props.redisAuthSecret.grantRead(fn);
      }

      fn.addToRolePolicy(new iam.PolicyStatement({
        actions: ['dynamodb:UpdateItem'],
        resources: [`arn:aws:dynamodb:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:table/smuppy-rate-limit-${environment}`],
      }));

      if (props.rdsProxyArn) {
        fn.addToRolePolicy(new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: ['rds-db:connect'],
          resources: [props.rdsProxyArn],
        }));
      }
    }
  }
}

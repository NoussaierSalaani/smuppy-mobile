/**
 * Shared Lambda Factory for CDK Stacks
 *
 * Eliminates duplicated createLambda() definitions across
 * lambda-stack.ts, lambda-stack-2.ts, lambda-stack-3.ts, lambda-stack-disputes.ts.
 */

import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as iam from 'aws-cdk-lib/aws-iam';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { Construct } from 'constructs';
import * as path from 'path';

export interface LambdaFactoryConfig {
  scope: Construct;
  vpc: ec2.IVpc;
  lambdaSecurityGroup: ec2.ISecurityGroup;
  dbCredentials: secretsmanager.ISecret;
  lambdaEnvironment: { [key: string]: string };
  environment: string;
  isProduction: boolean;
  apiLogGroup: logs.ILogGroup;
  redisAuthSecret?: secretsmanager.ISecret;
  rdsProxyArn?: string;
}

export interface CreateLambdaOptions {
  memory?: number;
  timeout?: number;
  reservedConcurrency?: number;
}

/**
 * Create a factory function for building Lambda functions with standard configuration.
 * Each Lambda stack calls this once, then uses the returned function to create individual Lambdas.
 *
 * Usage:
 * ```
 * const createLambda = createLambdaFactory({ scope: this, vpc, ... });
 * this.myFn = createLambda('MyFunction', 'path/to/handler', { memory: 1024 });
 * ```
 */
export function createLambdaFactory(config: LambdaFactoryConfig) {
  const {
    scope,
    vpc,
    lambdaSecurityGroup,
    dbCredentials,
    lambdaEnvironment,
    environment,
    isProduction,
    apiLogGroup,
    redisAuthSecret,
    rdsProxyArn,
  } = config;

  return (name: string, entryFile: string, options?: CreateLambdaOptions): NodejsFunction => {
    const fn = new NodejsFunction(scope, name, {
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
      reservedConcurrentExecutions: options?.reservedConcurrency,
      tracing: lambda.Tracing.ACTIVE,
      logGroup: apiLogGroup,
      depsLockFilePath: path.join(__dirname, '../../lambda/api/package-lock.json'),
      projectRoot: path.join(__dirname, '../../lambda/api'),
    });

    dbCredentials.grantRead(fn);

    // Grant Redis auth secret read permission
    if (redisAuthSecret) {
      redisAuthSecret.grantRead(fn);
    }

    // Grant DynamoDB rate limit table access
    fn.addToRolePolicy(new iam.PolicyStatement({
      actions: ['dynamodb:UpdateItem'],
      resources: [`arn:aws:dynamodb:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:table/smuppy-rate-limit-${environment}`],
    }));

    // Grant RDS Proxy IAM authentication permissions
    if (rdsProxyArn) {
      fn.addToRolePolicy(new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['rds-db:connect'],
        resources: [rdsProxyArn],
      }));
    }

    return fn;
  };
}

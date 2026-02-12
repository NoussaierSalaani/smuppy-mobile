import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as iam from 'aws-cdk-lib/aws-iam';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { Construct } from 'constructs';
import * as path from 'path';

export interface LambdaStack3Props extends cdk.NestedStackProps {
  vpc: ec2.IVpc;
  lambdaSecurityGroup: ec2.ISecurityGroup;
  dbCredentials: secretsmanager.ISecret;
  redisAuthSecret?: secretsmanager.ISecret;
  lambdaEnvironment: { [key: string]: string };
  environment: string;
  isProduction: boolean;
  apiLogGroup: logs.ILogGroup;
  rdsProxyArn?: string;
}

/**
 * Lambda Stack 3 - Groups, Events, Battles, Challenges, Feed Variants, Search
 * Separated to stay under CloudFormation's 500 resource limit
 */
export class LambdaStack3 extends cdk.NestedStack {
  // Groups Lambda Functions
  public readonly groupsCreateFn: NodejsFunction;
  public readonly groupsListFn: NodejsFunction;
  public readonly groupsGetFn: NodejsFunction;
  public readonly groupsJoinFn: NodejsFunction;
  public readonly groupsLeaveFn: NodejsFunction;

  // Events Lambda Functions
  public readonly eventsCreateFn: NodejsFunction;
  public readonly eventsListFn: NodejsFunction;
  public readonly eventsJoinFn: NodejsFunction;

  // Battles Lambda Functions
  public readonly battlesCreateFn: NodejsFunction;
  public readonly battlesJoinFn: NodejsFunction;

  // Challenges Lambda Functions
  public readonly challengesCreateFn: NodejsFunction;
  public readonly challengesListFn: NodejsFunction;
  public readonly challengesRespondFn: NodejsFunction;
  public readonly challengesResponsesFn: NodejsFunction;

  // Feed Variants Lambda Functions
  public readonly feedOptimizedFn: NodejsFunction;
  public readonly feedFollowingFn: NodejsFunction;
  public readonly feedDiscoverFn: NodejsFunction;

  // Search & Discovery Lambda Functions
  public readonly postsSearchFn: NodejsFunction;
  public readonly peaksSearchFn: NodejsFunction;
  public readonly hashtagsTrendingFn: NodejsFunction;

  // Interests & Expertise Lambda Functions
  public readonly interestsListFn: NodejsFunction;
  public readonly expertiseListFn: NodejsFunction;

  // Posts Batch Lambda Functions
  public readonly postsLikesBatchFn: NodejsFunction;
  public readonly postsSavesBatchFn: NodejsFunction;

  constructor(scope: Construct, id: string, props: LambdaStack3Props) {
    super(scope, id, props);

    const {
      vpc,
      lambdaSecurityGroup,
      dbCredentials,
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

      // Grant Redis auth secret read permission
      if (props.redisAuthSecret) {
        props.redisAuthSecret.grantRead(fn);
      }

      // Grant DynamoDB rate limit table access
      fn.addToRolePolicy(new iam.PolicyStatement({
        actions: ['dynamodb:UpdateItem'],
        resources: [`arn:aws:dynamodb:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:table/smuppy-rate-limit-${environment}`],
      }));

      // Grant RDS Proxy IAM authentication permissions
      if (props.rdsProxyArn) {
        fn.addToRolePolicy(new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: ['rds-db:connect'],
          resources: [props.rdsProxyArn],
        }));
      }

      return fn;
    };

    // ========================================
    // Groups Lambda Functions
    // ========================================
    this.groupsCreateFn = createLambda('GroupsCreateFunction', 'groups/create');
    this.groupsListFn = createLambda('GroupsListFunction', 'groups/list');
    this.groupsGetFn = createLambda('GroupsGetFunction', 'groups/get');
    this.groupsJoinFn = createLambda('GroupsJoinFunction', 'groups/join');
    this.groupsLeaveFn = createLambda('GroupsLeaveFunction', 'groups/leave');

    // ========================================
    // Events Lambda Functions
    // ========================================
    this.eventsCreateFn = createLambda('EventsCreateFunction', 'events/create');
    this.eventsListFn = createLambda('EventsListFunction', 'events/list');
    this.eventsJoinFn = createLambda('EventsJoinFunction', 'events/join');

    // ========================================
    // Battles Lambda Functions
    // ========================================
    this.battlesCreateFn = createLambda('BattlesCreateFunction', 'battles/create');
    this.battlesJoinFn = createLambda('BattlesJoinFunction', 'battles/join');

    // ========================================
    // Challenges Lambda Functions
    // ========================================
    this.challengesCreateFn = createLambda('ChallengesCreateFunction', 'challenges/create');
    this.challengesListFn = createLambda('ChallengesListFunction', 'challenges/list');
    this.challengesRespondFn = createLambda('ChallengesRespondFunction', 'challenges/respond');
    this.challengesResponsesFn = createLambda('ChallengesResponsesFunction', 'challenges/responses');

    // ========================================
    // Feed Variants Lambda Functions
    // ========================================
    this.feedOptimizedFn = createLambda('FeedOptimizedFunction', 'feed/optimized', { memory: 2048, timeout: 60 });
    this.feedFollowingFn = createLambda('FeedFollowingFunction', 'feed/following', { memory: 1024 });
    this.feedDiscoverFn = createLambda('FeedDiscoverFunction', 'feed/discover', { memory: 1024 });

    // ========================================
    // Search & Discovery Lambda Functions
    // ========================================
    this.postsSearchFn = createLambda('PostsSearchFunction', 'posts/search', { memory: 1024 });
    this.peaksSearchFn = createLambda('PeaksSearchFunction', 'peaks/search', { memory: 1024 });
    this.hashtagsTrendingFn = createLambda('HashtagsTrendingFunction', 'hashtags/trending');

    // ========================================
    // Interests & Expertise Lambda Functions
    // ========================================
    this.interestsListFn = createLambda('InterestsListFunction', 'interests/list');
    this.expertiseListFn = createLambda('ExpertiseListFunction', 'expertise/list');

    // ========================================
    // Posts Batch Lambda Functions
    // ========================================
    this.postsLikesBatchFn = createLambda('PostsLikesBatchFunction', 'posts/likes-batch');
    this.postsSavesBatchFn = createLambda('PostsSavesBatchFunction', 'posts/saves-batch');

    // ========== Comprehend IAM for content moderation ==========
    const comprehendLambdas = [
      this.battlesCreateFn,
      this.challengesCreateFn,
      this.eventsCreateFn,
      this.groupsCreateFn,
    ];
    for (const fn of comprehendLambdas) {
      fn.addToRolePolicy(new iam.PolicyStatement({
        actions: ['comprehend:DetectToxicContent'],
        resources: ['*'],
      }));
    }
  }
}

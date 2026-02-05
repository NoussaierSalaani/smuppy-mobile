import * as cdk from 'aws-cdk-lib';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';

export interface DatabaseStackProps extends cdk.NestedStackProps {
  vpc: ec2.IVpc;
  rdsSecurityGroup: ec2.ISecurityGroup;
  environment: string;
  isProduction: boolean;
}

/**
 * Database Nested Stack
 * Contains RDS Aurora PostgreSQL cluster
 */
export class DatabaseStack extends cdk.NestedStack {
  public readonly cluster: rds.DatabaseCluster;
  public readonly dbCredentials: secretsmanager.ISecret;
  public readonly rdsProxy: rds.DatabaseProxy;

  constructor(scope: Construct, id: string, props: DatabaseStackProps) {
    super(scope, id, props);

    const { vpc, rdsSecurityGroup, environment, isProduction } = props;

    // KMS Key for encryption
    const dbEncryptionKey = new kms.Key(this, 'DBEncryptionKey', {
      enableKeyRotation: true,
      description: 'KMS key for RDS encryption',
      alias: `smuppy-db-key-${environment}`,
      removalPolicy: isProduction ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
    });

    // Database credentials
    this.dbCredentials = new secretsmanager.Secret(this, 'DBCredentials', {
      secretName: `smuppy/${environment}/db-credentials`,
      generateSecretString: {
        secretStringTemplate: JSON.stringify({ username: 'smuppy_admin' }),
        generateStringKey: 'password',
        excludePunctuation: true,
        passwordLength: 32,
      },
      removalPolicy: isProduction ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
    });

    // Parameter groups
    const clusterParameterGroup = new rds.ParameterGroup(this, 'ClusterParamGroup', {
      engine: rds.DatabaseClusterEngine.auroraPostgres({
        version: rds.AuroraPostgresEngineVersion.VER_15_4,
      }),
      parameters: {
        'shared_preload_libraries': 'pg_stat_statements',
        'log_statement': 'ddl',
        'log_min_duration_statement': '1000',
      },
    });

    // Aurora PostgreSQL Cluster
    this.cluster = new rds.DatabaseCluster(this, 'Database', {
      engine: rds.DatabaseClusterEngine.auroraPostgres({
        version: rds.AuroraPostgresEngineVersion.VER_15_4,
      }),
      credentials: rds.Credentials.fromSecret(this.dbCredentials),
      defaultDatabaseName: 'smuppy',
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      securityGroups: [rdsSecurityGroup],
      parameterGroup: clusterParameterGroup,
      storageEncrypted: true,
      storageEncryptionKey: dbEncryptionKey,
      deletionProtection: isProduction,
      backup: {
        retention: cdk.Duration.days(isProduction ? 30 : 7),
        preferredWindow: '03:00-04:00',
      },
      writer: rds.ClusterInstance.provisioned('Writer', {
        instanceType: isProduction
          ? ec2.InstanceType.of(ec2.InstanceClass.R6G, ec2.InstanceSize.LARGE)
          : ec2.InstanceType.of(ec2.InstanceClass.T4G, ec2.InstanceSize.MEDIUM),
        publiclyAccessible: false,
      }),
      readers: isProduction ? [
        rds.ClusterInstance.provisioned('Reader', {
          instanceType: ec2.InstanceType.of(ec2.InstanceClass.R6G, ec2.InstanceSize.LARGE),
          publiclyAccessible: false,
        }),
      ] : [
        rds.ClusterInstance.provisioned('Reader', {
          instanceType: ec2.InstanceType.of(ec2.InstanceClass.T4G, ec2.InstanceSize.MEDIUM),
          publiclyAccessible: false,
        }),
      ],
      removalPolicy: isProduction ? cdk.RemovalPolicy.SNAPSHOT : cdk.RemovalPolicy.DESTROY,
    });

    // RDS Proxy for connection pooling
    this.rdsProxy = new rds.DatabaseProxy(this, 'RDSProxy', {
      proxyTarget: rds.ProxyTarget.fromCluster(this.cluster),
      secrets: [this.dbCredentials],
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      securityGroups: [rdsSecurityGroup],
      requireTLS: true,
      idleClientTimeout: cdk.Duration.minutes(30),
      maxConnectionsPercent: 90,
      maxIdleConnectionsPercent: 10,
    });

    // Lambda will connect using IAM auth or password from secrets

    // Store endpoints in SSM
    new ssm.StringParameter(this, 'DBWriterEndpoint', {
      parameterName: `/smuppy/${environment}/db/writer-endpoint`,
      stringValue: this.cluster.clusterEndpoint.hostname,
    });

    new ssm.StringParameter(this, 'DBProxyEndpoint', {
      parameterName: `/smuppy/${environment}/db/proxy-endpoint`,
      stringValue: this.rdsProxy.endpoint,
    });
  }
}

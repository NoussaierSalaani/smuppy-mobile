import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as cloudtrail from 'aws-cdk-lib/aws-cloudtrail';
import { Construct } from 'constructs';

/**
 * Remaining SECURITY TODOs:
 * - #38: Enable CloudTrail with S3 log archiving for API audit trail
 * - #40: Schedule quarterly backup restoration tests (RDS point-in-time recovery)
 *
 * DONE: #36 (secrets rotation — smuppy-stack.ts), #37/#22 (GuardDuty — security-phase2-stack.ts),
 *       #39 (VPC endpoints SQS + CloudWatch — below)
 */

export interface NetworkStackProps extends cdk.NestedStackProps {
  environment: string;
  isProduction: boolean;
}

/**
 * Network Nested Stack
 * Contains VPC, Security Groups, and VPC Endpoints
 */
export class NetworkStack extends cdk.NestedStack {
  public readonly vpc: ec2.Vpc;
  public readonly lambdaSecurityGroup: ec2.SecurityGroup;
  public readonly rdsSecurityGroup: ec2.SecurityGroup;
  public readonly redisSecurityGroup: ec2.SecurityGroup;

  constructor(scope: Construct, id: string, props: NetworkStackProps) {
    super(scope, id, props);

    const { isProduction } = props;

    // Flow Logs log group with short retention to control CloudWatch costs
    const flowLogGroup = new logs.LogGroup(this, 'VPCFlowLogGroup', {
      // SECURITY: 90 days minimum for compliance; TWO_WEEKS for staging cost savings
      retention: isProduction ? logs.RetentionDays.THREE_MONTHS : logs.RetentionDays.TWO_WEEKS,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // VPC - High Availability Network
    this.vpc = new ec2.Vpc(this, 'SmuppyVPC', {
      maxAzs: isProduction ? 3 : 2,
      natGateways: isProduction ? 2 : 1,
      subnetConfiguration: [
        {
          cidrMask: 20,
          name: 'Public',
          subnetType: ec2.SubnetType.PUBLIC,
        },
        {
          cidrMask: 20,
          name: 'Private',
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
        },
        {
          cidrMask: 24,
          name: 'Isolated',
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
        },
      ],
      flowLogs: {
        'FlowLog': {
          destination: ec2.FlowLogDestination.toCloudWatchLogs(flowLogGroup),
          trafficType: ec2.FlowLogTrafficType.ALL,
        },
      },
    });

    // CloudTrail - Audit logging (multi-region)
    const cloudTrailBucket = new s3.Bucket(this, 'CloudTrailBucket', {
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      versioned: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    new cloudtrail.Trail(this, 'AuditTrail', {
      trailName: `smuppy-audit-${props.environment}`,
      bucket: cloudTrailBucket,
      isMultiRegionTrail: true,
      enableFileValidation: true,
      includeGlobalServiceEvents: true,
      managementEvents: cloudtrail.ReadWriteType.ALL,
      cloudWatchLogRetention: logs.RetentionDays.THREE_MONTHS,
    });

    // S3 Gateway Endpoint (free)
    this.vpc.addGatewayEndpoint('S3Endpoint', {
      service: ec2.GatewayVpcEndpointAwsService.S3,
      subnets: [{ subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS }],
    });

    // Secrets Manager Interface Endpoint
    this.vpc.addInterfaceEndpoint('SecretsManagerEndpoint', {
      service: ec2.InterfaceVpcEndpointAwsService.SECRETS_MANAGER,
      subnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      privateDnsEnabled: true,
    });

    // SQS Interface Endpoint (#39) — reduces NAT traffic for DLQ operations
    this.vpc.addInterfaceEndpoint('SQSEndpoint', {
      service: ec2.InterfaceVpcEndpointAwsService.SQS,
      subnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      privateDnsEnabled: true,
    });

    // CloudWatch Logs Interface Endpoint (#39) — reduces NAT traffic for Lambda logging
    this.vpc.addInterfaceEndpoint('CloudWatchLogsEndpoint', {
      service: ec2.InterfaceVpcEndpointAwsService.CLOUDWATCH_LOGS,
      subnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      privateDnsEnabled: true,
    });

    // Security Groups
    this.lambdaSecurityGroup = new ec2.SecurityGroup(this, 'LambdaSG', {
      vpc: this.vpc,
      description: 'Security group for Lambda functions',
      allowAllOutbound: false,
    });
    // Allow HTTPS outbound only (Stripe, Google, AWS services, etc.)
    this.lambdaSecurityGroup.addEgressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(443), 'HTTPS outbound');
    // Allow PostgreSQL to RDS via private subnets
    this.lambdaSecurityGroup.addEgressRule(ec2.Peer.ipv4(this.vpc.vpcCidrBlock), ec2.Port.tcp(5432), 'RDS PostgreSQL');
    // Allow Redis to ElastiCache via private subnets
    this.lambdaSecurityGroup.addEgressRule(ec2.Peer.ipv4(this.vpc.vpcCidrBlock), ec2.Port.tcp(6379), 'ElastiCache Redis');

    this.rdsSecurityGroup = new ec2.SecurityGroup(this, 'RDSSG', {
      vpc: this.vpc,
      description: 'Security group for RDS',
      allowAllOutbound: false,
    });

    this.redisSecurityGroup = new ec2.SecurityGroup(this, 'RedisSG', {
      vpc: this.vpc,
      description: 'Security group for Redis',
      allowAllOutbound: false,
    });

    // Allow Lambda to access RDS
    this.rdsSecurityGroup.addIngressRule(
      this.lambdaSecurityGroup,
      ec2.Port.tcp(5432),
      'Allow Lambda to access PostgreSQL'
    );

    // Allow Lambda to access Redis
    this.redisSecurityGroup.addIngressRule(
      this.lambdaSecurityGroup,
      ec2.Port.tcp(6379),
      'Allow Lambda to access Redis'
    );

    // ========================================
    // Network ACLs — defense-in-depth layer
    // ========================================

    // NACL for Private subnets (Lambda): allow HTTPS, RDS, Redis outbound + ephemeral inbound
    const privateNacl = new ec2.NetworkAcl(this, 'PrivateSubnetNACL', {
      vpc: this.vpc,
      subnetSelection: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
    });

    // Inbound: ephemeral ports (return traffic from outbound connections)
    privateNacl.addEntry('PrivateInboundEphemeral', {
      ruleNumber: 100,
      cidr: ec2.AclCidr.anyIpv4(),
      traffic: ec2.AclTraffic.tcpPortRange(1024, 65535),
      direction: ec2.TrafficDirection.INGRESS,
      ruleAction: ec2.Action.ALLOW,
    });

    // Outbound: HTTPS (Stripe, Cognito, AWS APIs)
    privateNacl.addEntry('PrivateOutboundHTTPS', {
      ruleNumber: 100,
      cidr: ec2.AclCidr.anyIpv4(),
      traffic: ec2.AclTraffic.tcpPort(443),
      direction: ec2.TrafficDirection.EGRESS,
      ruleAction: ec2.Action.ALLOW,
    });

    // Outbound: PostgreSQL to Isolated subnets
    privateNacl.addEntry('PrivateOutboundPostgres', {
      ruleNumber: 110,
      cidr: ec2.AclCidr.anyIpv4(),
      traffic: ec2.AclTraffic.tcpPort(5432),
      direction: ec2.TrafficDirection.EGRESS,
      ruleAction: ec2.Action.ALLOW,
    });

    // Outbound: Redis
    privateNacl.addEntry('PrivateOutboundRedis', {
      ruleNumber: 120,
      cidr: ec2.AclCidr.anyIpv4(),
      traffic: ec2.AclTraffic.tcpPort(6379),
      direction: ec2.TrafficDirection.EGRESS,
      ruleAction: ec2.Action.ALLOW,
    });

    // Outbound: ephemeral ports (return traffic)
    privateNacl.addEntry('PrivateOutboundEphemeral', {
      ruleNumber: 130,
      cidr: ec2.AclCidr.anyIpv4(),
      traffic: ec2.AclTraffic.tcpPortRange(1024, 65535),
      direction: ec2.TrafficDirection.EGRESS,
      ruleAction: ec2.Action.ALLOW,
    });

    // NACLs for isolated subnets (database layer) — only allow PostgreSQL from private subnets
    const isolatedNacl = new ec2.NetworkAcl(this, 'IsolatedNacl', {
      vpc: this.vpc,
      subnetSelection: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
    });

    // Allow inbound PostgreSQL from private subnets
    isolatedNacl.addEntry('AllowPostgresInbound', {
      cidr: ec2.AclCidr.ipv4(this.vpc.vpcCidrBlock),
      ruleNumber: 100,
      traffic: ec2.AclTraffic.tcpPort(5432),
      direction: ec2.TrafficDirection.INGRESS,
      ruleAction: ec2.Action.ALLOW,
    });

    // Allow inbound Redis from private subnets
    isolatedNacl.addEntry('AllowRedisInbound', {
      cidr: ec2.AclCidr.ipv4(this.vpc.vpcCidrBlock),
      ruleNumber: 110,
      traffic: ec2.AclTraffic.tcpPort(6379),
      direction: ec2.TrafficDirection.INGRESS,
      ruleAction: ec2.Action.ALLOW,
    });

    // Allow ephemeral port responses outbound
    isolatedNacl.addEntry('AllowEphemeralOutbound', {
      cidr: ec2.AclCidr.ipv4(this.vpc.vpcCidrBlock),
      ruleNumber: 100,
      traffic: ec2.AclTraffic.tcpPortRange(1024, 65535),
      direction: ec2.TrafficDirection.EGRESS,
      ruleAction: ec2.Action.ALLOW,
    });

    // Deny all other traffic (implicit, but explicit for clarity)
    isolatedNacl.addEntry('DenyAllInbound', {
      cidr: ec2.AclCidr.anyIpv4(),
      ruleNumber: 32767,
      traffic: ec2.AclTraffic.allTraffic(),
      direction: ec2.TrafficDirection.INGRESS,
      ruleAction: ec2.Action.DENY,
    });

    isolatedNacl.addEntry('DenyAllOutbound', {
      cidr: ec2.AclCidr.anyIpv4(),
      ruleNumber: 32767,
      traffic: ec2.AclTraffic.allTraffic(),
      direction: ec2.TrafficDirection.EGRESS,
      ruleAction: ec2.Action.DENY,
    });
  }
}

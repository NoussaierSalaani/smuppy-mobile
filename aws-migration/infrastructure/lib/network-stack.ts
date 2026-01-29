import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';

/**
 * SECURITY TODOs (audit issues 36-40):
 * - #36: Enable automatic secrets rotation (30-day cycle) for DB credentials and Stripe keys
 * - #37: Enable GuardDuty for runtime threat detection
 * - #38: Enable CloudTrail with S3 log archiving for API audit trail
 * - #39: Add VPC endpoints for SQS and CloudWatch to reduce NAT traffic
 * - #40: Schedule quarterly backup restoration tests (RDS point-in-time recovery)
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

    // Security Groups
    this.lambdaSecurityGroup = new ec2.SecurityGroup(this, 'LambdaSG', {
      vpc: this.vpc,
      description: 'Security group for Lambda functions',
      // TODO: Restrict outbound to specific CIDR ranges (RDS, Secrets Manager, S3, Stripe API)
      // For now, allowAllOutbound is needed for Stripe API calls and other integrations
      allowAllOutbound: true,
    });

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

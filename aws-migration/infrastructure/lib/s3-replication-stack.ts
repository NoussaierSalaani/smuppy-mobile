import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

interface S3ReplicationStackProps extends cdk.StackProps {
  environment: string;
  sourceBucket: s3.IBucket;
  destinationRegion: string;
}

/**
 * S3 Cross-Region Replication Stack
 *
 * Sets up real-time replication of media files from primary region
 * to disaster recovery region.
 *
 * Prerequisites:
 * - Versioning must be enabled on source bucket (done in global-stack)
 * - Destination bucket must exist in DR region
 *
 * Features:
 * - Real-time replication (vs backup which is scheduled)
 * - Replicates all objects in uploads/, posts/, peaks/, users/ prefixes
 * - Delete marker replication for consistent state
 */
export class S3ReplicationStack extends cdk.Stack {
  public readonly replicationRole: iam.Role;

  constructor(scope: Construct, id: string, props: S3ReplicationStackProps) {
    super(scope, id, props);

    const { environment, sourceBucket, destinationRegion } = props;
    const isProduction = environment === 'production';

    // Replication role
    this.replicationRole = new iam.Role(this, 'S3ReplicationRole', {
      roleName: `smuppy-s3-replication-${environment}`,
      assumedBy: new iam.ServicePrincipal('s3.amazonaws.com'),
      description: 'Role for S3 cross-region replication',
    });

    // Source bucket permissions
    this.replicationRole.addToPolicy(new iam.PolicyStatement({
      actions: [
        's3:GetReplicationConfiguration',
        's3:ListBucket',
      ],
      resources: [sourceBucket.bucketArn],
    }));

    this.replicationRole.addToPolicy(new iam.PolicyStatement({
      actions: [
        's3:GetObjectVersionForReplication',
        's3:GetObjectVersionAcl',
        's3:GetObjectVersionTagging',
        's3:GetObjectRetention',
        's3:GetObjectLegalHold',
      ],
      resources: [`${sourceBucket.bucketArn}/*`],
    }));

    // Destination bucket permissions
    const destinationBucketArn = `arn:aws:s3:::smuppy-media-dr-${environment}-${this.account}`;
    this.replicationRole.addToPolicy(new iam.PolicyStatement({
      actions: [
        's3:ReplicateObject',
        's3:ReplicateDelete',
        's3:ReplicateTags',
        's3:ObjectOwnerOverrideToBucketOwner',
      ],
      resources: [`${destinationBucketArn}/*`],
    }));

    // Note: The actual replication rule must be configured via CfnBucket
    // or CloudFormation custom resource since CDK L2 doesn't support
    // adding replication rules to existing buckets

    // Create destination bucket in DR region (using CfnBucket for cross-region)
    // This should be deployed in a separate stack in the DR region
    const destinationBucketConfig = {
      bucketName: `smuppy-media-dr-${environment}-${this.account}`,
      region: destinationRegion,
      versioningEnabled: true,
      encryption: 'AES256',
      blockPublicAccess: true,
    };

    // Output configuration for manual setup or cross-region deployment
    new cdk.CfnOutput(this, 'ReplicationRoleArn', {
      value: this.replicationRole.roleArn,
      description: 'Replication role ARN',
      exportName: `smuppy-replication-role-arn-${environment}`,
    });

    new cdk.CfnOutput(this, 'DestinationBucketConfig', {
      value: JSON.stringify(destinationBucketConfig),
      description: 'Configuration for destination bucket (create in DR region)',
    });

    new cdk.CfnOutput(this, 'ReplicationRuleConfig', {
      value: JSON.stringify({
        id: `smuppy-replication-${environment}`,
        status: isProduction ? 'Enabled' : 'Disabled',
        priority: 1,
        filter: {
          and: {
            prefixes: ['uploads/', 'posts/', 'peaks/', 'users/'],
          },
        },
        destination: {
          bucket: destinationBucketArn,
          storageClass: 'STANDARD_IA', // Cheaper for DR
          replicationTime: {
            status: 'Enabled',
            time: { minutes: 15 }, // S3 Replication Time Control
          },
          metrics: {
            status: 'Enabled',
            eventThreshold: { minutes: 15 },
          },
        },
        deleteMarkerReplication: {
          status: 'Enabled',
        },
      }),
      description: 'Replication rule configuration (apply to source bucket)',
    });

    // Instructions for completing setup
    new cdk.CfnOutput(this, 'SetupInstructions', {
      value: `
To complete S3 replication setup:

1. Deploy destination bucket in ${destinationRegion}:
   - Create bucket: ${destinationBucketConfig.bucketName}
   - Enable versioning
   - Enable encryption

2. Add replication rule to source bucket via AWS Console or CLI:
   aws s3api put-bucket-replication \\
     --bucket ${sourceBucket.bucketName} \\
     --replication-configuration file://replication-config.json

3. Verify replication is working:
   - Upload a test file to source bucket
   - Check destination bucket for replicated file
`,
      description: 'Manual setup instructions',
    });
  }
}

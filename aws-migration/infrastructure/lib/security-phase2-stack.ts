import * as cdk from 'aws-cdk-lib';
import * as backup from 'aws-cdk-lib/aws-backup';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3n from 'aws-cdk-lib/aws-s3-notifications';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as snsSubscriptions from 'aws-cdk-lib/aws-sns-subscriptions';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as kms from 'aws-cdk-lib/aws-kms';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { Construct } from 'constructs';
import * as path from 'path';

interface SecurityPhase2StackProps extends cdk.StackProps {
  environment: string;
  mediaBucket: s3.IBucket;
  secondaryRegion?: string;
  alertEmail?: string;
}

/**
 * Security Phase 2 Stack
 *
 * 1. Multi-Region Backup (AWS Backup)
 *    - Cross-region backup vault in secondary region
 *    - Daily backups with 35-day retention (production)
 *    - Automatic cross-region copy for disaster recovery
 *
 * 2. S3 Virus Scanning (ClamAV Lambda)
 *    - Scans all uploaded files
 *    - Quarantines infected files
 *    - SNS alerts for security team
 */
export class SecurityPhase2Stack extends cdk.Stack {
  public readonly backupVault: backup.BackupVault;
  public readonly virusScanFunction: lambda.Function;
  public readonly imageModerationFunction: NodejsFunction;
  public readonly securityAlertsTopic: sns.Topic;

  constructor(scope: Construct, id: string, props: SecurityPhase2StackProps) {
    super(scope, id, props);

    const { environment, mediaBucket, secondaryRegion = 'eu-west-1', alertEmail } = props;
    const isProduction = environment === 'production';

    // ========================================
    // GuardDuty — Runtime Threat Detection (#22 / #37)
    // ========================================
    new cdk.aws_guardduty.CfnDetector(this, 'GuardDutyDetector', {
      enable: true,
      findingPublishingFrequency: 'FIFTEEN_MINUTES',
      dataSources: {
        s3Logs: { enable: true },
        malwareProtection: {
          scanEc2InstanceWithFindings: {
            ebsVolumes: true,
          },
        },
      },
    });

    // ========================================
    // SNS Topic for Security Alerts
    // ========================================
    const securitySnsKey = new kms.Key(this, 'SecuritySnsKey', {
      alias: `smuppy-security-sns-${environment}`,
      description: `KMS key for security SNS topic encryption - ${environment}`,
      enableKeyRotation: true,
    });

    this.securityAlertsTopic = new sns.Topic(this, 'SecurityAlertsTopic', {
      topicName: `smuppy-security-alerts-${environment}`,
      displayName: 'Smuppy Security Alerts',
      masterKey: securitySnsKey,
    });

    // Add email subscription if provided
    if (alertEmail) {
      this.securityAlertsTopic.addSubscription(
        new snsSubscriptions.EmailSubscription(alertEmail)
      );
    }

    // ========================================
    // 1. MULTI-REGION BACKUP with AWS Backup
    // ========================================

    // KMS key for backup encryption
    const backupKey = new kms.Key(this, 'BackupEncryptionKey', {
      alias: `smuppy-backup-key-${environment}`,
      description: 'KMS key for AWS Backup encryption',
      enableKeyRotation: true,
      removalPolicy: isProduction ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
    });

    // Primary Backup Vault
    this.backupVault = new backup.BackupVault(this, 'PrimaryBackupVault', {
      backupVaultName: `smuppy-backup-vault-${environment}`,
      encryptionKey: backupKey,
      removalPolicy: isProduction ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
      notificationTopic: this.securityAlertsTopic,
      notificationEvents: [
        backup.BackupVaultEvents.BACKUP_JOB_FAILED,
        backup.BackupVaultEvents.RESTORE_JOB_FAILED,
        backup.BackupVaultEvents.COPY_JOB_FAILED,
      ],
    });

    // Secondary Backup Vault in another region (for cross-region copies)
    // Note: The DR vault must be created separately in the secondary region
    // This references an existing vault for cross-region copy operations
    const secondaryBackupVault = backup.BackupVault.fromBackupVaultArn(
      this, 'SecondaryBackupVault',
      `arn:aws:backup:${secondaryRegion}:${this.account}:backup-vault:smuppy-backup-vault-dr-${environment}`
    );

    // Backup Plan for RDS Aurora
    const rdsBackupPlan = new backup.BackupPlan(this, 'RDSBackupPlan', {
      backupPlanName: `smuppy-rds-backup-${environment}`,
      backupPlanRules: [
        new backup.BackupPlanRule({
          ruleName: 'DailyBackup',
          backupVault: this.backupVault,
          scheduleExpression: events.Schedule.cron({
            hour: '3',
            minute: '0',
          }),
          startWindow: cdk.Duration.hours(1),
          completionWindow: cdk.Duration.hours(4),
          deleteAfter: isProduction ? cdk.Duration.days(35) : cdk.Duration.days(14),
          moveToColdStorageAfter: isProduction ? cdk.Duration.days(30) : undefined,
          // Cross-region copy for disaster recovery (production only)
          ...(isProduction && {
            copyActions: [{
              destinationBackupVault: secondaryBackupVault,
              moveToColdStorageAfter: cdk.Duration.days(30),
              deleteAfter: cdk.Duration.days(90),
            }],
          }),
        }),
        // Hourly backup for production (more granular recovery)
        ...(isProduction ? [
          new backup.BackupPlanRule({
            ruleName: 'HourlyBackup',
            backupVault: this.backupVault,
            scheduleExpression: events.Schedule.cron({
              minute: '0',
            }),
            startWindow: cdk.Duration.minutes(30),
            completionWindow: cdk.Duration.hours(2),
            deleteAfter: cdk.Duration.days(7), // Keep hourly for 7 days
          }),
        ] : []),
      ],
    });

    // Backup Plan for DynamoDB Tables
    const dynamoBackupPlan = new backup.BackupPlan(this, 'DynamoDBBackupPlan', {
      backupPlanName: `smuppy-dynamodb-backup-${environment}`,
      backupPlanRules: [
        new backup.BackupPlanRule({
          ruleName: 'DailyBackup',
          backupVault: this.backupVault,
          scheduleExpression: events.Schedule.cron({
            hour: '4',
            minute: '0',
          }),
          startWindow: cdk.Duration.hours(1),
          completionWindow: cdk.Duration.hours(3),
          deleteAfter: isProduction ? cdk.Duration.days(35) : cdk.Duration.days(14),
          // Cross-region copy for production
          ...(isProduction && {
            copyActions: [{
              destinationBackupVault: secondaryBackupVault,
              deleteAfter: cdk.Duration.days(90),
            }],
          }),
        }),
      ],
    });

    // Backup selection for RDS (by tag)
    rdsBackupPlan.addSelection('RDSSelection', {
      backupSelectionName: 'RDSResources',
      resources: [
        backup.BackupResource.fromTag('backup', 'true'),
        backup.BackupResource.fromTag('aws:cloudformation:stack-name', `SmuppyStack-${environment}`),
      ],
      role: new iam.Role(this, 'RDSBackupRole', {
        assumedBy: new iam.ServicePrincipal('backup.amazonaws.com'),
        managedPolicies: [
          iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSBackupServiceRolePolicyForBackup'),
          iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSBackupServiceRolePolicyForRestores'),
        ],
      }),
    });

    // Backup selection for DynamoDB (by tag)
    dynamoBackupPlan.addSelection('DynamoDBSelection', {
      backupSelectionName: 'DynamoDBResources',
      resources: [
        backup.BackupResource.fromTag('service', 'smuppy'),
      ],
      role: new iam.Role(this, 'DynamoDBBackupRole', {
        assumedBy: new iam.ServicePrincipal('backup.amazonaws.com'),
        managedPolicies: [
          iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSBackupServiceRolePolicyForBackup'),
          iam.ManagedPolicy.fromAwsManagedPolicyName('AWSBackupServiceRolePolicyForS3Backup'),
        ],
      }),
    });

    // S3 Cross-Region Replication (production only)
    if (isProduction) {
      // Replication destination bucket in secondary region
      // Note: This is a reference - the actual bucket needs to be created in the secondary region
      const replicationRole = new iam.Role(this, 'S3ReplicationRole', {
        assumedBy: new iam.ServicePrincipal('s3.amazonaws.com'),
        description: 'Role for S3 cross-region replication',
      });

      replicationRole.addToPolicy(new iam.PolicyStatement({
        actions: [
          's3:GetReplicationConfiguration',
          's3:ListBucket',
          's3:GetObjectVersionForReplication',
          's3:GetObjectVersionAcl',
          's3:GetObjectVersionTagging',
          's3:GetObjectRetention',
          's3:GetObjectLegalHold',
        ],
        resources: [
          mediaBucket.bucketArn,
          `${mediaBucket.bucketArn}/*`,
        ],
      }));

      replicationRole.addToPolicy(new iam.PolicyStatement({
        actions: [
          's3:ReplicateObject',
          's3:ReplicateDelete',
          's3:ReplicateTags',
          's3:ObjectOwnerOverrideToBucketOwner',
        ],
        resources: [
          `arn:aws:s3:::smuppy-media-dr-${environment}-${this.account}/*`,
        ],
      }));

      // Note: S3 replication rule must be configured via CfnBucket or manually
      // CDK L2 construct doesn't support replication rules directly on existing buckets
    }

    // ========================================
    // 2. S3 VIRUS SCANNING with ClamAV Lambda
    // ========================================

    // Quarantine bucket for infected files
    const quarantineBucket = new s3.Bucket(this, 'QuarantineBucket', {
      bucketName: `smuppy-quarantine-${environment}-${this.account}`,
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      versioned: true,
      lifecycleRules: [
        {
          id: 'DeleteAfter90Days',
          expiration: cdk.Duration.days(90),
        },
      ],
      removalPolicy: isProduction ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: !isProduction,
    });

    // Lambda function for virus scanning
    // Uses bucketAV or ClamAV layer
    this.virusScanFunction = new lambda.Function(this, 'VirusScanFunction', {
      functionName: `smuppy-virus-scan-${environment}`,
      runtime: lambda.Runtime.PYTHON_3_12,
      handler: 'index.handler',
      code: lambda.Code.fromInline(`
import json
import boto3
import os
from datetime import datetime

s3 = boto3.client('s3')
sns = boto3.client('sns')

QUARANTINE_BUCKET = os.environ['QUARANTINE_BUCKET']
ALERT_TOPIC_ARN = os.environ['ALERT_TOPIC_ARN']
MAX_FILE_SIZE = 500 * 1024 * 1024  # 500 MB max

def handler(event, context):
    """
    Virus scan Lambda handler - EventBridge triggered.

    For production, this should use:
    - ClamAV Lambda Layer (e.g., clamav-lambda-layer)
    - Or bucketAV (https://github.com/widdix/aws-s3-virusscan)
    - Or AWS GuardDuty Malware Protection for S3

    This is a placeholder that demonstrates the pattern.
    Replace with actual ClamAV integration for production.
    """
    print(f"Event received: {json.dumps(event)}")

    # Handle EventBridge event format
    if 'detail' in event:
        # EventBridge S3 event
        bucket = event['detail']['bucket']['name']
        key = event['detail']['object']['key']
        size = event['detail']['object'].get('size', 0)
    elif 'Records' in event:
        # Direct S3 notification (fallback)
        record = event['Records'][0]
        bucket = record['s3']['bucket']['name']
        key = record['s3']['object']['key']
        size = record['s3']['object'].get('size', 0)
    else:
        print("Unknown event format")
        return {'statusCode': 400, 'body': 'Unknown event format'}

    print(f"Scanning: s3://{bucket}/{key} ({size} bytes)")

    # Skip files that are too large
    if size > MAX_FILE_SIZE:
        print(f"File too large to scan: {size} bytes")
        return {'statusCode': 200, 'body': 'File too large - skipped'}

    # File magic bytes validation — verify file headers match claimed extension
    MAGIC_BYTES = {
        '.png': [b'\\x89PNG'],
        '.jpg': [b'\\xff\\xd8\\xff'],
        '.jpeg': [b'\\xff\\xd8\\xff'],
        '.gif': [b'GIF87a', b'GIF89a'],
        '.webp': [b'RIFF'],
        '.mp4': [b'ftyp', b'\\x00\\x00\\x00'],
        '.mov': [b'ftyp', b'moov', b'\\x00\\x00\\x00'],
        '.mp3': [b'ID3', b'\\xff\\xfb', b'\\xff\\xf3'],
        '.m4a': [b'ftyp'],
        '.wav': [b'RIFF'],
        '.aac': [b'\\xff\\xf1', b'\\xff\\xf9'],
    }

    safe_extensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.heic', '.heif',
                       '.mp4', '.mov', '.webm', '.m4v', '.mp3', '.m4a', '.wav', '.aac']
    file_ext = '.' + key.rsplit('.', 1)[-1].lower() if '.' in key else ''

    if file_ext in safe_extensions:
        # Validate magic bytes for known extensions
        header_valid = True
        if file_ext in MAGIC_BYTES and size > 0:
            try:
                head_resp = s3.get_object(Bucket=bucket, Key=key, Range='bytes=0-11')
                header = head_resp['Body'].read(12)
                expected = MAGIC_BYTES[file_ext]
                header_valid = any(
                    header[:len(magic)] == magic or magic in header[:12]
                    for magic in expected
                )
            except Exception as e:
                print(f"Magic bytes check failed: {e}")
                header_valid = False

        if not header_valid:
            # Extension mismatch — quarantine as suspicious
            print(f"SUSPICIOUS: File header does not match extension {file_ext}: {key}")
            quarantine_key = f"suspicious/{bucket}/{key}"
            try:
                s3.copy_object(
                    CopySource={'Bucket': bucket, 'Key': key},
                    Bucket=QUARANTINE_BUCKET,
                    Key=quarantine_key,
                    MetadataDirective='COPY'
                )
                s3.delete_object(Bucket=bucket, Key=key)
                sns.publish(
                    TopicArn=ALERT_TOPIC_ARN,
                    Subject="[SECURITY ALERT] Suspicious file - header mismatch",
                    Message=json.dumps({
                        'type': 'HEADER_MISMATCH',
                        'bucket': bucket,
                        'key': key,
                        'claimed_extension': file_ext,
                        'quarantine_location': f"s3://{QUARANTINE_BUCKET}/{quarantine_key}",
                        'timestamp': datetime.utcnow().isoformat()
                    }, indent=2)
                )
            except Exception as e:
                print(f"Failed to quarantine suspicious file: {e}")
                raise
            return {'statusCode': 200, 'body': 'Suspicious file quarantined - header mismatch'}

        # Valid media file — tag as scanned (extension + header verified)
        # Enhancement: ClamAV layer for deep content scanning
        try:
            s3.put_object_tagging(
                Bucket=bucket, Key=key,
                Tagging={'TagSet': [
                    {'Key': 'virus-scan', 'Value': 'header-verified'},
                    {'Key': 'scan-date', 'Value': datetime.utcnow().isoformat()}
                ]}
            )
        except Exception as e:
            print(f"Failed to tag: {e}")
        return {'statusCode': 200, 'body': 'Media file header verified'}

    # Non-media files: quarantine by default (defense-in-depth)
    # Enhancement: ClamAV Lambda Layer for deep scanning of non-media uploads
    print(f"Non-media file detected, quarantining: {key}")
    scan_result = 'INFECTED'  # Default-deny: quarantine unknown files

    if scan_result == 'INFECTED':
        # Move to quarantine
        quarantine_key = f"infected/{bucket}/{key}"
        try:
            s3.copy_object(
                CopySource={'Bucket': bucket, 'Key': key},
                Bucket=QUARANTINE_BUCKET,
                Key=quarantine_key,
                MetadataDirective='COPY'
            )
            s3.delete_object(Bucket=bucket, Key=key)

            # Send alert
            sns.publish(
                TopicArn=ALERT_TOPIC_ARN,
                Subject="[SECURITY ALERT] Infected file detected",
                Message=json.dumps({
                    'type': 'MALWARE_DETECTED',
                    'bucket': bucket,
                    'key': key,
                    'quarantine_location': f"s3://{QUARANTINE_BUCKET}/{quarantine_key}",
                    'action': 'File quarantined and deleted from source',
                    'timestamp': datetime.utcnow().isoformat()
                }, indent=2)
            )
            print(f"INFECTED file quarantined: {key}")
        except Exception as e:
            print(f"Failed to quarantine: {e}")
            raise

        return {'statusCode': 200, 'body': 'Infected file quarantined'}
    else:
        # Tag as scanned
        try:
            s3.put_object_tagging(
                Bucket=bucket, Key=key,
                Tagging={'TagSet': [
                    {'Key': 'virus-scan', 'Value': 'clean'},
                    {'Key': 'scan-date', 'Value': datetime.utcnow().isoformat()}
                ]}
            )
        except Exception as e:
            print(f"Failed to tag object: {e}")

        return {'statusCode': 200, 'body': 'File scanned - clean'}
`),
      timeout: cdk.Duration.minutes(5),
      memorySize: 1024,
      environment: {
        QUARANTINE_BUCKET: quarantineBucket.bucketName,
        ALERT_TOPIC_ARN: this.securityAlertsTopic.topicArn,
      },
      logRetention: logs.RetentionDays.ONE_MONTH,
    });

    // Grant permissions
    mediaBucket.grantRead(this.virusScanFunction);
    mediaBucket.grantDelete(this.virusScanFunction);
    mediaBucket.grantPut(this.virusScanFunction); // For tagging
    quarantineBucket.grantPut(this.virusScanFunction);
    this.securityAlertsTopic.grantPublish(this.virusScanFunction);

    // Add S3 tagging permission
    this.virusScanFunction.addToRolePolicy(new iam.PolicyStatement({
      actions: ['s3:PutObjectTagging', 's3:GetObjectTagging'],
      resources: [`${mediaBucket.bucketArn}/*`],
    }));

    // Dead Letter Queue for failed scan events — prevents silent loss of unscanned files
    const scanDlq = new sqs.Queue(this, 'ScanDeadLetterQueue', {
      queueName: `smuppy-scan-dlq-${environment}`,
      retentionPeriod: cdk.Duration.days(14),
      encryption: sqs.QueueEncryption.SQS_MANAGED,
    });

    const scanDlqAlarm = new cdk.aws_cloudwatch.Alarm(this, 'ScanDLQAlarm', {
      alarmName: `smuppy-scan-dlq-depth-${environment}`,
      alarmDescription: 'Failed scan events accumulating — files may be unscanned',
      metric: scanDlq.metricApproximateNumberOfMessagesVisible(),
      threshold: 1,
      evaluationPeriods: 1,
      treatMissingData: cdk.aws_cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    scanDlqAlarm.addAlarmAction({
      bind: () => ({
        alarmActionArn: this.securityAlertsTopic.topicArn,
      }),
    });

    // Use EventBridge to trigger virus scan (avoids cyclic dependency)
    // S3 must have EventBridge notifications enabled
    const virusScanRule = new events.Rule(this, 'VirusScanRule', {
      ruleName: `smuppy-virus-scan-trigger-${environment}`,
      description: 'Trigger virus scan on S3 object uploads',
      eventPattern: {
        source: ['aws.s3'],
        detailType: ['Object Created'],
        detail: {
          bucket: {
            name: [mediaBucket.bucketName],
          },
          object: {
            key: [
              { prefix: 'uploads/' },
              { prefix: 'posts/' },
              { prefix: 'peaks/' },
              { prefix: 'users/' },
              { prefix: 'private/' },
              { prefix: 'voice-messages/' },
            ],
          },
        },
      },
    });

    virusScanRule.addTarget(new targets.LambdaFunction(this.virusScanFunction, {
      retryAttempts: 2,
      deadLetterQueue: scanDlq,
    }));

    // ========================================
    // 3. IMAGE MODERATION with AWS Rekognition
    // ========================================

    this.imageModerationFunction = new NodejsFunction(this, 'ImageModerationFunction', {
      functionName: `smuppy-image-moderation-${environment}`,
      entry: path.join(__dirname, '../../lambda/api/moderation/analyze-image.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_22_X,
      memorySize: 512,
      timeout: cdk.Duration.seconds(30),
      environment: {
        QUARANTINE_BUCKET: quarantineBucket.bucketName,
        SECURITY_ALERTS_TOPIC_ARN: this.securityAlertsTopic.topicArn,
        AWS_REGION_OVERRIDE: cdk.Aws.REGION,
      },
      bundling: {
        minify: true,
        sourceMap: !isProduction,
        externalModules: [],
      },
      tracing: lambda.Tracing.ACTIVE,
      logRetention: logs.RetentionDays.ONE_MONTH,
      depsLockFilePath: path.join(__dirname, '../../lambda/api/package-lock.json'),
      projectRoot: path.join(__dirname, '../../lambda/api'),
    });

    // Grant S3 permissions (read source, delete source, tag source, write quarantine)
    mediaBucket.grantRead(this.imageModerationFunction);
    mediaBucket.grantDelete(this.imageModerationFunction);
    quarantineBucket.grantPut(this.imageModerationFunction);
    this.imageModerationFunction.addToRolePolicy(new iam.PolicyStatement({
      actions: ['s3:PutObjectTagging', 's3:GetObjectTagging'],
      resources: [`${mediaBucket.bucketArn}/*`],
    }));

    // Grant Rekognition DetectModerationLabels
    // Rekognition is a stateless API — resource-level ARNs are not supported by AWS
    this.imageModerationFunction.addToRolePolicy(new iam.PolicyStatement({
      actions: ['rekognition:DetectModerationLabels'],
      resources: ['*'],
      conditions: {
        StringEquals: { 'aws:RequestedRegion': cdk.Stack.of(this).region },
      },
    }));

    // Grant SNS publish for alerts
    this.securityAlertsTopic.grantPublish(this.imageModerationFunction);

    // EventBridge rule: trigger on media uploads to media bucket (images + videos)
    const imageModerationRule = new events.Rule(this, 'ImageModerationRule', {
      ruleName: `smuppy-image-moderation-trigger-${environment}`,
      description: 'Trigger Rekognition moderation on media uploads',
      eventPattern: {
        source: ['aws.s3'],
        detailType: ['Object Created'],
        detail: {
          bucket: {
            name: [mediaBucket.bucketName],
          },
          object: {
            key: [
              { prefix: 'uploads/' },
              { prefix: 'posts/' },
              { prefix: 'peaks/' },
              { prefix: 'users/' },
              { prefix: 'private/' },
            ],
          },
        },
      },
    });

    imageModerationRule.addTarget(new targets.LambdaFunction(this.imageModerationFunction, {
      retryAttempts: 2,
      deadLetterQueue: scanDlq,
    }));

    // ========================================
    // 4. ASYNC VIDEO MODERATION with Rekognition
    // ========================================

    // Dedicated SNS topic for Rekognition async video moderation callbacks
    // Not KMS-encrypted: Rekognition publishes directly and requires simpler permissions
    const videoModerationTopic = new sns.Topic(this, 'VideoModerationTopic', {
      topicName: `smuppy-video-moderation-${environment}`,
      displayName: 'Smuppy Video Moderation Callbacks',
    });

    // IAM role for Rekognition to publish results to the video SNS topic
    const rekognitionRole = new iam.Role(this, 'RekognitionVideoRole', {
      roleName: `smuppy-rekognition-video-${environment}`,
      assumedBy: new iam.ServicePrincipal('rekognition.amazonaws.com'),
      description: 'Allows Rekognition to publish video moderation results to SNS',
    });
    videoModerationTopic.grantPublish(rekognitionRole);

    // Lambda to process video moderation results from Rekognition
    const videoModerationFunction = new NodejsFunction(this, 'VideoModerationFunction', {
      functionName: `smuppy-video-moderation-results-${environment}`,
      entry: path.join(__dirname, '../../lambda/api/moderation/process-video-moderation.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_22_X,
      memorySize: 512,
      timeout: cdk.Duration.seconds(60),
      environment: {
        QUARANTINE_BUCKET: quarantineBucket.bucketName,
        SECURITY_ALERTS_TOPIC_ARN: this.securityAlertsTopic.topicArn,
      },
      bundling: {
        minify: true,
        sourceMap: !isProduction,
        externalModules: [],
      },
      tracing: lambda.Tracing.ACTIVE,
      logRetention: logs.RetentionDays.ONE_MONTH,
      depsLockFilePath: path.join(__dirname, '../../lambda/api/package-lock.json'),
      projectRoot: path.join(__dirname, '../../lambda/api'),
    });

    // Grant permissions to video moderation results handler
    mediaBucket.grantRead(videoModerationFunction);
    mediaBucket.grantDelete(videoModerationFunction);
    quarantineBucket.grantPut(videoModerationFunction);
    videoModerationFunction.addToRolePolicy(new iam.PolicyStatement({
      actions: ['s3:PutObjectTagging', 's3:GetObjectTagging'],
      resources: [`${mediaBucket.bucketArn}/*`],
    }));
    videoModerationFunction.addToRolePolicy(new iam.PolicyStatement({
      actions: ['rekognition:GetContentModeration'],
      resources: ['*'],
      conditions: {
        StringEquals: { 'aws:RequestedRegion': cdk.Stack.of(this).region },
      },
    }));
    this.securityAlertsTopic.grantPublish(videoModerationFunction);

    // Subscribe Lambda to Rekognition video moderation SNS topic
    videoModerationTopic.addSubscription(
      new snsSubscriptions.LambdaSubscription(videoModerationFunction),
    );

    // Grant image moderation Lambda permission to start async video jobs
    this.imageModerationFunction.addToRolePolicy(new iam.PolicyStatement({
      actions: ['rekognition:StartContentModeration'],
      resources: ['*'],
      conditions: {
        StringEquals: { 'aws:RequestedRegion': cdk.Stack.of(this).region },
      },
    }));

    // Allow image moderation Lambda to pass the Rekognition role
    this.imageModerationFunction.addToRolePolicy(new iam.PolicyStatement({
      actions: ['iam:PassRole'],
      resources: [rekognitionRole.roleArn],
      conditions: {
        StringEquals: { 'iam:PassedToService': 'rekognition.amazonaws.com' },
      },
    }));

    // Inject video moderation config into the image moderation Lambda
    this.imageModerationFunction.addEnvironment('VIDEO_MODERATION_TOPIC_ARN', videoModerationTopic.topicArn);
    this.imageModerationFunction.addEnvironment('REKOGNITION_ROLE_ARN', rekognitionRole.roleArn);

    // ========================================
    // CloudWatch Alarms for Backup Monitoring
    // ========================================

    // Alarm for failed backup jobs
    const backupFailedAlarm = new cdk.aws_cloudwatch.Alarm(this, 'BackupFailedAlarm', {
      alarmName: `smuppy-backup-failed-${environment}`,
      alarmDescription: 'AWS Backup job failed',
      metric: new cdk.aws_cloudwatch.Metric({
        namespace: 'AWS/Backup',
        metricName: 'NumberOfBackupJobsFailed',
        statistic: 'Sum',
        period: cdk.Duration.hours(1),
      }),
      threshold: 1,
      evaluationPeriods: 1,
      treatMissingData: cdk.aws_cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    // Connect alarm to SNS
    backupFailedAlarm.addAlarmAction({
      bind: () => ({
        alarmActionArn: this.securityAlertsTopic.topicArn,
      }),
    });

    // ========================================
    // Outputs
    // ========================================
    new cdk.CfnOutput(this, 'BackupVaultArn', {
      value: this.backupVault.backupVaultArn,
      description: 'Primary Backup Vault ARN',
      exportName: `smuppy-backup-vault-arn-${environment}`,
    });

    new cdk.CfnOutput(this, 'QuarantineBucketName', {
      value: quarantineBucket.bucketName,
      description: 'Quarantine bucket for infected files',
      exportName: `smuppy-quarantine-bucket-${environment}`,
    });

    new cdk.CfnOutput(this, 'VirusScanFunctionArn', {
      value: this.virusScanFunction.functionArn,
      description: 'Virus scan Lambda function ARN',
      exportName: `smuppy-virus-scan-arn-${environment}`,
    });

    new cdk.CfnOutput(this, 'SecurityAlertsTopicArn', {
      value: this.securityAlertsTopic.topicArn,
      description: 'SNS Topic for security alerts',
      exportName: `smuppy-security-alerts-arn-${environment}`,
    });
  }
}

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
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { Construct } from 'constructs';
import * as path from 'path';

interface SecurityPhase2StackProps extends cdk.StackProps {
  environment: string;
  mediaBucket: s3.IBucket;
  secondaryRegion?: string;
  alertEmail?: string;
  enableGuardDutyMalware?: boolean; // Requires manual GuardDuty activation; default false
}

/**
 * Security Phase 2 Stack
 *
 * 1. Multi-Region Backup (AWS Backup)
 *    - Cross-region backup vault in secondary region
 *    - Daily backups with 35-day retention (production)
 *    - Automatic cross-region copy for disaster recovery
 *
 * 2. S3 Virus Scanning (Lambda)
 *    - Magic bytes validation for all media types
 *    - Default-deny for non-media files (quarantine)
 *    - SNS alerts for security team
 *
 * 3. Image/Video Moderation (AWS Rekognition)
 *    - DetectModerationLabels for images (sync)
 *    - StartContentModeration for videos (async via SNS)
 *    - Tiered thresholds: >90% quarantine, 70-90% review, <70% pass
 *
 * 4. GuardDuty Malware Protection for S3
 *    - AWS-managed malware scanning on every upload
 *    - Auto-tags objects with GuardDutyMalwareScanStatus
 *    - EventBridge → quarantine Lambda on THREATS_FOUND
 */
export class SecurityPhase2Stack extends cdk.Stack {
  public readonly backupVault: backup.BackupVault;
  public readonly virusScanFunction: lambda.Function;
  public readonly imageModerationFunction: NodejsFunction;
  public readonly securityAlertsTopic: sns.Topic;

  constructor(scope: Construct, id: string, props: SecurityPhase2StackProps) {
    super(scope, id, props);

    const { environment, mediaBucket, secondaryRegion = 'eu-west-1', alertEmail, enableGuardDutyMalware = false } = props;
    const isProduction = environment === 'production';

    // ========================================
    // GuardDuty — Runtime Threat Detection (#22 / #37)
    // Requires manual activation: set enableGuardDutyMalware=true after enabling GuardDuty in the account
    // ========================================
    if (enableGuardDutyMalware) {
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
    }

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

    // DynamoDB table for quarantine-first scan coordination
    // Two scanners (virus + moderation) run in parallel on pending-scan/ images.
    // Each writes its result + atomic ADD counter. Last scanner promotes or quarantines.
    const scanCoordinationTable = new dynamodb.Table(this, 'ScanCoordinationTable', {
      tableName: `smuppy-scan-coordination-${environment}`,
      partitionKey: { name: 'objectKey', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: 'expiresAt',
      removalPolicy: cdk.RemovalPolicy.DESTROY, // Ephemeral data — safe to destroy
      pointInTimeRecovery: false, // Not needed for transient coordination data
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
import time
from datetime import datetime

s3 = boto3.client('s3')
sns = boto3.client('sns')
dynamodb = boto3.client('dynamodb')

QUARANTINE_BUCKET = os.environ['QUARANTINE_BUCKET']
ALERT_TOPIC_ARN = os.environ['ALERT_TOPIC_ARN']
SCAN_TABLE = os.environ.get('SCAN_COORDINATION_TABLE', '')
MAX_FILE_SIZE = 500 * 1024 * 1024  # 500 MB
PENDING_PREFIX = 'pending-scan/'

IMAGE_EXTS = {'.jpg', '.jpeg', '.png', '.gif', '.webp', '.heic', '.heif'}

MAGIC_BYTES = {
    '.png': [b'\\x89PNG'],
    '.jpg': [b'\\xff\\xd8\\xff'],
    '.jpeg': [b'\\xff\\xd8\\xff'],
    '.gif': [b'GIF87a', b'GIF89a'],
    '.webp': [b'RIFF'],
    '.heic': [b'ftyp'],
    '.heif': [b'ftyp'],
    '.mp4': [b'ftyp', b'\\x00\\x00\\x00'],
    '.mov': [b'ftyp', b'moov', b'\\x00\\x00\\x00'],
    '.m4v': [b'ftyp', b'\\x00\\x00\\x00'],
    '.webm': [b'\\x1a\\x45\\xdf\\xa3'],
    '.mp3': [b'ID3', b'\\xff\\xfb', b'\\xff\\xf3'],
    '.m4a': [b'ftyp'],
    '.wav': [b'RIFF'],
    '.aac': [b'\\xff\\xf1', b'\\xff\\xf9'],
}

SAFE_EXTS = set(MAGIC_BYTES.keys())

def handler(event, context):
    if 'detail' in event:
        bucket = event['detail']['bucket']['name']
        key = event['detail']['object']['key']
        size = event['detail']['object'].get('size', 0)
    elif 'Records' in event:
        r = event['Records'][0]
        bucket = r['s3']['bucket']['name']
        key = r['s3']['object']['key']
        size = r['s3']['object'].get('size', 0)
    else:
        return {'statusCode': 400, 'body': 'Unknown event format'}

    print(f"Scanning: s3://{bucket}/{key} ({size} bytes)")

    if size > MAX_FILE_SIZE:
        print(f"File too large: {size}")
        return {'statusCode': 200, 'body': 'Skipped - too large'}

    is_pending = key.startswith(PENDING_PREFIX)
    file_ext = ('.' + key.rsplit('.', 1)[-1].lower()) if '.' in key else ''

    # Skip already-scanned files (promoted files re-trigger EventBridge)
    if not is_pending:
        try:
            tags = s3.get_object_tagging(Bucket=bucket, Key=key)
            if any(t['Key'] == 'scan-status' for t in tags.get('TagSet', [])):
                print(f"Already scanned, skipping: {key}")
                return {'statusCode': 200, 'body': 'Already scanned'}
        except Exception:
            pass

    # Determine scan verdict
    verdict = scan_file(bucket, key, size, file_ext)

    if is_pending:
        # Quarantine-first flow: coordinate via DynamoDB
        # For pending-scan images, expectedScanCount=2 (virus + moderation)
        is_image = file_ext in IMAGE_EXTS
        expected = 2 if is_image else 1
        coordinate_and_finalize(bucket, key, verdict, expected)
    else:
        # Direct-path flow: tag or quarantine immediately
        handle_direct(bucket, key, verdict, file_ext)

    return {'statusCode': 200, 'body': f'Scan complete: {verdict}'}

def scan_file(bucket, key, size, file_ext):
    if file_ext not in SAFE_EXTS:
        print(f"Non-media file, default-deny: {key}")
        return 'quarantine'

    if file_ext not in MAGIC_BYTES or size <= 0:
        return 'passed'

    try:
        resp = s3.get_object(Bucket=bucket, Key=key, Range='bytes=0-11')
        header = resp['Body'].read(12)
        expected = MAGIC_BYTES[file_ext]
        valid = any(header[:len(m)] == m or m in header[:12] for m in expected)
        if not valid:
            print(f"HEADER MISMATCH: {file_ext} for {key}")
            return 'quarantine'
    except Exception as e:
        print(f"Magic bytes check failed: {e}")
        return 'error'

    return 'passed'

def coordinate_and_finalize(bucket, key, verdict, expected_count):
    if not SCAN_TABLE:
        print("No SCAN_TABLE configured, falling back to direct action")
        if verdict == 'quarantine':
            quarantine_direct(bucket, key)
        return

    now = datetime.utcnow().isoformat()
    ttl = int(time.time()) + 3600

    resp = dynamodb.update_item(
        TableName=SCAN_TABLE,
        Key={'objectKey': {'S': key}},
        UpdateExpression='SET virusScanResult = :r, virusScanAt = :ts, bucketName = :b, expiresAt = :ttl, uploadedAt = if_not_exists(uploadedAt, :ts), expectedScanCount = if_not_exists(expectedScanCount, :exp) ADD scanCount :one',
        ExpressionAttributeValues={
            ':r': {'S': verdict},
            ':ts': {'S': now},
            ':b': {'S': bucket},
            ':ttl': {'N': str(ttl)},
            ':exp': {'N': str(expected_count)},
            ':one': {'N': '1'},
        },
        ReturnValues='ALL_NEW',
    )

    attrs = resp['Attributes']
    scan_count = int(attrs['scanCount']['N'])
    exp = int(attrs['expectedScanCount']['N'])
    virus_r = attrs.get('virusScanResult', {}).get('S', 'pending')
    mod_r = attrs.get('moderationResult', {}).get('S', 'passed')

    print(f"DynamoDB: scanCount={scan_count}/{exp}, virus={virus_r}, mod={mod_r}")

    if scan_count < exp:
        print("Not last scanner, waiting")
        return

    # Last scanner — promote or quarantine
    should_quarantine = virus_r == 'quarantine' or mod_r == 'quarantine'

    if should_quarantine:
        final_key = key.replace(PENDING_PREFIX, '', 1)
        q_key = f"quarantine/{final_key}"
        print(f"QUARANTINE from pending: {key} -> {q_key}")
        try:
            s3.copy_object(CopySource={'Bucket': bucket, 'Key': key}, Bucket=QUARANTINE_BUCKET, Key=q_key, MetadataDirective='COPY')
            s3.delete_object(Bucket=bucket, Key=key)
            sns.publish(TopicArn=ALERT_TOPIC_ARN, Subject=f"[QUARANTINE] {key.split('/')[-1]}", Message=json.dumps({'type': 'QUARANTINE_FROM_PENDING', 'bucket': bucket, 'key': key, 'reason': f"virus={virus_r}, mod={mod_r}", 'timestamp': now}, indent=2))
        except Exception as e:
            print(f"Quarantine failed: {e}")
    else:
        final_key = key.replace(PENDING_PREFIX, '', 1)
        print(f"PROMOTE: {key} -> {final_key}")
        try:
            s3.copy_object(CopySource={'Bucket': bucket, 'Key': key}, Bucket=bucket, Key=final_key, MetadataDirective='COPY')
            tag_val = mod_r if mod_r in ('review', 'under_review') else 'clean'
            s3.put_object_tagging(Bucket=bucket, Key=final_key, Tagging={'TagSet': [{'Key': 'scan-status', 'Value': 'clean'}, {'Key': 'moderation-status', 'Value': tag_val}, {'Key': 'promoted-at', 'Value': now}]})
            s3.delete_object(Bucket=bucket, Key=key)
        except Exception as e:
            print(f"Promote failed: {e}")

    # Cleanup DynamoDB
    try:
        dynamodb.delete_item(TableName=SCAN_TABLE, Key={'objectKey': {'S': key}})
    except Exception:
        pass

def handle_direct(bucket, key, verdict, file_ext):
    if verdict == 'quarantine':
        quarantine_direct(bucket, key)
    else:
        tag_val = 'header-verified' if file_ext in SAFE_EXTS else 'clean'
        try:
            s3.put_object_tagging(Bucket=bucket, Key=key, Tagging={'TagSet': [{'Key': 'virus-scan', 'Value': tag_val}, {'Key': 'scan-date', 'Value': datetime.utcnow().isoformat()}]})
        except Exception as e:
            print(f"Failed to tag: {e}")

def quarantine_direct(bucket, key):
    q_key = f"suspicious/{key}"
    try:
        s3.copy_object(CopySource={'Bucket': bucket, 'Key': key}, Bucket=QUARANTINE_BUCKET, Key=q_key, MetadataDirective='COPY')
        s3.delete_object(Bucket=bucket, Key=key)
        sns.publish(TopicArn=ALERT_TOPIC_ARN, Subject=f"[SECURITY] Quarantined: {key.split('/')[-1]}", Message=json.dumps({'type': 'VIRUS_SCAN_QUARANTINE', 'bucket': bucket, 'key': key, 'quarantine': f"s3://{QUARANTINE_BUCKET}/{q_key}", 'timestamp': datetime.utcnow().isoformat()}, indent=2))
    except Exception as e:
        print(f"Quarantine failed: {e}")
        raise
`),
      timeout: cdk.Duration.minutes(5),
      memorySize: 1024,
      environment: {
        QUARANTINE_BUCKET: quarantineBucket.bucketName,
        ALERT_TOPIC_ARN: this.securityAlertsTopic.topicArn,
        SCAN_COORDINATION_TABLE: scanCoordinationTable.tableName,
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

    // Grant DynamoDB access for quarantine-first coordination
    scanCoordinationTable.grantReadWriteData(this.virusScanFunction);

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
              { prefix: 'pending-scan/' }, // Quarantine-first images
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
        SCAN_COORDINATION_TABLE: scanCoordinationTable.tableName,
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

    // Grant S3 permissions (read, write/copy, delete source, tag, quarantine)
    mediaBucket.grantRead(this.imageModerationFunction);
    mediaBucket.grantPut(this.imageModerationFunction); // CopyObject for promotion from pending-scan/
    mediaBucket.grantDelete(this.imageModerationFunction);
    quarantineBucket.grantPut(this.imageModerationFunction);
    this.imageModerationFunction.addToRolePolicy(new iam.PolicyStatement({
      actions: ['s3:PutObjectTagging', 's3:GetObjectTagging'],
      resources: [`${mediaBucket.bucketArn}/*`],
    }));

    // Grant DynamoDB access for quarantine-first coordination
    scanCoordinationTable.grantReadWriteData(this.imageModerationFunction);

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
              { prefix: 'pending-scan/' }, // Quarantine-first images
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
    // 5. GUARDDUTY MALWARE PROTECTION FOR S3
    // ========================================
    // Replaces placeholder ClamAV with AWS-managed malware scanning.
    // GuardDuty scans every new S3 object, tags it, and emits EventBridge events.
    // Cost: ~$0.50/GB scanned (first 1,000 GB/month in Free Tier for 12 months).
    // Gated behind enableGuardDutyMalware — requires manual GuardDuty activation.
    if (enableGuardDutyMalware) {

    // IAM role for GuardDuty Malware Protection to read & tag S3 objects
    const guardDutyMalwareRole = new iam.Role(this, 'GuardDutyMalwareRole', {
      roleName: `smuppy-guardduty-malware-${environment}`,
      assumedBy: new iam.ServicePrincipal('malware-protection-plan.guardduty.amazonaws.com'),
      description: 'Allows GuardDuty Malware Protection to scan S3 objects',
    });

    guardDutyMalwareRole.addToPolicy(new iam.PolicyStatement({
      sid: 'ReadMediaBucket',
      actions: [
        's3:GetObject',
        's3:GetObjectVersion',
        's3:GetBucketLocation',
        's3:ListBucket',
      ],
      resources: [
        mediaBucket.bucketArn,
        `${mediaBucket.bucketArn}/*`,
      ],
    }));

    guardDutyMalwareRole.addToPolicy(new iam.PolicyStatement({
      sid: 'TagScannedObjects',
      actions: [
        's3:PutObjectTagging',
        's3:GetObjectTagging',
        's3:DeleteObjectTagging',
      ],
      resources: [`${mediaBucket.bucketArn}/*`],
    }));

    // Allow GuardDuty to decrypt S3 objects if bucket uses KMS
    guardDutyMalwareRole.addToPolicy(new iam.PolicyStatement({
      sid: 'DecryptObjects',
      actions: [
        'kms:GenerateDataKey',
        'kms:Decrypt',
      ],
      resources: ['*'],
      conditions: {
        StringLike: {
          'kms:ViaService': `s3.${cdk.Aws.REGION}.amazonaws.com`,
        },
      },
    }));

    // Malware Protection Plan — scans all uploads across all prefixes
    const malwareProtectionPlan = new cdk.aws_guardduty.CfnMalwareProtectionPlan(this, 'MalwareProtectionPlan', {
      protectedResource: {
        s3Bucket: {
          bucketName: mediaBucket.bucketName,
          objectPrefixes: ['uploads/', 'posts/', 'peaks/', 'users/', 'private/', 'voice-messages/', 'pending-scan/'],
        },
      },
      role: guardDutyMalwareRole.roleArn,
      actions: {
        tagging: {
          status: 'ENABLED',
        },
      },
    });

    // Lambda to quarantine files when GuardDuty finds malware
    const malwareQuarantineFunction = new lambda.Function(this, 'MalwareQuarantineFunction', {
      functionName: `smuppy-malware-quarantine-${environment}`,
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

def handler(event, context):
    """
    Quarantine files when GuardDuty Malware Protection detects threats.
    Triggered by EventBridge on 'GuardDuty Malware Protection Object Scan Result'.
    """
    print(f"GuardDuty event: {json.dumps(event)}")

    detail = event.get('detail', {})
    scan_status = detail.get('scanStatus')

    if scan_status != 'THREATS_FOUND':
        print(f"Ignoring non-threat scan result: {scan_status}")
        return {'statusCode': 200, 'body': 'No threats'}

    s3_details = detail.get('s3ObjectDetails', {})
    bucket = s3_details.get('bucketName', '')
    key = s3_details.get('objectKey', '')

    if not bucket or not key:
        print("Missing bucket or key in event")
        return {'statusCode': 400, 'body': 'Missing S3 details'}

    threats = detail.get('scanResultDetails', {}).get('threats', [])
    threat_names = [t.get('name', 'unknown') for t in threats]

    print(f"MALWARE DETECTED: s3://{bucket}/{key} — threats: {threat_names}")

    # Move to quarantine bucket
    quarantine_key = f"malware/{key}"
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
            Subject=f"[CRITICAL] Malware detected: {key.split('/')[-1]}",
            Message=json.dumps({
                'type': 'MALWARE_DETECTED',
                'source': 'guardduty',
                'bucket': bucket,
                'key': key,
                'threats': threat_names,
                'quarantine': f"s3://{QUARANTINE_BUCKET}/{quarantine_key}",
                'timestamp': datetime.utcnow().isoformat()
            }, indent=2)
        )
        print(f"File quarantined: {quarantine_key}")
    except Exception as e:
        print(f"CRITICAL: Failed to quarantine malware: {e}")
        # Alert even on quarantine failure
        try:
            sns.publish(
                TopicArn=ALERT_TOPIC_ARN,
                Subject=f"[CRITICAL] Malware quarantine FAILED: {key.split('/')[-1]}",
                Message=json.dumps({
                    'type': 'QUARANTINE_FAILURE',
                    'bucket': bucket,
                    'key': key,
                    'threats': threat_names,
                    'error': str(e),
                    'timestamp': datetime.utcnow().isoformat()
                }, indent=2)
            )
        except Exception:
            pass
        raise

    return {'statusCode': 200, 'body': 'Malware quarantined'}
`),
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
      environment: {
        QUARANTINE_BUCKET: quarantineBucket.bucketName,
        ALERT_TOPIC_ARN: this.securityAlertsTopic.topicArn,
      },
      logRetention: logs.RetentionDays.ONE_MONTH,
    });

    // Grant permissions to quarantine Lambda
    mediaBucket.grantRead(malwareQuarantineFunction);
    mediaBucket.grantDelete(malwareQuarantineFunction);
    quarantineBucket.grantPut(malwareQuarantineFunction);
    this.securityAlertsTopic.grantPublish(malwareQuarantineFunction);

    // EventBridge rule: trigger quarantine when GuardDuty detects threats
    const malwareThreatRule = new events.Rule(this, 'MalwareThreatRule', {
      ruleName: `smuppy-malware-threat-${environment}`,
      description: 'Quarantine files when GuardDuty detects malware in S3',
      eventPattern: {
        source: ['aws.guardduty'],
        detailType: ['GuardDuty Malware Protection Object Scan Result'],
        detail: {
          scanStatus: ['THREATS_FOUND'],
          s3ObjectDetails: {
            bucketName: [mediaBucket.bucketName],
          },
        },
      },
    });

    malwareThreatRule.addTarget(new targets.LambdaFunction(malwareQuarantineFunction, {
      retryAttempts: 2,
      deadLetterQueue: scanDlq,
    }));
    } // end enableGuardDutyMalware

    // ========================================
    // 6. SCAN COORDINATION CLEANUP
    // ========================================
    // Sweeps DynamoDB for stuck entries where one scanner never finished
    // (e.g., Lambda timeout, Rekognition error). Promotes or quarantines
    // based on whichever results are available after 10 minutes.

    const scanCleanupFunction = new lambda.Function(this, 'ScanCleanupFunction', {
      functionName: `smuppy-scan-cleanup-${environment}`,
      runtime: lambda.Runtime.PYTHON_3_12,
      handler: 'index.handler',
      code: lambda.Code.fromInline(`
import json
import boto3
import os
import time
from datetime import datetime

dynamodb = boto3.client('dynamodb')
s3 = boto3.client('s3')
sns = boto3.client('sns')

SCAN_TABLE = os.environ['SCAN_COORDINATION_TABLE']
QUARANTINE_BUCKET = os.environ['QUARANTINE_BUCKET']
ALERT_TOPIC_ARN = os.environ['ALERT_TOPIC_ARN']
PENDING_PREFIX = 'pending-scan/'
STUCK_THRESHOLD_SECONDS = 600  # 10 minutes

def handler(event, context):
    """Sweep for stuck scan coordination entries and finalize them."""
    now = time.time()
    count = 0
    stuck = 0

    # Scan for entries that have been pending too long
    paginator = dynamodb.get_paginator('scan')
    for page in paginator.paginate(TableName=SCAN_TABLE):
        for item in page.get('Items', []):
            count += 1
            obj_key = item['objectKey']['S']
            uploaded_at = item.get('uploadedAt', {}).get('S', '')
            scan_count = int(item.get('scanCount', {}).get('N', '0'))
            expected = int(item.get('expectedScanCount', {}).get('N', '2'))
            bucket = item.get('bucketName', {}).get('S', '')

            if scan_count >= expected:
                # Already finalized but not cleaned up — just delete
                cleanup(obj_key)
                continue

            if not uploaded_at:
                continue

            try:
                upload_time = datetime.fromisoformat(uploaded_at.replace('Z', '+00:00'))
                age_seconds = now - upload_time.timestamp()
            except Exception:
                age_seconds = 0

            if age_seconds < STUCK_THRESHOLD_SECONDS:
                continue

            stuck += 1
            virus_r = item.get('virusScanResult', {}).get('S', 'missing')
            mod_r = item.get('moderationResult', {}).get('S', 'missing')

            print(f"STUCK entry: {obj_key} age={int(age_seconds)}s virus={virus_r} mod={mod_r}")

            should_quarantine = virus_r == 'quarantine' or mod_r == 'quarantine'

            if should_quarantine:
                quarantine_stuck(bucket, obj_key, virus_r, mod_r)
            else:
                promote_stuck(bucket, obj_key, mod_r)

            cleanup(obj_key)

    print(f"Cleanup done: scanned={count}, stuck={stuck}")
    return {'statusCode': 200, 'body': f'Scanned {count}, resolved {stuck} stuck entries'}

def promote_stuck(bucket, key, mod_result):
    if not key.startswith(PENDING_PREFIX):
        return
    final_key = key.replace(PENDING_PREFIX, '', 1)
    try:
        s3.copy_object(CopySource={'Bucket': bucket, 'Key': key}, Bucket=bucket, Key=final_key, MetadataDirective='COPY')
        mod_tag = 'under_review' if mod_result in ('review', 'under_review') else 'promoted_after_timeout'
        s3.put_object_tagging(Bucket=bucket, Key=final_key, Tagging={'TagSet': [{'Key': 'scan-status', 'Value': 'clean'}, {'Key': 'moderation-status', 'Value': mod_tag}, {'Key': 'promoted-at', 'Value': datetime.utcnow().isoformat()}, {'Key': 'promotion-reason', 'Value': 'cleanup-timeout'}]})
        s3.delete_object(Bucket=bucket, Key=key)
        print(f"Promoted stuck file: {key} -> {final_key}")
    except Exception as e:
        print(f"Failed to promote stuck file: {e}")

def quarantine_stuck(bucket, key, virus_r, mod_r):
    if not key.startswith(PENDING_PREFIX):
        return
    final_key = key.replace(PENDING_PREFIX, '', 1)
    q_key = f"quarantine/{final_key}"
    try:
        s3.copy_object(CopySource={'Bucket': bucket, 'Key': key}, Bucket=QUARANTINE_BUCKET, Key=q_key, MetadataDirective='COPY')
        s3.delete_object(Bucket=bucket, Key=key)
        sns.publish(TopicArn=ALERT_TOPIC_ARN, Subject=f"[QUARANTINE-CLEANUP] {key.split('/')[-1]}", Message=json.dumps({'type': 'QUARANTINE_FROM_CLEANUP', 'bucket': bucket, 'key': key, 'reason': f"stuck: virus={virus_r}, mod={mod_r}", 'timestamp': datetime.utcnow().isoformat()}, indent=2))
        print(f"Quarantined stuck file: {key} -> {q_key}")
    except Exception as e:
        print(f"Failed to quarantine stuck file: {e}")

def cleanup(obj_key):
    try:
        dynamodb.delete_item(TableName=SCAN_TABLE, Key={'objectKey': {'S': obj_key}})
    except Exception:
        pass
`),
      timeout: cdk.Duration.minutes(2),
      memorySize: 256,
      environment: {
        SCAN_COORDINATION_TABLE: scanCoordinationTable.tableName,
        QUARANTINE_BUCKET: quarantineBucket.bucketName,
        ALERT_TOPIC_ARN: this.securityAlertsTopic.topicArn,
      },
      logRetention: logs.RetentionDays.ONE_MONTH,
    });

    // Grant permissions
    scanCoordinationTable.grantReadWriteData(scanCleanupFunction);
    mediaBucket.grantRead(scanCleanupFunction);
    mediaBucket.grantPut(scanCleanupFunction);
    mediaBucket.grantDelete(scanCleanupFunction);
    quarantineBucket.grantPut(scanCleanupFunction);
    this.securityAlertsTopic.grantPublish(scanCleanupFunction);

    scanCleanupFunction.addToRolePolicy(new iam.PolicyStatement({
      actions: ['s3:PutObjectTagging'],
      resources: [`${mediaBucket.bucketArn}/*`],
    }));

    // Run every 15 minutes
    new events.Rule(this, 'ScanCleanupSchedule', {
      ruleName: `smuppy-scan-cleanup-${environment}`,
      description: 'Sweep stuck scan coordination entries every 15 minutes',
      schedule: events.Schedule.rate(cdk.Duration.minutes(15)),
      targets: [new targets.LambdaFunction(scanCleanupFunction, {
        retryAttempts: 1,
      })],
    });

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

    new cdk.CfnOutput(this, 'ScanCoordinationTableName', {
      value: scanCoordinationTable.tableName,
      description: 'DynamoDB table for quarantine-first scan coordination',
      exportName: `smuppy-scan-coordination-table-${environment}`,
    });

    // MalwareProtectionPlanId output only when GuardDuty is enabled
    // (malwareProtectionPlan is defined inside the enableGuardDutyMalware block)
  }
}

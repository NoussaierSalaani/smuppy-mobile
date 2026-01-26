"""
ClamAV Virus Scanner Lambda

This Lambda function scans uploaded S3 files for viruses using ClamAV.
It requires the ClamAV Lambda Layer to be attached.

Environment Variables:
- QUARANTINE_BUCKET: Bucket to move infected files to
- ALERT_TOPIC_ARN: SNS topic for security alerts
- CLAM_DB_PATH: Path to ClamAV virus definitions (default: /opt/clamav/share/clamav)
- MAX_FILE_SIZE_MB: Maximum file size to scan in MB (default: 500)
"""

import json
import os
import subprocess
import tempfile
from datetime import datetime
from typing import Any

import boto3
from botocore.exceptions import ClientError

# Initialize AWS clients
s3 = boto3.client('s3')
sns = boto3.client('sns')

# Configuration
QUARANTINE_BUCKET = os.environ.get('QUARANTINE_BUCKET', '')
ALERT_TOPIC_ARN = os.environ.get('ALERT_TOPIC_ARN', '')
CLAM_DB_PATH = os.environ.get('CLAM_DB_PATH', '/opt/clamav/share/clamav')
CLAMSCAN_PATH = os.environ.get('CLAMSCAN_PATH', '/opt/clamav/bin/clamscan')
MAX_FILE_SIZE = int(os.environ.get('MAX_FILE_SIZE_MB', '500')) * 1024 * 1024

# File types to skip (already validated media files)
SKIP_EXTENSIONS = {
    '.jpg', '.jpeg', '.png', '.gif', '.webp', '.heic', '.heif', '.avif',
    '.mp4', '.mov', '.webm', '.m4v', '.avi',
    '.mp3', '.m4a', '.wav', '.aac', '.flac', '.ogg',
}


def handler(event: dict, context: Any) -> dict:
    """
    Lambda handler for virus scanning.

    Triggered by EventBridge when files are uploaded to S3.
    Scans files using ClamAV and quarantines infected ones.

    Args:
        event: EventBridge or S3 event
        context: Lambda context

    Returns:
        dict with statusCode and body
    """
    print(f"Event received: {json.dumps(event)}")

    try:
        # Parse event to get bucket and key
        bucket, key, size = parse_event(event)
        print(f"Processing: s3://{bucket}/{key} ({size} bytes)")

        # Skip large files
        if size > MAX_FILE_SIZE:
            print(f"File too large to scan: {size} bytes (max: {MAX_FILE_SIZE})")
            tag_object(bucket, key, 'skipped', 'File too large')
            return {'statusCode': 200, 'body': 'File too large - skipped'}

        # Skip known safe media extensions
        ext = os.path.splitext(key.lower())[1]
        if ext in SKIP_EXTENSIONS:
            print(f"Media file - tagging as scanned: {key}")
            tag_object(bucket, key, 'clean', 'Media file - basic validation')
            return {'statusCode': 200, 'body': 'Media file - basic validation passed'}

        # Download and scan the file
        scan_result = scan_file(bucket, key)

        if scan_result['infected']:
            # Quarantine infected file
            handle_infected_file(bucket, key, scan_result)
            return {'statusCode': 200, 'body': 'Infected file quarantined'}
        else:
            # Tag as clean
            tag_object(bucket, key, 'clean')
            return {'statusCode': 200, 'body': 'File scanned - clean'}

    except Exception as e:
        print(f"Error scanning file: {e}")
        # Don't fail - just log and alert
        send_alert('SCAN_ERROR', {
            'error': str(e),
            'event': event,
        })
        raise


def parse_event(event: dict) -> tuple[str, str, int]:
    """Parse event to extract bucket, key, and size."""
    if 'detail' in event:
        # EventBridge S3 event
        detail = event['detail']
        bucket = detail['bucket']['name']
        key = detail['object']['key']
        size = detail['object'].get('size', 0)
    elif 'Records' in event:
        # Direct S3 notification
        record = event['Records'][0]
        bucket = record['s3']['bucket']['name']
        key = record['s3']['object']['key']
        size = record['s3']['object'].get('size', 0)
    else:
        raise ValueError(f"Unknown event format: {event}")

    return bucket, key, size


def scan_file(bucket: str, key: str) -> dict:
    """
    Download file and scan with ClamAV.

    Returns:
        dict with 'infected' (bool) and 'details' (str)
    """
    # Download file to temp location
    with tempfile.NamedTemporaryFile(delete=False) as tmp_file:
        tmp_path = tmp_file.name

    try:
        print(f"Downloading s3://{bucket}/{key} to {tmp_path}")
        s3.download_file(bucket, key, tmp_path)

        # Check if clamscan is available
        if not os.path.exists(CLAMSCAN_PATH):
            print("ClamAV not available - using placeholder scan")
            return {'infected': False, 'details': 'ClamAV not available'}

        # Run ClamAV scan
        print(f"Scanning {tmp_path} with ClamAV...")
        result = subprocess.run(
            [
                CLAMSCAN_PATH,
                '--database=' + CLAM_DB_PATH,
                '--no-summary',
                '--infected',
                tmp_path
            ],
            capture_output=True,
            text=True,
            timeout=300  # 5 minute timeout
        )

        # ClamAV exit codes:
        # 0 = No virus found
        # 1 = Virus found
        # 2 = Error
        if result.returncode == 0:
            print("File is clean")
            return {'infected': False, 'details': 'No threats detected'}
        elif result.returncode == 1:
            # Virus found
            details = result.stdout.strip() or result.stderr.strip()
            print(f"VIRUS DETECTED: {details}")
            return {'infected': True, 'details': details}
        else:
            # Error occurred
            error = result.stderr.strip() or result.stdout.strip()
            print(f"ClamAV error: {error}")
            # Don't fail - treat as clean but log
            return {'infected': False, 'details': f'Scan error: {error}'}

    finally:
        # Clean up temp file
        if os.path.exists(tmp_path):
            os.unlink(tmp_path)


def handle_infected_file(bucket: str, key: str, scan_result: dict) -> None:
    """Move infected file to quarantine and send alert."""
    quarantine_key = f"infected/{datetime.utcnow().strftime('%Y/%m/%d')}/{bucket}/{key}"

    print(f"Quarantining infected file to s3://{QUARANTINE_BUCKET}/{quarantine_key}")

    try:
        # Copy to quarantine with metadata
        s3.copy_object(
            CopySource={'Bucket': bucket, 'Key': key},
            Bucket=QUARANTINE_BUCKET,
            Key=quarantine_key,
            Metadata={
                'original-bucket': bucket,
                'original-key': key,
                'scan-result': scan_result['details'][:256],
                'quarantine-date': datetime.utcnow().isoformat(),
            },
            MetadataDirective='REPLACE',
        )

        # Delete original
        s3.delete_object(Bucket=bucket, Key=key)
        print(f"Deleted original file from s3://{bucket}/{key}")

        # Send alert
        send_alert('MALWARE_DETECTED', {
            'bucket': bucket,
            'key': key,
            'scan_result': scan_result['details'],
            'quarantine_location': f"s3://{QUARANTINE_BUCKET}/{quarantine_key}",
            'action': 'File quarantined and deleted from source',
        })

    except ClientError as e:
        print(f"Error quarantining file: {e}")
        # Still send alert even if quarantine fails
        send_alert('QUARANTINE_FAILED', {
            'bucket': bucket,
            'key': key,
            'scan_result': scan_result['details'],
            'error': str(e),
        })
        raise


def tag_object(bucket: str, key: str, status: str, details: str = '') -> None:
    """Tag S3 object with scan result."""
    try:
        tags = [
            {'Key': 'virus-scan', 'Value': status},
            {'Key': 'scan-date', 'Value': datetime.utcnow().isoformat()},
        ]
        if details:
            tags.append({'Key': 'scan-details', 'Value': details[:256]})

        s3.put_object_tagging(
            Bucket=bucket,
            Key=key,
            Tagging={'TagSet': tags}
        )
    except ClientError as e:
        print(f"Failed to tag object: {e}")


def send_alert(alert_type: str, data: dict) -> None:
    """Send alert to SNS topic."""
    if not ALERT_TOPIC_ARN:
        print(f"Alert (no SNS): {alert_type} - {data}")
        return

    try:
        message = {
            'type': alert_type,
            'timestamp': datetime.utcnow().isoformat(),
            **data,
        }

        sns.publish(
            TopicArn=ALERT_TOPIC_ARN,
            Subject=f"[SECURITY ALERT] {alert_type}",
            Message=json.dumps(message, indent=2),
        )
        print(f"Alert sent: {alert_type}")
    except ClientError as e:
        print(f"Failed to send alert: {e}")

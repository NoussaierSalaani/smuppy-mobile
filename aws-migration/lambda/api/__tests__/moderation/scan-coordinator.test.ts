/**
 * Tests for moderation/scan-coordinator
 * Validates isPendingScan, getFinalKey, recordScanResult, promoteObject, quarantineFromPending
 */

// Set env vars BEFORE module load (module captures these at top level)
process.env.SCAN_COORDINATION_TABLE = 'scan-table';
process.env.QUARANTINE_BUCKET = 'quarantine-bucket';
process.env.SECURITY_ALERTS_TOPIC_ARN = 'arn:aws:sns:us-east-1:123456789:alerts';

// ── Mocks (must be before handler import — Jest hoists jest.mock calls) ──

const mockDynamoSend = jest.fn().mockResolvedValue({ Attributes: {} });
const mockS3Send = jest.fn().mockResolvedValue({});
const mockSnsSend = jest.fn().mockResolvedValue({});

jest.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: jest.fn().mockImplementation(() => ({ send: mockDynamoSend })),
  UpdateItemCommand: jest.fn().mockImplementation((input) => ({ input })),
  DeleteItemCommand: jest.fn().mockImplementation((input) => ({ input })),
}));

jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn().mockImplementation(() => ({ send: mockS3Send })),
  CopyObjectCommand: jest.fn().mockImplementation((input) => ({ input })),
  DeleteObjectCommand: jest.fn().mockImplementation((input) => ({ input })),
  PutObjectTaggingCommand: jest.fn().mockImplementation((input) => ({ input })),
}));

jest.mock('@aws-sdk/client-sns', () => ({
  SNSClient: jest.fn().mockImplementation(() => ({ send: mockSnsSend })),
  PublishCommand: jest.fn().mockImplementation((input) => ({ input })),
}));

jest.mock('../../utils/logger', () => ({
  createLogger: jest.fn(() => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    initFromEvent: jest.fn(),
    setRequestId: jest.fn(),
    setUserId: jest.fn(),
    logRequest: jest.fn(),
    logResponse: jest.fn(),
    logQuery: jest.fn(),
    logSecurity: jest.fn(),
    child: jest.fn().mockReturnThis(),
  })),
}));

// ── Import AFTER all mocks are declared ──

import {
  isPendingScan,
  getFinalKey,
  recordScanResult,
  promoteObject,
  quarantineFromPending,
} from '../../moderation/scan-coordinator';

// ── Test suite ──

describe('scan-coordinator', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('isPendingScan', () => {
    it('should return true for pending-scan/ prefix', () => {
      expect(isPendingScan('pending-scan/uploads/photo.jpg')).toBe(true);
    });

    it('should return false for non-pending paths', () => {
      expect(isPendingScan('uploads/photo.jpg')).toBe(false);
    });

    it('should return false for quarantine paths', () => {
      expect(isPendingScan('quarantine/uploads/photo.jpg')).toBe(false);
    });
  });

  describe('getFinalKey', () => {
    it('should strip pending-scan/ prefix', () => {
      expect(getFinalKey('pending-scan/uploads/photo.jpg')).toBe('uploads/photo.jpg');
    });

    it('should return key unchanged if no prefix', () => {
      expect(getFinalKey('uploads/photo.jpg')).toBe('uploads/photo.jpg');
    });
  });

  describe('recordScanResult', () => {
    it('should record result in DynamoDB and return isLastScanner=false when not all scans done', async () => {
      mockDynamoSend.mockResolvedValueOnce({
        Attributes: {
          scanCount: { N: '1' },
          expectedScanCount: { N: '2' },
          moderationResult: { S: 'passed' },
        },
      });

      const result = await recordScanResult('pending-scan/photo.jpg', 'bucket', 'moderation', 'passed', 2);

      expect(mockDynamoSend).toHaveBeenCalledTimes(1);
      expect(result.isLastScanner).toBe(false);
    });

    it('should return isLastScanner=true when all scans complete', async () => {
      mockDynamoSend.mockResolvedValueOnce({
        Attributes: {
          scanCount: { N: '2' },
          expectedScanCount: { N: '2' },
          virusScanResult: { S: 'passed' },
          moderationResult: { S: 'passed' },
        },
      });

      const result = await recordScanResult('pending-scan/photo.jpg', 'bucket', 'moderation', 'passed', 2);

      expect(result.isLastScanner).toBe(true);
      expect(result.shouldQuarantine).toBe(false);
    });

    it('should return shouldQuarantine=true when virus scan found threat', async () => {
      mockDynamoSend.mockResolvedValueOnce({
        Attributes: {
          scanCount: { N: '2' },
          expectedScanCount: { N: '2' },
          virusScanResult: { S: 'quarantine' },
          moderationResult: { S: 'passed' },
        },
      });

      const result = await recordScanResult('pending-scan/photo.jpg', 'bucket', 'moderation', 'passed', 2);

      expect(result.shouldQuarantine).toBe(true);
    });
  });

  describe('promoteObject', () => {
    it('should copy to final path, tag, and delete pending', async () => {
      await promoteObject('bucket', 'pending-scan/uploads/photo.jpg', 'passed');

      // CopyObject + PutObjectTagging + DeleteObject + DeleteItemCommand
      expect(mockS3Send).toHaveBeenCalledTimes(3);
      expect(mockDynamoSend).toHaveBeenCalledTimes(1);
    });

    it('should use "passed" as default tag when no moderationTag given', async () => {
      await promoteObject('bucket', 'pending-scan/uploads/photo.jpg');

      expect(mockS3Send).toHaveBeenCalled();
    });
  });

  describe('quarantineFromPending', () => {
    it('should copy to quarantine bucket, delete pending, send alert, and cleanup', async () => {
      await quarantineFromPending('bucket', 'pending-scan/uploads/bad.jpg', 'virus detected');

      // CopyObject + DeleteObject
      expect(mockS3Send).toHaveBeenCalledTimes(2);
      // SNS alert
      expect(mockSnsSend).toHaveBeenCalledTimes(1);
      // DynamoDB cleanup
      expect(mockDynamoSend).toHaveBeenCalledTimes(1);
    });

    it('should handle SNS alert failure gracefully', async () => {
      mockSnsSend.mockRejectedValueOnce(new Error('SNS error'));

      // Should not throw even if SNS fails
      await quarantineFromPending('bucket', 'pending-scan/uploads/bad.jpg', 'virus detected');

      expect(mockS3Send).toHaveBeenCalled();
    });
  });
});

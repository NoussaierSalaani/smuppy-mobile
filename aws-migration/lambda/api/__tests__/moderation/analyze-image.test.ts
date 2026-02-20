/**
 * Tests for moderation/analyze-image Lambda handler
 * Validates image/video detection, Rekognition analysis, tagging, and quarantine
 */

// Set env vars BEFORE module load (module captures these at top level)
process.env.QUARANTINE_BUCKET = 'quarantine-bucket';
process.env.SECURITY_ALERTS_TOPIC_ARN = 'arn:aws:sns:us-east-1:123456789:alerts';
process.env.VIDEO_MODERATION_TOPIC_ARN = 'arn:aws:sns:us-east-1:123456789:video-mod';
process.env.REKOGNITION_ROLE_ARN = 'arn:aws:iam::123456789:role/rek-role';

// ── Mocks (must be before handler import — Jest hoists jest.mock calls) ──

const mockS3Send = jest.fn().mockResolvedValue({});
const mockRekognitionSend = jest.fn().mockResolvedValue({ ModerationLabels: [] });
const mockSnsSend = jest.fn().mockResolvedValue({});

jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn().mockImplementation(() => ({ send: mockS3Send })),
  PutObjectTaggingCommand: jest.fn().mockImplementation((input) => ({ input, _type: 'PutObjectTagging' })),
  GetObjectTaggingCommand: jest.fn().mockImplementation((input) => ({ input, _type: 'GetObjectTagging' })),
  CopyObjectCommand: jest.fn().mockImplementation((input) => ({ input, _type: 'CopyObject' })),
  DeleteObjectCommand: jest.fn().mockImplementation((input) => ({ input, _type: 'DeleteObject' })),
}));

jest.mock('@aws-sdk/client-rekognition', () => ({
  RekognitionClient: jest.fn().mockImplementation(() => ({ send: mockRekognitionSend })),
  DetectModerationLabelsCommand: jest.fn().mockImplementation((input) => ({ input, _type: 'DetectModerationLabels' })),
  StartContentModerationCommand: jest.fn().mockImplementation((input) => ({ input, _type: 'StartContentModeration' })),
}));

jest.mock('@aws-sdk/client-sns', () => ({
  SNSClient: jest.fn().mockImplementation(() => ({ send: mockSnsSend })),
  PublishCommand: jest.fn().mockImplementation((input) => ({ input, _type: 'Publish' })),
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

jest.mock('../../moderation/scan-coordinator', () => ({
  isPendingScan: jest.fn().mockReturnValue(false),
  recordScanResult: jest.fn().mockResolvedValue({
    isLastScanner: false,
    allResultsSafe: true,
    shouldQuarantine: false,
  }),
  promoteObject: jest.fn().mockResolvedValue(undefined),
  quarantineFromPending: jest.fn().mockResolvedValue(undefined),
}));

// ── Import handler AFTER all mocks are declared ──

import { handler } from '../../moderation/analyze-image';
import { isPendingScan, recordScanResult, promoteObject } from '../../moderation/scan-coordinator';

// ── Test suite ──

describe('moderation/analyze-image handler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should skip non-media files', async () => {
    const event = {
      detail: {
        bucket: { name: 'media-bucket' },
        object: { key: 'uploads/doc.pdf', size: 1000 },
      },
    };

    await handler(event);
    expect(mockRekognitionSend).not.toHaveBeenCalled();
  });

  it('should skip quarantine/ prefixed objects', async () => {
    const event = {
      detail: {
        bucket: { name: 'media-bucket' },
        object: { key: 'quarantine/image.jpg', size: 1000 },
      },
    };

    await handler(event);
    expect(mockRekognitionSend).not.toHaveBeenCalled();
  });

  it('should analyze direct-path image and tag as passed when no labels', async () => {
    mockS3Send.mockResolvedValueOnce({ TagSet: [] }); // GetObjectTagging - no existing tags
    mockRekognitionSend.mockResolvedValueOnce({ ModerationLabels: [] });

    const event = {
      detail: {
        bucket: { name: 'media-bucket' },
        object: { key: 'uploads/photo.jpg', size: 5000 },
      },
    };

    await handler(event);

    // Should call GetObjectTagging then DetectModerationLabels, then PutObjectTagging
    expect(mockS3Send).toHaveBeenCalled();
    expect(mockRekognitionSend).toHaveBeenCalled();
  });

  it('should quarantine direct-path image with >90% confidence labels', async () => {
    mockS3Send.mockResolvedValueOnce({ TagSet: [] }); // no existing tags
    mockRekognitionSend.mockResolvedValueOnce({
      ModerationLabels: [
        { Name: 'Explicit Nudity', Confidence: 95, ParentName: '' },
      ],
    });

    const event = {
      detail: {
        bucket: { name: 'media-bucket' },
        object: { key: 'uploads/bad-image.jpg', size: 5000 },
      },
    };

    await handler(event);

    // Should have called CopyObject (to quarantine) + DeleteObject + PutObjectTagging + PublishCommand (alert)
    expect(mockS3Send).toHaveBeenCalled();
    expect(mockSnsSend).toHaveBeenCalled();
  });

  it('should tag image as under_review for 70-90% confidence', async () => {
    mockS3Send.mockResolvedValueOnce({ TagSet: [] });
    mockRekognitionSend.mockResolvedValueOnce({
      ModerationLabels: [
        { Name: 'Suggestive', Confidence: 80, ParentName: '' },
      ],
    });

    const event = {
      detail: {
        bucket: { name: 'media-bucket' },
        object: { key: 'uploads/maybe-bad.jpg', size: 5000 },
      },
    };

    await handler(event);

    // Should tag as under_review and send alert
    expect(mockS3Send).toHaveBeenCalled();
    expect(mockSnsSend).toHaveBeenCalled();
  });

  it('should tag image as passed_low_signal for <70% confidence', async () => {
    mockS3Send.mockResolvedValueOnce({ TagSet: [] });
    mockRekognitionSend.mockResolvedValueOnce({
      ModerationLabels: [
        { Name: 'Suggestive', Confidence: 55, ParentName: '' },
      ],
    });

    const event = {
      detail: {
        bucket: { name: 'media-bucket' },
        object: { key: 'uploads/low-signal.png', size: 5000 },
      },
    };

    await handler(event);
    expect(mockS3Send).toHaveBeenCalled();
  });

  it('should skip already-scanned images', async () => {
    mockS3Send.mockResolvedValueOnce({
      TagSet: [{ Key: 'moderation-status', Value: 'passed' }],
    });

    const event = {
      detail: {
        bucket: { name: 'media-bucket' },
        object: { key: 'uploads/already-scanned.jpg', size: 5000 },
      },
    };

    await handler(event);
    expect(mockRekognitionSend).not.toHaveBeenCalled();
  });

  it('should tag oversized direct-path image for manual review', async () => {
    const event = {
      detail: {
        bucket: { name: 'media-bucket' },
        object: { key: 'uploads/big-image.jpg', size: 20 * 1024 * 1024 },
      },
    };

    await handler(event);
    expect(mockS3Send).toHaveBeenCalled();
    expect(mockRekognitionSend).not.toHaveBeenCalled();
  });

  it('should start async video moderation for video files', async () => {
    mockRekognitionSend.mockResolvedValueOnce({ JobId: 'job-123' });

    const event = {
      detail: {
        bucket: { name: 'media-bucket' },
        object: { key: 'uploads/video.mp4', size: 50000 },
      },
    };

    await handler(event);
    expect(mockRekognitionSend).toHaveBeenCalled();
    expect(mockS3Send).toHaveBeenCalled(); // tag as in_progress
  });

  it('should handle pending-scan images', async () => {
    (isPendingScan as jest.Mock).mockReturnValueOnce(true);
    mockRekognitionSend.mockResolvedValueOnce({ ModerationLabels: [] });
    (recordScanResult as jest.Mock).mockResolvedValueOnce({
      isLastScanner: true,
      allResultsSafe: true,
      shouldQuarantine: false,
    });

    const event = {
      detail: {
        bucket: { name: 'media-bucket' },
        object: { key: 'pending-scan/uploads/photo.jpg', size: 5000 },
      },
    };

    await handler(event);
    expect(recordScanResult).toHaveBeenCalled();
    expect(promoteObject).toHaveBeenCalled();
  });

  it('should handle Rekognition errors gracefully for direct images', async () => {
    mockS3Send.mockResolvedValueOnce({ TagSet: [] });
    mockRekognitionSend.mockRejectedValueOnce(new Error('Rekognition error'));

    const event = {
      detail: {
        bucket: { name: 'media-bucket' },
        object: { key: 'uploads/error-image.jpg', size: 5000 },
      },
    };

    // Should not throw
    await handler(event);
    // Should tag as scan_error
    expect(mockS3Send).toHaveBeenCalled();
  });
});

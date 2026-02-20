/**
 * Tests for moderation/process-video-moderation Lambda handler
 * Validates SNS event parsing, Rekognition result processing, and quarantine/tagging
 */

// Set env vars BEFORE module load (module captures these at top level)
process.env.QUARANTINE_BUCKET = 'quarantine-bucket';
process.env.SECURITY_ALERTS_TOPIC_ARN = 'arn:aws:sns:us-east-1:123456789:alerts';

// ── Mocks (must be before handler import — Jest hoists jest.mock calls) ──

const mockS3Send = jest.fn().mockResolvedValue({});
const mockRekognitionSend = jest.fn().mockResolvedValue({ ModerationLabels: [], NextToken: undefined });
const mockSnsSend = jest.fn().mockResolvedValue({});

jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn().mockImplementation(() => ({ send: mockS3Send })),
  PutObjectTaggingCommand: jest.fn().mockImplementation((input) => ({ input })),
  CopyObjectCommand: jest.fn().mockImplementation((input) => ({ input })),
  DeleteObjectCommand: jest.fn().mockImplementation((input) => ({ input })),
}));

jest.mock('@aws-sdk/client-rekognition', () => ({
  RekognitionClient: jest.fn().mockImplementation(() => ({ send: mockRekognitionSend })),
  GetContentModerationCommand: jest.fn().mockImplementation((input) => ({ input })),
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

// ── Import handler AFTER all mocks are declared ──

import { handler } from '../../moderation/process-video-moderation';

// ── Helpers ──

function makeSNSEvent(message: object | string) {
  return {
    Records: [{
      Sns: {
        Message: typeof message === 'string' ? message : JSON.stringify(message),
      },
    }],
  };
}

function makeValidCallback(overrides: Record<string, unknown> = {}) {
  return {
    JobId: 'job-123',
    Status: 'SUCCEEDED',
    API: 'StartContentModeration',
    Video: {
      S3ObjectName: 'uploads/video.mp4',
      S3Bucket: 'media-bucket',
    },
    ...overrides,
  };
}

// ── Test suite ──

describe('moderation/process-video-moderation handler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should skip non-StartContentModeration callbacks', async () => {
    const event = makeSNSEvent(makeValidCallback({ API: 'StartFaceDetection' }));
    await handler(event);
    expect(mockRekognitionSend).not.toHaveBeenCalled();
  });

  it('should handle malformed SNS message gracefully', async () => {
    const event = makeSNSEvent('not-valid-json');
    await handler(event);
    expect(mockRekognitionSend).not.toHaveBeenCalled();
  });

  it('should tag as error when job status is FAILED', async () => {
    const event = makeSNSEvent(makeValidCallback({ Status: 'FAILED' }));
    await handler(event);

    expect(mockS3Send).toHaveBeenCalled();
    expect(mockRekognitionSend).not.toHaveBeenCalled();
  });

  it('should tag video as passed when no moderation labels found', async () => {
    mockRekognitionSend.mockResolvedValueOnce({
      ModerationLabels: [],
      NextToken: undefined,
    });

    const event = makeSNSEvent(makeValidCallback());
    await handler(event);

    expect(mockRekognitionSend).toHaveBeenCalled();
    expect(mockS3Send).toHaveBeenCalled();
  });

  it('should quarantine video with >90% confidence labels', async () => {
    mockRekognitionSend.mockResolvedValueOnce({
      ModerationLabels: [{
        ModerationLabel: { Name: 'Explicit Nudity', Confidence: 95, ParentName: '' },
        Timestamp: 1000,
      }],
      NextToken: undefined,
    });

    const event = makeSNSEvent(makeValidCallback());
    await handler(event);

    // CopyObject + DeleteObject for quarantine, plus SNS alert
    expect(mockS3Send).toHaveBeenCalled();
    expect(mockSnsSend).toHaveBeenCalled();
  });

  it('should tag video as under_review for 70-90% confidence', async () => {
    mockRekognitionSend.mockResolvedValueOnce({
      ModerationLabels: [{
        ModerationLabel: { Name: 'Suggestive', Confidence: 80, ParentName: '' },
        Timestamp: 500,
      }],
      NextToken: undefined,
    });

    const event = makeSNSEvent(makeValidCallback());
    await handler(event);

    expect(mockS3Send).toHaveBeenCalled();
    expect(mockSnsSend).toHaveBeenCalled();
  });

  it('should tag video as passed_low_signal for <70% confidence', async () => {
    mockRekognitionSend.mockResolvedValueOnce({
      ModerationLabels: [{
        ModerationLabel: { Name: 'Suggestive', Confidence: 55, ParentName: '' },
        Timestamp: 200,
      }],
      NextToken: undefined,
    });

    const event = makeSNSEvent(makeValidCallback());
    await handler(event);

    expect(mockS3Send).toHaveBeenCalled();
    expect(mockSnsSend).not.toHaveBeenCalled();
  });

  it('should paginate through all Rekognition results', async () => {
    mockRekognitionSend
      .mockResolvedValueOnce({
        ModerationLabels: [{
          ModerationLabel: { Name: 'Suggestive', Confidence: 55, ParentName: '' },
          Timestamp: 200,
        }],
        NextToken: 'next-page',
      })
      .mockResolvedValueOnce({
        ModerationLabels: [{
          ModerationLabel: { Name: 'Violence', Confidence: 60, ParentName: '' },
          Timestamp: 500,
        }],
        NextToken: undefined,
      });

    const event = makeSNSEvent(makeValidCallback());
    await handler(event);

    expect(mockRekognitionSend).toHaveBeenCalledTimes(2);
  });

  it('should use highest confidence across all timestamps', async () => {
    mockRekognitionSend.mockResolvedValueOnce({
      ModerationLabels: [
        { ModerationLabel: { Name: 'Violence', Confidence: 50, ParentName: '' }, Timestamp: 100 },
        { ModerationLabel: { Name: 'Violence', Confidence: 95, ParentName: '' }, Timestamp: 200 },
      ],
      NextToken: undefined,
    });

    const event = makeSNSEvent(makeValidCallback());
    await handler(event);

    // >90% = quarantine
    expect(mockSnsSend).toHaveBeenCalled();
  });

  it('should handle Rekognition errors gracefully', async () => {
    mockRekognitionSend.mockRejectedValueOnce(new Error('Rekognition error'));

    const event = makeSNSEvent(makeValidCallback());
    await handler(event);

    // Should tag as video_scan_error
    expect(mockS3Send).toHaveBeenCalled();
  });
});

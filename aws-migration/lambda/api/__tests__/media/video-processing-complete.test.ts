/**
 * Tests for media/video-processing-complete Lambda handler (EventBridge)
 */

process.env.MEDIA_BUCKET = 'test-media-bucket';
process.env.CDN_DOMAIN = 'cdn.example.com';

jest.mock('../../../shared/db', () => ({ getPool: jest.fn(), getReaderPool: jest.fn() }));
jest.mock('../../utils/logger', () => ({
  createLogger: jest.fn(() => ({
    info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(),
    initFromEvent: jest.fn(), child: jest.fn().mockReturnThis(),
  })),
}));

import { getPool } from '../../../shared/db';
import { handler } from '../../media/video-processing-complete';

describe('media/video-processing-complete handler', () => {
  let mockDb: { query: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();
    mockDb = { query: jest.fn().mockResolvedValue({ rows: [] }) };
    (getPool as jest.Mock).mockResolvedValue(mockDb);
  });

  it('should return early when jobId is missing', async () => {
    await handler({
      source: 'aws.mediaconvert',
      'detail-type': 'MediaConvert Job State Change',
      detail: { jobId: '', status: 'COMPLETE' },
    });
    expect(mockDb.query).not.toHaveBeenCalled();
  });

  it('should return early when entity cannot be resolved', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] }); // job not found in DB
    await handler({
      source: 'aws.mediaconvert',
      'detail-type': 'MediaConvert Job State Change',
      detail: { jobId: 'job-123', status: 'COMPLETE' },
    });
    // Only the job lookup query should have been called
    expect(mockDb.query).toHaveBeenCalledTimes(1);
  });

  it('should update post as ready on COMPLETE', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: '1', entity_type: 'post', entity_id: 'post-123' }] }); // job lookup
    mockDb.query.mockResolvedValue({ rows: [] }); // subsequent updates

    await handler({
      source: 'aws.mediaconvert',
      'detail-type': 'MediaConvert Job State Change',
      detail: {
        jobId: 'job-123',
        status: 'COMPLETE',
        outputGroupDetails: [{
          outputDetails: [{
            outputFilePaths: ['s3://test-media-bucket/video-processed/post/post-123/hls/master.m3u8'],
            videoDetails: { widthInPx: 1920, heightInPx: 1080 },
          }],
        }],
      },
    });

    // Should have called UPDATE posts SET video_status = 'ready'
    const updateCall = mockDb.query.mock.calls.find(
      (call: unknown[]) => typeof call[0] === 'string' && (call[0] as string).includes("video_status = 'ready'"),
    );
    expect(updateCall).toBeDefined();
  });

  it('should update post as failed on ERROR', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: '1', entity_type: 'post', entity_id: 'post-123' }] });
    mockDb.query.mockResolvedValue({ rows: [] });

    await handler({
      source: 'aws.mediaconvert',
      'detail-type': 'MediaConvert Job State Change',
      detail: {
        jobId: 'job-123',
        status: 'ERROR',
        errorMessage: 'Transcoding failed',
      },
    });

    const updateCall = mockDb.query.mock.calls.find(
      (call: unknown[]) => typeof call[0] === 'string' && (call[0] as string).includes("video_status = 'failed'"),
    );
    expect(updateCall).toBeDefined();
  });

  it('should not throw on processing error', async () => {
    mockDb.query.mockRejectedValueOnce(new Error('DB error'));
    await expect(handler({
      source: 'aws.mediaconvert',
      'detail-type': 'MediaConvert Job State Change',
      detail: { jobId: 'job-123', status: 'COMPLETE' },
    })).resolves.toBeUndefined();
  });
});

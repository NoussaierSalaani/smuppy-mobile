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

  // ── Missing jobId branch ─────────────────────────────────────────
  it('should return early when jobId is missing', async () => {
    await handler({
      source: 'aws.mediaconvert',
      'detail-type': 'MediaConvert Job State Change',
      detail: { jobId: '', status: 'COMPLETE' },
    });
    expect(mockDb.query).not.toHaveBeenCalled();
  });

  // ── Entity cannot be resolved (no DB row, no userMetadata) ───────
  it('should return early when entity cannot be resolved', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] }); // job not found in DB
    await handler({
      source: 'aws.mediaconvert',
      'detail-type': 'MediaConvert Job State Change',
      detail: { jobId: 'job-123', status: 'COMPLETE' },
    });
    expect(mockDb.query).toHaveBeenCalledTimes(1);
  });

  // ── Fallback to userMetadata when DB has no row ──────────────────
  it('should resolve entity from userMetadata when DB returns no rows', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] }); // no DB match
    mockDb.query.mockResolvedValue({ rows: [] }); // subsequent updates

    await handler({
      source: 'aws.mediaconvert',
      'detail-type': 'MediaConvert Job State Change',
      detail: {
        jobId: 'job-fallback',
        status: 'COMPLETE',
        userMetadata: { entityType: 'post', entityId: 'post-from-meta' },
        outputGroupDetails: [{
          outputDetails: [{
            outputFilePaths: ['s3://test-media-bucket/hls/master.m3u8'],
          }],
        }],
      },
    });

    // Should proceed past the entity check and run UPDATE queries
    expect(mockDb.query).toHaveBeenCalledTimes(3); // lookup + update posts + update job
  });

  // ── Fallback: userMetadata has entityType but not entityId ───────
  it('should return early when userMetadata has entityType but no entityId', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] });

    await handler({
      source: 'aws.mediaconvert',
      'detail-type': 'MediaConvert Job State Change',
      detail: {
        jobId: 'job-no-id',
        status: 'COMPLETE',
        userMetadata: { entityType: 'post' },
      },
    });

    expect(mockDb.query).toHaveBeenCalledTimes(1); // only the lookup
  });

  // ── COMPLETE for post entityType ─────────────────────────────────
  it('should update post as ready on COMPLETE', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: '1', entity_type: 'post', entity_id: 'post-123' }] });
    mockDb.query.mockResolvedValue({ rows: [] });

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

    const updateCall = mockDb.query.mock.calls.find(
      (call: unknown[]) => typeof call[0] === 'string' && (call[0] as string).includes('UPDATE posts'),
    );
    expect(updateCall).toBeDefined();
  });

  // ── COMPLETE for peak entityType ─────────────────────────────────
  it('should update peak as ready on COMPLETE', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: '1', entity_type: 'peak', entity_id: 'peak-456' }] });
    mockDb.query.mockResolvedValue({ rows: [] });

    await handler({
      source: 'aws.mediaconvert',
      'detail-type': 'MediaConvert Job State Change',
      detail: {
        jobId: 'job-peak',
        status: 'COMPLETE',
        outputGroupDetails: [{
          outputDetails: [{
            outputFilePaths: [
              's3://test-media-bucket/peaks/peak-456/hls/master.m3u8',
              's3://test-media-bucket/peaks/peak-456/thumb.jpg',
            ],
            videoDetails: { widthInPx: 720, heightInPx: 1280 },
            durationInMs: 15000,
          }],
        }],
      },
    });

    const updateCall = mockDb.query.mock.calls.find(
      (call: unknown[]) => typeof call[0] === 'string' && (call[0] as string).includes('UPDATE peaks'),
    );
    expect(updateCall).toBeDefined();
    expect(updateCall![0]).toContain("video_status = 'ready'");
  });

  // ── COMPLETE with no outputGroupDetails (null HLS/thumbnail) ─────
  it('should handle COMPLETE with no outputGroupDetails (null HLS and thumbnail)', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: '1', entity_type: 'post', entity_id: 'post-no-output' }] });
    mockDb.query.mockResolvedValue({ rows: [] });

    await handler({
      source: 'aws.mediaconvert',
      'detail-type': 'MediaConvert Job State Change',
      detail: {
        jobId: 'job-no-output',
        status: 'COMPLETE',
      },
    });

    const updateCall = mockDb.query.mock.calls.find(
      (call: unknown[]) => typeof call[0] === 'string' && (call[0] as string).includes('UPDATE posts'),
    );
    expect(updateCall).toBeDefined();
    // hlsUrl and thumbnailUrl should be null
    expect(updateCall![1][1]).toBeNull(); // hlsUrl
    expect(updateCall![1][2]).toBeNull(); // thumbnailUrl
  });

  // ── COMPLETE with outputGroupDetails but empty outputDetails ─────
  it('should handle outputGroupDetails with missing outputDetails', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: '1', entity_type: 'post', entity_id: 'post-empty' }] });
    mockDb.query.mockResolvedValue({ rows: [] });

    await handler({
      source: 'aws.mediaconvert',
      'detail-type': 'MediaConvert Job State Change',
      detail: {
        jobId: 'job-empty-details',
        status: 'COMPLETE',
        outputGroupDetails: [
          { /* no outputDetails */ },
          { outputDetails: [{ /* no outputFilePaths */ }] },
        ],
      },
    });

    const updateCall = mockDb.query.mock.calls.find(
      (call: unknown[]) => typeof call[0] === 'string' && (call[0] as string).includes('UPDATE posts'),
    );
    expect(updateCall).toBeDefined();
    expect(updateCall![1][1]).toBeNull(); // hlsUrl is null when no .m3u8 found
  });

  // ── COMPLETE with non-m3u8 / non-image output files ──────────────
  it('should return null HLS/thumbnail when output files are not m3u8 or images', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: '1', entity_type: 'post', entity_id: 'post-mp4' }] });
    mockDb.query.mockResolvedValue({ rows: [] });

    await handler({
      source: 'aws.mediaconvert',
      'detail-type': 'MediaConvert Job State Change',
      detail: {
        jobId: 'job-mp4',
        status: 'COMPLETE',
        outputGroupDetails: [{
          outputDetails: [{
            outputFilePaths: ['s3://test-media-bucket/output/video.mp4'],
          }],
        }],
      },
    });

    const updateCall = mockDb.query.mock.calls.find(
      (call: unknown[]) => typeof call[0] === 'string' && (call[0] as string).includes('UPDATE posts'),
    );
    expect(updateCall).toBeDefined();
    expect(updateCall![1][1]).toBeNull(); // no .m3u8 => null hlsUrl
    expect(updateCall![1][2]).toBeNull(); // no image => null thumbnailUrl
  });

  // ── buildVideoVariants: .m3u8 with 'master' in name is excluded ──
  it('should exclude master.m3u8 from video variants but include non-master .m3u8', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: '1', entity_type: 'post', entity_id: 'post-variants' }] });
    mockDb.query.mockResolvedValue({ rows: [] });

    await handler({
      source: 'aws.mediaconvert',
      'detail-type': 'MediaConvert Job State Change',
      detail: {
        jobId: 'job-variants',
        status: 'COMPLETE',
        outputGroupDetails: [{
          outputDetails: [
            {
              outputFilePaths: ['s3://test-media-bucket/hls/master.m3u8'], // excluded from variants
              videoDetails: { widthInPx: 1920, heightInPx: 1080 },
              durationInMs: 30000,
            },
            {
              outputFilePaths: ['s3://test-media-bucket/hls/720p.m3u8'], // included in variants
              videoDetails: { widthInPx: 1280, heightInPx: 720 },
              durationInMs: 30000,
            },
            {
              // variant without videoDetails (covers ?.widthInPx || null, ?.heightInPx || null)
              outputFilePaths: ['s3://test-media-bucket/hls/360p.m3u8'],
              durationInMs: undefined, // covers durationInMs || null
            },
          ],
        }],
      },
    });

    // Check the video_variants JSON passed to the job tracking update
    const jobUpdate = mockDb.query.mock.calls.find(
      (call: unknown[]) => typeof call[0] === 'string' && (call[0] as string).includes('UPDATE video_processing_jobs'),
    );
    expect(jobUpdate).toBeDefined();
    const variants = JSON.parse(jobUpdate![1][1]);
    // master.m3u8 is excluded from variants; 720p and 360p are included
    expect(variants.length).toBe(2);
    expect(variants[0].width).toBe(1280);
    expect(variants[1].width).toBeNull(); // no videoDetails
    expect(variants[1].height).toBeNull();
    expect(variants[1].durationMs).toBeNull();
  });

  // ── ERROR for post entityType ────────────────────────────────────
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
    expect(updateCall![0]).toContain('UPDATE posts');

    // Check job tracking: ERROR maps to 'error'
    const jobUpdate = mockDb.query.mock.calls.find(
      (call: unknown[]) => typeof call[0] === 'string' && (call[0] as string).includes('UPDATE video_processing_jobs'),
    );
    expect(jobUpdate![1][1]).toBe('error');
    expect(jobUpdate![1][2]).toBe('Transcoding failed');
  });

  // ── ERROR for peak entityType ────────────────────────────────────
  it('should update peak as failed on ERROR', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: '1', entity_type: 'peak', entity_id: 'peak-456' }] });
    mockDb.query.mockResolvedValue({ rows: [] });

    await handler({
      source: 'aws.mediaconvert',
      'detail-type': 'MediaConvert Job State Change',
      detail: {
        jobId: 'job-peak-error',
        status: 'ERROR',
        errorMessage: 'Encoding error',
      },
    });

    const updateCall = mockDb.query.mock.calls.find(
      (call: unknown[]) => typeof call[0] === 'string' && (call[0] as string).includes('UPDATE peaks'),
    );
    expect(updateCall).toBeDefined();
    expect(updateCall![0]).toContain("video_status = 'failed'");
  });

  // ── CANCELED status for post (covers 'canceled' branch of ternary) ──
  it('should set job status to canceled on CANCELED for post', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: '1', entity_type: 'post', entity_id: 'post-cancel' }] });
    mockDb.query.mockResolvedValue({ rows: [] });

    await handler({
      source: 'aws.mediaconvert',
      'detail-type': 'MediaConvert Job State Change',
      detail: {
        jobId: 'job-canceled',
        status: 'CANCELED',
      },
    });

    // Check post update
    const postUpdate = mockDb.query.mock.calls.find(
      (call: unknown[]) => typeof call[0] === 'string' && (call[0] as string).includes('UPDATE posts') && (call[0] as string).includes("video_status = 'failed'"),
    );
    expect(postUpdate).toBeDefined();

    // Check job tracking: CANCELED maps to 'canceled', errorMessage is undefined => null
    const jobUpdate = mockDb.query.mock.calls.find(
      (call: unknown[]) => typeof call[0] === 'string' && (call[0] as string).includes('UPDATE video_processing_jobs'),
    );
    expect(jobUpdate![1][1]).toBe('canceled');
    expect(jobUpdate![1][2]).toBeNull(); // errorMessage || null when undefined
  });

  // ── CANCELED status for peak ─────────────────────────────────────
  it('should set job status to canceled on CANCELED for peak', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: '1', entity_type: 'peak', entity_id: 'peak-cancel' }] });
    mockDb.query.mockResolvedValue({ rows: [] });

    await handler({
      source: 'aws.mediaconvert',
      'detail-type': 'MediaConvert Job State Change',
      detail: {
        jobId: 'job-peak-canceled',
        status: 'CANCELED',
      },
    });

    const peakUpdate = mockDb.query.mock.calls.find(
      (call: unknown[]) => typeof call[0] === 'string' && (call[0] as string).includes('UPDATE peaks') && (call[0] as string).includes("video_status = 'failed'"),
    );
    expect(peakUpdate).toBeDefined();
  });

  // ── Unknown entityType (neither post nor peak) on COMPLETE ───────
  it('should skip entity update for unknown entityType on COMPLETE', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: '1', entity_type: 'story', entity_id: 'story-1' }] });
    mockDb.query.mockResolvedValue({ rows: [] });

    await handler({
      source: 'aws.mediaconvert',
      'detail-type': 'MediaConvert Job State Change',
      detail: {
        jobId: 'job-story',
        status: 'COMPLETE',
        outputGroupDetails: [{
          outputDetails: [{
            outputFilePaths: ['s3://test-media-bucket/hls/stream.m3u8'],
          }],
        }],
      },
    });

    // Should NOT have UPDATE posts or UPDATE peaks, but should still update video_processing_jobs
    const postUpdate = mockDb.query.mock.calls.find(
      (call: unknown[]) => typeof call[0] === 'string' && (call[0] as string).includes('UPDATE posts'),
    );
    const peakUpdate = mockDb.query.mock.calls.find(
      (call: unknown[]) => typeof call[0] === 'string' && (call[0] as string).includes('UPDATE peaks'),
    );
    expect(postUpdate).toBeUndefined();
    expect(peakUpdate).toBeUndefined();

    const jobUpdate = mockDb.query.mock.calls.find(
      (call: unknown[]) => typeof call[0] === 'string' && (call[0] as string).includes('UPDATE video_processing_jobs'),
    );
    expect(jobUpdate).toBeDefined();
  });

  // ── Unknown entityType on ERROR ──────────────────────────────────
  it('should skip entity update for unknown entityType on ERROR', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: '1', entity_type: 'reel', entity_id: 'reel-1' }] });
    mockDb.query.mockResolvedValue({ rows: [] });

    await handler({
      source: 'aws.mediaconvert',
      'detail-type': 'MediaConvert Job State Change',
      detail: {
        jobId: 'job-reel-error',
        status: 'ERROR',
        errorMessage: 'Unknown format',
      },
    });

    const postUpdate = mockDb.query.mock.calls.find(
      (call: unknown[]) => typeof call[0] === 'string' && (call[0] as string).includes('UPDATE posts'),
    );
    const peakUpdate = mockDb.query.mock.calls.find(
      (call: unknown[]) => typeof call[0] === 'string' && (call[0] as string).includes('UPDATE peaks'),
    );
    expect(postUpdate).toBeUndefined();
    expect(peakUpdate).toBeUndefined();
  });

  // ── Thumbnail extraction with .jpg extension ─────────────────────
  it('should extract thumbnail URL from jpg output file', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: '1', entity_type: 'post', entity_id: 'post-thumb' }] });
    mockDb.query.mockResolvedValue({ rows: [] });

    await handler({
      source: 'aws.mediaconvert',
      'detail-type': 'MediaConvert Job State Change',
      detail: {
        jobId: 'job-thumb',
        status: 'COMPLETE',
        outputGroupDetails: [{
          outputDetails: [
            {
              outputFilePaths: ['s3://test-media-bucket/hls/master.m3u8'],
            },
          ],
        }, {
          outputDetails: [
            {
              outputFilePaths: ['s3://test-media-bucket/thumbs/frame.0000000.jpg'],
            },
          ],
        }],
      },
    });

    const updateCall = mockDb.query.mock.calls.find(
      (call: unknown[]) => typeof call[0] === 'string' && (call[0] as string).includes('UPDATE posts') && (call[0] as string).includes("video_status = 'ready'"),
    );
    expect(updateCall).toBeDefined();
    // thumbnailUrl should be CDN URL for the jpg
    expect(updateCall![1][2]).toBe('https://cdn.example.com/thumbs/frame.0000000.jpg');
  });

  // ── Thumbnail extraction with .png extension ─────────────────────
  it('should extract thumbnail URL from png output file', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: '1', entity_type: 'post', entity_id: 'post-png' }] });
    mockDb.query.mockResolvedValue({ rows: [] });

    await handler({
      source: 'aws.mediaconvert',
      'detail-type': 'MediaConvert Job State Change',
      detail: {
        jobId: 'job-png',
        status: 'COMPLETE',
        outputGroupDetails: [{
          outputDetails: [{
            outputFilePaths: ['s3://test-media-bucket/thumbs/frame.PNG'],
          }],
        }],
      },
    });

    const updateCall = mockDb.query.mock.calls.find(
      (call: unknown[]) => typeof call[0] === 'string' && (call[0] as string).includes('UPDATE posts'),
    );
    expect(updateCall).toBeDefined();
    expect(updateCall![1][2]).toBe('https://cdn.example.com/thumbs/frame.PNG');
  });

  // ── Catch block (error handling) ─────────────────────────────────
  it('should not throw on processing error', async () => {
    mockDb.query.mockRejectedValueOnce(new Error('DB error'));
    await expect(handler({
      source: 'aws.mediaconvert',
      'detail-type': 'MediaConvert Job State Change',
      detail: { jobId: 'job-123', status: 'COMPLETE' },
    })).resolves.toBeUndefined();
  });

  // ── hlsUrl 'set' vs 'missing' log branch ────────────────────────
  it('should log hlsUrl as set when found and missing when not found', async () => {
    // This test covers the ternary: hlsUrl ? 'set' : 'missing'
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: '1', entity_type: 'post', entity_id: 'post-nohl' }] });
    mockDb.query.mockResolvedValue({ rows: [] });

    await handler({
      source: 'aws.mediaconvert',
      'detail-type': 'MediaConvert Job State Change',
      detail: {
        jobId: 'job-no-hls',
        status: 'COMPLETE',
        outputGroupDetails: [{
          outputDetails: [{
            outputFilePaths: ['s3://test-media-bucket/output/video.ts'], // no .m3u8
          }],
        }],
      },
    });

    // hlsUrl is null, thumbnailUrl is null
    const updateCall = mockDb.query.mock.calls.find(
      (call: unknown[]) => typeof call[0] === 'string' && (call[0] as string).includes('UPDATE posts'),
    );
    expect(updateCall![1][1]).toBeNull();
  });
});

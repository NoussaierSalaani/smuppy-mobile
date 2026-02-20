/**
 * Tests for peaks/cleanup-expired Lambda handler (scheduled)
 * Validates batch cleanup of expired peaks with S3 media deletion
 */

import { getPool } from '../../../shared/db';

// ── Mocks ──────────────────────────────────────────────────────────

jest.mock('../../../shared/db', () => ({
  getPool: jest.fn(),
  getReaderPool: jest.fn(),
}));

jest.mock('../../utils/rate-limit', () => ({
  checkRateLimit: jest.fn().mockResolvedValue({ allowed: true }),
  requireRateLimit: jest.fn().mockResolvedValue(null),
}));

jest.mock('../../utils/logger', () => ({
  createLogger: jest.fn(() => ({
    info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(),
    initFromEvent: jest.fn(), setRequestId: jest.fn(), setUserId: jest.fn(),
    logRequest: jest.fn(), logResponse: jest.fn(), logQuery: jest.fn(),
    logSecurity: jest.fn(), child: jest.fn().mockReturnThis(),
  })),
}));

jest.mock('../../utils/cors', () => ({
  createHeaders: jest.fn(() => ({
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Credentials': 'true',
  })),
}));

const mockS3Send = jest.fn().mockResolvedValue({});

jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn().mockImplementation(() => ({
    send: mockS3Send,
  })),
  DeleteObjectsCommand: jest.fn().mockImplementation((input) => input),
}));

jest.mock('../../utils/media-cleanup', () => ({
  extractS3Key: jest.fn((url: string) => {
    if (!url) return null;
    try {
      const parsed = new URL(url);
      return parsed.pathname.substring(1); // remove leading /
    } catch {
      return null;
    }
  }),
}));

// Set MEDIA_BUCKET BEFORE importing handler (module reads it at load time)
process.env.MEDIA_BUCKET = 'smuppy-media';

import { handler } from '../../peaks/cleanup-expired';

// ── Helpers ────────────────────────────────────────────────────────

function makePeakRow(id: string) {
  return {
    id,
    video_url: `https://smuppy-media.s3.amazonaws.com/peaks/${id}/video.mp4`,
    thumbnail_url: `https://smuppy-media.s3.amazonaws.com/peaks/${id}/thumb.jpg`,
  };
}

// ── Tests ──────────────────────────────────────────────────────────

describe('peaks/cleanup-expired handler', () => {
  let mockDb: { query: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();

    mockDb = {
      query: jest.fn().mockResolvedValue({ rows: [] }),
    };

    (getPool as jest.Mock).mockResolvedValue(mockDb);
    mockS3Send.mockReset();
    mockS3Send.mockResolvedValue({});
  });

  describe('no expired peaks', () => {
    it('should return zero counts when no expired peaks found', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });

      const result = await handler();

      expect(result.cleaned).toBe(0);
      expect(result.errors).toBe(0);
    });
  });

  describe('successful cleanup', () => {
    it('should clean up a single expired peak', async () => {
      const peak = makePeakRow('peak-1');
      mockDb.query
        .mockResolvedValueOnce({ rows: [peak] }) // find expired peaks
        .mockResolvedValueOnce({ rows: [] }); // DELETE FROM peaks

      const result = await handler();

      expect(result.cleaned).toBe(1);
      expect(result.errors).toBe(0);

      // Verify S3 cleanup was attempted
      expect(mockS3Send).toHaveBeenCalled();

      // Verify DB delete was called
      const deleteCall = mockDb.query.mock.calls.find(
        (call: unknown[]) => typeof call[0] === 'string' && call[0].includes('DELETE FROM peaks')
      );
      expect(deleteCall).toBeDefined();
      expect(deleteCall![1]).toEqual(['peak-1']);
    });

    it('should clean up multiple expired peaks', async () => {
      const peaks = [
        makePeakRow('peak-1'),
        makePeakRow('peak-2'),
        makePeakRow('peak-3'),
      ];
      mockDb.query
        .mockResolvedValueOnce({ rows: peaks }) // find expired peaks
        .mockResolvedValue({ rows: [] }); // DELETE calls

      const result = await handler();

      expect(result.cleaned).toBe(3);
      expect(result.errors).toBe(0);
    });

    it('should handle peak with no thumbnail URL', async () => {
      const peak = { id: 'peak-no-thumb', video_url: 'https://smuppy-media.s3.amazonaws.com/video.mp4', thumbnail_url: null };
      mockDb.query
        .mockResolvedValueOnce({ rows: [peak] })
        .mockResolvedValueOnce({ rows: [] });

      const result = await handler();

      expect(result.cleaned).toBe(1);
      expect(result.errors).toBe(0);
    });

    it('should handle peak with no video URL', async () => {
      const peak = { id: 'peak-no-video', video_url: null, thumbnail_url: 'https://smuppy-media.s3.amazonaws.com/thumb.jpg' };
      mockDb.query
        .mockResolvedValueOnce({ rows: [peak] })
        .mockResolvedValueOnce({ rows: [] });

      const result = await handler();

      expect(result.cleaned).toBe(1);
      expect(result.errors).toBe(0);
    });
  });

  describe('S3 cleanup errors', () => {
    it('should continue cleaning up even if S3 delete fails', async () => {
      const peak = makePeakRow('peak-s3-fail');
      mockDb.query
        .mockResolvedValueOnce({ rows: [peak] })
        .mockResolvedValueOnce({ rows: [] }); // DB delete

      mockS3Send.mockRejectedValueOnce(new Error('S3 access denied'));

      const result = await handler();

      // S3 failure should not prevent DB cleanup
      expect(result.cleaned).toBe(1);
      expect(result.errors).toBe(0);
    });
  });

  describe('DB errors during cleanup', () => {
    it('should count errors when individual peak cleanup fails', async () => {
      const peaks = [makePeakRow('peak-ok'), makePeakRow('peak-fail')];
      mockDb.query
        .mockResolvedValueOnce({ rows: peaks }) // find expired
        .mockResolvedValueOnce({ rows: [] }) // delete peak-ok
        .mockRejectedValueOnce(new Error('FK constraint')); // delete peak-fail fails

      const result = await handler();

      expect(result.cleaned).toBe(1);
      expect(result.errors).toBe(1);
    });
  });

  describe('query parameters', () => {
    it('should query for peaks with saved_to_profile IS NULL and expired > 30 days', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });

      await handler();

      const queryStr = mockDb.query.mock.calls[0][0];
      expect(queryStr).toContain('saved_to_profile IS NULL');
      expect(queryStr).toContain('30 days');
    });

    it('should limit batch size', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });

      await handler();

      const params = mockDb.query.mock.calls[0][1];
      expect(params[0]).toBe(50); // BATCH_SIZE
    });
  });

  describe('total failure', () => {
    it('should return error counts when main query fails', async () => {
      (getPool as jest.Mock).mockRejectedValueOnce(new Error('DB unreachable'));

      const result = await handler();

      expect(result.cleaned).toBe(0);
      expect(result.errors).toBe(1);
    });
  });

  describe('with MEDIA_BUCKET set', () => {
    it('should call S3 to delete media objects', async () => {
      const peak = makePeakRow('peak-with-media');
      mockDb.query
        .mockResolvedValueOnce({ rows: [peak] })
        .mockResolvedValueOnce({ rows: [] });

      const result = await handler();

      expect(result.cleaned).toBe(1);
      // S3 send should be called to delete the video and thumbnail
      expect(mockS3Send).toHaveBeenCalled();
    });
  });
});

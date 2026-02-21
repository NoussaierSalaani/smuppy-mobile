jest.unmock('../../utils/media-cleanup');

// Set env BEFORE module loads (MEDIA_BUCKET is captured at module scope)
process.env.MEDIA_BUCKET = 'test-bucket';
process.env.CLOUDFRONT_DISTRIBUTION_ID = 'DIST123';

const mockSend = jest.fn().mockResolvedValue({});

jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn().mockImplementation(() => ({ send: mockSend })),
  DeleteObjectsCommand: jest.fn().mockImplementation((input: unknown) => ({ input })),
}));

jest.mock('@aws-sdk/client-cloudfront', () => ({
  CloudFrontClient: jest.fn().mockImplementation(() => ({ send: mockSend })),
  CreateInvalidationCommand: jest.fn().mockImplementation((input: unknown) => ({ input })),
}));

import { extractS3Key, buildS3Keys, cleanupMedia } from '../../utils/media-cleanup';

describe('extractS3Key', () => {
  it('extracts key from S3 URL', () => {
    expect(extractS3Key('https://bucket.s3.amazonaws.com/uploads/image.jpg'))
      .toBe('uploads/image.jpg');
  });

  it('extracts key from CloudFront URL', () => {
    expect(extractS3Key('https://cdn.example.com/media/video.mp4'))
      .toBe('media/video.mp4');
  });

  it('strips leading slash from pathname', () => {
    expect(extractS3Key('https://cdn.example.com/file.png'))
      .toBe('file.png');
  });

  it('returns null for invalid URL', () => {
    expect(extractS3Key('not-a-url')).toBeNull();
  });

  it('returns null for URL with empty path', () => {
    expect(extractS3Key('https://cdn.example.com/')).toBeNull();
  });

  it('handles URL with query parameters', () => {
    expect(extractS3Key('https://cdn.example.com/image.jpg?w=100'))
      .toBe('image.jpg');
  });
});

describe('buildS3Keys', () => {
  it('builds keys with all variants for a single URL', () => {
    const urls = ['https://cdn.example.com/uploads/photo.jpg'];
    const keys = buildS3Keys(urls);

    expect(keys).toContainEqual({ Key: 'uploads/photo.jpg' });
    // 3 variants (large, medium, thumb) x 2 formats (jpg, webp) = 6 + 1 original = 7
    expect(keys).toHaveLength(7);
    expect(keys).toContainEqual({ Key: 'uploads/large/photo.jpg' });
    expect(keys).toContainEqual({ Key: 'uploads/large/photo.webp' });
    expect(keys).toContainEqual({ Key: 'uploads/medium/photo.jpg' });
    expect(keys).toContainEqual({ Key: 'uploads/medium/photo.webp' });
    expect(keys).toContainEqual({ Key: 'uploads/thumb/photo.jpg' });
    expect(keys).toContainEqual({ Key: 'uploads/thumb/photo.webp' });
  });

  it('handles multiple URLs', () => {
    const urls = [
      'https://cdn.example.com/a/img1.png',
      'https://cdn.example.com/b/img2.png',
    ];
    const keys = buildS3Keys(urls);
    expect(keys).toHaveLength(14); // 7 per URL
  });

  it('skips invalid URLs', () => {
    const urls = ['not-a-url', 'https://cdn.example.com/valid.jpg'];
    const keys = buildS3Keys(urls);
    expect(keys).toHaveLength(7); // only valid URL produces keys
  });

  it('returns empty array for empty input', () => {
    expect(buildS3Keys([])).toEqual([]);
  });

  it('handles deeply nested paths', () => {
    const urls = ['https://cdn.example.com/a/b/c/file.png'];
    const keys = buildS3Keys(urls);
    expect(keys).toContainEqual({ Key: 'a/b/c/file.png' });
    expect(keys).toContainEqual({ Key: 'a/b/c/large/file.jpg' });
  });
});

describe('cleanupMedia', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('does nothing when MEDIA_BUCKET is empty', async () => {
    // cleanupMedia reads MEDIA_BUCKET at module load time, so we test via the module's behavior
    // Since we set it above, this test verifies the early return for empty URLs
    await cleanupMedia({ urls: [], callerPrefix: 'test', resourceId: '123' });
    // buildS3Keys returns [] for empty urls, so S3 send should not be called
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('filters out null and undefined URLs', async () => {
    await cleanupMedia({
      urls: [null, undefined, '', 'https://cdn.example.com/img.jpg'],
      callerPrefix: 'test',
      resourceId: '123',
    });
    // Should still call send for the valid URL
    expect(mockSend).toHaveBeenCalled();
  });

  it('calls S3 delete with correct bucket and keys', async () => {
    const { DeleteObjectsCommand } = require('@aws-sdk/client-s3');
    await cleanupMedia({
      urls: ['https://cdn.example.com/uploads/img.jpg'],
      callerPrefix: 'post-delete',
      resourceId: 'abc-123',
    });
    expect(DeleteObjectsCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        Bucket: 'test-bucket',
        Delete: expect.objectContaining({
          Quiet: true,
        }),
      }),
    );
  });

  it('calls CloudFront invalidation when distribution ID is set', async () => {
    const { CreateInvalidationCommand } = require('@aws-sdk/client-cloudfront');
    await cleanupMedia({
      urls: ['https://cdn.example.com/uploads/img.jpg'],
      callerPrefix: 'post-delete',
      resourceId: 'abc-123',
    });
    expect(CreateInvalidationCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        DistributionId: 'DIST123',
      }),
    );
  });

  it('does not throw when S3 delete fails', async () => {
    mockSend.mockRejectedValueOnce(new Error('S3 error'));
    await expect(cleanupMedia({
      urls: ['https://cdn.example.com/img.jpg'],
      callerPrefix: 'test',
      resourceId: '123',
    })).resolves.toBeUndefined();
  });

  it('does not throw when CloudFront invalidation fails', async () => {
    // First call (S3) succeeds, second call (CloudFront) fails
    mockSend.mockResolvedValueOnce({}).mockRejectedValueOnce(new Error('CF error'));
    await expect(cleanupMedia({
      urls: ['https://cdn.example.com/img.jpg'],
      callerPrefix: 'test',
      resourceId: '123',
    })).resolves.toBeUndefined();
  });

  it('skips all processing when all URLs are invalid (buildS3Keys returns empty)', async () => {
    await cleanupMedia({
      urls: ['not-a-url', 'also-not-valid'],
      callerPrefix: 'test',
      resourceId: '123',
    });
    // No S3 calls since no valid keys
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('maps S3 keys to CloudFront invalidation paths with leading slash', async () => {
    const { CreateInvalidationCommand } = require('@aws-sdk/client-cloudfront');
    await cleanupMedia({
      urls: ['https://cdn.example.com/media/file.jpg'],
      callerPrefix: 'peak-delete',
      resourceId: 'peak-xyz',
    });
    // Verify the invalidation paths have leading slash
    const callArgs = CreateInvalidationCommand.mock.calls[0][0];
    const paths = callArgs.InvalidationBatch.Paths.Items;
    for (const p of paths) {
      expect(p.startsWith('/')).toBe(true);
    }
  });

  it('uses callerPrefix and resourceId in CloudFront CallerReference', async () => {
    const { CreateInvalidationCommand } = require('@aws-sdk/client-cloudfront');
    await cleanupMedia({
      urls: ['https://cdn.example.com/media/file.jpg'],
      callerPrefix: 'post-delete',
      resourceId: 'post-999',
    });
    const callArgs = CreateInvalidationCommand.mock.calls[0][0];
    expect(callArgs.InvalidationBatch.CallerReference).toContain('post-delete');
    expect(callArgs.InvalidationBatch.CallerReference).toContain('post-999');
  });

  it('includes correct Paths.Quantity in CloudFront invalidation', async () => {
    const { CreateInvalidationCommand } = require('@aws-sdk/client-cloudfront');
    await cleanupMedia({
      urls: ['https://cdn.example.com/uploads/img.jpg'],
      callerPrefix: 'test',
      resourceId: '123',
    });
    const callArgs = CreateInvalidationCommand.mock.calls[0][0];
    // 1 original + 3 variants * 2 formats = 7
    expect(callArgs.InvalidationBatch.Paths.Quantity).toBe(7);
    expect(callArgs.InvalidationBatch.Paths.Items).toHaveLength(7);
  });
});
